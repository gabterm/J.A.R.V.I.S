import http.server
import os
import threading
from pathlib import Path

import yt_dlp

import tools.ui_bridge as ui_bridge


CACHE_DIR = Path(os.path.expanduser("~/.jarvis/music_cache"))
SERVIDOR_PORTA = 8766

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
