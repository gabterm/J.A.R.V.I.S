import os
import subprocess
import urllib.parse
import webbrowser
import xml.etree.ElementTree as ET
import json
import time
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen, Request
from zoneinfo import ZoneInfo
import uuid
from ytmusicapi import YTMusic

import tools.ui_bridge as ui_bridge
from tools.voice import speak, limpar_para_fala


WMO_CODE_MAP = {
    0: ("céu limpo", "ceu_limpo"),
    1: ("poucas nuvens", "ceu_limpo"),
    2: ("parcialmente nublado", "nublado"),
    3: ("nublado", "nublado"),
    45: ("neblina", "neblina"),
    48: ("neblina com geada", "neblina"),
    51: ("garoa fraca", "chuva"),
    53: ("garoa", "chuva"),
    55: ("garoa forte", "chuva"),
    56: ("garoa congelante", "chuva"),
    57: ("garoa congelante forte", "chuva"),
    61: ("chuva fraca", "chuva"),
    63: ("chuva", "chuva"),
    65: ("chuva forte", "chuva"),
    66: ("chuva congelante", "chuva"),
    67: ("chuva congelante forte", "chuva"),
    71: ("neve fraca", "neve"),
    73: ("neve", "neve"),
    75: ("neve forte", "neve"),
    77: ("grãos de neve", "neve"),
    80: ("pancadas de chuva fracas", "chuva"),
    81: ("pancadas de chuva", "chuva"),
    82: ("pancadas de chuva fortes", "chuva"),
    85: ("pancadas de neve fracas", "neve"),
    86: ("pancadas de neve fortes", "neve"),
    95: ("tempestade", "tempestade"),
    96: ("tempestade com granizo", "tempestade"),
    99: ("tempestade forte com granizo", "tempestade"),
}


REMINDERS_PATH = os.path.expanduser("~/.jarvis/reminders.json")

def _load_reminders():
    try:
        with open(REMINDERS_PATH, "r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        return []
    except Exception:
        return []


def _save_reminders(reminders):
    os.makedirs(os.path.dirname(REMINDERS_PATH), exist_ok=True)
    with open(REMINDERS_PATH, "w", encoding="utf-8") as file:
        json.dump(reminders, file, ensure_ascii=False, indent=2)


def _broadcast_reminders(reminders):
    ui_bridge.broadcast({
        "type": "reminders",
        "items": reminders,
    })


def add_reminder(texto: str, quando: str = None):
    try:
        reminders = _load_reminders()

        novo = {
            "id": str(uuid.uuid4()),
            "texto": texto,
            "quando": quando,
            "concluido": False,
        }

        reminders.append(novo)
        _save_reminders(reminders)
        _broadcast_reminders(reminders)

        return {
            "success": True,
            "reminder": novo,
            "message": f"Lembrete adicionado: {texto}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível adicionar o lembrete: {error}",
        }


def list_reminders():
    try:
        reminders = _load_reminders()
        _broadcast_reminders(reminders)

        return {
            "success": True,
            "count": len(reminders),
            "reminders": reminders,
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível listar os lembretes: {error}",
        }


def complete_reminder(texto: str):
    try:
        reminders = _load_reminders()
        encontrado = None

        for reminder in reminders:
            if texto.lower() in reminder["texto"].lower() and not reminder["concluido"]:
                reminder["concluido"] = True
                encontrado = reminder
                break

        if not encontrado:
            return {
                "success": False,
                "message": f"Nenhum lembrete pendente encontrado com: {texto}",
            }

        _save_reminders(reminders)
        _broadcast_reminders(reminders)

        return {
            "success": True,
            "reminder": encontrado,
            "message": f"Lembrete concluído: {encontrado['texto']}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível concluir o lembrete: {error}",
        }


def remove_reminder(texto: str):
    try:
        reminders = _load_reminders()
        tamanho_original = len(reminders)

        reminders = [
            r for r in reminders if texto.lower() not in r["texto"].lower()
        ]

        if len(reminders) == tamanho_original:
            return {
                "success": False,
                "message": f"Nenhum lembrete encontrado com: {texto}",
            }

        _save_reminders(reminders)
        _broadcast_reminders(reminders)

        return {
            "success": True,
            "message": f"Lembrete(s) removido(s): {texto}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível remover o lembrete: {error}",
        }


def get_weather(local: str = "São Paulo, BR"):
    try:
        geocode_url = (
            "https://geocoding-api.open-meteo.com/v1/search?"
            f"name={urllib.parse.quote_plus(local)}"
            "&count=1&language=pt&format=json"
        )

        with urlopen(geocode_url, timeout=10) as response:
            geocode_data = json.loads(response.read())

        results = geocode_data.get("results")

        if not results:
            return {
                "success": False,
                "message": f"Local não encontrado: {local}",
            }

        place = results[0]
        latitude = place["latitude"]
        longitude = place["longitude"]
        nome_local = ", ".join(
            filter(None, [place.get("name"), place.get("admin1"), place.get("country")])
        )

        forecast_url = (
            "https://api.open-meteo.com/v1/forecast?"
            f"latitude={latitude}&longitude={longitude}"
            "&current=temperature_2m,apparent_temperature,"
            "relative_humidity_2m,weather_code,wind_speed_10m"
            "&daily=temperature_2m_min,temperature_2m_max"
            "&timezone=auto"
        )

        with urlopen(forecast_url, timeout=10) as response:
            forecast_data = json.loads(response.read())

        current = forecast_data["current"]
        daily = forecast_data["daily"]
        weather_code = current.get("weather_code", 0)
        condicao, icone = WMO_CODE_MAP.get(weather_code, ("indefinido", "nublado"))

        payload = {
            "type": "weather",
            "temp": current["temperature_2m"],
            "sensacao": current["apparent_temperature"],
            "umidade": current["relative_humidity_2m"],
            "vento": round(current["wind_speed_10m"]),
            "min": daily["temperature_2m_min"][0],
            "max": daily["temperature_2m_max"][0],
            "condicao": condicao,
            "local": nome_local,
            "icone": icone,
        }

        ui_bridge.broadcast(payload)

        return {
            "success": True,
            "local": nome_local,
            "temperatura": current["temperature_2m"],
            "condicao": condicao,
            "message": (
                f"Em {nome_local}: {current['temperature_2m']}°C, {condicao}."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível obter o clima: {error}",
        }

def get_current_time(timezone: str = "America/Sao_Paulo"):
    try:
        now = datetime.now(ZoneInfo(timezone))

        return {
            "success": True,
            "timezone": timezone,
            "date": now.strftime("%d/%m/%Y"),
            "time": now.strftime("%H:%M:%S"),
            "formatted": now.strftime("%d/%m/%Y às %H:%M:%S"),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Fuso horário inválido: {error}",
        }


def get_current_date(timezone: str = "America/Sao_Paulo"):
    try:
        now = datetime.now(ZoneInfo(timezone))

        return {
            "success": True,
            "timezone": timezone,
            "date": now.strftime("%d/%m/%Y"),
            "day_of_week": now.strftime("%A"),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Fuso horário inválido: {error}",
        }


def open_website(url: str):
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        webbrowser.open(url)

        return {
            "success": True,
            "url": url,
            "message": f"Site aberto: {url}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível abrir o site: {error}",
        }


def search_web(query: str):
    try:
        encoded_query = urllib.parse.quote_plus(query)

        url = (
            "https://www.google.com/search?q="
            + encoded_query
        )

        webbrowser.open(url)

        return {
            "success": True,
            "query": query,
            "url": url,
            "message": f"Pesquisa aberta para: {query}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível pesquisar: {error}",
        }


def open_application(application: str):
    try:
        subprocess.Popen(
            ["open", "-a", application],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        return {
            "success": True,
            "application": application,
            "message": f"Aplicativo aberto: {application}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": (
                f"Não foi possível abrir "
                f"{application}: {error}"
            ),
        }


def close_application(application: str):
    try:
        subprocess.run(
            ["osascript", "-e", f'quit app "{application}"'],
            check=True,
            capture_output=True,
            text=True,
        )

        return {
            "success": True,
            "application": application,
            "message": f"Aplicativo fechado: {application}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": (
                f"Não foi possível fechar {application}: {error}"
            ),
        }


def open_folder(path: str):
    expanded_path = os.path.expanduser(path)

    if not os.path.exists(expanded_path):
        return {
            "success": False,
            "message": f"O caminho não existe: {expanded_path}",
        }

    if not os.path.isdir(expanded_path):
        return {
            "success": False,
            "message": f"O caminho não é uma pasta: {expanded_path}",
        }

    try:
        subprocess.Popen(["open", expanded_path])

        return {
            "success": True,
            "path": expanded_path,
            "message": f"Pasta aberta: {expanded_path}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível abrir a pasta: {error}",
        }


def list_files(path: str):
    expanded_path = os.path.expanduser(path)

    if not os.path.exists(expanded_path):
        return {
            "success": False,
            "message": f"O caminho não existe: {expanded_path}",
        }

    if not os.path.isdir(expanded_path):
        return {
            "success": False,
            "message": (
                f"O caminho não é um diretório: {expanded_path}"
            ),
        }

    try:
        files = []

        for item in Path(expanded_path).iterdir():
            files.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
            })

        return {
            "success": True,
            "path": expanded_path,
            "files": files,
        }

    except Exception as error:
        return {
            "success": False,
            "message": (
                f"Não foi possível listar os arquivos: {error}"
            ),
        }


def run_terminal(command: str):
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
        )

        return {
            "success": result.returncode == 0,
            "command": command,
            "return_code": result.returncode,
            "stdout": result.stdout[-5000:],
            "stderr": result.stderr[-5000:],
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "command": command,
            "message": "O comando excedeu o limite de 30 segundos.",
        }

    except Exception as error:
        return {
            "success": False,
            "command": command,
            "message": str(error),
        }


def take_screenshot(save_path: str = "~/Desktop/screenshot.png"):
    expanded_path = os.path.expanduser(save_path)

    try:
        subprocess.run(
            ["screencapture", "-x", expanded_path],
            check=True,
            capture_output=True,
            text=True,
        )

        return {
            "success": True,
            "path": expanded_path,
            "message": f"Captura de tela salva em: {expanded_path}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível capturar a tela: {error}",
        }


def lock_screen():
    try:
        subprocess.run(
            [
                "/System/Library/CoreServices/"
                "Menu Extras/User.menu/Contents/Resources/CGSession",
                "-suspend",
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        return {
            "success": True,
            "message": "Tela bloqueada.",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível bloquear a tela: {error}",
        }


def set_volume(level: int):
    clamped_level = max(0, min(100, level))

    try:
        subprocess.run(
            [
                "osascript",
                "-e",
                f"set volume output volume {clamped_level}",
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        return {
            "success": True,
            "level": clamped_level,
            "message": f"Volume ajustado para {clamped_level}%.",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível ajustar o volume: {error}",
        }


def get_battery_status():
    try:
        result = subprocess.run(
            ["pmset", "-g", "batt"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        return {
            "success": result.returncode == 0,
            "status": result.stdout.strip(),
        }

    except Exception as error:
        return {
            "success": False,
            "message": (
                f"Não foi possível obter o status da bateria: {error}"
            ),
        }


def show_notification(title: str, message: str):
    try:
        subprocess.run(
            [
                "osascript",
                "-e",
                f'display notification "{message}" with title "{title}"',
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        return {
            "success": True,
            "title": title,
            "message": message,
        }

    except Exception as error:
        return {
            "success": False,
            "message": (
                f"Não foi possível exibir a notificação: {error}"
            ),
        }


def get_daily_news(query: str = "", limit: int = 5):
    try:
        if query:
            encoded_query = urllib.parse.quote_plus(query)
            rss_url = (
                "https://news.google.com/rss/search?q="
                f"{encoded_query}&hl=pt-BR&gl=BR&ceid=BR:pt-BR"
            )
        else:
            rss_url = (
                "https://news.google.com/rss"
                "?hl=pt-BR&gl=BR&ceid=BR:pt-BR"
            )

        request = Request(
            rss_url,
            headers={"User-Agent": "Mozilla/5.0"},
        )

        with urlopen(request, timeout=10) as response:
            raw_data = response.read()

        root = ET.fromstring(raw_data)
        items = root.findall("./channel/item")[:limit]

        news = []

        for item in items:
            title = item.findtext("title", default="").strip()
            link = item.findtext("link", default="").strip()
            pub_date = item.findtext("pubDate", default="").strip()

            source_element = item.find(
                "{http://www.google.com/schemas/news}source"
            )
            source = (
                source_element.text
                if source_element is not None
                else None
            )

            news.append({
                "title": title,
                "link": link,
                "source": source,
                "published_at": pub_date,
            })

        if not news:
            return {
                "success": False,
                "message": "Nenhuma notícia encontrada.",
            }

        return {
            "success": True,
            "query": query or "principais notícias",
            "count": len(news),
            "news": news,
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível buscar as notícias: {error}",
        }


_ytmusic_client = None


def _get_ytmusic_client():
    global _ytmusic_client

    if _ytmusic_client is None:
        _ytmusic_client = YTMusic()

    return _ytmusic_client


def play_music(query: str):
    try:
        client = _get_ytmusic_client()

        results = client.search(query, filter="songs", limit=1)

        if not results:
            results = client.search(query, filter="videos", limit=1)

        if not results:
            return {
                "success": False,
                "message": f"Nenhuma música encontrada para: {query}",
            }

        top_result = results[0]
        video_id = top_result.get("videoId")

        if not video_id:
            return {
                "success": False,
                "message": (
                    "A música encontrada não possui um ID válido."
                ),
            }

        watch_url = f"https://music.youtube.com/watch?v={video_id}"
        webbrowser.open(watch_url)

        artists = ", ".join(
            artist["name"] for artist in top_result.get("artists", [])
        )

        return {
            "success": True,
            "title": top_result.get("title"),
            "artists": artists,
            "url": watch_url,
            "message": f"Tocando: {top_result.get('title')} - {artists}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível tocar a música: {error}",
        }


def _validate_coordinate(value, field_name):
    if not isinstance(value, (int, float)):
        return f"Coordenada '{field_name}' inválida: {value!r}"
    if not (0 <= value <= 100):
        return f"Coordenada '{field_name}' fora do intervalo 0-100: {value}"
    return None


def _validate_tactical_frame(frame, index):
    players = frame.get("jogadores")

    if not players:
        return f"Quadro {index + 1} sem jogadores."

    for player in players:
        for field_name in ("x", "y"):
            error = _validate_coordinate(
                player.get(field_name),
                f"jogador {player.get('num')}.{field_name}",
            )
            if error:
                return f"Quadro {index + 1}: {error}"

    ball = frame.get("bola")
    if ball:
        for field_name in ("x", "y"):
            error = _validate_coordinate(ball.get(field_name), f"bola.{field_name}")
            if error:
                return f"Quadro {index + 1}: {error}"

    return None


# Pausa usada entre quadros que não têm nenhuma anotação para narrar —
# sem isso a animação pularia instantaneamente pra esses instantes.
_PAUSA_QUADRO_SEM_NARRACAO = 1.2


def _narrar_quadros_taticos(quadros):
    """
    Percorre os quadros em ordem e, para cada um:
      1. Envia o evento 'tactical_frame' (índice + anotação) — é isso que
         faz a interface avançar a animação para aquele instante.
      2. Fala a anotação daquele instante pelo Fish Audio, bloqueando até
         o áudio terminar.

    Como o passo 2 é bloqueante, a duração de cada quadro na tela é
    exatamente a duração da fala daquele instante — a animação fica
    sincronizada com a narração por construção, não por um timer fixo.
    """

    for index, frame in enumerate(quadros):
        anotacao = frame.get("anotacao") or ""

        ui_bridge.broadcast({
            "type": "tactical_frame",
            "index": index,
            "anotacao": anotacao,
        })

        if anotacao.strip():
            speak(limpar_para_fala(anotacao))
        else:
            time.sleep(_PAUSA_QUADRO_SEM_NARRACAO)


def show_tactical_board(
    titulo: str,
    quadros: list,
    formacao_casa: str = None,
    formacao_visitante: str = None,
):
    if not quadros:
        return {
            "success": False,
            "message": "Nenhum quadro fornecido.",
        }

    for index, frame in enumerate(quadros):
        error = _validate_tactical_frame(frame, index)
        if error:
            return {
                "success": False,
                "message": error,
            }

    try:
        ui_bridge.broadcast({
            "type": "tactical_board",
            "titulo": titulo,
            "formacao_casa": formacao_casa,
            "formacao_visitante": formacao_visitante,
            "quadros": quadros,
        })

        # Narra quadro a quadro, em sincronia com o TTS — bloqueia até a
        # sequência inteira terminar de ser narrada.
        _narrar_quadros_taticos(quadros)

        return {
            "success": True,
            "message": (
                f"Quadro tático '{titulo}' narrado com "
                f"{len(quadros)} instante(s). Não repita a explicação "
                "quadro a quadro na sua resposta final, ela já foi "
                "narrada — só complemente se fizer sentido."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível exibir o quadro tático: {error}",
        }


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": (
                "Obtém a hora atual em um determinado fuso horário. "
                "Use esta ferramenta quando o usuário perguntar "
                "que horas são, a hora atual ou horário atual."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": (
                            "Fuso horário no formato IANA. "
                            "Exemplo: America/Sao_Paulo."
                        ),
                    },
                },
                "required": ["timezone"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_date",
            "description": (
                "Obtém a data atual. Use quando o usuário "
                "perguntar a data de hoje, dia atual ou qual é o dia."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": (
                            "Fuso horário no formato IANA. "
                            "Exemplo: America/Sao_Paulo."
                        ),
                    },
                },
                "required": ["timezone"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_website",
            "description": (
                "Abre um site no navegador padrão. "
                "Use quando o usuário pedir para abrir "
                "um site ou página específica."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL do site.",
                    },
                },
                "required": ["url"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": (
                "Abre uma pesquisa na internet usando o Google. "
                "Use quando o usuário pedir para pesquisar "
                "alguma informação na web."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Termo ou pergunta que deve ser pesquisado."
                        ),
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_application",
            "description": "Abre um aplicativo instalado no macOS.",
            "parameters": {
                "type": "object",
                "properties": {
                    "application": {
                        "type": "string",
                        "description": "Nome do aplicativo instalado.",
                    },
                },
                "required": ["application"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "close_application",
            "description": (
                "Fecha um aplicativo em execução no macOS. "
                "Use quando o usuário pedir para fechar, "
                "encerrar ou sair de um aplicativo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "application": {
                        "type": "string",
                        "description": "Nome do aplicativo em execução.",
                    },
                },
                "required": ["application"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_folder",
            "description": "Abre uma pasta no Finder do macOS.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": (
                            "Caminho da pasta. Pode utilizar ~."
                        ),
                    },
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": (
                "Lista os arquivos e diretórios "
                "existentes em uma pasta."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Caminho do diretório.",
                    },
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_terminal",
            "description": (
                "Executa um comando no terminal do macOS. "
                "Use somente quando o usuário solicitar "
                "uma ação que precise realmente ser executada "
                "no computador."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Comando que deve ser executado.",
                    },
                },
                "required": ["command"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "take_screenshot",
            "description": (
                "Captura a tela do computador e salva como "
                "imagem. Use quando o usuário pedir um print "
                "ou captura de tela."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "save_path": {
                        "type": "string",
                        "description": (
                            "Caminho onde a imagem será salva. "
                            "Padrão: ~/Desktop/screenshot.png."
                        ),
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lock_screen",
            "description": (
                "Bloqueia a tela do macOS. Use quando o "
                "usuário pedir para travar ou bloquear a tela."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_volume",
            "description": (
                "Ajusta o volume do sistema. Use quando o "
                "usuário pedir para aumentar, diminuir ou "
                "definir o volume."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "level": {
                        "type": "integer",
                        "description": (
                            "Nível de volume, de 0 a 100."
                        ),
                    },
                },
                "required": ["level"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_battery_status",
            "description": (
                "Obtém o status da bateria do computador, "
                "incluindo porcentagem e se está carregando."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
                "additionalProperties": False,
            },
        },
    },

    {
        "type": "function",
        "function": {
            "name": "add_reminder",
            "description": (
                "Adiciona um novo lembrete e o exibe no painel de "
                "lembretes da interface. Use quando o usuário pedir "
                "para lembrá-lo de algo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "texto": {
                        "type": "string",
                        "description": "O que deve ser lembrado.",
                    },
                    "quando": {
                        "type": "string",
                        "description": (
                            "Horário ou data do lembrete, em texto livre "
                            "(ex: '15:00', 'amanhã de manhã'). Opcional."
                        ),
                    },
                },
                "required": ["texto"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_reminders",
            "description": (
                "Lista os lembretes atuais e atualiza o painel de "
                "lembretes na interface."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "complete_reminder",
            "description": (
                "Marca um lembrete pendente como concluído, buscando "
                "pelo texto. Use quando o usuário disser que já fez "
                "algo que estava nos lembretes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "texto": {
                        "type": "string",
                        "description": (
                            "Trecho do texto do lembrete a ser concluído."
                        ),
                    },
                },
                "required": ["texto"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_reminder",
            "description": (
                "Remove um ou mais lembretes que contenham o texto "
                "informado. Use quando o usuário pedir para apagar "
                "ou cancelar um lembrete."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "texto": {
                        "type": "string",
                        "description": (
                            "Trecho do texto do lembrete a ser removido."
                        ),
                    },
                },
                "required": ["texto"],
                "additionalProperties": False,
            },
        },
    },

    {
        "type": "function",
        "function": {
            "name": "show_notification",
            "description": (
                "Exibe uma notificação no macOS com título "
                "e mensagem."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Título da notificação.",
                    },
                    "message": {
                        "type": "string",
                        "description": "Mensagem da notificação.",
                    },
                },
                "required": ["title", "message"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": (
                "Busca o clima atual de um local e exibe no painel de "
                "clima da interface. Use quando o usuário perguntar como "
                "está o tempo, a temperatura ou o clima em algum lugar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "local": {
                        "type": "string",
                        "description": (
                            "Nome da cidade (e opcionalmente estado/país). "
                            "Padrão: São Paulo, BR."
                        ),
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_daily_news",
            "description": (
                "Busca as principais notícias do dia (ou notícias "
                "sobre um tema específico) e retorna título, fonte, "
                "link e data de publicação de cada uma. Use quando "
                "o usuário pedir para ver, buscar ou resumir as "
                "notícias do dia."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Tema específico para filtrar as notícias. "
                            "Deixe vazio para as principais notícias gerais."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Quantidade máxima de notícias a retornar. "
                            "Padrão: 5."
                        ),
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_music",
            "description": (
                "Busca e toca uma música específica no YouTube Music, "
                "abrindo diretamente a página de reprodução. Use quando "
                "o usuário pedir para tocar, colocar ou ouvir uma "
                "música, artista ou álbum."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Nome da música, artista ou álbum a ser "
                            "reproduzido. Exemplo: 'Bohemian Rhapsody "
                            "Queen'."
                        ),
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_tactical_board",
            "description": (
                "Exibe e NARRA um quadro tático de futebol na interface: "
                "jogadores, bola e setas sobre um campo. Aceita uma "
                "sequência de 1 ou mais quadros para simular uma "
                "jogada se desenrolando no tempo — cada quadro é um "
                "instante. Esta ferramenta já fala a 'anotacao' de cada "
                "quadro em voz alta, em sincronia com a animação "
                "avançando na interface (um quadro é exibido exatamente "
                "quando sua anotação começa a ser narrada). Por isso, a "
                "anotação de cada quadro deve ser escrita como texto "
                "falado natural, curto e direto — é isso que o usuário "
                "vai ouvir. "
                "Use quando o usuário pedir uma análise tática, "
                "simulação de jogada ou explicação visual de uma "
                "situação de futebol. Coordenadas x e y vão de 0 a "
                "100 (percentual do campo; x=0 é o gol do time da "
                "casa, x=100 é o gol do visitante; y=0 é a lateral de "
                "cima, y=100 é a lateral de baixo). Para jogadas com "
                "movimento, gere de 3 a 6 quadros, cada um com sua "
                "própria anotação."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "titulo": {
                        "type": "string",
                        "description": "Título curto da situação tática.",
                    },
                    "formacao_casa": {
                        "type": "string",
                        "description": "Formação do time da casa, ex: 4-3-3.",
                    },
                    "formacao_visitante": {
                        "type": "string",
                        "description": "Formação do time visitante, ex: 4-4-2.",
                    },
                    "quadros": {
                        "type": "array",
                        "description": (
                            "Sequência de instantes da jogada, em ordem "
                            "cronológica."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "anotacao": {
                                    "type": "string",
                                    "description": (
                                        "O que acontece neste instante, "
                                        "escrito como fala natural — será "
                                        "narrado em voz alta exatamente "
                                        "quando este quadro aparecer."
                                    ),
                                },
                                "jogadores": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "time": {
                                                "type": "string",
                                                "enum": ["casa", "visitante"],
                                            },
                                            "num": {"type": "integer"},
                                            "x": {"type": "number"},
                                            "y": {"type": "number"},
                                            "papel": {
                                                "type": "string",
                                                "description": (
                                                    "Ex: GOL, ZAG, LE, LD, "
                                                    "VOL, MEI, PE, PD, ATA."
                                                ),
                                            },
                                        },
                                        "required": ["time", "num", "x", "y"],
                                    },
                                },
                                "bola": {
                                    "type": "object",
                                    "properties": {
                                        "x": {"type": "number"},
                                        "y": {"type": "number"},
                                    },
                                },
                                "setas": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "de": {
                                                "type": "object",
                                                "properties": {
                                                    "x": {"type": "number"},
                                                    "y": {"type": "number"},
                                                },
                                            },
                                            "para": {
                                                "type": "object",
                                                "properties": {
                                                    "x": {"type": "number"},
                                                    "y": {"type": "number"},
                                                },
                                            },
                                            "tipo": {
                                                "type": "string",
                                                "enum": [
                                                    "passe",
                                                    "corrida",
                                                    "chute",
                                                    "marcacao",
                                                ],
                                            },
                                        },
                                        "required": ["de", "para"],
                                    },
                                },
                            },
                            "required": ["jogadores"],
                        },
                    },
                },
                "required": ["titulo", "quadros"],
                "additionalProperties": False,
            },
        },
    },
]


TOOL_FUNCTIONS = {
    "get_current_time": get_current_time,
    "get_current_date": get_current_date,
    "open_website": open_website,
    "search_web": search_web,
    "get_weather": get_weather,
    "open_application": open_application,
    "close_application": close_application,
    "open_folder": open_folder,
    "list_files": list_files,
    "run_terminal": run_terminal,
    "take_screenshot": take_screenshot,
    "lock_screen": lock_screen,
    "set_volume": set_volume,
    "get_battery_status": get_battery_status,
    "show_notification": show_notification,
    "get_daily_news": get_daily_news,
    "play_music": play_music,
    "show_tactical_board": show_tactical_board,
    "add_reminder": add_reminder,
    "list_reminders": list_reminders,
    "complete_reminder": complete_reminder,
    "remove_reminder": remove_reminder,
}