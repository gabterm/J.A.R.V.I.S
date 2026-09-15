from dotenv import load_dotenv

                                                                  
load_dotenv()

import json
import os
import re
import socket
import sys
import threading
import time
import uuid
from tools.tools import TOOLS, TOOL_FUNCTIONS
from openai import OpenAI
from tools.jarvis_sounds import sounds
from tools.voice import speak, limpar_para_fala, limpar_para_texto, extrair_proxima_frase
import tools.ui_bridge as ui_bridge
import tools.whatsapp_agent as whatsapp_agent
from tools.push import enviar_push
from tools.ntfy_listener import escutar_ntfy
from pathlib import Path
import tools.proactive as proactive
import webview

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"

MEMORY_FILE = ASSETS_DIR / "memory.json"
PROMPT_FILE = ASSETS_DIR / "prompt.txt"

memory_lock = threading.Lock()

                                                                        
MAX_TAMANHO_RESPOSTA_PUSH = 1000


def default_memory():
    return {
        "primeira_interacao": True,
        "nome": None,
        "idade": None,
        "interesses": [],
        "rotina": [],
        "preferencias": [],
        "objetivos": [],
        "resumo_contexto": "",
        "historico_recente": [],
        "timeline": [],
    }


def load_memory():
    if not os.path.exists(MEMORY_FILE):
        memory = default_memory()
        save_memory(memory)
        return memory

    with open(MEMORY_FILE, "r", encoding="utf-8") as file:
        content = file.read().strip()
        if not content:
            memory = default_memory()
            save_memory(memory)
            return memory

        memory = json.loads(content)

    memory.setdefault("timeline", [])
    return memory


def save_memory(memory):
    with open(MEMORY_FILE, "w", encoding="utf-8") as file:
        json.dump(memory, file, indent=4, ensure_ascii=False)


def _normalizar(texto):
    if not isinstance(texto, str):
        return texto
    t = texto.strip().strip("\"'").lower()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[.,;:!?]+$", "", t)
    return t


MEMORY_EXTRACTION_SCHEMA = """
Você é um extrator de fatos. Analise a mensagem do usuário (e, se ajudar,
a resposta do assistente) e extraia SOMENTE fatos novos que o usuário
declarou explicitamente sobre si mesmo.

Responda ESTRITAMENTE em JSON, sem markdown, sem texto extra, no formato:

{
  "nome": string ou null,
  "idade": number ou null,
  "interesses": [string, ...],
  "rotina": [string, ...],
  "preferencias": [string, ...],
  "objetivos": [string, ...]
}

Regras:
- Campos não mencionados na mensagem devem vir como null (nome/idade) ou
  lista vazia (demais campos).
- NUNCA invente informação. Só extraia o que foi dito literalmente.
- Não inclua, suposições ou inferências.
"""


def extract_facts(user_message, assistant_response):
    extraction = client.chat.completions.create(
        model="gpt-5.6-luna",
        messages=[
            {
                "role": "system",
                "content": MEMORY_EXTRACTION_SCHEMA
            },
            {
                "role": "user",
                "content": (
                    f"Mensagem do usuário: {user_message}\n"
                    f"Resposta do assistente: {assistant_response}"
                )
            }
        ],
        response_format={"type": "json_object"}
    )

    raw = extraction.choices[0].message.content

    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def novos_itens_timeline(memory, facts):
    campos = (
        ("interesses", "interesse"),
        ("rotina", "rotina"),
        ("preferencias", "preferencia"),
        ("objetivos", "objetivo"),
    )
    novos = []
    for campo, rotulo in campos:
        existentes_norm = {_normalizar(i) for i in memory.get(campo, [])}
        for item in (facts.get(campo) or []):
            if not isinstance(item, str):
                continue
            item = item.strip()
            if item and _normalizar(item) not in existentes_norm:
                novos.append({
                    "id": str(uuid.uuid4()),
                    "tipo": rotulo,
                    "text": item,
                    "pinned": False,
                })
                existentes_norm.add(_normalizar(item))
    return novos


def merge_facts_into_memory(memory, facts):
    if not facts:
        return memory

    for field in ("nome", "idade"):
        value = facts.get(field)
        if value not in (None, ""):
            memory[field] = value

    for field in ("interesses", "rotina", "preferencias", "objetivos"):
        new_items = facts.get(field) or []
        if not isinstance(new_items, list):
            continue
        existing = memory.get(field, [])
        existing_norm = {_normalizar(i) for i in existing}
        for item in new_items:
            item = item.strip() if isinstance(item, str) else item
            if item and _normalizar(item) not in existing_norm:
                existing.append(item)
                existing_norm.add(_normalizar(item))
        memory[field] = existing

    return memory


MAX_HISTORICO_BRUTO = 10


def add_to_history(memory, user_message, assistant_response):
    historico = memory.get("historico_recente", [])

    historico.append({
        "usuario": user_message,
        "jarvis": assistant_response
    })

    if len(historico) > MAX_HISTORICO_BRUTO:
        excedente = historico[:-MAX_HISTORICO_BRUTO]
        historico = historico[-MAX_HISTORICO_BRUTO:]

        memory["resumo_contexto"] = condense_history(
            memory.get("resumo_contexto", ""),
            excedente
        )

    memory["historico_recente"] = historico
    return memory


CONDENSE_PROMPT = """
Você resume conversas para servir de memória de longo prazo de um
assistente pessoal chamado JARVIS.

Receberá um resumo anterior (pode estar vazio) e uma lista de trocas mais
antigas que precisam ser condensadas nele.

Produza um novo resumo em português, em terceira pessoa, curto e denso,
preservando fatos, decisões, contexto de projetos e preferências
relevantes mencionados. Não invente nada que não esteja no material.
Responda apenas com o texto do resumo, sem markdown, sem preâmbulo.
"""


def condense_history(resumo_anterior, trocas_antigas):
    condensacao = client.chat.completions.create(
        model="gpt-5.6-luna",
        messages=[
            {"role": "system", "content": CONDENSE_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Resumo anterior:\n{resumo_anterior or '(vazio)'}\n\n"
                    f"Trocas a condensar:\n"
                    f"{json.dumps(trocas_antigas, ensure_ascii=False, indent=2)}"
                )
            }
        ]
    )
    return condensacao.choices[0].message.content.strip()


def load_prompt():
    with open(PROMPT_FILE, "r", encoding="utf-8") as file:
        return file.read()


def ask_jarvis(message, memory, falar_resposta_ativa=True):
    system_prompt = load_prompt()

    fatos = {
        k: v
        for k, v in memory.items()
        if k not in ("resumo_contexto", "historico_recente", "timeline")
    }

    contexto_parts = [
        "Fatos conhecidos sobre o usuário:\n"
        + json.dumps(fatos, ensure_ascii=False)
    ]

    if memory.get("resumo_contexto"):
        contexto_parts.append(
            "Resumo de conversas anteriores:\n"
            + memory["resumo_contexto"]
        )

    if memory.get("historico_recente"):
        contexto_parts.append(
            "Trocas recentes (mais antiga primeiro):\n"
            + json.dumps(
                memory["historico_recente"],
                ensure_ascii=False,
                indent=2,
            )
        )

    memory_context = "\n\n".join(contexto_parts)

    system_messages = [
        {
            "role": "system",
            "content": system_prompt,
        },
        {
            "role": "system",
            "content": memory_context,
        },
    ]

    if not falar_resposta_ativa:
        system_messages.append({
            "role": "system",
            "content": (
                "Esta resposta específica será entregue como texto "
                "escrito, numa notificação push — não vai ser falada em "
                "voz alta. Escreva de forma normal para leitura: use "
                "algarismos para números (ex: 73, não 'setenta e três'), "
                "não soletre siglas, não substitua símbolos por palavras "
                "e não adapte nada para fala. Seja direto e conciso, já "
                "que é uma notificação."
            ),
        })

    messages = system_messages + [
        {
            "role": "user",
            "content": message,
        },
    ]

    ui_bridge.broadcast({
        "type": "status",
        "state": "thinking"
    })
    sounds.play("thinking")

    while True:
        response = client.chat.completions.create(
            model="gpt-5.6-luna",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            reasoning_effort="none",
        )

        assistant_message = response.choices[0].message
        messages.append(assistant_message)

        if not assistant_message.tool_calls:
            full_response = assistant_message.content or ""

            if falar_resposta_ativa:
                falar_resposta(full_response)
            else:
                                                                        
                                                                        
                print("JARVIS (via push, sem voz):", full_response)
                ui_bridge.broadcast({
                    "type": "log",
                    "role": "jarvis",
                    "text": full_response
                })

            ui_bridge.broadcast({
                "type": "status",
                "state": "idle"
            })

            return full_response

        for tool_call in assistant_message.tool_calls:
            tool_name = tool_call.function.name

            try:
                arguments = json.loads(
                    tool_call.function.arguments
                )
            except json.JSONDecodeError:
                result = {
                    "success": False,
                    "message": "Argumentos inválidos."
                }
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result),
                })
                sounds.play("error")
                ui_bridge.broadcast({
                    "type": "tool_exec",
                    "name": tool_name,
                    "status": "error",
                    "result": "Argumentos inválidos.",
                })
                continue

            tool_function = TOOL_FUNCTIONS.get(tool_name)

            if not tool_function:
                result = {
                    "success": False,
                    "message": f"Ferramenta desconhecida: {tool_name}"
                }
                sounds.play("error")
                ui_bridge.broadcast({
                    "type": "tool_exec",
                    "name": tool_name,
                    "status": "error",
                    "result": result["message"],
                })
            else:
                print(
                    f"\n🔧 JARVIS executando: "
                    f"{tool_name}({arguments})"
                )

                ui_bridge.broadcast({
                    "type": "tool_exec",
                    "name": tool_name,
                    "status": "running",
                })
                sounds.play("processing")

                try:
                    result = tool_function(**arguments)
                    ok = result.get("success", True) if isinstance(result, dict) else True
                    ui_bridge.broadcast({
                        "type": "tool_exec",
                        "name": tool_name,
                        "status": "success" if ok else "error",
                        "result": str(result.get("message", "")) if isinstance(result, dict) else str(result),
                    })
                    if not ok:
                        sounds.play("error")
                except Exception as error:
                    result = {
                        "success": False,
                        "message": str(error),
                    }
                    sounds.play("error")
                    ui_bridge.broadcast({
                        "type": "tool_exec",
                        "name": tool_name,
                        "status": "error",
                        "result": str(error),
                    })

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(
                    result,
                    ensure_ascii=False
                ),
            })


def falar_resposta(full_response):
    print("JARVIS:", full_response)

    ui_bridge.jarvis_falando.set()  

    ui_bridge.broadcast({
        "type": "status",
        "state": "speaking"
    })
    sounds.play("voice_start")

    ui_bridge.broadcast({
        "type": "log",
        "role": "jarvis",
        "text": full_response
    })

    buffer = ""
    for char in full_response:
        buffer += char
        while True:
            frase, buffer = extrair_proxima_frase(buffer)
            if frase is None:
                break
            frase_falada = limpar_para_fala(frase)
            if frase_falada:
                speak(frase_falada)

    restante = buffer.strip()
    if restante:
        frase_falada = limpar_para_fala(restante)
        if frase_falada:
            speak(frase_falada)
    ui_bridge.jarvis_falando.clear() 
    sounds.play("voice_end") 


def escutar_terminal():
    while True:
        try:
            texto = input("\nVocê: ")
        except EOFError:
            break
        texto = texto.strip()
        if texto:
            ui_bridge.mensagens_entrada.put(texto)


def escutar_acoes_timeline(memory_ref):
    while True:
        acao = ui_bridge.acoes_entrada.get()
        item_id = acao["id"]
        tipo_acao = acao["action"]

        with memory_lock:
            timeline = memory_ref.get("timeline", [])

            if tipo_acao == "remove":
                memory_ref["timeline"] = [
                    i for i in timeline if i["id"] != item_id
                ]
            else:
                for item in timeline:
                    if item["id"] == item_id:
                        item["pinned"] = (tipo_acao == "pin")
                        break

            save_memory(memory_ref)
            timeline_atual = list(memory_ref.get("timeline", []))

        ui_bridge.broadcast({"type": "timeline", "items": timeline_atual})


def aguardar_servidor(host, port, timeout=10):
    prazo = time.monotonic() + timeout
    while time.monotonic() < prazo:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def loop_jarvis(memory):
    while True:
        item = ui_bridge.mensagens_entrada.get()

        if isinstance(item, tuple):
            origem, user_input = item
        else:
            origem, user_input = None, item

        if user_input.lower() in ["sair", "exit", "quit"]:
            sounds.play("shutdown", block=True)
            print("\nJARVIS desligado.")
            os._exit(0)

        try:
            response = ask_jarvis(
                user_input,
                memory,
                falar_resposta_ativa=(origem != "ntfy"),
            )

            if origem == "ntfy":
                resposta_texto = limpar_para_texto(response)
                resposta_push = (
                    resposta_texto
                    if len(resposta_texto) <= MAX_TAMANHO_RESPOSTA_PUSH
                    else resposta_texto[:MAX_TAMANHO_RESPOSTA_PUSH] + "…"
                )
                enviar_push("JARVIS", resposta_push)

            facts = extract_facts(user_input, response)

            with memory_lock:
                novos = novos_itens_timeline(memory, facts)
                memory = merge_facts_into_memory(memory, facts)
                memory.setdefault("timeline", []).extend(novos)
                memory = add_to_history(memory, user_input, response)
                save_memory(memory)

                fatos_para_ui = {
                    k: v for k, v in memory.items()
                    if k not in ("resumo_contexto", "historico_recente", "timeline")
                }

            for novo_item in novos:
                ui_bridge.broadcast({"type": "timeline_add", "item": novo_item})

            ui_bridge.broadcast({"type": "memory", "facts": fatos_para_ui})

        except Exception as error:
            print(f"⚠️  Erro processando mensagem: {error}")
            sounds.play("error")
            ui_bridge.broadcast({
                "type": "status",
                "state": "idle"
            })

            if origem == "ntfy":
                try:
                    enviar_push(
                        "JARVIS",
                        f"Não consegui processar sua mensagem agora: {error}",
                        prioridade="alta",
                    )
                except Exception:
                    pass


def main():
    memory = load_memory()
    ui_bridge.start_server_in_background()

    fatos_iniciais = {
        k: v for k, v in memory.items()
        if k not in ("resumo_contexto", "historico_recente", "timeline")
    }
    ui_bridge.broadcast({"type": "memory", "facts": fatos_iniciais})
    ui_bridge.broadcast({"type": "timeline", "items": memory.get("timeline", [])})

    print("\n🤖 JARVIS iniciado.\n")
    sounds.play("system_ready")

    if memory.get("primeira_interacao"):
        response = ask_jarvis(
            """
                O usuário acabou de iniciar o sistema.
                Comece a primeira interação.
                Apresente-se como JARVIS.
                Explique que você está aqui para ajudar.
                Faça somente uma pergunta simples para conhecer o usuário.
                Não faça várias perguntas.
                """,
            memory
        )
        memory["primeira_interacao"] = False
        with memory_lock:
            save_memory(memory)

    from tools.mic_listener import escutar_microfone
    threading.Thread(target=escutar_microfone, daemon=True).start()
    threading.Thread(
        target=escutar_acoes_timeline,
        args=(memory,),
        daemon=True,
    ).start()
    threading.Thread(
        target=whatsapp_agent.start_whatsapp_session,
        daemon=True,
    ).start()
    threading.Thread(
        target=escutar_ntfy,
        daemon=True,
    ).start()
    threading.Thread(
        target=loop_jarvis,
        args=(memory,),
        daemon=True,
    ).start()
    proactive.iniciar_scheduler()

    aguardar_servidor(ui_bridge.HOST, ui_bridge.PORT)

    window = webview.create_window(
        "J.A.R.V.I.S.",
        f"http://{ui_bridge.HOST}:{ui_bridge.PORT}/",
        width=1600,
        height=900,
        min_size=(960, 600),
        background_color="#040c11",
    )
    webview.start()
    os._exit(0)


if __name__ == "__main__":
    main()
