"""
tools/whatsapp_agent.py

Sessão persistente do WhatsApp Web via Playwright, no mesmo padrão do
tools/web_agent.py já existente no JARVIS: um browser rodando numa thread
dedicada, contexto salvo em disco (login por QR code só na primeira vez).

IMPORTANTE — modelo de concorrência:
Playwright (API síncrona) só permite usar um browser/page a partir da
MESMA thread que os criou. Por isso este módulo tem uma única worker
thread dona da sessão inteira: ela abre o browser, e depois fica
processando uma fila de "tarefas" (funções que recebem a page como
argumento). Tanto o poller de notificação quanto as tools expostas ao
LLM (list_unread_whatsapp, read_whatsapp_chat, send_whatsapp_message)
NUNCA tocam na page diretamente — elas só enfileiram uma tarefa e
esperam o resultado via Future. Isso evita o erro "cannot switch to a
different thread" que acontece quando código de outra thread tenta
chamar métodos do Playwright.

Modelo de notificação (ler + sugerir rascunho automaticamente):
  O poller (_checar_mensagens_novas) NÃO fala uma notificação genérica
  fixa. Em vez disso, para cada chat não lido ainda não visto, injeta
  uma instrução sintética em ui_bridge.mensagens_entrada — a mesma fila
  usada pelo microfone e pelo terminal. Isso faz a notificação passar
  pelo ciclo normal do ask_jarvis em main.py: o LLM chama
  read_whatsapp_chat pra ler a conversa completa, resume pro usuário e
  já sugere um rascunho de resposta via send_whatsapp_message com
  confirmado=false, pedindo aprovação — sem duplicar nenhuma lógica de
  LLM aqui dentro do whatsapp_agent.

Modelo de segurança do envio:
  send_whatsapp_message() só realiza o envio de fato se confirmado=True.
  Essa flag deve ser setada pelo LLM SOMENTE depois que o usuário
  confirmou verbalmente, em um turno de conversa POSTERIOR ao turno em
  que a mensagem recebida foi lida/resumida (ver REGRA DE OURO no
  prompt.txt). Chamar com confirmado=False (ou omitir) devolve um
  preview do que seria enviado, sem enviar nada.
"""

import os
import queue
import re
import threading
import time
from concurrent.futures import Future
from pathlib import Path

from playwright.sync_api import sync_playwright

import tools.ui_bridge as ui_bridge
from tools.voice import speak, limpar_para_fala

BASE_DIR = Path(__file__).resolve().parent.parent
WHATSAPP_PROFILE_DIR = BASE_DIR / "assets" / "whatsapp_profile"

# Intervalo do poller de mensagens não lidas. WhatsApp Web não expõe um
# webhook local — o jeito confiável sem depender de API oficial da Meta
# é poll no DOM.
POLL_INTERVAL_SEGUNDOS = 30

# Timeout de espera por login (QR code manual na primeira vez,
# instantâneo nas seguintes por causa do contexto persistente).
LOGIN_TIMEOUT_MS = 120_000

# Timeout padrão que uma tool espera pelo resultado de uma tarefa
# enfileirada na worker thread. Generoso o bastante pra cobrir o
# primeiro login sem falhar por timeout.
TAREFA_TIMEOUT_SEGUNDOS = 150

_tarefa_queue = queue.Queue()
_worker_thread = None
_worker_lock = threading.Lock()

# Guarda os IDs (nome_chat + preview + naoLidas) já notificados nesta
# sessão, pra não repetir aviso da mesma mensagem a cada ciclo do poller.
_ja_notificados = set()


def _abrir_sessao():
    """
    Abre (ou reaproveita) a sessão persistente do WhatsApp Web. Roda
    SEMPRE dentro da worker thread. Na primeira execução, abre visível
    pra você escanear o QR code; depois disso o contexto fica salvo em
    WHATSAPP_PROFILE_DIR e os próximos starts já entram logados.
    """
    os.makedirs(WHATSAPP_PROFILE_DIR, exist_ok=True)

    playwright = sync_playwright().start()
    browser_context = playwright.chromium.launch_persistent_context(
        user_data_dir=str(WHATSAPP_PROFILE_DIR),
        headless=False,  # precisa ser visível na primeira vez (QR code)
        viewport={"width": 1280, "height": 900},
    )
    page = browser_context.pages[0] if browser_context.pages else browser_context.new_page()
    page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")

    try:
        # '#pane-side' é o id do painel da lista de conversas — estável
        # entre idiomas/versões, ao contrário de aria-label traduzido
        # (ex: 'Lista de conversas' só existe em pt-BR; 'Chat list' em
        # en; outros idiomas usam outra string ainda).
        page.wait_for_selector("#pane-side", timeout=LOGIN_TIMEOUT_MS)
    except Exception:
        print("⚠️  Não confirmei o seletor da lista de conversas — verifique login manualmente.")

    return page


def _extrair_chats_nao_lidos(page):
    """
    Varre a lista de conversas visível e retorna os chats com badge de
    não lida, junto com o texto de preview da última mensagem. Roda
    inteiramente via JS no contexto da página pra ser rápido e não
    depender de seletores frágeis do Playwright em Python.

    IMPORTANTE — por que não usar aria-label pra achar o badge: a versão
    anterior procurava um span cujo aria-label contivesse "unread" ou
    "não lida", mas isso depende do idioma da interface do WhatsApp
    (pode estar em espanhol, francês etc.) E do formato exato que a Meta
    usa no aria-label naquela versão — qualquer mudança/mismatch faz o
    seletor não casar com NADA, e o chats vem sempre vazio (o que faz o
    poller nunca notificar e list_unread_whatsapp nunca achar nada).

    Em vez disso, escaneamos por um <span> cujo conteúdo seja só
    dígitos dentro da linha do chat — é o número do badge de não lidas,
    e aparece igual não importa o idioma da interface (só o aria-label
    ao redor dele muda). Escopamos a busca a '#pane-side' (o painel da
    lista de conversas, um id estável) pra não pegar números soltos de
    outras partes da tela.
    """
    return page.evaluate(
        """
        () => {
            const linhas = document.querySelectorAll(
                '#pane-side div[role="listitem"], #pane-side div[role="row"]'
            );
            const resultado = [];
            linhas.forEach((linha) => {
                const nomeEl = linha.querySelector('span[title]');
                const nome = nomeEl ? nomeEl.getAttribute('title') : null;
                if (!nome) return;

                let naoLidas = 0;
                const spans = linha.querySelectorAll('span');
                for (const s of spans) {
                    const texto = (s.textContent || '').trim();
                    if (/^\\d+$/.test(texto)) {
                        naoLidas = parseInt(texto, 10);
                        break;
                    }
                }
                if (naoLidas <= 0) return;

                const previewEl = linha.querySelector('span[dir="ltr"]');
                resultado.push({
                    nome,
                    preview: previewEl ? previewEl.textContent : '',
                    naoLidas: String(naoLidas),
                });
            });
            return resultado;
        }
        """
    )


def _checar_mensagens_novas(page):
    """
    Executado periodicamente pela própria worker thread (nunca por uma
    thread separada). Para cada chat não lido ainda não visto nesta
    sessão, NÃO fala uma notificação genérica aqui dentro — em vez
    disso, injeta uma instrução sintética na mesma fila de entrada
    usada pelo microfone e pelo terminal (ui_bridge.mensagens_entrada).

    Isso faz a notificação passar pelo ciclo normal do ask_jarvis em
    main.py: o LLM chama read_whatsapp_chat pra ler a conversa
    completa, resume pro usuário, já sugere um rascunho de resposta via
    send_whatsapp_message(confirmado=false) e pede aprovação — tudo
    dentro do fluxo de tools já existente e respeitando a REGRA DE OURO
    do prompt.txt, sem duplicar nenhuma lógica de LLM aqui no
    whatsapp_agent.
    """
    chats = _extrair_chats_nao_lidos(page)

    for chat in chats:
        chave = f"{chat['nome']}::{chat['preview']}::{chat['naoLidas']}"
        if chave in _ja_notificados:
            continue
        _ja_notificados.add(chave)

        ui_bridge.broadcast({
            "type": "whatsapp_message",
            "nome": chat["nome"],
            "preview": chat["preview"],
            "nao_lidas": chat["naoLidas"],
        })

        instrucao = (
            "[NOTIFICAÇÃO AUTOMÁTICA DE WHATSAPP] Chegou uma mensagem "
            f"nova de {chat['nome']}. Prévia: \"{chat['preview']}\". "
            "Use read_whatsapp_chat para ler a conversa completa com "
            f"{chat['nome']}. Avise o usuário sobre a mensagem, resuma "
            "o conteúdo dela em fala natural, e já sugira um rascunho "
            "de resposta chamando send_whatsapp_message com "
            "confirmado=false. Fale o rascunho sugerido e pergunte se "
            "pode enviar. Não chame send_whatsapp_message com "
            "confirmado=true nesta mesma resposta, mesmo que o "
            "rascunho pareça óbvio — a aprovação só vem em uma "
            "mensagem seguinte do usuário."
        )

        ui_bridge.mensagens_entrada.put(instrucao)


def _tarefa_listar_nao_lidos(page):
    return _extrair_chats_nao_lidos(page)


# Timeout menor e específico só para achar o RESULTADO da busca — se
# estourar aqui (e não no campo de mensagem depois), sabemos que o
# problema é "não achei esse contato", não "campo de mensagem sumiu".
TIMEOUT_RESULTADO_BUSCA_MS = 6000
TIMEOUT_CAMPO_MENSAGEM_MS = 8000
TIMEOUT_POR_TENTATIVA_MS = 2500


def _primeiro_visivel(tentativas, timeout_por_tentativa_ms=TIMEOUT_POR_TENTATIVA_MS):
    """
    Recebe uma lista de (descrição, função que devolve um Locator) e
    tenta cada uma em ordem, devolvendo a primeira que realmente aparece
    visível na tela. Espelha o mesmo princípio do '_localizar' em
    web_agent.py: em vez de apostar tudo num único seletor fixo (id,
    data-tab, classe) que a WhatsApp Web pode trocar numa atualização,
    tentamos várias estratégias em cascata — role/aria-label primeiro
    (mais estável, é acessibilidade e sobrevive a redesigns visuais),
    depois seletores estruturais como fallback.

    Se NENHUMA bater, levanta um erro listando o que foi tentado — isso
    aparece no traceback do terminal e poupa uma rodada inteira de
    "cola o log aqui" da próxima vez que a WhatsApp Web mudar de novo.
    """
    descricoes_tentadas = []
    for descricao, obter_locator in tentativas:
        descricoes_tentadas.append(descricao)
        try:
            locator = obter_locator().first
            locator.wait_for(state="visible", timeout=timeout_por_tentativa_ms)
            return locator
        except Exception:
            continue

    raise RuntimeError(
        "Não encontrei o elemento com nenhuma das estratégias conhecidas "
        f"(tentei: {', '.join(descricoes_tentadas)}). A WhatsApp Web "
        "provavelmente mudou de estrutura — inspecione a página "
        "manualmente pra achar o seletor atual."
    )


def _localizar_campo_busca(page):
    return _primeiro_visivel([
        (
            "role=textbox com aria-label de busca",
            lambda: page.get_by_role(
                "textbox",
                name=re.compile(
                    r"pesquisar|pesquisa|search|buscar",
                    re.I,
                ),
            ),
        ),
        (
            "div[contenteditable] com data-tab=3 (versão antiga)",
            lambda: page.locator(
                '#side div[contenteditable="true"][data-tab="3"]'
            ),
        ),
        (
            "div[contenteditable][role=textbox] dentro de #side",
            lambda: page.locator(
                '#side div[contenteditable="true"][role="textbox"]'
            ),
        ),
        (
            "qualquer div[contenteditable] dentro de #side",
            lambda: page.locator(
                '#side div[contenteditable="true"]'
            ),
        ),
    ])


def _localizar_resultado_busca(page, contato):
    return _primeiro_visivel([
        (
            f"span[title] igual a '{contato}'",
            lambda: page.locator(f'span[title="{contato}"]'),
        ),
        (
            f"texto visível contendo '{contato}'",
            lambda: page.get_by_text(contato, exact=False),
        ),
    ], timeout_por_tentativa_ms=TIMEOUT_RESULTADO_BUSCA_MS)


def _localizar_campo_mensagem(page):
    return _primeiro_visivel([
        (
            "role=textbox com aria-label de mensagem",
            lambda: page.get_by_role(
                "textbox",
                name=re.compile(
                    r"digite uma mensagem|type a message|mensagem|message",
                    re.I,
                ),
            ),
        ),
        (
            "div[contenteditable] com data-tab=10 (versão antiga)",
            lambda: page.locator(
                '#main div[contenteditable="true"][data-tab="10"]'
            ),
        ),
        (
            "div[contenteditable][role=textbox] dentro do footer de #main",
            lambda: page.locator(
                '#main footer div[contenteditable="true"][role="textbox"]'
            ),
        ),
        (
            "div[contenteditable] dentro do footer de #main",
            lambda: page.locator(
                '#main footer div[contenteditable="true"]'
            ),
        ),
    ], timeout_por_tentativa_ms=TIMEOUT_CAMPO_MENSAGEM_MS)


def _abrir_conversa(page, contato):
    campo_busca = _localizar_campo_busca(page)

    campo_busca.click(timeout=8000)
    campo_busca.fill("")
    campo_busca.fill(contato)

    resultado = _localizar_resultado_busca(page, contato)
    resultado.click(timeout=TIMEOUT_RESULTADO_BUSCA_MS)

    _localizar_campo_mensagem(page)


def _preencher_texto(locator, texto):
    try:
        locator.fill(texto)
    except Exception:
        locator.click()
        locator.press_sequentially(texto)


def _tarefa_enviar_mensagem(page, contato, texto):
    _abrir_conversa(page, contato)

    campo_mensagem = _localizar_campo_mensagem(page)

    campo_mensagem.click(timeout=TIMEOUT_CAMPO_MENSAGEM_MS)

    _preencher_texto(campo_mensagem, texto)

    page.keyboard.press("Enter")

    return True


def _tarefa_ler_chat(page, contato, quantidade):
    _abrir_conversa(page, contato)

    page.locator(
        '#main div.message-in, #main div.message-out'
    ).first.wait_for(
        state="visible",
        timeout=TIMEOUT_CAMPO_MENSAGEM_MS,
    )

    mensagens = page.evaluate(
        """
        (quantidade, contato) => {
            const bolhas = document.querySelectorAll(
                '#main div.message-in, #main div.message-out'
            );

            const ultimas = Array.from(bolhas).slice(-quantidade);

            return ultimas.map(b => {
                const enviadaPorMim =
                    b.classList.contains('message-out');

                const textoEl = b.querySelector(
                    'span.selectable-text'
                );

                const texto = textoEl
                    ? textoEl.innerText.trim()
                    : '';

                return {
                    texto: texto || '[mídia/sem texto]',
                    de: enviadaPorMim ? 'você' : contato,
                };
            });
        }
        """,
        quantidade,
        contato,
    )

    return mensagens


def _executar_no_worker(func, *args, timeout=TAREFA_TIMEOUT_SEGUNDOS, **kwargs):
    """
    Enfileira 'func' para rodar dentro da worker thread (recebendo a
    page como primeiro argumento) e bloqueia até o resultado, ou
    propaga a exceção que a tarefa levantou.
    """
    _garantir_worker_rodando()

    future = Future()
    _tarefa_queue.put((func, args, kwargs, future))
    return future.result(timeout=timeout)


def _worker_loop():
    page = _abrir_sessao()
    ultimo_poll = time.time()

    while True:
        tempo_restante = POLL_INTERVAL_SEGUNDOS - (time.time() - ultimo_poll)
        espera = max(0.1, tempo_restante)

        try:
            func, args, kwargs, future = _tarefa_queue.get(timeout=espera)
        except queue.Empty:
            func = None

        if func is not None:
            try:
                resultado = func(page, *args, **kwargs)
                future.set_result(resultado)
            except Exception as error:
                import traceback
                print(f"⚠️  Tarefa do WhatsApp falhou ({func.__name__}): {error}", flush=True)
                traceback.print_exc()
                import sys
                sys.stderr.flush()
                future.set_exception(error)

        if time.time() - ultimo_poll >= POLL_INTERVAL_SEGUNDOS:
            try:
                _checar_mensagens_novas(page)
            except Exception as error:
                print(f"⚠️  Poller do WhatsApp falhou neste ciclo: {error}")
            ultimo_poll = time.time()


def _garantir_worker_rodando():
    global _worker_thread
    with _worker_lock:
        if _worker_thread is None:
            _worker_thread = threading.Thread(target=_worker_loop, daemon=True)
            _worker_thread.start()


def start_whatsapp_session():
    """Chamar uma vez na inicialização do JARVIS (igual ao mic_listener)."""
    _garantir_worker_rodando()
    return {"success": True, "message": "Sessão do WhatsApp Web iniciada."}


def list_unread_whatsapp():
    try:
        chats = _executar_no_worker(_tarefa_listar_nao_lidos)
        return {
            "success": True,
            "count": len(chats),
            "chats": chats,
        }
    except Exception as error:
        return {"success": False, "message": f"Não foi possível listar mensagens: {error}"}


def read_whatsapp_chat(contato: str, quantidade: int = 5):
    try:
        mensagens = _executar_no_worker(_tarefa_ler_chat, contato, quantidade)
        return {
            "success": True,
            "contato": contato,
            "mensagens": mensagens,
        }
    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível ler a conversa com {contato}: {error}",
        }


def send_whatsapp_message(contato: str, texto: str, confirmado: bool = False):
    if not confirmado:
        return {
            "success": True,
            "enviado": False,
            "preview": {"contato": contato, "texto": texto},
            "message": (
                f"Rascunho pronto para {contato}: \"{texto}\". "
                "NÃO envie ainda — leia este rascunho em voz alta pro "
                "usuário e só chame esta ferramenta de novo com "
                "confirmado=true depois que ele confirmar explicitamente."
            ),
        }

    try:
        _executar_no_worker(_tarefa_enviar_mensagem, contato, texto)
        return {
            "success": True,
            "enviado": True,
            "contato": contato,
            "message": f"Mensagem enviada para {contato}.",
        }
    except Exception as error:
        return {
            "success": False,
            "enviado": False,
            "message": f"Não foi possível enviar a mensagem: {error}",
        }