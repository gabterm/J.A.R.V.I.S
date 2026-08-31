"""
tools/web_agent.py

Navegação de verdade dentro de sites — não só "abrir" uma URL, mas
clicar em links/botões, preencher campos, rolar a página, ler o texto
visível e voltar/avançar, tudo numa sessão de navegador real (Playwright
+ Chromium) que persiste entre chamadas.

POR QUE UMA THREAD DEDICADA:
Playwright (API síncrona) exige que todas as chamadas relativas a um
mesmo browser/page aconteçam na MESMA thread onde ele foi criado. Como
as tools do JARVIS rodam via asyncio.to_thread (que pode reaproveitar
threads diferentes a cada chamada), não dá pra chamar o Playwright
direto de dentro de tools.py sem correr o risco de cair em outra thread
e quebrar tudo.

A solução: uma única thread "dona" do navegador, rodando pra sempre,
recebendo comandos por uma fila e devolvendo o resultado por outra. As
funções públicas deste módulo (browser_open, browser_click, etc.) só
empacotam o pedido e esperam a resposta — podem ser chamadas de
qualquer thread sem problema.

MONITORAMENTO DE MENSAGENS (WhatsApp Web):
Além de comandos avulsos, a mesma thread também pode ficar de olho no
WhatsApp Web em segundo plano. Isso é feito trocando o `_comandos.get()`
bloqueante por um `_comandos.get(timeout=intervalo)`: enquanto não chega
nenhum comando novo, o timeout estoura periodicamente e a thread
aproveita a "folga" pra checar se algum chat ganhou mensagens não lidas
novas. Assim o monitoramento não bloqueia nem compete com comandos
normais (clicar, digitar, etc.) — eles continuam tendo prioridade.
"""

import base64
import queue
import threading

import tools.ui_bridge as ui_bridge

_comandos = queue.Queue()
_worker_iniciado = False
_lock_worker = threading.Lock()

VIEWPORT = {"width": 1280, "height": 800}
TIMEOUT_PADRAO_MS = 15000
MAX_TEXTO_RETORNADO = 4000  # caracteres — evita estourar o contexto do modelo

INTERVALO_MONITORAMENTO_PADRAO_S = 7  # "quase tempo real" sem martelar a página


def _garantir_worker_rodando():
    global _worker_iniciado
    with _lock_worker:
        if not _worker_iniciado:
            _worker_iniciado = True
            threading.Thread(target=_worker_loop, daemon=True).start()


def _enviar_comando(acao, **kwargs):
    _garantir_worker_rodando()
    resposta_fila = queue.Queue(maxsize=1)
    _comandos.put({"acao": acao, "args": kwargs, "resposta": resposta_fila})
    return resposta_fila.get()


def _worker_loop():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = None
        context = None
        page = None

        # --- estado do monitoramento de WhatsApp (vive só nesta thread) ---
        monitorando = False
        intervalo_monitoramento = INTERVALO_MONITORAMENTO_PADRAO_S
        estado_chats = {}  # nome do chat -> quantidade de não lidas na última checagem
        primeira_checagem = True  # evita notificar mensagens que já existiam antes de ligar o monitor

        def _garantir_pagina():
            nonlocal browser, context, page
            if browser is None:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(viewport=VIEWPORT)
                page = context.new_page()
                page.set_default_timeout(TIMEOUT_PADRAO_MS)
            return page

        while True:
            try:
                # Se o monitoramento está ligado, não bloqueia pra sempre:
                # estoura o timeout de tempos em tempos pra dar tempo de checar
                # o WhatsApp. Se não está ligado, comportamento é o de sempre
                # (espera indefinidamente pelo próximo comando).
                timeout = intervalo_monitoramento if monitorando else None
                comando = _comandos.get(timeout=timeout)
            except queue.Empty:
                if monitorando and page is not None:
                    try:
                        if _pagina_e_whatsapp(page):
                            novo_estado, novidades = _checar_novas_mensagens_whatsapp(
                                page, estado_chats, ignorar_notificacao=primeira_checagem
                            )
                            estado_chats = novo_estado
                            primeira_checagem = False
                            for novidade in novidades:
                                _notificar_nova_mensagem(novidade)
                    except Exception as error:
                        # Uma falha ao checar não deve derrubar o monitoramento;
                        # só loga (via ui_bridge) e tenta de novo na próxima volta.
                        ui_bridge.broadcast({
                            "type": "browser_monitor_erro",
                            "message": f"Falha ao checar novas mensagens: {error}",
                        })
                continue

            acao = comando["acao"]
            args = comando["args"]
            resposta_fila = comando["resposta"]

            try:
                if acao == "abrir":
                    pg = _garantir_pagina()
                    pg.goto(args["url"], wait_until="domcontentloaded")
                    resultado = _snapshot(pg)

                elif acao == "clicar":
                    pg = _garantir_pagina()
                    alvo = _localizar(pg, args["alvo"])
                    alvo.click(timeout=TIMEOUT_PADRAO_MS)
                    pg.wait_for_load_state("domcontentloaded", timeout=TIMEOUT_PADRAO_MS)
                    resultado = _snapshot(pg)

                elif acao == "digitar":
                    pg = _garantir_pagina()
                    alvo = _localizar(pg, args["alvo"])
                    alvo.fill(args["texto"])
                    if args.get("enter"):
                        alvo.press("Enter")
                        pg.wait_for_load_state("domcontentloaded", timeout=TIMEOUT_PADRAO_MS)
                    resultado = _snapshot(pg)

                elif acao == "rolar":
                    pg = _garantir_pagina()
                    delta = args.get("quantidade", 800)
                    if args.get("direcao") == "cima":
                        delta = -delta
                    pg.mouse.wheel(0, delta)
                    resultado = _snapshot(pg)

                elif acao == "voltar":
                    pg = _garantir_pagina()
                    pg.go_back(wait_until="domcontentloaded")
                    resultado = _snapshot(pg)

                elif acao == "avancar":
                    pg = _garantir_pagina()
                    pg.go_forward(wait_until="domcontentloaded")
                    resultado = _snapshot(pg)

                elif acao == "ler":
                    pg = _garantir_pagina()
                    resultado = _snapshot(pg, incluir_texto_completo=True)

                elif acao == "monitorar_whatsapp_ligar":
                    pg = _garantir_pagina()
                    monitorando = True
                    intervalo_monitoramento = args.get("intervalo_segundos") or INTERVALO_MONITORAMENTO_PADRAO_S
                    estado_chats = {}
                    primeira_checagem = True
                    resultado = {
                        "success": True,
                        "message": (
                            f"Monitoramento do WhatsApp Web ligado "
                            f"(checando a cada {intervalo_monitoramento}s)."
                        ),
                    }

                elif acao == "monitorar_whatsapp_desligar":
                    monitorando = False
                    resultado = {"success": True, "message": "Monitoramento do WhatsApp Web desligado."}

                elif acao == "fechar":
                    if browser:
                        browser.close()
                        browser = None
                        context = None
                        page = None
                    monitorando = False
                    resultado = {"success": True, "message": "Sessão de navegação encerrada."}

                else:
                    resultado = {"success": False, "message": f"Ação desconhecida: {acao}"}

            except Exception as error:
                resultado = {"success": False, "message": str(error)}

            resposta_fila.put(resultado)


def _localizar(page, alvo: str):
    """
    Acha um elemento clicável/preenchível a partir de uma descrição em
    linguagem natural OU de um seletor CSS explícito, nessa ordem:
      1. Parece seletor CSS ('#id', '.classe', '[atributo]') → usa direto.
      2. Texto visível (get_by_text) — cobre a maioria dos links/botões.
      3. role + nome acessível (get_by_role) — botões/campos com aria-label.
      4. placeholder — campos de busca/formulário.
      5. label associado ao campo.
    Isso deixa o modelo descrever o que "vê" na tela ("botão Entrar",
    "campo de busca") em vez de precisar inspecionar HTML.
    """
    alvo = alvo.strip()

    parece_seletor = alvo.startswith(("#", ".", "[")) or (
        " " in alvo and any(c in alvo for c in ("#", ".", "[", ">"))
    )
    if parece_seletor:
        locator = page.locator(alvo).first
        if locator.count() > 0:
            return locator

    tentativas = (
        lambda: page.get_by_role("button", name=alvo, exact=False),
        lambda: page.get_by_role("link", name=alvo, exact=False),
        lambda: page.get_by_placeholder(alvo, exact=False),
        lambda: page.get_by_label(alvo, exact=False),
        lambda: page.get_by_text(alvo, exact=False),
    )
    for tentativa in tentativas:
        try:
            locator = tentativa().first
            if locator.count() > 0:
                return locator
        except Exception:
            continue

    raise ValueError(f"Não encontrei nenhum elemento correspondente a: '{alvo}'")


def _snapshot(page, incluir_texto_completo=False):
    """
    Captura o estado atual da página: título, URL, um recorte do texto
    visível (pro modelo "ler" sem outra chamada) e um screenshot em
    base64. O screenshot é transmitido pra interface via ui_bridge, então
    a navegação fica visível em tempo real — sem isso ela aconteceria só
    "nos bastidores" do backend, invisível pro usuário.
    """
    titulo = page.title()
    url = page.url

    try:
        texto = page.inner_text("body")
    except Exception:
        texto = ""

    texto_recortado = texto.strip()
    limite = MAX_TEXTO_RETORNADO if incluir_texto_completo else 1200
    if len(texto_recortado) > limite:
        texto_recortado = texto_recortado[:limite] + "…"

    screenshot_b64 = None
    try:
        screenshot_bytes = page.screenshot(type="jpeg", quality=70)
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")
    except Exception:
        pass

    if screenshot_b64:
        ui_bridge.broadcast({
            "type": "browser_screenshot",
            "titulo": titulo,
            "url": url,
            "imagem_base64": screenshot_b64,
        })

    return {
        "success": True,
        "titulo": titulo,
        "url": url,
        "texto_visivel": texto_recortado,
    }


# ============================================================
# MONITORAMENTO DE NOVAS MENSAGENS (WhatsApp Web)
# ============================================================

def _pagina_e_whatsapp(page) -> bool:
    try:
        return "web.whatsapp.com" in (page.url or "")
    except Exception:
        return False


def _checar_novas_mensagens_whatsapp(page, estado_anterior: dict, ignorar_notificacao: bool):
    """
    Lê a lista de conversas do WhatsApp Web e extrai, pra cada uma,
    o nome do chat e o número de mensagens não lidas.

    Por que não usar um seletor CSS fixo tipo '.badge-unread': a
    WhatsApp Web muda os nomes de classe com frequência, o que quebraria
    isso a cada atualização deles. Em vez disso:
      - o NOME do chat vem do atributo `title` (mais estável, é usado
        pra acessibilidade/tooltip);
      - a CONTAGEM de não lidas vem do primeiro <span> dentro da linha
        cujo texto seja só dígitos — o número em si aparece igual
        independente do idioma da interface (só o aria-label ao redor
        muda: "3 unread messages" / "3 mensagens não lidas" etc.).

    Isso é mais resistente a mudanças de layout, mas ainda pode quebrar
    se a WhatsApp Web mudar a estrutura da lista de conversas — nesse
    caso normalmente basta ajustar o seletor '#pane-side [role="row"]'
    abaixo pro que estiver atual.
    """
    linhas = page.evaluate(
        """
        () => {
            const linhas = Array.from(
                document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]')
            );
            const resultado = [];
            for (const linha of linhas) {
                const tituloEl = linha.querySelector('span[title]');
                const titulo = tituloEl
                    ? tituloEl.getAttribute('title')
                    : (linha.textContent || '').trim().slice(0, 40);
                if (!titulo) continue;

                let naoLidas = 0;
                const spans = linha.querySelectorAll('span');
                for (const s of spans) {
                    const texto = (s.textContent || '').trim();
                    if (/^\\d+$/.test(texto)) {
                        naoLidas = parseInt(texto, 10);
                        break;
                    }
                }
                resultado.push({ titulo, naoLidas });
            }
            return resultado;
        }
        """
    )

    novo_estado = {}
    novidades = []

    for linha in linhas:
        titulo = linha["titulo"]
        nao_lidas = linha["naoLidas"]
        novo_estado[titulo] = nao_lidas

        if ignorar_notificacao:
            continue  # primeira leitura só estabelece a base, não avisa de nada

        anterior = estado_anterior.get(titulo, 0)
        if nao_lidas > anterior:
            novidades.append({
                "chat": titulo,
                "mensagens_novas": nao_lidas - anterior,
                "total_nao_lidas": nao_lidas,
            })

    return novo_estado, novidades


def _notificar_nova_mensagem(novidade: dict):
    """
    Publica o evento de nova mensagem pro resto do JARVIS ouvir.

    Este módulo só sabe conversar com `ui_bridge` — ele NÃO sabe como o
    seu JARVIS toca voz (TTS). Por isso o evento carrega:
      - os dados brutos (chat, quantidade), pra UI montar um toast/badge;
      - um campo `falar` = True e um `texto_para_falar` já pronto, pra
        onde quer que você trate a fala (loop principal do assistente,
        outro listener de ui_bridge, etc.) só pegar o texto e mandar
        pro TTS sem precisar remontar a frase.

    Se o seu `ui_bridge` já tem um jeito de "falar" diretamente (por
    exemplo `ui_bridge.falar(texto)`), é só trocar/adicionar a chamada
    aqui.
    """
    chat = novidade["chat"]
    qtd = novidade["mensagens_novas"]

    if qtd == 1:
        texto = f"Você tem uma mensagem nova de {chat}."
    else:
        texto = f"Você tem {qtd} mensagens novas de {chat}."

    ui_bridge.broadcast({
        "type": "whatsapp_nova_mensagem",
        "chat": chat,
        "mensagens_novas": qtd,
        "total_nao_lidas": novidade["total_nao_lidas"],
        "falar": True,
        "texto_para_falar": texto,
    })


# ============================================================
# API PÚBLICA (chamada pelas tools em tools.py)
# ============================================================

def browser_open(url: str):
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    resultado = _enviar_comando("abrir", url=url)
    if resultado.get("success"):
        resultado["message"] = f"Página aberta: {resultado.get('titulo') or url}"
    return resultado


def browser_click(alvo: str):
    resultado = _enviar_comando("clicar", alvo=alvo)
    if resultado.get("success"):
        resultado["message"] = f"Cliquei em '{alvo}'. Agora em: {resultado.get('titulo')}"
    return resultado


def browser_type(alvo: str, texto: str, enter: bool = False):
    resultado = _enviar_comando("digitar", alvo=alvo, texto=texto, enter=enter)
    if resultado.get("success"):
        resultado["message"] = f"Digitei em '{alvo}'."
    return resultado


def browser_scroll(direcao: str = "baixo", quantidade: int = 800):
    resultado = _enviar_comando("rolar", direcao=direcao, quantidade=quantidade)
    if resultado.get("success"):
        resultado["message"] = f"Rolei a página para {direcao}."
    return resultado


def browser_back():
    resultado = _enviar_comando("voltar")
    if resultado.get("success"):
        resultado["message"] = f"Voltei para: {resultado.get('titulo')}"
    return resultado


def browser_forward():
    resultado = _enviar_comando("avancar")
    if resultado.get("success"):
        resultado["message"] = f"Avancei para: {resultado.get('titulo')}"
    return resultado


def browser_read():
    resultado = _enviar_comando("ler")
    if resultado.get("success"):
        resultado["message"] = "Conteúdo da página lido."
    return resultado


def browser_monitorar_whatsapp(ativar: bool = True, intervalo_segundos: int = INTERVALO_MONITORAMENTO_PADRAO_S):
    """
    Liga/desliga o monitoramento de novas mensagens do WhatsApp Web.

    Pré-requisito: a página atual (aberta com browser_open) precisa ser
    o web.whatsapp.com e já estar logada (QR code escaneado). Enquanto
    ligado, a cada `intervalo_segundos` a thread do navegador confere se
    algum chat ganhou mensagens não lidas novas e, se sim, publica um
    evento `whatsapp_nova_mensagem` via ui_bridge (com aviso pra UI e um
    texto pronto pra ser falado).
    """
    if ativar:
        return _enviar_comando("monitorar_whatsapp_ligar", intervalo_segundos=intervalo_segundos)
    return _enviar_comando("monitorar_whatsapp_desligar")


def browser_close():
    return _enviar_comando("fechar")