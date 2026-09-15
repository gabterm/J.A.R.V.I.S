import http.server
import json
import os
import threading
from datetime import datetime
from pathlib import Path

import yt_dlp

import tools.ui_bridge as ui_bridge


CACHE_DIR = Path(os.path.expanduser("~/.jarvis/music_cache"))
SERVIDOR_PORTA = 8766

HISTORY_PATH = os.path.expanduser("~/.jarvis/music_history.json")
HISTORY_MAX = 200

_servidor_lock = threading.Lock()
_servidor_iniciado = False


def _garantir_pasta_cache():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


class AudioHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, format, *args):
        print(
            f"[MUSIC HTTP] "
            f"{self.address_string()} - "
            f"{format % args}"
        )


def _garantir_servidor_audio_rodando():
    global _servidor_iniciado

    with _servidor_lock:
        if _servidor_iniciado:
            return

        _garantir_pasta_cache()

        servidor = http.server.ThreadingHTTPServer(
            ("127.0.0.1", SERVIDOR_PORTA),
            lambda *args, **kwargs: AudioHandler(
                *args,
                directory=str(CACHE_DIR),
                **kwargs,
            ),
        )

        thread = threading.Thread(
            target=servidor.serve_forever,
            daemon=True,
            name="jarvis-music-server",
        )

        thread.start()

        _servidor_iniciado = True

        print(
            f"[MUSIC] Servidor de áudio: "
            f"http://127.0.0.1:{SERVIDOR_PORTA}"
        )

def listar_recentes(limite=12):
    """Lista as músicas mais recentes do histórico que ainda estão em cache local."""
    historico = _load_history()
    recentes = []
    for item in historico:
        caminho = _caminho_cache(item["video_id"])
        if caminho.exists() and caminho.stat().st_size > 0:
            recentes.append(item)
        if len(recentes) >= limite:
            break
    return {"success": True, "count": len(recentes), "recentes": recentes}


def tocar_do_historico(video_id: str):
    """Toca uma música do histórico. Usa o arquivo em cache se ainda existir;
    se o cache tiver sido limpo, cai no fluxo normal de download via `tocar`."""
    historico = _load_history()
    entrada = next((h for h in historico if h["video_id"] == video_id), None)
    if not entrada:
        return {"success": False, "message": "Música não encontrada no histórico."}

    caminho = _caminho_cache(video_id)
    if not caminho.exists() or caminho.stat().st_size <= 0:
        return tocar(
            video_id,
            entrada["watch_url"],
            entrada["titulo"],
            entrada["artistas"],
            entrada.get("thumbnail"),
        )

    _garantir_servidor_audio_rodando()
    url_local = f"http://127.0.0.1:{SERVIDOR_PORTA}/{caminho.name}"

    # sobe de novo pro topo do histórico
    _registrar_historico(
        video_id, entrada["watch_url"], entrada["titulo"],
        entrada["artistas"], entrada.get("thumbnail"),
    )

    ui_bridge.broadcast({
        "type": "play_audio",
        "url": url_local,
        "titulo": entrada["titulo"],
        "artistas": entrada["artistas"],
        "thumbnail": entrada.get("thumbnail"),
    })

    return {"success": True, "url": url_local, "titulo": entrada["titulo"], "artistas": entrada["artistas"]}


def abrir_painel_recentes(limite=12):
    """Manda o histórico pra UI abrir o painel de músicas recentes."""
    resultado = listar_recentes(limite)
    if resultado["success"]:
        ui_bridge.broadcast({"type": "music_recent", "recentes": resultado["recentes"]})
    return resultado


def _caminho_cache(video_id: str) -> Path:
    return CACHE_DIR / f"{video_id}.mp3"


def _baixar_audio(video_id: str, watch_url: str) -> Path:
    destino = _caminho_cache(video_id)

    if destino.exists() and destino.stat().st_size > 0:
        print(f"[MUSIC] Cache encontrado: {destino}")
        return destino

    _garantir_pasta_cache()

    opcoes = {
        "format": "bestaudio/best",

        "outtmpl": str(
            CACHE_DIR / f"{video_id}.%(ext)s"
        ),

        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],

        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }

    print(f"[MUSIC] Baixando: {watch_url}")

    with yt_dlp.YoutubeDL(opcoes) as ydl:
        ydl.download([watch_url])

    if not destino.exists():
        raise RuntimeError(
            f"Áudio não encontrado após download: {destino}"
        )

    if destino.stat().st_size <= 0:
        raise RuntimeError(
            f"Arquivo de áudio vazio: {destino}"
        )

    print(
        f"[MUSIC] Áudio pronto: "
        f"{destino} "
        f"({destino.stat().st_size} bytes)"
    )

    return destino


# ============================================================
# HISTÓRICO — usado por tools/music_library.py (playlists/recentes).
# Guardado como JSON simples, mesmo padrão de reminders/alarms em
# tools.py. Cada entrada guarda os metadados já conhecidos no momento
# em que a música tocou, pra listar/reusar sem precisar rebuscar no
# YTMusic depois.
# ============================================================

def _load_history():
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_history(historico):
    os.makedirs(os.path.dirname(HISTORY_PATH), exist_ok=True)
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(historico, f, ensure_ascii=False, indent=2)


def _registrar_historico(video_id, watch_url, titulo, artistas, thumbnail):
    historico = _load_history()
    # remove uma entrada anterior da mesma música, se existir, pra ela
    # "subir" pro topo em vez de duplicar
    historico = [h for h in historico if h["video_id"] != video_id]
    historico.insert(0, {
        "video_id": video_id,
        "watch_url": watch_url,
        "titulo": titulo,
        "artistas": artistas,
        "thumbnail": thumbnail,
        "tocado_em": datetime.now().astimezone().isoformat(),
    })
    _save_history(historico[:HISTORY_MAX])


def tocar(
    video_id: str,
    watch_url: str,
    titulo: str,
    artistas: str,
    thumbnail: str = None,
):
    _garantir_servidor_audio_rodando()

    try:
        caminho = _baixar_audio(
            video_id,
            watch_url,
        )

    except Exception as error:
        print(f"[MUSIC] Falha ao baixar áudio: {error}")

        return {
            "success": False,
            "message": f"Falha ao baixar o áudio: {error}",
        }

    url_local = (
        f"http://127.0.0.1:{SERVIDOR_PORTA}/"
        f"{caminho.name}"
    )

    print(f"[MUSIC] URL: {url_local}")

    _registrar_historico(video_id, watch_url, titulo, artistas, thumbnail)

    ui_bridge.broadcast(
        {
            "type": "play_audio",
            "url": url_local,
            "titulo": titulo,
            "artistas": artistas,
            "thumbnail": thumbnail,
        }
    )

    return {
        "success": True,
        "url": url_local,
        "titulo": titulo,
        "artistas": artistas,
    }