import json
import os
import ssl
from urllib.request import Request, urlopen

import certifi

_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

NTFY_URL = "https://ntfy.sh"

_PRIORIDADES = {"baixa": 2, "normal": 3, "alta": 4, "urgente": 5}


def enviar_push(titulo: str, mensagem: str, prioridade: str = "normal"):
    NTFY_TOPIC = "datateste80809090"

    if not NTFY_TOPIC:
        return {
            "success": False,
            "message": (
                "NTFY_TOPIC não configurado no .env. Instale o app ntfy "
                "(ntfy.sh) e defina um tópico único em NTFY_TOPIC pra "
                "habilitar notificações push."
            ),
        }

    try:
        payload = json.dumps({
            "topic": NTFY_TOPIC,
            "title": titulo,
            "message": mensagem,
            "priority": _PRIORIDADES.get(prioridade, 3),
            "tags": ["jarvis"],
        }).encode("utf-8")

        request = Request(
            NTFY_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
        )

        with urlopen(request, timeout=10, context=_SSL_CONTEXT):
            pass

        return {
            "success": True,
            "message": f"Notificação push enviada: {titulo}",
        }

    except Exception as error:
        return {
            "success": False,
            "message": f"Não foi possível enviar a notificação push: {error}",
        }