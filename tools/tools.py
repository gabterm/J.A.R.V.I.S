import os
import re
import subprocess
import urllib.parse
import webbrowser
import xml.etree.ElementTree as ET
import json
import math
import time
import threading
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen, Request
from zoneinfo import ZoneInfo
import uuid
from ytmusicapi import YTMusic

import tools.ui_bridge as ui_bridge
import tools.web_agent as web_agent
import tools.whatsapp_agent as whatsapp_agent
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


ALARMS_PATH = os.path.expanduser("~/.jarvis/alarms.json")
_alarm_scheduler_lock = threading.Lock()
_alarm_scheduler_started = False


def _load_alarms():
    try:
        with open(ALARMS_PATH, "r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        return []
    except Exception:
        return []


def _save_alarms(alarms):
    os.makedirs(os.path.dirname(ALARMS_PATH), exist_ok=True)
    with open(ALARMS_PATH, "w", encoding="utf-8") as file:
        json.dump(alarms, file, ensure_ascii=False, indent=2)


def _broadcast_alarms(alarms):
    ui_bridge.broadcast({
        "type": "alarms",
        "items": [a for a in alarms if a["ativo"]],
    })


def _disparar_alarme(alarm):
    ui_bridge.broadcast({
        "type": "alarm_triggered",
        "id": alarm["id"],
        "texto": alarm["texto"],
    })

    texto_falado = alarm["texto"] or "Seu alarme está tocando."
    try:
        speak(limpar_para_fala(f"Alarme: {texto_falado}"))
    except Exception:
        pass

    try:
        subprocess.run(
            [
                "osascript", "-e",
                f'display notification "{texto_falado}" with title "⏰ Alarme"'
                ' sound name "Glass"',
            ],
            capture_output=True, text=True,
        )
    except Exception:
        pass


def _alarm_scheduler_loop():
    while True:
        time.sleep(1)

        with _alarm_scheduler_lock:
            alarms = _load_alarms()
            agora = datetime.now().astimezone()
            mudou = False

            for alarm in alarms:
                if not alarm["ativo"]:
                    continue

                dispara_em = datetime.fromisoformat(alarm["dispara_em"])
                if agora >= dispara_em:
                    alarm["ativo"] = False
                    mudou = True
                    _disparar_alarme(alarm)

            if mudou:
                _save_alarms(alarms)
                _broadcast_alarms(alarms)


def _garantir_scheduler_rodando():
    global _alarm_scheduler_started
    if not _alarm_scheduler_started:
        _alarm_scheduler_started = True
        threading.Thread(target=_alarm_scheduler_loop, daemon=True).start()


def set_alarm(texto: str, segundos: int, timezone: str = "America/Sao_Paulo"):
    try:
        _garantir_scheduler_rodando()

        if segundos <= 0:
            return {
                "success": False,
                "message": "O alarme precisa ser marcado para um tempo no futuro.",
            }

        agora = datetime.now(ZoneInfo(timezone))
        dispara_em = agora.timestamp() + segundos
        dispara_em_dt = datetime.fromtimestamp(dispara_em, ZoneInfo(timezone))

        with _alarm_scheduler_lock:
            alarms = _load_alarms()
            novo = {
                "id": str(uuid.uuid4()),
                "texto": texto,
                "dispara_em": dispara_em_dt.isoformat(),
                "ativo": True,
            }
            alarms.append(novo)
            _save_alarms(alarms)
            _broadcast_alarms(alarms)

        horas, resto = divmod(segundos, 3600)
        minutos, seg = divmod(resto, 60)
        partes = []
        if horas:
            partes.append(f"{horas}h")
        if minutos:
            partes.append(f"{minutos}min")
        if seg and not horas:
            partes.append(f"{seg}s")
        tempo_texto = " ".join(partes) or "instantaneamente"

        return {
            "success": True,
            "alarm": novo,
            "message": (
                f"Alarme marcado para daqui a {tempo_texto} "
                f"({dispara_em_dt.strftime('%d/%m %H:%M')}): {texto}"
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível criar o alarme: {error}",
        }


def list_alarms():
    try:
        alarms = _load_alarms()
        ativos = [a for a in alarms if a["ativo"]]
        _broadcast_alarms(alarms)

        return {
            "success": True,
            "count": len(ativos),
            "alarms": ativos,
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível listar os alarmes: {error}",
        }


def cancel_alarm(texto: str):
    try:
        with _alarm_scheduler_lock:
            alarms = _load_alarms()
            encontrado = None

            for alarm in alarms:
                if alarm["ativo"] and texto.lower() in alarm["texto"].lower():
                    alarm["ativo"] = False
                    encontrado = alarm
                    break

            if not encontrado:
                return {
                    "success": False,
                    "message": f"Nenhum alarme ativo encontrado com: {texto}",
                }

            _save_alarms(alarms)
            _broadcast_alarms(alarms)

        return {
            "success": True,
            "message": f"Alarme cancelado: {encontrado['texto']}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível cancelar o alarme: {error}",
        }


def _geocode_local(local: str):
    url = (
        "https://nominatim.openstreetmap.org/search?"
        f"q={urllib.parse.quote_plus(local)}&format=json&limit=1"
    )
    request = Request(url, headers={"User-Agent": "JARVIS/1.0 (assistente pessoal)"})
    with urlopen(request, timeout=10) as response:
        data = json.loads(response.read())

    if not data:
        return None

    item = data[0]
    return {
        "lat": float(item["lat"]),
        "lon": float(item["lon"]),
        "nome": item.get("display_name", local),
    }


def _osrm_route(origem_lat, origem_lon, destino_lat, destino_lon, profile="driving"):
    url = (
        f"https://router.project-osrm.org/route/v1/{profile}/"
        f"{origem_lon},{origem_lat};{destino_lon},{destino_lat}"
        "?overview=full&geometries=geojson"
    )
    request = Request(url, headers={"User-Agent": "JARVIS/1.0"})
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read())


def get_distance(origem: str, destino: str, modo: str = "driving"):
    try:
        ponto_origem = _geocode_local(origem)
        if not ponto_origem:
            return {
                "success": False,
                "message": f"Local de origem não encontrado: {origem}",
            }

        # Nominatim pede no máximo 1 requisição por segundo
        time.sleep(1)

        ponto_destino = _geocode_local(destino)
        if not ponto_destino:
            return {
                "success": False,
                "message": f"Local de destino não encontrado: {destino}",
            }

        perfil = modo if modo in ("driving", "walking", "cycling") else "driving"

        rota = _osrm_route(
            ponto_origem["lat"], ponto_origem["lon"],
            ponto_destino["lat"], ponto_destino["lon"],
            perfil,
        )

        if rota.get("code") != "Ok" or not rota.get("routes"):
            return {
                "success": False,
                "message": "Não foi possível calcular a rota entre os locais.",
            }

        trajeto = rota["routes"][0]
        distancia_km = round(trajeto["distance"] / 1000, 1)
        duracao_min = round(trajeto["duration"] / 60)

        ui_bridge.broadcast({
            "type": "map",
            "origem": {"lat": ponto_origem["lat"], "lon": ponto_origem["lon"], "nome": origem},
            "destino": {"lat": ponto_destino["lat"], "lon": ponto_destino["lon"], "nome": destino},
            "distancia_km": distancia_km,
            "duracao_min": duracao_min,
            "modo": perfil,
            "geometria": trajeto["geometry"],
        })

        horas, minutos = divmod(duracao_min, 60)
        duracao_texto = f"{horas}h{minutos:02d}" if horas else f"{minutos} min"
        modo_texto = {"driving": "de carro", "walking": "a pé", "cycling": "de bicicleta"}[perfil]

        return {
            "success": True,
            "origem": origem,
            "destino": destino,
            "distancia_km": distancia_km,
            "duracao_min": duracao_min,
            "message": (
                f"De {origem} até {destino}: {distancia_km} km, "
                f"aproximadamente {duracao_texto} {modo_texto}."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível calcular a distância: {error}",
        }


# ---------- busca de "lugar mais próximo por categoria", sem dicionário fixo ----------
#
# Em vez de mapear palavras-chave em português pra tags OSM (o que só
# funcionaria pra um idioma e um conjunto finito de categorias), quem decide
# a(s) tag(s) OSM corretas é o próprio modelo, no momento da chamada da
# ferramenta — ele já conhece o esquema de tagging do OpenStreetMap, que é
# padronizado e cobre o planeta inteiro, em qualquer idioma. Isso torna a
# busca genuinamente universal: "chaveiro", "locksmith", "cerrajero",
# "farmácia 24h", "pronto-socorro veterinário" etc. tudo cai no mesmo
# mecanismo, sem precisar tocar no código pra cada categoria nova.

_OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]

_RAIOS_BUSCA_METROS = [3000, 10000, 30000, 100000]  # expande até achar algo


def _haversine_km(lat1, lon1, lat2, lon2):
    raio_terra = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return raio_terra * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_osm_tag(tag: str):
    if "=" not in tag:
        return None
    chave, valor = tag.split("=", 1)
    chave, valor = chave.strip(), valor.strip()
    if not chave or not valor:
        return None
    return chave, valor


def _overpass_query_for_tags(tags_validas, lat, lon, raio_metros):
    filtros = []
    for chave, valor in tags_validas:
        filtros.append(f'node["{chave}"="{valor}"](around:{raio_metros},{lat},{lon});')
        filtros.append(f'way["{chave}"="{valor}"](around:{raio_metros},{lat},{lon});')
    corpo = "\n".join(filtros)
    return f"[out:json][timeout:20];\n(\n{corpo}\n);\nout center 40;"


def _overpass_request(query, tentativas_por_mirror=1):
    ultimo_erro = None
    for mirror in _OVERPASS_MIRRORS:
        for _ in range(tentativas_por_mirror):
            try:
                request = Request(
                    mirror,
                    data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
                    headers={"User-Agent": "JARVIS/1.0 (assistente pessoal)"},
                )
                with urlopen(request, timeout=20) as response:
                    return json.loads(response.read())
            except Exception as error:
                ultimo_erro = error
                continue
    raise ultimo_erro or RuntimeError("Todos os espelhos do Overpass falharam.")


def _overpass_nearest(lat, lon, tags):
    """
    Busca o POI mais próximo de (lat, lon) que satisfaça QUALQUER uma das
    tags OSM fornecidas (ex: [("shop","locksmith")]). Expande o raio de
    busca progressivamente até encontrar algo ou esgotar as tentativas —
    funciona tanto em centro de metrópole quanto em zona rural, em
    qualquer lugar do planeta onde exista cobertura OSM (praticamente
    universal). Ordena por distância real (haversine), não por
    relevância textual.
    """
    tags_validas = [t for t in (_parse_osm_tag(tag) for tag in tags) if t]
    if not tags_validas:
        return None, None

    for raio in _RAIOS_BUSCA_METROS:
        query = _overpass_query_for_tags(tags_validas, lat, lon, raio)
        try:
            data = _overpass_request(query)
        except Exception:
            continue

        elementos = data.get("elements", [])
        candidatos = []
        for el in elementos:
            el_lat = el.get("lat") or (el.get("center") or {}).get("lat")
            el_lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if el_lat is None or el_lon is None:
                continue
            distancia_km = _haversine_km(lat, lon, el_lat, el_lon)
            nome = el.get("tags", {}).get("name")
            candidatos.append({
                "lat": el_lat,
                "lon": el_lon,
                "nome": nome or f"local a {distancia_km:.1f} km",
                "distancia_km": distancia_km,
            })

        if candidatos:
            candidatos.sort(key=lambda c: c["distancia_km"])
            return candidatos[0], raio

    return None, None


def find_nearest_place(origem: str, categoria: str, tags: list, modo: str = "driving"):
    """
    Acha o estabelecimento/lugar mais próximo de uma categoria (definida
    via tags OSM escolhidas pelo modelo) a partir de um ponto de origem,
    e traça a rota até lá no mapa da interface. Funciona pra qualquer
    categoria, em qualquer idioma, em qualquer lugar do planeta com
    cobertura OpenStreetMap.
    """
    try:
        ponto_origem = _geocode_local(origem)
        if not ponto_origem:
            return {
                "success": False,
                "message": f"Local de origem não encontrado: {origem}",
            }

        if not tags:
            return {
                "success": False,
                "message": "Nenhuma tag OSM fornecida para a categoria buscada.",
            }

        mais_proximo, raio_usado = _overpass_nearest(
            ponto_origem["lat"], ponto_origem["lon"], tags
        )

        if not mais_proximo:
            return {
                "success": False,
                "message": (
                    f"Não encontrei nenhum lugar do tipo '{categoria}' "
                    f"perto de {origem}, mesmo expandindo a busca."
                ),
            }

        perfil = modo if modo in ("driving", "walking", "cycling") else "driving"

        rota = _osrm_route(
            ponto_origem["lat"], ponto_origem["lon"],
            mais_proximo["lat"], mais_proximo["lon"],
            perfil,
        )

        if rota.get("code") != "Ok" or not rota.get("routes"):
            return {
                "success": False,
                "message": "Encontrei o lugar mas não consegui calcular a rota até ele.",
            }

        trajeto = rota["routes"][0]
        distancia_km = round(trajeto["distance"] / 1000, 1)
        duracao_min = round(trajeto["duration"] / 60)

        ui_bridge.broadcast({
            "type": "map",
            "origem": {"lat": ponto_origem["lat"], "lon": ponto_origem["lon"], "nome": origem},
            "destino": {"lat": mais_proximo["lat"], "lon": mais_proximo["lon"], "nome": mais_proximo["nome"]},
            "distancia_km": distancia_km,
            "duracao_min": duracao_min,
            "modo": perfil,
            "geometria": trajeto["geometry"],
        })

        horas, minutos = divmod(duracao_min, 60)
        duracao_texto = f"{horas}h{minutos:02d}" if horas else f"{minutos} min"
        modo_texto = {"driving": "de carro", "walking": "a pé", "cycling": "de bicicleta"}[perfil]

        return {
            "success": True,
            "categoria": categoria,
            "lugar_encontrado": mais_proximo["nome"],
            "origem": origem,
            "distancia_km": distancia_km,
            "duracao_min": duracao_min,
            "message": (
                f"O {categoria} mais próximo de {origem} é {mais_proximo['nome']}, "
                f"a {distancia_km} km ({duracao_texto} {modo_texto})."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível encontrar o local mais próximo: {error}",
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


# ============================================================
# BUSCA / NAVEGAÇÃO WEB (search_web + browser_*)
# ============================================================
#
# search_web e as funções browser_* abaixo delegam pro tools/web_agent.py,
# que roda uma sessão de navegador real (Playwright + Chromium) numa
# thread dedicada. Diferente do antigo browse_url (que só embutia uma URL
# num iframe via proxy), essas ferramentas conseguem de fato navegar
# dentro dos sites: clicar em links/botões, preencher campos, rolar,
# voltar/avançar — e cada ação transmite um screenshot ao vivo pra
# interface (evento 'browser_screenshot').

def search_web(query: str):
    try:
        url = "https://www.google.com/search?q=" + urllib.parse.quote_plus(query)
        resultado = web_agent.browser_open(url)

        if not resultado.get("success"):
            return resultado

        return {
            "success": True,
            "query": query,
            "url": resultado.get("url"),
            "texto_visivel": resultado.get("texto_visivel"),
            "message": (
                f"Pesquisa aberta para: {query}. Use browser_read para ler "
                "mais resultados, ou browser_click para abrir um link "
                "específico."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível pesquisar: {error}",
        }


def browser_open(url: str):
    return web_agent.browser_open(url)


def browser_click(alvo: str):
    return web_agent.browser_click(alvo)


def browser_type(alvo: str, texto: str, enter: bool = False):
    return web_agent.browser_type(alvo, texto, enter)


def browser_scroll(direcao: str = "baixo", quantidade: int = 800):
    return web_agent.browser_scroll(direcao, quantidade)


def browser_back():
    return web_agent.browser_back()


def browser_forward():
    return web_agent.browser_forward()


def browser_read():
    return web_agent.browser_read()


def browser_close():
    return web_agent.browser_close()


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


def toggle_microphone(ativo: bool = None):
    """
    Liga ou desliga a escuta contínua do microfone real (o mesmo
    controlado pelo botão de mic no HUD). Se 'ativo' não for informado,
    inverte o estado atual. Sincroniza o botão de todas as interfaces
    conectadas via broadcast, e o mic_listener.py passa a descartar (ou
    voltar a processar) o áudio capturado imediatamente.
    """
    try:
        if ativo is None:
            ativo = not ui_bridge.microfone_ativo.is_set()

        if ativo:
            ui_bridge.microfone_ativo.set()
        else:
            ui_bridge.microfone_ativo.clear()

        ui_bridge.broadcast({
            "type": "mic_state",
            "ativo": ui_bridge.microfone_ativo.is_set(),
        })

        return {
            "success": True,
            "ativo": ui_bridge.microfone_ativo.is_set(),
            "message": (
                "Microfone ativado."
                if ui_bridge.microfone_ativo.is_set()
                else "Microfone desativado."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível alternar o microfone: {error}",
        }


_TIPOS_OBJETO_SIMULACAO = {"circulo", "retangulo", "texto", "linha", "onda"}
_TIPOS_MOVIMENTO_SIMULACAO = {
    "projetil", "linear", "mhs", "pendulo", "orbital", "mola", "onda",
}

def _validar_objeto_simulacao(obj, contexto):
    if not obj.get("id"):
        return f"{contexto}: objeto sem 'id'."

    tipo = obj.get("tipo")
    if tipo not in _TIPOS_OBJETO_SIMULACAO:
        return f"{contexto}: tipo de objeto inválido '{tipo}' (id={obj.get('id')})."

    # linha usa x1/y1/x2/y2 em vez de x/y; onda pode não ter x/y próprio
    # (a posição vem inteira dos params do movimento) — por isso x/y só
    # são validados quando presentes, não são sempre obrigatórios aqui.
    for campo in ("x", "y", "x1", "y1", "x2", "y2"):
        valor = obj.get(campo)
        if valor is not None:
            erro = _validate_coordinate(valor, f"{obj.get('id')}.{campo}")
            if erro:
                return f"{contexto}: {erro}"

    movimento = obj.get("movimento")
    if movimento:
        tipo_mov = movimento.get("tipo")
        if tipo_mov not in _TIPOS_MOVIMENTO_SIMULACAO:
            return (
                f"{contexto}: tipo de movimento inválido '{tipo_mov}' "
                f"no objeto '{obj.get('id')}'."
            )

    return None

def _validar_cena_fisica_simulacao(objetos):
    if not objetos:
        return "Nenhum objeto fornecido para a simulação."
    for obj in objetos:
        erro = _validar_objeto_simulacao(obj, "Simulação")
        if erro:
            return erro
    return None

def _validar_quadro_simulacao(frame, index):
    objetos = frame.get("objetos")
    if not objetos:
        return f"Quadro {index + 1} sem objetos."
    for obj in objetos:
        erro = _validar_objeto_simulacao(obj, f"Quadro {index + 1}")
        if erro:
            return erro
    return None

_PAUSA_QUADRO_SIMULACAO_SEM_NARRACAO = 1.0


def _narrar_quadros_simulacao(quadros):
    """
    Espelha _narrar_quadros_raciocinio: manda o estado completo de cada
    quadro ('simulation_frame') e fala a anotação de forma bloqueante,
    então a animação avança exatamente no ritmo da narração. Usado só
    no modo="cenas".
    """
    for index, frame in enumerate(quadros):
        anotacao = frame.get("anotacao") or ""

        ui_bridge.broadcast({
            "type": "simulation_frame",
            "index": index,
            "anotacao": anotacao,
            "objetos": frame.get("objetos", []),
        })

        if anotacao.strip():
            speak(limpar_para_fala(anotacao))
        else:
            time.sleep(_PAUSA_QUADRO_SIMULACAO_SEM_NARRACAO)


def show_simulation(
    titulo: str,
    objetos: list,
    modo: str = "fisica",
    duracao: float = 8,
    loop: bool = True,
    velocidade: float = 1,
    anotacao: str = "",
):
    modo = modo if modo in ("fisica", "cenas") else "fisica"

    if modo == "fisica":
        erro = _validar_cena_fisica_simulacao(objetos)
        if erro:
            return {"success": False, "message": erro}
    else:
        if not objetos:
            return {"success": False, "message": "Nenhum quadro fornecido."}
        for index, frame in enumerate(objetos):
            erro = _validar_quadro_simulacao(frame, index)
            if erro:
                return {"success": False, "message": erro}

    try:
        ui_bridge.broadcast({"type": "simulation_board", "titulo": titulo})

        if modo == "fisica":
            # Uma mensagem só — o navegador anima sozinho, continuamente,
            # sem o backend precisar reenviar frames.
            ui_bridge.broadcast({
                "type": "simulation_scene",
                "objetos": objetos,
                "duracao": duracao,
                "loop": loop,
                "velocidade": velocidade,
                "anotacao": anotacao,
            })

            if anotacao.strip():
                speak(limpar_para_fala(anotacao))

            return {
                "success": True,
                "message": (
                    f"Simulação '{titulo}' iniciada e está rodando "
                    "continuamente na interface. Não descreva a "
                    "animação passo a passo na resposta final — ela já "
                    "está visível e rodando, só complemente com "
                    "contexto se fizer sentido."
                ),
            }

        _narrar_quadros_simulacao(objetos)

        return {
            "success": True,
            "message": (
                f"Simulação '{titulo}' narrada com {len(objetos)} "
                "passo(s). Não repita a explicação passo a passo na "
                "resposta final, ela já foi narrada — só complemente "
                "se fizer sentido."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível exibir a simulação: {error}",
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

            # A RSS do Google News não vem com imagem. Usamos o serviço
            # gratuito de screenshot da WordPress (mshots), que gera uma
            # miniatura da própria página da notícia a partir da URL —
            # sem precisar de chave de API nem scraping adicional.
            image_url = (
                "https://s.wordpress.com/mshots/v1/"
                f"{urllib.parse.quote(link, safe='')}?w=500&h=300"
                if link else None
            )

            news.append({
                "title": title,
                "link": link,
                "source": source,
                "published_at": pub_date,
                "image": image_url,
            })

        if not news:
            return {
                "success": False,
                "message": "Nenhuma notícia encontrada.",
            }

        ui_bridge.broadcast({
            "type": "news_board",
            "titulo": query or "Principais notícias",
            "news": news,
        })

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

        embed_url = f"https://www.youtube.com/embed/{video_id}?autoplay=1"
        watch_url = f"https://music.youtube.com/watch?v={video_id}"
        artists = ", ".join(
            artist["name"] for artist in top_result.get("artists", [])
        )

        ui_bridge.broadcast({
            "type": "browser_navigate",
            "url": embed_url,
            "titulo": f"{top_result.get('title')} - {artists}",
            "url_externo": watch_url,
        })

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

_TIPOS_NO_RACIOCINIO = {"ideia", "pergunta", "dado", "conclusao", "alerta"}
_ESTADOS_NO_RACIOCINIO = {"normal", "ativo", "descartado"}
_TIPOS_CONEXAO_RACIOCINIO = {"leva_a", "suporta", "contradiz", "responde"}

def _validar_no_raciocinio(no, index_quadro):
    for campo in ("x", "y"):
        erro = _validate_coordinate(no.get(campo), f"nó {no.get('id')}.{campo}")
        if erro:
            return f"Quadro {index_quadro + 1}: {erro}"

    if not no.get("id"):
        return f"Quadro {index_quadro + 1}: nó sem 'id'."

    if not no.get("texto"):
        return f"Quadro {index_quadro + 1}: nó '{no.get('id')}' sem 'texto'."

    tipo = no.get("tipo")
    if tipo is not None and tipo not in _TIPOS_NO_RACIOCINIO:
        return (
            f"Quadro {index_quadro + 1}: tipo inválido '{tipo}' no nó "
            f"'{no.get('id')}'."
        )

    estado = no.get("estado")
    if estado is not None and estado not in _ESTADOS_NO_RACIOCINIO:
        return (
            f"Quadro {index_quadro + 1}: estado inválido '{estado}' no nó "
            f"'{no.get('id')}'."
        )

    return None


def _validar_quadro_raciocinio(frame, index):
    nos = frame.get("nos")
    if not nos:
        return f"Quadro {index + 1} sem nós."

    ids_validos = set()
    for no in nos:
        erro = _validar_no_raciocinio(no, index)
        if erro:
            return erro
        ids_validos.add(no["id"])

    for conexao in frame.get("conexoes") or []:
        de, para = conexao.get("de"), conexao.get("para")
        if de not in ids_validos or para not in ids_validos:
            return (
                f"Quadro {index + 1}: conexão referencia nó inexistente "
                f"({de} -> {para})."
            )
        tipo_conexao = conexao.get("tipo")
        if tipo_conexao is not None and tipo_conexao not in _TIPOS_CONEXAO_RACIOCINIO:
            return (
                f"Quadro {index + 1}: tipo de conexão inválido "
                f"'{tipo_conexao}'."
            )

    return None

_PAUSA_QUADRO_RACIOCINIO_SEM_NARRACAO = 1.0


def _narrar_quadros_raciocinio(quadros):
    """
    Espelha _narrar_quadros_taticos: envia o estado completo do quadro
    ('reasoning_frame') e fala a anotação de forma bloqueante, então a
    animação avança exatamente no ritmo da narração.
    """
    for index, frame in enumerate(quadros):
        anotacao = frame.get("anotacao") or ""

        ui_bridge.broadcast({
            "type": "reasoning_frame",
            "index": index,
            "anotacao": anotacao,
            "nos": frame.get("nos", []),
            "conexoes": frame.get("conexoes", []),
        })

        if anotacao.strip():
            speak(limpar_para_fala(anotacao))
        else:
            time.sleep(_PAUSA_QUADRO_RACIOCINIO_SEM_NARRACAO)


def show_reasoning_board(titulo: str, quadros: list):
    if not quadros:
        return {
            "success": False,
            "message": "Nenhum quadro fornecido.",
        }

    for index, frame in enumerate(quadros):
        erro = _validar_quadro_raciocinio(frame, index)
        if erro:
            return {
                "success": False,
                "message": erro,
            }

    try:
        # Diferente do tático, o board não manda o conteúdo completo de
        # antemão — só abre o overlay. Cada quadro chega via
        # 'reasoning_frame' já narrado, redesenhando o SVG do zero.
        ui_bridge.broadcast({
            "type": "reasoning_board",
            "titulo": titulo,
        })

        _narrar_quadros_raciocinio(quadros)

        return {
            "success": True,
            "message": (
                f"Quadro de raciocínio '{titulo}' narrado com "
                f"{len(quadros)} passo(s). Não repita o raciocínio "
                "passo a passo na resposta final — ele já foi "
                "narrado, só complemente se fizer sentido."
            ),
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível exibir o quadro de raciocínio: {error}",
        }


# ============================================================
# WHATSAPP (list_unread_whatsapp / read_whatsapp_chat / send_whatsapp_message)
# ============================================================
#
# Delegam pro tools/whatsapp_agent.py, que mantém uma sessão persistente
# do WhatsApp Web via Playwright (mesmo padrão do web_agent.py) e roda um
# poller em background que notifica (fala + broadcast) sobre mensagens
# novas. O envio (send_whatsapp_message) só é efetivado com
# confirmado=True — ver REGRA DE OURO no prompt.txt.

def list_unread_whatsapp():
    return whatsapp_agent.list_unread_whatsapp()


def read_whatsapp_chat(contato: str, quantidade: int = 5):
    return whatsapp_agent.read_whatsapp_chat(contato, quantidade)


def send_whatsapp_message(contato: str, texto: str, confirmado: bool = False):
    return whatsapp_agent.send_whatsapp_message(contato, texto, confirmado)


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
                "name": "show_simulation",
                "description": (
                    "Exibe uma simulação visual/animação científica ou "
                    "genérica na interface — círculos, retângulos, texto, "
                    "linhas e ondas se movendo numa cena. Use para qualquer "
                    "pedido de 'mostrar', 'simular', 'animar' ou 'visualizar' "
                    "um fenômeno físico (queda livre, lançamento de "
                    "projétil, pêndulo, órbita, oscilação, onda, mola, "
                    "movimento uniforme) ou uma sequência visual livre "
                    "passo a passo. NÃO use para raciocínio abstrato "
                    "(ideias/argumentos) — para isso use show_reasoning_board. "
                    "NÃO use para futebol em campo — para isso use "
                    "show_tactical_board.\n\n"
                    "Tem dois modos, escolhidos em 'modo':\n\n"
                    "1) modo='fisica' (padrão, prefira este pra qualquer "
                    "fenômeno com fórmula conhecida): 'objetos' é uma lista "
                    "PLANA de objetos da cena. O navegador calcula a posição "
                    "de cada objeto continuamente sozinho a partir do campo "
                    "'movimento' — você NÃO precisa (nem deve) gerar frame a "
                    "frame. Cada objeto pode ter:\n"
                    "  - id (string, obrigatório, único)\n"
                    "  - tipo: 'circulo' | 'retangulo' | 'texto' | 'linha' | 'onda'\n"
                    "  - x, y: posição inicial/estática (0-100), quando aplicável\n"
                    "  - raio (circulo), largura/altura (retangulo), rotulo (texto), "
                    "x1,y1,x2,y2 (linha)\n"
                    "  - cor: opcional, ex 'var(--amber)'\n"
                    "  - rastro: true pra desenhar a trajetória percorrida\n"
                    "  - movimento: { tipo, params } — os tipos disponíveis e "
                    "seus params são:\n"
                    "      projetil: {x0,y0,v0,angulo(graus),g} — lançamento "
                    "oblíquo/queda livre (angulo=-90 = queda livre)\n"
                    "      linear: {x0,y0,vx,vy,quicar(bool),min,max} — "
                    "movimento retilíneo, opcionalmente quicando nas bordas\n"
                    "      mhs: {x0,y0,amplitude,periodo,fase,eixo('x'|'y')} — "
                    "oscilação harmônica simples\n"
                    "      pendulo: {pivoX,pivoY,comprimento,amplitude(graus),"
                    "periodo,fase}\n"
                    "      orbital: {cx,cy,raio,periodo,fase} — órbita circular\n"
                    "      mola: {x0,y0,amplitude,periodo,amortecimento,eixo} — "
                    "oscilador amortecido\n"
                    "      onda: {x_inicio,x_fim,y_base,amplitude,"
                    "comprimento_onda,periodo,n_pontos} — use com objeto "
                    "tipo='onda'\n"
                    "Coordenadas e todos os params espaciais são num espaço "
                    "normalizado 0-100. 'anotacao' (opcional) é falada uma "
                    "vez, junto da animação começando. 'duracao' (segundos) "
                    "e 'loop' controlam se a animação se repete.\n\n"
                    "2) modo='cenas': 'objetos' é uma lista de QUADROS "
                    "narrados em sequência — cada quadro é "
                    "{'anotacao': str, 'objetos': [...]} com o estado "
                    "completo (objetos SEM 'movimento', estáticos) daquele "
                    "instante. Use isso só quando o fenômeno não se encaixa "
                    "numa fórmula contínua (ex: passos de uma reação "
                    "química, etapas de um algoritmo) — esta ferramenta já "
                    "narra cada quadro em voz alta, em sincronia com a "
                    "animação avançando, igual show_reasoning_board."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "titulo": {
                            "type": "string",
                            "description": "Título curto da simulação.",
                        },
                        "modo": {
                            "type": "string",
                            "enum": ["fisica", "cenas"],
                            "description": (
                                "'fisica' (padrão) pra fenômenos com fórmula "
                                "de movimento; 'cenas' pra sequência narrada "
                                "de quadros estáticos livres."
                            ),
                        },
                        "objetos": {
                            "type": "array",
                            "description": (
                                "Se modo='fisica': lista plana de objetos da "
                                "cena (ver descrição da ferramenta). Se "
                                "modo='cenas': lista de quadros, cada um "
                                "{'anotacao': str, 'objetos': [...]}."
                            ),
                            "items": {
                                "type": "object",
                                "additionalProperties": True,
                            },
                        },
                        "duracao": {
                            "type": "number",
                            "description": (
                                "Duração de um ciclo da animação em "
                                "segundos. Só usado em modo='fisica'. "
                                "Padrão: 8."
                            ),
                        },
                        "loop": {
                            "type": "boolean",
                            "description": (
                                "Se a animação repete em loop. Só usado em "
                                "modo='fisica'. Padrão: true."
                            ),
                        },
                        "velocidade": {
                            "type": "number",
                            "description": (
                                "Multiplicador de velocidade da animação "
                                "(1 = tempo real). Só usado em modo='fisica'. "
                                "Padrão: 1."
                            ),
                        },
                        "anotacao": {
                            "type": "string",
                            "description": (
                                "Texto falado uma vez, junto do início da "
                                "animação. Só usado em modo='fisica' — em "
                                "modo='cenas' cada quadro tem sua própria "
                                "anotação."
                            ),
                        },
                    },
                    "required": ["titulo", "objetos"],
                    "additionalProperties": False,
                },
            },
        },

    {
        "type": "function",
        "function": {
            "name": "open_website",
            "description": (
                "Abre um site no navegador padrão do sistema (fora do "
                "HUD). Use quando o usuário pedir explicitamente para "
                "abrir um site no navegador de verdade, fora da "
                "interface. Para pesquisar ou navegar dentro de um site "
                "com o resultado visível no próprio HUD, prefira "
                "search_web/browser_open."
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
                "Pesquisa um termo no Google numa sessão de navegador "
                "real (não um simples embed) e retorna o texto visível "
                "da página de resultados, além de mostrar a navegação "
                "ao vivo (screenshot) na interface. Depois de pesquisar, "
                "use browser_click para abrir um resultado específico, "
                "ou browser_read para ler mais da página atual. NÃO use "
                "para achar o estabelecimento/lugar mais próximo de "
                "algo — para isso use find_nearest_place."
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
            "name": "browser_open",
            "description": (
                "Abre uma URL numa sessão de navegador real (persistente "
                "entre chamadas, feita com Playwright/Chromium) e "
                "retorna o texto visível da página, além de mostrar um "
                "screenshot ao vivo na interface. Use para começar uma "
                "navegação, ou pra pular direto para uma URL específica. "
                "Depois de abrir, use browser_click/browser_type/"
                "browser_scroll para interagir de verdade com a página."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL a abrir.",
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
            "name": "browser_click",
            "description": (
                "Clica em um elemento da página atualmente aberta na "
                "sessão de navegação (link, botão, item de menu, aba). "
                "Descreva o elemento como o texto visível na tela (ex: "
                "'Entrar', 'Aceitar cookies', 'Ver mais resultados') — "
                "não precisa ser um seletor CSS, embora um seletor "
                "também funcione se você souber. Depois do clique, "
                "retorna o novo estado da página (título, URL, texto "
                "visível) e atualiza o screenshot ao vivo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "alvo": {
                        "type": "string",
                        "description": "Texto visível ou seletor do elemento a clicar.",
                    },
                },
                "required": ["alvo"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_type",
            "description": (
                "Preenche um campo de texto/busca/formulário na página "
                "atual da sessão de navegação. Descreva o campo em "
                "linguagem natural (ex: 'campo de busca', 'E-mail', "
                "'Nome de usuário') e o texto a digitar. Se 'enter' for "
                "true, pressiona Enter em seguida — útil pra submeter "
                "buscas ou formulários sem precisar de um browser_click "
                "separado no botão de enviar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "alvo": {
                        "type": "string",
                        "description": "Campo a preencher.",
                    },
                    "texto": {
                        "type": "string",
                        "description": "Texto a digitar no campo.",
                    },
                    "enter": {
                        "type": "boolean",
                        "description": "Pressionar Enter após digitar. Padrão: false.",
                    },
                },
                "required": ["alvo", "texto"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_scroll",
            "description": (
                "Rola a página atual da sessão de navegação para cima "
                "ou para baixo. Use quando precisar ver conteúdo que "
                "está fora da área visível atual, antes de tentar "
                "clicar nele ou lê-lo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "direcao": {
                        "type": "string",
                        "enum": ["cima", "baixo"],
                        "description": "Direção da rolagem. Padrão: baixo.",
                    },
                    "quantidade": {
                        "type": "integer",
                        "description": "Pixels a rolar. Padrão: 800.",
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
            "name": "browser_back",
            "description": (
                "Volta para a página anterior no histórico da sessão de "
                "navegação atual."
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
            "name": "browser_forward",
            "description": (
                "Avança para a próxima página no histórico da sessão de "
                "navegação atual (o oposto de browser_back)."
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
            "name": "browser_read",
            "description": (
                "Lê o texto completo visível na página atual da sessão "
                "de navegação (um recorte maior do que o já retornado "
                "por browser_open/browser_click). Use quando precisar "
                "de mais contexto textual da página antes de decidir a "
                "próxima ação."
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
            "name": "browser_close",
            "description": (
                "Encerra a sessão de navegação atual, fechando o "
                "navegador headless. Use quando a navegação/tarefa na "
                "web tiver terminado, para liberar recursos."
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
            "name": "set_alarm",
            "description": (
                "Cria um alarme que toca (fala + notificação nativa) "
                "após um determinado número de segundos. Use quando o "
                "usuário pedir para ser acordado, avisado ou lembrado "
                "em voz alta em um momento específico no futuro (ex: "
                "'me acorda em 20 minutos', 'toca um alarme às 7h'). "
                "Você mesmo deve calcular o total de segundos até o "
                "momento desejado — use get_current_time/get_current_date "
                "se precisar saber a hora/data atual para converter um "
                "horário absoluto (ex: 'às 7h') em segundos restantes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "texto": {
                        "type": "string",
                        "description": "O que será dito quando o alarme tocar.",
                    },
                    "segundos": {
                        "type": "integer",
                        "description": "Segundos até o alarme disparar.",
                    },
                },
                "required": ["texto", "segundos"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_alarms",
            "description": (
                "Lista os alarmes ativos e atualiza o painel de "
                "alarmes na interface."
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
            "name": "cancel_alarm",
            "description": (
                "Cancela um alarme ativo, buscando pelo texto. Use "
                "quando o usuário pedir para desmarcar ou cancelar "
                "um alarme."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "texto": {
                        "type": "string",
                        "description": (
                            "Trecho do texto do alarme a ser cancelado."
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
            "name": "toggle_microphone",
            "description": (
                "Liga ou desliga a escuta contínua do microfone real do "
                "JARVIS (o mesmo botão de microfone da interface). Use "
                "quando o usuário pedir para desligar, silenciar, mutar, "
                "ligar ou reativar o microfone."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ativo": {
                        "type": "boolean",
                        "description": (
                            "true para ligar, false para desligar. Se "
                            "omitido, inverte o estado atual."
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
                "Busca uma música específica no YouTube Music e a "
                "reproduz dentro do painel de mídia embutido da "
                "interface, usando o player embedável do YouTube (o "
                "YouTube Music em si bloqueia exibição em iframe). Use "
                "quando o usuário pedir para tocar, colocar ou ouvir "
                "uma música, artista ou álbum."
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
            "name": "get_distance",
            "description": (
                "Calcula a distância e o tempo de viagem entre DOIS "
                "locais específicos e conhecidos (dois endereços, duas "
                "cidades) e exibe a rota no mapa da interface. Use "
                "quando o usuário pedir a distância entre lugares "
                "específicos, ou quanto tempo leva pra ir de um ponto "
                "conhecido a outro. Para 'o [algo] mais próximo' (sem um "
                "destino específico nomeado), use find_nearest_place."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origem": {"type": "string", "description": "Local de partida."},
                    "destino": {"type": "string", "description": "Local de destino."},
                    "modo": {
                        "type": "string",
                        "enum": ["driving", "walking", "cycling"],
                        "description": "Meio de transporte. Padrão: driving.",
                    },
                },
                "required": ["origem", "destino"],
                "additionalProperties": False,
            },
        },
    },

    {
        "type": "function",
        "function": {
            "name": "find_nearest_place",
            "description": (
                "Acha o estabelecimento/lugar mais próximo de uma "
                "origem, usando dados reais do OpenStreetMap, e traça a "
                "rota até lá no mapa da interface. Funciona pra QUALQUER "
                "categoria de lugar (chaveiro, farmácia, posto de "
                "gasolina, hospital, restaurante, oficina, hotel, caixa "
                "eletrônico, veterinário, etc.) em QUALQUER lugar do "
                "planeta, em qualquer idioma — você mesmo deve mapear a "
                "categoria pedida pelo usuário para a(s) tag(s) "
                "correspondente(s) do esquema de tagging do "
                "OpenStreetMap (wiki.openstreetmap.org/wiki/Map_features), "
                "no formato 'chave=valor' (ex: 'shop=locksmith', "
                "'amenity=pharmacy', 'amenity=fuel', 'amenity=hospital'). "
                "Pode passar mais de uma tag alternativa se a categoria "
                "puder estar mapeada de formas diferentes. Use esta "
                "ferramenta (NÃO search_web) sempre que o usuário pedir "
                "o [algo] mais próximo, mais perto, ou pedir pra achar/"
                "rotear até um tipo de estabelecimento sem nomear um "
                "local específico."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origem": {
                        "type": "string",
                        "description": (
                            "Local de partida (endereço, cidade, ou "
                            "'aqui' se souber a localização atual)."
                        ),
                    },
                    "categoria": {
                        "type": "string",
                        "description": (
                            "Nome da categoria em linguagem natural, pra "
                            "usar na fala/exibição (ex: 'chaveiro')."
                        ),
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Uma ou mais tags OSM no formato 'chave=valor' "
                            "que correspondem à categoria pedida. Ex: "
                            "['shop=locksmith']."
                        ),
                    },
                    "modo": {
                        "type": "string",
                        "enum": ["driving", "walking", "cycling"],
                        "description": "Meio de transporte. Padrão: driving.",
                    },
                },
                "required": ["origem", "categoria", "tags"],
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
                "situação de futebol. NÃO use para raciocínio genérico, "
                "comparação de ideias ou explicação de um pensamento "
                "sem relação com posição física em campo — para isso "
                "use show_reasoning_board. Coordenadas x e y vão de 0 a "
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

    {
        "type": "function",
        "function": {
            "name": "show_reasoning_board",
            "description": (
                "Exibe e NARRA um quadro visual de raciocínio: nós "
                "representando ideias, perguntas, dados ou conclusões, "
                "ligados por conexões que representam o fluxo lógico "
                "(leva_a, suporta, contradiz, responde). Aceita uma "
                "sequência de quadros, cada um sendo o estado COMPLETO "
                "do quadro naquele instante — comece com poucos nós e "
                "vá adicionando/conectando novos nos quadros seguintes "
                "pra simular o raciocínio se formando. Esta ferramenta "
                "já fala a 'anotacao' de cada quadro em voz alta, em "
                "sincronia com a animação (mesmo mecanismo do "
                "show_tactical_board). Use quando o usuário pedir pra "
                "você pensar em voz alta de forma visual, mapear uma "
                "decisão, comparar hipóteses, ou explicar um raciocínio "
                "com etapas que dependem umas das outras. NÃO use para "
                "perguntas diretas, factuais ou simples, e NÃO use para "
                "situações de futebol em campo — para isso use "
                "show_tactical_board. Coordenadas x e y vão de 0 a 100 "
                "(posição percentual no quadro). Para raciocínios com "
                "desenvolvimento real, gere de 3 a 8 quadros."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "titulo": {
                        "type": "string",
                        "description": "Título curto do raciocínio.",
                    },
                    "quadros": {
                        "type": "array",
                        "description": (
                            "Sequência de estados do quadro, em ordem "
                            "cronológica (cada um é o estado completo, "
                            "não só o que mudou)."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "anotacao": {
                                    "type": "string",
                                    "description": (
                                        "O que é dito/pensado neste "
                                        "instante, como fala natural — "
                                        "será narrado em voz alta quando "
                                        "este quadro aparecer."
                                    ),
                                },
                                "nos": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "string"},
                                            "texto": {"type": "string"},
                                            "x": {"type": "number"},
                                            "y": {"type": "number"},
                                            "tipo": {
                                                "type": "string",
                                                "enum": [
                                                    "ideia",
                                                    "pergunta",
                                                    "dado",
                                                    "conclusao",
                                                    "alerta",
                                                ],
                                            },
                                            "estado": {
                                                "type": "string",
                                                "enum": [
                                                    "normal",
                                                    "ativo",
                                                    "descartado",
                                                ],
                                            },
                                        },
                                        "required": ["id", "texto", "x", "y"],
                                    },
                                },
                                "conexoes": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "de": {"type": "string"},
                                            "para": {"type": "string"},
                                            "tipo": {
                                                "type": "string",
                                                "enum": [
                                                    "leva_a",
                                                    "suporta",
                                                    "contradiz",
                                                    "responde",
                                                ],
                                            },
                                        },
                                        "required": ["de", "para"],
                                    },
                                },
                            },
                            "required": ["nos"],
                        },
                    },
                },
                "required": ["titulo", "quadros"],
                "additionalProperties": False,
            },
        },
    },

    {
        "type": "function",
        "function": {
            "name": "list_unread_whatsapp",
            "description": (
                "Lista as conversas do WhatsApp com mensagens não lidas "
                "no momento, com o nome do contato e um preview da "
                "última mensagem. Use quando o usuário perguntar se tem "
                "mensagem nova, ou pra decidir sobre o que falar."
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
            "name": "read_whatsapp_chat",
            "description": (
                "Abre a conversa com um contato específico do WhatsApp e "
                "lê as últimas mensagens trocadas, sem enviar nada. Use "
                "quando o usuário pedir pra você ler, resumir ou contar "
                "o que fulano mandou."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "contato": {
                        "type": "string",
                        "description": "Nome do contato exatamente como aparece na lista de conversas.",
                    },
                    "quantidade": {
                        "type": "integer",
                        "description": "Quantas mensagens recentes ler. Padrão: 5.",
                    },
                },
                "required": ["contato"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_whatsapp_message",
            "description": (
                "Envia uma mensagem de WhatsApp para um contato. REGRA "
                "OBRIGATÓRIA: nunca chame esta ferramenta com "
                "confirmado=true na mesma resposta em que você acabou de "
                "ler ou resumir uma mensagem recebida. O fluxo correto é "
                "sempre: (1) chamar com confirmado=false (ou omitir) pra "
                "obter um rascunho, (2) falar o rascunho em voz alta pro "
                "usuário e perguntar se pode enviar, (3) só depois que o "
                "usuário confirmar explicitamente em uma mensagem "
                "seguinte, chamar de novo com confirmado=true. Nunca "
                "presuma autorização implícita."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "contato": {
                        "type": "string",
                        "description": "Nome do contato exatamente como aparece na lista de conversas.",
                    },
                    "texto": {
                        "type": "string",
                        "description": "Texto da mensagem a enviar.",
                    },
                    "confirmado": {
                        "type": "boolean",
                        "description": (
                            "true SOMENTE depois de confirmação explícita "
                            "do usuário, dada em um turno posterior à "
                            "leitura da mensagem original. Padrão: false."
                        ),
                    },
                },
                "required": ["contato", "texto"],
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
    "browser_open": browser_open,
    "browser_click": browser_click,
    "browser_type": browser_type,
    "browser_scroll": browser_scroll,
    "browser_back": browser_back,
    "browser_forward": browser_forward,
    "browser_read": browser_read,
    "browser_close": browser_close,
    "get_weather": get_weather,
    "get_distance": get_distance,
    "find_nearest_place": find_nearest_place,
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
    "toggle_microphone": toggle_microphone,
    "get_daily_news": get_daily_news,
    "play_music": play_music,
    "show_tactical_board": show_tactical_board,
    "show_reasoning_board": show_reasoning_board,
    "show_simulation": show_simulation,
    "add_reminder": add_reminder,
    "list_reminders": list_reminders,
    "complete_reminder": complete_reminder,
    "remove_reminder": remove_reminder,
    "set_alarm": set_alarm,
    "list_alarms": list_alarms,
    "cancel_alarm": cancel_alarm,
    "list_unread_whatsapp": list_unread_whatsapp,
    "read_whatsapp_chat": read_whatsapp_chat,
    "send_whatsapp_message": send_whatsapp_message,
}