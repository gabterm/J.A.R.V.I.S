import json
import os
import ssl
import time
from urllib.request import Request, urlopen

import certifi

import tools.ui_bridge as ui_bridge

_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def escutar_ntfy():
    NTFY_TOPIC = "datateste80809090"

    if not NTFY_TOPIC:
        print("⚠️  NTFY_TOPIC não configurado — ouvinte de push desativado.")
        return

    url = f"https://ntfy.sh/{NTFY_TOPIC}/json"

    while True:
        try:
            request = Request(url, headers={"User-Agent": "JARVIS/1.0"})
            with urlopen(request, timeout=None, context=_SSL_CONTEXT) as response:
                for linha in response:
                    linha = linha.decode("utf-8").strip()
                    if not linha:
                        continue

                    try:
                        dado = json.loads(linha)
                    except json.JSONDecodeError:
                        continue

                    if dado.get("event") != "message":
                        continue

                    if "jarvis" in (dado.get("tags") or []):
                        continue

                    texto = dado.get("message", "").strip()
                    if not texto:
                        continue

                    print(f"\n📱 Mensagem recebida via push: {texto}")
                    ui_bridge.mensagens_entrada.put(("ntfy", texto))

        except Exception as error:
            print(f"⚠️  Ouvinte ntfy caiu, reconectando em 5s: {error}")
            time.sleep(5)