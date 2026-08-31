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
esperam o resultado via Future.

IMPORTANTE — por que sempre limpar a busca no final de cada tarefa:
Abrir uma conversa passa pela caixa de busca do WhatsApp Web. Se essa
busca não for limpa depois, o painel lateral (#pane-side) fica
filtrado só pro contato buscado — e é exatamente esse painel que o
poller varre pra achar mensagens não lidas. Uma busca esquecida faz o
poller "cegar" pras outras conversas até a próxima limpeza manual, e é
a causa mais provável de erros repetidos ao receber mensagem nova logo
depois de enviar algo. Por isso _fechar_busca roda em bloco finally,
tanto em _tarefa_enviar_mensagem quanto em _tarefa_ler_chat — mesmo se
a tarefa falhar no meio do caminho.

Modelo de notificação (ler + sugerir rascunho automaticamente):
  O poller (_checar_mensagens_novas) NÃO fala uma notificação genérica
  fixa. Em vez disso, para cada chat não lido ainda não visto, injeta
  uma instrução sintética em ui_bridge.mensagens_entrada — a mesma fila
  usada pelo microfone e pelo terminal. Isso faz a notificação passar
  pelo ciclo normal do ask_jarvis em main.py: o LLM chama
  read_whatsapp_chat pra ler a conversa completa, resume pro usuário e
  já sugere um rascunho de resposta via send_whatsapp_message com
  confirmado=false, pedindo aprovação.

Modelo de segurança do envio:
  send_whatsapp_message() só realiza o envio de fato se confirmado=True.
  Essa flag deve ser setada pelo LLM SOMENTE depois que o usuário
  confirmou verbalmente, em um turno de conversa POSTERIOR ao turno em
  que a mensagem recebida foi lida/resumida (ver REGRA DE OURO no
  prompt.txt).
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

POLL_INTERVAL_SEGUNDOS = 30
LOGIN_TIMEOUT_MS = 120_000
TAREFA_TIMEOUT_SEGUNDOS = 150

_tarefa_queue = queue.Queue()
_worker_thread = None
_worker_lock = threading.Lock()

_ja_notificados = set()


def _abrir_sessao():
    os.makedirs(WHATSAPP_PROFILE_DIR, exist_ok=True)

    playwright = sync_playwright().start()
    browser_context = playwright.chromium.launch_persistent_context(
        user_data_dir=str(WHATSAPP_PROFILE_DIR),
        headless=False,
        viewport={"width": 1280, "height": 900},
    )
    page = browser_context.pages[0] if browser_context.pages else browser_context.new_page()
    page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")

    try:
        page.wait_for_selector("#pane-side", timeout=LOGIN_TIMEOUT_MS)
    except Exception:
        print("⚠️  Não confirmei o seletor da lista de conversas — verifique login manualmente.")

    return page


def _extrair_chats_nao_lidos(page):
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


TIMEOUT_RESULTADO_BUSCA_MS = 6000
TIMEOUT_CAMPO_MENSAGEM_MS = 8000
TIMEOUT_POR_TENTATIVA_MS = 2500


def _primeiro_visivel(tentativas, timeout_por_tentativa_ms=TIMEOUT_POR_TENTATIVA_MS):
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
                name=re.compile(r"pesquisar|pesquisa|search|buscar", re.I),
            ),
        ),
        (
            "div[contenteditable] com data-tab=3 (versão antiga)",
            lambda: page.locator('#side div[contenteditable="true"][data-tab="3"]'),
        ),
        (
            "div[contenteditable][role=textbox] dentro de #side",
            lambda: page.locator('#side div[contenteditable="true"][role="textbox"]'),
        ),
        (
            "qualquer div[contenteditable] dentro de #side",
            lambda: page.locator('#side div[contenteditable="true"]'),
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
                name=re.compile(r"digite uma mensagem|type a message|mensagem|message", re.I),
            ),
        ),
        (
            "div[contenteditable] com data-tab=10 (versão antiga)",
            lambda: page.locator('#main div[contenteditable="true"][data-tab="10"]'),
        ),
        (
            "div[contenteditable][role=textbox] dentro do footer de #main",
            lambda: page.locator('#main footer div[contenteditable="true"][role="textbox"]'),
        ),
        (
            "div[contenteditable] dentro do footer de #main",
            lambda: page.locator('#main footer div[contenteditable="true"]'),
        ),
    ], timeout_por_tentativa_ms=TIMEOUT_CAMPO_MENSAGEM_MS)


def _limpar_campo_busca(campo_busca):
    """
    .fill("") em contenteditable às vezes deixa lixo (texto residual,
    marcação interna do WhatsApp) que atrapalha a próxima busca.
    Selecionar tudo e apagar via teclado é mais confiável do que
    depender do fill interno do Playwright pra limpar um contenteditable.
    """
    campo_busca.click()
    campo_busca.press("Control+A")
    campo_busca.press("Backspace")


def _digitar_com_eventos_reais(locator, texto):
    """
    O WhatsApp Web filtra a lista de conversas reagindo a eventos de
    teclado reais disparados por digitação, não necessariamente à
    simples mudança de valor que Locator.fill() produz em alguns
    contenteditable. press_sequentially() simula tecla por tecla e é o
    que aciona o filtro de busca de forma confiável — .fill() era a
    causa mais provável de "não consegue entrar na conversa": a busca
    não filtrava nada, e o clique no resultado caía no vazio ou no
    elemento errado.
    """
    locator.click()
    locator.press_sequentially(texto, delay=30)


def _fechar_busca(page):
    """
    Restaura o painel lateral pro estado sem filtro depois de qualquer
    ação que passou pela busca. Sem isso, o WhatsApp Web fica com a
    busca aplicada e #pane-side passa a listar só o resultado daquela
    busca — é isso que fazia o poller (que lê #pane-side pra achar
    mensagens não lidas) parar de enxergar as outras conversas depois
    de enviar uma mensagem, gerando os erros repetidos ao chegar
    mensagem nova. Roda em finally, então executa mesmo se a tarefa
    tiver falhado no meio do caminho.
    """
    try:
        campo_busca = _localizar_campo_busca(page)
        campo_busca.click()
        campo_busca.press("Control+A")
        campo_busca.press("Backspace")
        campo_busca.press("Escape")
    except Exception:
        pass


def _abrir_conversa(page, contato):
    campo_busca = _localizar_campo_busca(page)

    _limpar_campo_busca(campo_busca)
    _digitar_com_eventos_reais(campo_busca, contato)

    resultado = _localizar_resultado_busca(page, contato)
    resultado.click(timeout=TIMEOUT_RESULTADO_BUSCA_MS)

    # Confirma que a conversa certa abriu de fato, checando o cabeçalho
    # do painel principal. Sem essa checagem, um clique que caiu no
    # lugar errado (busca ainda filtrando, elemento sobreposto) passava
    # batido e só quebrava silenciosamente mais adiante — por isso
    # parecia que o JARVIS "não conseguia entrar na conversa".
    try:
        page.locator("#main header").get_by_text(contato, exact=False).first.wait_for(
            state="visible", timeout=5000,
        )
    except Exception:
        raise RuntimeError(
            f"Cliquei no resultado de busca para '{contato}', mas o "
            "cabeçalho da conversa aberta não confirma esse contato. "
            "Provavelmente abriu a conversa errada ou nenhuma conversa "
            "abriu de verdade."
        )

    _localizar_campo_mensagem(page)


def _preencher_texto(locator, texto):
    try:
        locator.fill(texto)
    except Exception:
        locator.click()
        locator.press_sequentially(texto)


def _tarefa_enviar_mensagem(page, contato, texto):
    try:
        _abrir_conversa(page, contato)

        campo_mensagem = _localizar_campo_mensagem(page)
        campo_mensagem.click(timeout=TIMEOUT_CAMPO_MENSAGEM_MS)
        _preencher_texto(campo_mensagem, texto)
        page.keyboard.press("Enter")

        return True
    finally:
        _fechar_busca(page)


def _localizar_mensagens_container(page):
    """
    As classes CSS do WhatsApp Web são compiladas/hashadas e mudam a
    cada deploy (foi o que quebrou 'div.message-in'/'div.message-out').
    'data-id' é bem mais estável porque é usado pela própria lógica
    interna do app pra identificar mensagens, não só estilização — por
    isso vira a estratégia primária, com as classes antigas como
    último fallback.
    """
    return _primeiro_visivel([
        (
            "elemento com data-id (identificador interno de mensagem)",
            lambda: page.locator('#main [data-id^="true_"], #main [data-id^="false_"]'),
        ),
        (
            "div.copyable-text (contém metadados de remetente/hora)",
            lambda: page.locator('#main div.copyable-text'),
        ),
        (
            "classes antigas message-in/message-out",
            lambda: page.locator('#main div.message-in, #main div.message-out'),
        ),
    ], timeout_por_tentativa_ms=TIMEOUT_CAMPO_MENSAGEM_MS)


def _tarefa_ler_chat(page, contato, quantidade):
    try:
        _abrir_conversa(page, contato)

        _localizar_mensagens_container(page)

        mensagens = page.evaluate(
            """
            (quantidade, contato) => {
                // Estratégia primária: data-id, formato 'true_...'
                // (enviada por você) ou 'false_...' (recebida) — mais
                // estável que classes CSS, que mudam a cada deploy.
                const porDataId = document.querySelectorAll(
                    '#main [data-id^="true_"], #main [data-id^="false_"]'
                );

                const vistos = new Set();
                let mensagens = [];

                porDataId.forEach(linha => {
                    const dataId = linha.getAttribute('data-id');
                    if (!dataId || vistos.has(dataId)) return;
                    vistos.add(dataId);

                    const enviadaPorMim = dataId.startsWith('true_');
                    const textoEl = linha.querySelector('span.selectable-text');
                    const texto = textoEl ? textoEl.innerText.trim() : '';

                    mensagens.push({
                        texto: texto || '[mídia/sem texto]',
                        de: enviadaPorMim ? 'você' : contato,
                    });
                });

                // Fallback: classes antigas, caso data-id não exista
                // nesta versão do WhatsApp Web.
                if (mensagens.length === 0) {
                    const bolhas = document.querySelectorAll(
                        '#main div.message-in, #main div.message-out'
                    );
                    mensagens = Array.from(bolhas).map(b => {
                        const enviadaPorMim = b.classList.contains('message-out');
                        const textoEl = b.querySelector('span.selectable-text');
                        const texto = textoEl ? textoEl.innerText.trim() : '';
                        return {
                            texto: texto || '[mídia/sem texto]',
                            de: enviadaPorMim ? 'você' : contato,
                        };
                    });
                }

                return mensagens.slice(-quantidade);
            }
            """,
            quantidade,
            contato,
        )

        return mensagens
    finally:
        _fechar_busca(page)


def _executar_no_worker(func, *args, timeout=TAREFA_TIMEOUT_SEGUNDOS, **kwargs):
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