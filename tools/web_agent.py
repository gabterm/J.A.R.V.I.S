"""
tools/whatsapp_agent.py

Integração com WhatsApp via Evolution API (REST + webhook), substituindo
a versão anterior baseada em Playwright/WhatsApp Web.

Requer no .env:
  EVOLUTION_API_URL      - ex: http://localhost:8080 ou https://evo.seudominio.com
  EVOLUTION_API_KEY      - apikey da instância (ou global, dependendo da config)
  EVOLUTION_INSTANCE     - nome da instância criada no Evolution Manager
  WHATSAPP_WEBHOOK_URL   - (opcional) URL pública completa que a Evolution API
                           deve chamar quando chegar mensagem, ex:
                           https://seu-tunel.ngrok-free.app/webhook/whatsapp
                           Só é usada por _configurar_webhook_best_effort(); se
                           não tiver, configure manualmente no Evolution Manager
                           (aba Webhook da instância), evento MESSAGES_UPSERT.

IMPORTANTE — endereçamento de contato:
Diferente da versão via WhatsApp Web (que buscava por nome na UI), a
Evolution API manda mensagem pra um NÚMERO, não pra um nome. Por isso
toda função aqui aceita `contato` como:
  - número com DDI (ex: "5511999999999" ou "+55 11 99999-9999"), OU
  - remoteJid já resolvido (ex: "5511999999999@s.whatsapp.net"), OU
  - um nome — nesse caso _resolver_contato tenta achar o remoteJid via
    POST /chat/findContacts. Isso depende do contato já ter conversado
    com essa instância (ou estar salvo), e pode ser ambíguo ou falhar.
    Prefira sempre que possível passar o número.

IMPORTANTE — versões da Evolution API:
Os endpoints e nomes de campo abaixo (sendText, findMessages, findChats,
findContacts, formato do payload de webhook messages.upsert) foram
conferidos contra relatos/issues da linha v2.x (fork atendai/evolution-api,
a mais comum hoje). Forks e versões antigas (v1.x) usam schemas um pouco
diferentes (ex: "textMessage": {"text": ...} em vez de "text": ... direto
no sendText). O nome do campo de "não lidas" em findChats também não é
100% padronizado entre versões — list_unread_whatsapp tenta várias
variantes conhecidas. Se algo der 400/500, teste o payload direto no
Swagger/Postman/Insomnia da sua instância antes de assumir bug de lógica
aqui.

IMPORTANTE — modelo de notificação (mesma ideia da versão anterior):
Em vez de pollar o DOM, o endpoint POST /webhook/whatsapp em
tools/ui_bridge.py recebe o evento messages.upsert da Evolution API e
chama processar_evento_webhook(), que injeta uma instrução sintética em
ui_bridge.mensagens_entrada — a mesma fila usada pelo microfone e pelo
terminal. Isso faz a notificação passar pelo ciclo normal do ask_jarvis
em main.py: o LLM chama read_whatsapp_chat, resume pro usuário, e já
sugere um rascunho de resposta via send_whatsapp_message com
confirmado=false.

Mensagens de grupo (remoteJid terminado em "@g.us") são ignoradas por
padrão em processar_evento_webhook — remova o filtro se quiser notificar
para grupos também.

Modelo de segurança do envio (mantido igual):
send_whatsapp_message só realiza o envio de fato se confirmado=True,
setado pelo LLM somente depois que o usuário confirmou verbalmente, em
um turno de conversa POSTERIOR ao turno em que a mensagem recebida foi
lida/resumida (ver REGRA DE OURO no prompt.txt).
"""

import os
import re

import httpx

EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL", "").rstrip("/")
EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_INSTANCE = os.getenv("EVOLUTION_INSTANCE", "")
WHATSAPP_WEBHOOK_URL = os.getenv("WHATSAPP_WEBHOOK_URL", "")

TIMEOUT_SEGUNDOS = 20

# Dedup de eventos de webhook (a Evolution API pode reentregar o mesmo
# evento em retries). Cresce sem limite ao longo da execução — se o
# processo ficar rodando por muito tempo, considere trocar por um
# deque/LRU com tamanho máximo.
_ja_notificados = set()


def _cliente():
    if not (EVOLUTION_API_URL and EVOLUTION_API_KEY and EVOLUTION_INSTANCE):
        raise RuntimeError(
            "Configuração da Evolution API incompleta — verifique "
            "EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE no .env."
        )
    return httpx.Client(
        base_url=EVOLUTION_API_URL,
        headers={"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"},
        timeout=TIMEOUT_SEGUNDOS,
    )


def _somente_digitos(texto):
    return re.sub(r"\D", "", texto or "")


def _parece_numero(contato):
    # Heurística: se sobrarem pelo menos 8 dígitos depois de tirar tudo
    # que não é número, tratamos como telefone, não como nome.
    return len(_somente_digitos(contato)) >= 8


def _numero_do_jid(remote_jid):
    return remote_jid.split("@")[0]


def _resolver_contato(contato):
    """
    Retorna o remoteJid (ex: '5511999999999@s.whatsapp.net') a partir
    de um número, de um remoteJid já pronto, ou de um nome.
    """
    if "@" in contato:
        return contato

    if _parece_numero(contato):
        return f"{_somente_digitos(contato)}@s.whatsapp.net"

    with _cliente() as cliente:
        resposta = cliente.post(
            f"/chat/findContacts/{EVOLUTION_INSTANCE}",
            json={"where": {"pushName": contato}},
        )
        resposta.raise_for_status()
        contatos = resposta.json() or []

    contato_lower = contato.strip().lower()
    correspondentes = [
        c for c in contatos
        if contato_lower in (c.get("pushName") or "").strip().lower()
    ]

    if not correspondentes:
        raise RuntimeError(
            f"Não encontrei nenhum contato chamado '{contato}' na "
            "Evolution API. Tente passar o número com DDI, ex: "
            "'5511999999999'."
        )

    if len(correspondentes) > 1:
        nomes = ", ".join(c.get("pushName", "?") for c in correspondentes)
        raise RuntimeError(
            f"Encontrei mais de um contato parecido com '{contato}': "
            f"{nomes}. Seja mais específico ou use o número direto."
        )

    remote_jid = correspondentes[0].get("remoteJid")
    if not remote_jid:
        raise RuntimeError(f"Contato '{contato}' encontrado, mas sem remoteJid.")
    return remote_jid


def _extrair_texto(message):
    """
    O corpo da mensagem muda de formato conforme o tipo (texto simples,
    resposta citada, legenda de mídia etc.). Cobre os formatos mais
    comuns antes de desistir.
    """
    if not isinstance(message, dict):
        return ""
    return (
        message.get("conversation")
        or (message.get("extendedTextMessage") or {}).get("text")
        or (message.get("imageMessage") or {}).get("caption")
        or (message.get("videoMessage") or {}).get("caption")
        or ""
    )


def start_whatsapp_session():
    """
    Só confere se a instância está conectada e tenta (best-effort)
    configurar o webhook se WHATSAPP_WEBHOOK_URL estiver setada. Não
    sobe nenhuma thread/browser dedicada — quem fala com o WhatsApp
    agora é a Evolution API, que roda como serviço separado.
    """
    try:
        with _cliente() as cliente:
            resposta = cliente.get(f"/instance/connectionState/{EVOLUTION_INSTANCE}")
            resposta.raise_for_status()
            estado = resposta.json()
    except Exception as error:
        return {
            "success": False,
            "message": f"Não consegui falar com a Evolution API: {error}",
        }

    if WHATSAPP_WEBHOOK_URL:
        _configurar_webhook_best_effort()

    return {
        "success": True,
        "message": "Sessão do WhatsApp (Evolution API) verificada.",
        "estado": estado,
    }


def _configurar_webhook_best_effort():
    """
    Tenta registrar o webhook automaticamente. O schema varia entre
    versões da Evolution API — se der erro, só loga um aviso e segue;
    configure manualmente pelo Evolution Manager (aba Webhook da
    instância) apontando pra WHATSAPP_WEBHOOK_URL com o evento
    MESSAGES_UPSERT habilitado.
    """
    try:
        with _cliente() as cliente:
            cliente.post(
                f"/webhook/set/{EVOLUTION_INSTANCE}",
                json={
                    "webhook": {
                        "url": WHATSAPP_WEBHOOK_URL,
                        "enabled": True,
                        "events": ["MESSAGES_UPSERT"],
                    }
                },
            )
    except Exception as error:
        print(
            "⚠️  Não consegui configurar o webhook automaticamente "
            f"({error}). Configure manualmente no Evolution Manager: "
            f"URL = {WHATSAPP_WEBHOOK_URL}, evento MESSAGES_UPSERT."
        )


def list_unread_whatsapp():
    try:
        with _cliente() as cliente:
            resposta = cliente.post(
                f"/chat/findChats/{EVOLUTION_INSTANCE}",
                json={},
            )
            resposta.raise_for_status()
            chats = resposta.json() or []
    except Exception as error:
        return {"success": False, "message": f"Não foi possível listar mensagens: {error}"}

    resultado = []
    for chat in chats:
        # Nome do campo de "não lidas" varia entre versões/forks.
        nao_lidas = (
            chat.get("unreadCount")
            or chat.get("unreadMessages")
            or chat.get("unread_count")
            or 0
        )
        if not nao_lidas:
            continue
        resultado.append({
            "nome": chat.get("pushName") or chat.get("name") or chat.get("remoteJid"),
            "remoteJid": chat.get("remoteJid"),
            "naoLidas": str(nao_lidas),
        })

    return {"success": True, "count": len(resultado), "chats": resultado}


def read_whatsapp_chat(contato: str, quantidade: int = 5):
    try:
        remote_jid = _resolver_contato(contato)

        with _cliente() as cliente:
            resposta = cliente.post(
                f"/chat/findMessages/{EVOLUTION_INSTANCE}",
                json={
                    "where": {"key": {"remoteJid": remote_jid}},
                    "limit": quantidade,
                },
            )
            resposta.raise_for_status()
            dados = resposta.json()

        # Algumas versões retornam lista direta, outras dentro de
        # {"messages": {"records": [...]}} — cobre as duas.
        if isinstance(dados, dict):
            bloco_mensagens = dados.get("messages")
            registros = (
                bloco_mensagens.get("records")
                if isinstance(bloco_mensagens, dict)
                else bloco_mensagens
            ) or []
        else:
            registros = dados or []

        mensagens = []
        for m in registros[-quantidade:]:
            key = m.get("key", {})
            texto = _extrair_texto(m.get("message", {}))
            mensagens.append({
                "texto": texto or "[mídia/sem texto]",
                "de": "você" if key.get("fromMe") else contato,
            })

        return {"success": True, "contato": contato, "mensagens": mensagens}
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
        remote_jid = _resolver_contato(contato)
        numero = _numero_do_jid(remote_jid)

        with _cliente() as cliente:
            resposta = cliente.post(
                f"/message/sendText/{EVOLUTION_INSTANCE}",
                json={"number": numero, "text": texto},
            )
            resposta.raise_for_status()

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


def processar_evento_webhook(payload):
    """
    Chamado por tools/ui_bridge.py quando chega POST em /webhook/whatsapp.
    Espera o formato padrão de evento da Evolution API:
      {"event": "messages.upsert", "instance": "...", "data": {...}}
    """
    if not isinstance(payload, dict):
        return

    if payload.get("event") != "messages.upsert":
        return

    dados = payload.get("data") or {}
    key = dados.get("key") or {}

    if key.get("fromMe"):
        return  # mensagem enviada por nós mesmos, ignora

    remote_jid = key.get("remoteJid", "")
    if not remote_jid or remote_jid.endswith("@g.us"):
        return  # sem remoteJid, ou mensagem de grupo (ignorada por padrão)

    message_id = key.get("id")
    if not message_id or message_id in _ja_notificados:
        return
    _ja_notificados.add(message_id)

    numero = _numero_do_jid(remote_jid)
    nome = dados.get("pushName") or numero
    texto = _extrair_texto(dados.get("message") or {})

    # Import local pra evitar import circular — ui_bridge importa este
    # módulo pra registrar a rota do webhook (mesmo padrão já usado
    # dentro do websocket_endpoint em ui_bridge.py para TOOL_FUNCTIONS).
    import tools.ui_bridge as ui_bridge

    ui_bridge.broadcast({
        "type": "whatsapp_message",
        "nome": nome,
        "preview": texto,
    })

    instrucao = (
        "[NOTIFICAÇÃO AUTOMÁTICA DE WHATSAPP] Chegou uma mensagem nova "
        f"de {nome} (número {numero}). Prévia: \"{texto}\". Use "
        f"read_whatsapp_chat com contato=\"{numero}\" para ler a "
        "conversa completa. Avise o usuário sobre a mensagem, resuma "
        "o conteúdo dela em fala natural, e já sugira um rascunho de "
        f"resposta chamando send_whatsapp_message com contato=\"{numero}\" "
        "e confirmado=false. Fale o rascunho sugerido e pergunte se "
        "pode enviar. Não chame send_whatsapp_message com "
        "confirmado=true nesta mesma resposta, mesmo que o rascunho "
        "pareça óbvio — a aprovação só vem em uma mensagem seguinte "
        "do usuário."
    )

    ui_bridge.mensagens_entrada.put(instrucao)