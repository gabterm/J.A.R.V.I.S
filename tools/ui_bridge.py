import asyncio
import json
import queue
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent.parent
INTERFACE_DIR = BASE_DIR / "interface"

JS_FILE = INTERFACE_DIR / "script.js"
HTML_FILE = INTERFACE_DIR / "jarvis-hud.html"
CSS_FILE = INTERFACE_DIR / "style.css"

HOST = "127.0.0.1"
PORT = 8765
_clients = set()
_loop = None

mensagens_entrada = queue.Queue()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop

    _loop = asyncio.get_running_loop()

    yield


app = FastAPI(lifespan=lifespan)

app.mount(
    "/static",
    StaticFiles(directory=INTERFACE_DIR),
    name="static",
)

@app.get("/script.js")
async def javascript():
    return FileResponse(
        JS_FILE,
        media_type="application/javascript",
    )

@app.get("/")
async def index():
    return FileResponse(HTML_FILE)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _clients.add(websocket)

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                evento = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if evento.get("type") == "command":
                texto = (evento.get("text") or "").strip()

                if texto:
                    mensagens_entrada.put(texto)

    except WebSocketDisconnect:
        _clients.discard(websocket)


async def _broadcast_async(event: dict):
    payload = json.dumps(event, ensure_ascii=False)
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
    Chame isso a partir do main.py (código síncrono normal) para mandar
    um evento pra interface.

    Ex:
        broadcast({"type": "log", "role": "user", "text": "oi"})
        broadcast({"type": "status", "state": "speaking"})
        broadcast({"type": "memory", "facts": {...}})
    """

    if _loop is None:
        return

    asyncio.run_coroutine_threadsafe(
        _broadcast_async(event),
        _loop,
    )


def start_server_in_background():
    """
    Sobe o servidor numa thread separada, sem travar o loop principal
    do JARVIS.
    """

    if not HTML_FILE.exists():
        print(
            f"⚠️  Não encontrei '{HTML_FILE.name}' em {HTML_FILE.parent}. "
            f"Coloque o arquivo jarvis-hud.html na mesma pasta do main.py "
            f"para a interface funcionar."
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

    print(f"🖥️  Interface disponível em: http://{HOST}:{PORT}")