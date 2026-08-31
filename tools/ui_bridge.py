import asyncio
import json
import queue
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent.parent
INTERFACE_DIR = BASE_DIR / "interface"

JS_FILE = INTERFACE_DIR / "main.js"
HTML_FILE = INTERFACE_DIR / "jarvis-hud.html"
CSS_FILE = INTERFACE_DIR / "style.css"

HOST = "127.0.0.1"
PORT = 8765

_clients = set()
_loop = None


# ============================================================
# FILAS DE ENTRADA
# ============================================================

# Comandos de texto enviados para o fluxo normal do JARVIS.
mensagens_entrada = queue.Queue()

jarvis_falando = threading.Event()

# Escuta contínua do microfone (tools/mic_listener.py) — ligada por
# padrão. Desligada via {"type": "mic_toggle", "ativo": false} vindo do
# frontend, ou pela tool toggle_microphone (chamável por voz/texto); o
# callback de captura em mic_listener.py checa esse evento e descarta
# qualquer áudio enquanto ele estiver limpo, sem precisar fechar/reabrir
# a InputStream a cada toggle.
microfone_ativo = threading.Event()
microfone_ativo.set()

# Ações estruturadas da interface.
acoes_entrada = queue.Queue()


# ============================================================
# LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop

    _loop = asyncio.get_running_loop()

    yield


app = FastAPI(lifespan=lifespan)


# ============================================================
# ARQUIVOS ESTÁTICOS
# ============================================================

app.mount(
    "/static",
    StaticFiles(directory=INTERFACE_DIR),
    name="static",
)


@app.get("/main.js")
async def javascript():
    return RedirectResponse(url="/static/js/main.js")


@app.get("/")
async def index():
    return FileResponse(HTML_FILE)


# ============================================================
# PROXY DE EMBED
# ============================================================
#
# Busca a página real por trás do servidor (em vez de o navegador buscar
# direto) e devolve o conteúdo sem os headers que bloqueiam exibição em
# <iframe> (X-Frame-Options / Content-Security-Policy: frame-ancestors).
# Como, do ponto de vista do navegador, o conteúdo passa a vir da mesma
# origem do HUD (127.0.0.1:8765), a regra de bloqueio do site original
# nem chega a se aplicar.
#
# Limitações conhecidas (não dá pra contornar só tirando headers):
#   - sites que fazem "frame-busting" via JavaScript, checando
#     window.top !== window.self e recusando renderizar;
#   - conteúdo que depende de cookies de sessão do domínio original
#     (login) — a sessão do usuário não é repassada automaticamente.

_HEADERS_A_REMOVER = {
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
}


@app.get("/proxy")
async def proxy(url: str, request: Request):
    # Repassa o header Range (pedido de "só esse trecho do arquivo") pra
    # origem. É isso que permite ao navegador buscar um vídeo grande em
    # pedaços — sem isso, ele teria que esperar o arquivo inteiro ser
    # baixado no servidor antes de receber o primeiro byte, o que deixa
    # tudo lento e quebra a barra de progresso/seek do player.
    headers_saida = {"User-Agent": "Mozilla/5.0 (JARVIS HUD Proxy)"}
    range_header = request.headers.get("range")
    if range_header:
        headers_saida["Range"] = range_header

    client = httpx.AsyncClient(follow_redirects=True, timeout=30)

    try:
        requisicao = client.build_request("GET", url, headers=headers_saida)
        resposta = await client.send(requisicao, stream=True)
    except Exception as error:
        await client.aclose()
        return Response(
            content=f"Não foi possível carregar a página: {error}",
            status_code=502,
            media_type="text/plain",
        )

    content_type = resposta.headers.get("content-type", "")

    if "text/html" in content_type:
        # Páginas HTML costumam ser pequenas (diferente de vídeo/áudio),
        # então bufferizar o corpo aqui pra injetar o <base> não pesa.
        html_bytes = await resposta.aread()
        await resposta.aclose()
        await client.aclose()

        html = html_bytes.decode(resposta.encoding or "utf-8", errors="replace")

        # <base> resolve os caminhos relativos da página (css, imagens,
        # links internos) contra a URL original, sem precisar reescrever
        # cada URL manualmente dentro do HTML.
        base_tag = f'<base href="{url}">'
        if "<head>" in html:
            html = html.replace("<head>", f"<head>{base_tag}", 1)
        else:
            idx = html.find("<head")
            fim_tag = html.find(">", idx) if idx != -1 else -1
            if fim_tag != -1:
                html = html[: fim_tag + 1] + base_tag + html[fim_tag + 1 :]
            else:
                html = base_tag + html

        return Response(content=html, media_type="text/html")

    # Recursos não-HTML (vídeo, áudio, imagem, etc.): faz streaming direto
    # pro navegador, em pedaços, sem bufferizar o arquivo inteiro em
    # memória — e preserva o status 206/Content-Range da origem quando a
    # resposta for parcial (Range), essencial pra vídeo carregar rápido
    # e permitir avançar/voltar no player.
    headers_repassados = {
        chave: valor
        for chave, valor in resposta.headers.items()
        if chave.lower() not in _HEADERS_A_REMOVER
    }

    async def gerador_de_chunks():
        try:
            async for chunk in resposta.aiter_bytes():
                yield chunk
        finally:
            await resposta.aclose()
            await client.aclose()

    return StreamingResponse(
        gerador_de_chunks(),
        status_code=resposta.status_code,
        media_type=content_type or None,
        headers=headers_repassados,
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _clients.add(websocket)

    # Sincroniza o estado atual do microfone assim que o cliente conecta —
    # essencial se ele foi desligado por outra aba/dispositivo antes desta
    # conexão existir, ou pela tool toggle_microphone via voz/texto.
    await websocket.send_text(json.dumps({
        "type": "mic_state",
        "ativo": microfone_ativo.is_set(),
    }, ensure_ascii=False))

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                evento = json.loads(raw)
            except json.JSONDecodeError:
                continue

            tipo = evento.get("type")

            if tipo == "command":
                texto = (evento.get("text") or "").strip()

                if texto:
                    mensagens_entrada.put(texto)

    
            elif tipo == "tool_call":
                nome = evento.get("name")
                args = evento.get("args") or {}

                if not nome:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "tool_result",
                                "name": "",
                                "success": False,
                                "message": "Nome da ferramenta não informado.",
                            },
                            ensure_ascii=False,
                        )
                    )
                    continue

                # IMPORTANTE:
                #
                # Não fazemos:
                #
                # from tools.tools import TOOL_FUNCTIONS
                #
                # no topo do arquivo.
                #
                # Isso causaria import circular porque
                # tools.tools também importa ui_bridge.
                from tools.tools import TOOL_FUNCTIONS

                func = TOOL_FUNCTIONS.get(nome)

                # ----------------------------------------------
                # FERRAMENTA NÃO EXISTE
                # ----------------------------------------------

                if not func:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "tool_result",
                                "name": nome,
                                "success": False,
                                "message": (
                                    f'Ferramenta desconhecida: "{nome}".'
                                ),
                            },
                            ensure_ascii=False,
                        )
                    )
                    continue

                # ----------------------------------------------
                # AVISA A UI QUE COMEÇOU
                # ----------------------------------------------

                broadcast(
                    {
                        "type": "tool_exec",
                        "name": nome,
                        "status": "running",
                    }
                )

                try:
                    # Executa a ferramenta fora do event loop.
                    resultado = await asyncio.to_thread(
                        func,
                        **args,
                    )

                    # ------------------------------------------
                    # RESULTADO
                    # ------------------------------------------

                    broadcast(
                        {
                            "type": "tool_result",
                            "name": nome,
                            "success": True,
                            "data": resultado,
                        }
                    )

                except Exception as error:
                    # ------------------------------------------
                    # ERRO
                    # ------------------------------------------

                    broadcast(
                        {
                            "type": "tool_result",
                            "name": nome,
                            "success": False,
                            "message": str(error),
                        }
                    )

            # ==================================================
            # AÇÕES DA TIMELINE
            # ==================================================

            elif tipo == "timeline_action":
                item_id = evento.get("id")
                acao = evento.get("action")

                if item_id and acao in ("pin", "unpin", "remove"):
                    acoes_entrada.put(
                        {
                            "id": item_id,
                            "action": acao,
                        }
                    )

            # ==================================================
            # INTERROMPER FALA
            # ==================================================
            #
            # Ação em tempo real (não passa pelo LLM nem pelas filas):
            # corta a reprodução de áudio que estiver rolando agora e
            # sinaliza pro loop de falar_resposta() (em main.py) parar
            # de emendar as frases seguintes da resposta atual.

            elif tipo == "stop_speaking":
                from tools.voice import parar_fala

                parar_fala()
                broadcast({"type": "status", "state": "idle"})

            # ==================================================
            # LIGAR/DESLIGAR MICROFONE (escuta contínua)
            # ==================================================
            #
            # Controla tools/mic_listener.py: o callback de captura lá
            # checa esse mesmo Event antes de processar qualquer áudio.
            # Rebroadcasta o estado pra sincronizar todas as interfaces
            # conectadas (útil se houver mais de um cliente aberto). O
            # mesmo caminho é usado pela tool toggle_microphone, chamada
            # pelo modelo quando o pedido vem por voz/texto em vez do
            # clique no botão.

            elif tipo == "mic_toggle":
                ativo = evento.get("ativo")

                if ativo is None:
                    ativo = not microfone_ativo.is_set()

                if ativo:
                    microfone_ativo.set()
                else:
                    microfone_ativo.clear()

                broadcast({
                    "type": "mic_state",
                    "ativo": microfone_ativo.is_set(),
                })

    except WebSocketDisconnect:
        _clients.discard(websocket)

    except Exception:
        _clients.discard(websocket)


# ============================================================
# BROADCAST
# ============================================================

async def _broadcast_async(event: dict):
    payload = json.dumps(
        event,
        ensure_ascii=False,
    )

    mortos = []

    for ws in _clients:
        try:
            await ws.send_text(payload)

        except Exception:
            mortos.append(ws)

    for ws in mortos:
        _clients.discard(ws)


def broadcast(event: dict):
    """
    Envia um evento para todas as interfaces conectadas.

    Pode ser chamado pelo main.py ou por qualquer código síncrono.
    """

    if _loop is None:
        return

    asyncio.run_coroutine_threadsafe(
        _broadcast_async(event),
        _loop,
    )


# ============================================================
# SERVIDOR EM BACKGROUND
# ============================================================

def start_server_in_background():
    """
    Sobe o servidor em uma thread separada,
    sem bloquear o loop principal do JARVIS.
    """

    if not HTML_FILE.exists():
        print(
            f"⚠️  Não encontrei '{HTML_FILE.name}' "
            f"em {HTML_FILE.parent}. "
            f"Coloque o arquivo jarvis-hud.html "
            f"na pasta da interface."
        )

    def _run():
        uvicorn.run(
            app,
            host=HOST,
            port=PORT,
            log_level="warning",
        )

    thread = threading.Thread(
        target=_run,
        daemon=True,
    )

    thread.start()

    print(
        f"🖥️  Interface disponível em: "
        f"http://{HOST}:{PORT}"
    )