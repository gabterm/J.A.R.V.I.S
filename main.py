import json
import os
import re
import threading
import time
import unicodedata
import json
from tools import TOOLS, TOOL_FUNCTIONS
import pygame
from openai import OpenAI
from fish_audio_sdk import Session, TTSRequest
from jarvis_sounds import sounds
import ui_bridge



FISH_AUDIO_VOICE_ID = os.environ.get(
    "FISH_AUDIO_VOICE_ID",
    "a9558d6bc0ab45068843698477fe84f5",
)


FISH_AUDIO_MODEL = os.environ.get("FISH_AUDIO_MODEL", "s2.1-pro")

MEMORY_FILE = "memory.json"
PROMPT_FILE = "prompt.txt"

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
    buffer = ""
    bloco = []
    quantidade_frases = 0
    primeiro_bloco = True

    for char in full_response:
        buffer += char

        while True:
            frase, buffer = extrair_proxima_frase(buffer)

            if frase is None:
                break

            bloco.append(frase)
            quantidade_frases += 1

            if quantidade_frases >= 3:
                texto_bloco = " ".join(bloco).strip()
                bloco = []
                quantidade_frases = 0

                frase_falada = limpar_para_fala(texto_bloco)

                print("JARVIS:", texto_bloco)

                ui_bridge.broadcast({
                    "type": "status",
                    "state": "speaking"
                })

                if primeiro_bloco:
                    sounds.play("speaking")
                    primeiro_bloco = False

                ui_bridge.broadcast({
                    "type": "log",
                    "role": "jarvis",
                    "text": texto_bloco
                })

                if frase_falada:
                    speak(frase_falada)

    restante = buffer.strip()

    if restante:
        bloco.append(restante)

    if bloco:
        texto_bloco = " ".join(bloco).strip()
        frase_falada = limpar_para_fala(texto_bloco)

        print("JARVIS:", texto_bloco)

        ui_bridge.broadcast({
            "type": "status",
            "state": "speaking"
        })

        if primeiro_bloco:
            sounds.play("speaking")
            primeiro_bloco = False

        ui_bridge.broadcast({
            "type": "log",
            "role": "jarvis",
            "text": texto_bloco
        })

        if frase_falada:
            speak(frase_falada)
ABREVIACOES = {
    "sr", "sra", "srta", "dr", "dra", "prof", "profa",
    "etc", "ex", "vs", "cia", "ltda", "nº", "no",
    "pág", "pag", "cap", "vol", "aprox", "obs",
    "mr", "mrs", "ms", "jr", "sr", "st", "vs", "etc",
    "inc", "ltd", "co", "approx", "e.g", "i.e",
}

SIGLAS_SOLETRADAS = {
    r"\bAI\b": "A I",
    r"\bAPI\b": "A P I",
    r"\bGPT\b": "G P T",
    r"\bLLM\b": "L L M",
    r"\bUI\b": "U I",
    r"\bUX\b": "U X",
    r"\bCPU\b": "C P U",
    r"\bGPU\b": "G P U",
    r"\bRAM\b": "RAM",
    r"\bURL\b": "U R L",
    r"\bHTML\b": "H T M L",
    r"\bCSS\b": "C S S",
    r"\bSQL\b": "S Q L",
    r"\bJSON\b": "Jason",
    r"\bCEO\b": "C E O",
    r"\bTTS\b": "T T S",
    r"\bSDK\b": "S D K",
    r"\bWi-Fi\b": "Wai Fai",
}
SIGLAS_SOLETRADAS_COMPILADAS = [
    (re.compile(padrao), substituto)
    for padrao, substituto in SIGLAS_SOLETRADAS.items()
]

SIMBOLOS_POR_IDIOMA = {
    "pt": [
        ("R$", "reais"),
        ("US$", "dólares"),
        ("km/h", "quilômetros por hora"),
        ("°C", "graus Celsius"),
        ("°F", "graus Fahrenheit"),
        ("kg", "quilos"),
        ("%", "por cento"),
        ("&", "e"),
        ("@", "arroba"),
        ("#", "hashtag"),
    ],
    "en": [
        ("R$", "reais"),
        ("US$", "dollars"),
        ("km/h", "kilometers per hour"),
        ("°C", "degrees Celsius"),
        ("°F", "degrees Fahrenheit"),
        ("kg", "kilograms"),
        ("%", "percent"),
        ("&", "and"),
        ("@", "at"),
        ("#", "hashtag"),
    ],
}

STOPWORDS_PT = {
    "de", "para", "com", "não", "que", "você", "isso", "está", "uma",
    "um", "por", "mais", "como", "essa", "esse", "então", "também",
    "quando", "onde", "muito", "já", "aqui", "hoje", "obrigado",
}
STOPWORDS_EN = {
    "the", "is", "and", "you", "that", "this", "with", "for", "are",
    "was", "have", "not", "but", "what", "when", "where", "today",
    "thanks", "please",
}

REGEX_URL = re.compile(r"https?://\S+|www\.\S+")
REGEX_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
REGEX_EMOJI = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "]+",
    flags=re.UNICODE,
)


def detectar_idioma_simples(texto):

    palavras = re.findall(r"[a-zA-ZÀ-ÿ]+", texto.lower())
    if not palavras:
        return "pt"

    pontos_pt = sum(1 for p in palavras if p in STOPWORDS_PT)
    pontos_en = sum(1 for p in palavras if p in STOPWORDS_EN)

    tem_acento_pt = bool(re.search(r"[ãõçáéíóúâêô]", texto.lower()))

    if pontos_en > pontos_pt:
        return "en"
    if pontos_pt > pontos_en:
        return "pt"
    return "pt" if tem_acento_pt else "en"


def aplicar_siglas(texto):
    for regex, substituto in SIGLAS_SOLETRADAS_COMPILADAS:
        texto = regex.sub(substituto, texto)
    return texto


def aplicar_simbolos(texto, idioma):
    tabela = SIMBOLOS_POR_IDIOMA.get(idioma, SIMBOLOS_POR_IDIOMA["pt"])
    for simbolo, falado in tabela:
        if simbolo in texto:
            texto = texto.replace(simbolo, f" {falado} ")
    return texto

UNIDADES_FEM = [
    "zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete",
    "oito", "nove", "dez", "onze", "doze", "treze", "quatorze",
    "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
]
UNIDADES_MASC = [
    "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete",
    "oito", "nove", "dez", "onze", "doze", "treze", "quatorze",
    "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
]
DEZENAS = {
    20: "vinte", 30: "trinta", 40: "quarenta",
    50: "cinquenta",
}

UNIDADES_EN = [
    "zero", "one", "two", "three", "four", "five", "six", "seven",
    "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
    "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
]
DEZENAS_EN = {
    20: "twenty", 30: "thirty", 40: "forty", 50: "fifty",
}


def numero_por_extenso(n, idioma="pt", genero="masc"):

    if idioma == "en":
        unidades = UNIDADES_EN
        dezenas = DEZENAS_EN
        conectivo = "-"
    else:
        unidades = UNIDADES_FEM if genero == "fem" else UNIDADES_MASC
        dezenas = DEZENAS
        conectivo = " e "

    if n < 20:
        return unidades[n]

    dezena = (n // 10) * 10
    resto = n % 10

    if resto == 0:
        return dezenas[dezena]

    return f"{dezenas[dezena]}{conectivo}{unidades[resto]}"


REGEX_HORA = re.compile(
    r"\b([01]?\d|2[0-3])[:h]([0-5]\d)?(?::[0-5]\d)?\b"
)


def ler_horas(texto, idioma="pt"):

    def substituir(match):

        hora = int(match.group(1))
        minuto = match.group(2)
        minuto_num = int(minuto) if minuto is not None else 0

        if idioma != "pt":

            hora_extenso = numero_por_extenso(hora, idioma)

            if minuto_num == 0:
                return f"{hora_extenso} o'clock"

            minuto_extenso = numero_por_extenso(minuto_num, idioma)
            return f"{hora_extenso} {minuto_extenso}"

        if hora == 0:
            base = "meia-noite"
        elif hora == 12:
            base = "meio-dia"
        else:
            hora_extenso = numero_por_extenso(hora, idioma, genero="fem")
            sufixo = "hora" if hora == 1 else "horas"
            base = f"{hora_extenso} {sufixo}"

        if minuto_num == 0:
            return base

        if minuto_num == 30:
            return f"{base} e meia"

        minuto_extenso = numero_por_extenso(minuto_num, idioma, genero="masc")
        return f"{base} e {minuto_extenso}"

    return REGEX_HORA.sub(substituir, texto)

def limpar_para_fala(texto):

    texto = re.sub(r"```.*?```", "", texto, flags=re.DOTALL)
    texto = re.sub(r"\*\*(.*?)\*\*", r"\1", texto)
    texto = re.sub(r"(?<!\w)\*(.*?)\*(?!\w)", r"\1", texto)
    texto = re.sub(r"(?<!\w)_(.*?)_(?!\w)", r"\1", texto)
    texto = texto.replace("`", "")
    texto = re.sub(r"(?m)^\s*[-*•]\s+", "", texto)
    texto = re.sub(r"(?m)^\s*\d+[.)]\s+", "", texto)
    texto = re.sub(r"(?m)^#{1,6}\s*", "", texto)

    idioma_preliminar = detectar_idioma_simples(texto)
    placeholder_link = "um link" if idioma_preliminar == "pt" else "a link"
    placeholder_email = "um endereço de email" if idioma_preliminar == "pt" else "an email address"

    texto = REGEX_URL.sub(placeholder_link, texto)
    texto = REGEX_EMAIL.sub(placeholder_email, texto)
    texto = REGEX_EMOJI.sub("", texto)

    texto = ler_horas(texto, idioma_preliminar)

    texto = aplicar_siglas(texto)

    idioma = detectar_idioma_simples(texto)
    texto = aplicar_simbolos(texto, idioma)

    texto = re.sub(r"\n{2,}", ". ", texto)
    texto = re.sub(r"[ \t]{2,}", " ", texto)
    texto = unicodedata.normalize("NFC", texto)

    return texto.strip()


def extrair_proxima_frase(buffer):

    for i, char in enumerate(buffer):

        if char not in ".!?":
            continue

        if i + 1 >= len(buffer):
            continue

        proximo = buffer[i + 1]

        if char == "." and buffer[i - 1:i].isdigit() and proximo.isdigit():
            continue

        if not proximo.isspace():
            continue

        palavras_antes = buffer[:i].split()
        if palavras_antes:
            ultima_palavra = palavras_antes[-1].rstrip(".").lower()
            if ultima_palavra in ABREVIACOES:
                continue

        return buffer[:i + 1].strip(), buffer[i + 1:]

    return None, buffer

def speak(text):

    audio_file = "jarvis_voice.mp3"

    request = TTSRequest(
        text=text,
        reference_id=FISH_AUDIO_VOICE_ID,
        normalize=True,
        speed=1.1
    )

    with open(audio_file, "wb") as f:
        for chunk in fish_session.tts(request, backend=FISH_AUDIO_MODEL):
            f.write(chunk)

    pygame.mixer.init()
    pygame.mixer.music.load(audio_file)
    pygame.mixer.music.play()

    while pygame.mixer.music.get_busy():
        time.sleep(0.1)


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