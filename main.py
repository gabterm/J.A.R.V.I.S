import json
import os
from dotenv import load_dotenv
import threading
from tools.tools import TOOLS, TOOL_FUNCTIONS
from openai import OpenAI
from tools.jarvis_sounds import sounds
from tools.voice import speak, limpar_para_fala, extrair_proxima_frase
import tools.ui_bridge as ui_bridge
from pathlib import Path

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"

MEMORY_FILE = ASSETS_DIR / "memory.json"
PROMPT_FILE = ASSETS_DIR / "prompt.txt"

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
        "historico_recente": []
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

        return json.loads(content)

def save_memory(memory):
    with open(MEMORY_FILE, "w", encoding="utf-8") as file:
        json.dump(memory, file, indent=4, ensure_ascii=False)

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
- Não inclua opiniões, suposições ou inferências.
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
        for item in new_items:
            item = item.strip() if isinstance(item, str) else item
            if item and item not in existing:
                existing.append(item)
        memory[field] = existing

    return memory

MAX_HISTORICO_BRUTO = 10

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

def ask_jarvis(message, memory):
    system_prompt = load_prompt()

    fatos = {
        k: v
        for k, v in memory.items()
        if k not in ("resumo_contexto", "historico_recente")
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

    messages = [
        {
            "role": "system",
            "content": system_prompt,
        },
        {
            "role": "system",
            "content": memory_context,
        },
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

            falar_resposta(full_response)

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
                continue

            tool_function = TOOL_FUNCTIONS.get(tool_name)

            if not tool_function:
                result = {
                    "success": False,
                    "message": f"Ferramenta desconhecida: {tool_name}"
                }
                sounds.play("error")
            else:
                print(
                    f"\n🔧 JARVIS executando: "
                    f"{tool_name}({arguments})"
                )

                ui_bridge.broadcast({
                    "type": "status",
                    "state": "working"
                })
                sounds.play("working")

                try:
                    result = tool_function(**arguments)
                except Exception as error:
                    result = {
                        "success": False,
                        "message": str(error),
                    }
                    sounds.play("error")

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

    ui_bridge.broadcast({
        "type": "status",
        "state": "speaking"
    })
    sounds.play("speaking")

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

def main():
    memory = load_memory()
    ui_bridge.start_server_in_background()

    fatos_iniciais = {
        k: v for k, v in memory.items()
        if k not in ("resumo_contexto", "historico_recente")
    }
    ui_bridge.broadcast({"type": "memory", "facts": fatos_iniciais})

    print("\n🤖 JARVIS iniciado.\n")
    sounds.play("startup")

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
        save_memory(memory)

    def escutar_terminal():
        while True:
            try:
                texto = input("\nVocê: ")
            except EOFError:
                break
            texto = texto.strip()
            if texto:
                ui_bridge.mensagens_entrada.put(texto)

    threading.Thread(target=escutar_terminal, daemon=True).start()

    while True:
        user_input = ui_bridge.mensagens_entrada.get()

        if user_input.lower() in ["sair", "exit", "quit"]:
            sounds.play("shutdown", block=True)
            print("\nJARVIS desligado.")
            break

        ui_bridge.broadcast({"type": "log", "role": "user", "text": user_input})

        response = ask_jarvis(user_input, memory)

        facts = extract_facts(user_input, response)
        memory = merge_facts_into_memory(memory, facts)

        memory = add_to_history(memory, user_input, response)

        save_memory(memory)

        fatos_para_ui = {
            k: v for k, v in memory.items()
            if k not in ("resumo_contexto", "historico_recente")
        }
        ui_bridge.broadcast({"type": "memory", "facts": fatos_para_ui})

if __name__ == "__main__":
    main()