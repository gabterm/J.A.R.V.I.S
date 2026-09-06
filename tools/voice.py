import os
import re
import time
import unicodedata
import pygame
from fish_audio_sdk import Session, TTSRequest
from pathlib import Path
import os
import subprocess

from dotenv import load_dotenv
from fish_audio_sdk import Session, TTSRequest

load_dotenv()

FISH_AUDIO_API_KEY = os.getenv("FISH_AUDIO_API_KEY")

if not FISH_AUDIO_API_KEY:
    raise RuntimeError(
        "FISH_AUDIO_API_KEY não configurada."
    )

print(
    "Fish Audio API Key:",
    f"{FISH_AUDIO_API_KEY[:8]}..."
)

fish_session = Session(FISH_AUDIO_API_KEY)



FISH_AUDIO_VOICE_ID = os.getenv(
    "FISH_AUDIO_VOICE_ID",
    "a9558d6bc0ab45068843698477fe84f5",
)

FISH_AUDIO_MODEL = os.getenv(
    "FISH_AUDIO_MODEL",
    "s2.1-pro",
)

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BASE_DIR / "assets"

AUDIO_FILE = ASSETS_DIR / "jarvis_voice.mp3"

OUTPUT_DEVICE = "FN-B21B"


def _listar_dispositivos_saida():
    try:
        import pygame._sdl2.audio as sdl2_audio
        pygame.init()
        return list(sdl2_audio.get_audio_device_names(False))
    except Exception as error:
        print(f"⚠️  Não foi possível listar dispositivos de áudio de saída: {error}")
        return []


_dispositivos_saida = _listar_dispositivos_saida()
if _dispositivos_saida:
    print("🔊 Dispositivos de saída de áudio disponíveis:")
    for nome in _dispositivos_saida:
        marcador = " <- em uso (OUTPUT_DEVICE)" if nome == OUTPUT_DEVICE else ""
        print(f"    - {nome}{marcador}")
    if OUTPUT_DEVICE is None:
        print(
            "    (OUTPUT_DEVICE=None -> usando o default do sistema; "
            "copie um nome acima pra tools/voice.py se quiser forçar)"
        )


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


def aplicar_efeito_jarvis(input_file, output_file):
    filtro = (
    "equalizer=f=160:t=q:w=1:g=1.2,"
    # Presença
    "equalizer=f=3000:t=q:w=1:g=1.0,"
    # Controle de brilho/chiado

    # Eco mais longo, mas ainda discreto
    # Textura robótica leve

    # Volume
    "loudnorm=I=-16:TP=-1.5:LRA=7"
)

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(input_file),
            "-af",
            filtro,
            str(output_file),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

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

CENTENAS = {
    100: "cem",
    200: "duzentos",
    300: "trezentos",
    400: "quatrocentos",
    500: "quinhentos",
    600: "seiscentos",
    700: "setecentos",
    800: "oitocentos",
    900: "novecentos",
}

UNIDADES_EN = [
    "zero", "one", "two", "three", "four", "five", "six", "seven",
    "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
    "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
]
DEZENAS_EN = {
    20: "twenty", 30: "thirty", 40: "forty", 50: "fifty",
}

PRONUNCIAS_TTS = {
    # Linguagens / frameworks
    "Python": "Páiton",
    "JavaScript": "Java Script",
    "TypeScript": "Taip Script",
    "Elixir": "Elixir",
    "Phoenix": "Fênix",
    "Phoenix LiveView": "Fênix Laive View",
    "LiveView": "Laive View",
    "PySide": "Pai Side",
    "PySide6": "Pai Side seis",

    # Ferramentas
    "Docker": "Dóquer",
    "GitHub": "Git Ráb",
    "GitLab": "Git Láb",
    "Git": "Git",
    "npm": "N P M",
    "pip": "pip",
    "FFmpeg": "F F Mpeg",

    # Tecnologias
    "OpenAI": "Open A I",
    "ChatGPT": "Chat G P T",
    "GPT": "G P T",
    "API": "A P I",
    "SDK": "S D K",
    "JSON": "Jason",
    "HTTP": "H T T P",
    "HTTPS": "H T T P S",
    "HTML": "H T M L",
    "CSS": "C S S",
    "SQL": "S Q L",
    "UUID": "U U I D",
    "URL": "U R L",

    # Termos técnicos
    "frontend": "front end",
    "backend": "back end",
    "fullstack": "full stack",
    "framework": "framework",
    "software": "software",
    "hardware": "hardware",
    "database": "database",
    "debug": "debug",
    "debugging": "debugging",
    "deploy": "deploy",
    "deployment": "deployment",
    "commit": "commit",
    "branch": "branch",
    "merge": "merge",
    "pull request": "pull request",

    # Formatos
    ".json": " ponto Jason",
    ".csv": " ponto C S V",
    ".txt": " ponto T X T",
    ".pdf": " ponto P D F",
    ".py": " ponto P Y",
    ".ex": " ponto E X",
    ".exs": " ponto E X S",
    ".js": " ponto J S",
    ".ts": " ponto T S",
    ".html": " ponto H T M L",
    ".css": " ponto C S S",

    # Comandos
    "mix phx.server": "mix fênix ponto server",
    "mix deps.get": "mix deps get",
    "npm install": "N P M install",
    "pip install": "pip install",
    "git checkout": "git checkout",
    "git commit": "git commit",
    "git push": "git push",
    "git pull": "git pull",
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
            if hora == 0:
                base = "midnight"
            elif hora == 12:
                base = "noon"
            else:
                hora_12 = hora % 12
                base = numero_por_extenso(hora_12, idioma)

            if minuto_num == 0:
                return base if hora in (0, 12) else f"{base} o'clock"

            minuto_extenso = numero_por_extenso(minuto_num, idioma)
            return f"{base} {minuto_extenso}"

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

    texto = aplicar_siglas(texto)

    idioma = detectar_idioma_simples(texto)
    texto = aplicar_simbolos(texto, idioma)


    texto = ler_horas(texto, idioma_preliminar)

    texto = aplicar_siglas(texto)

    texto = aplicar_pronuncias_tts(texto)

    idioma = detectar_idioma_simples(texto)
    texto = aplicar_simbolos(texto, idioma)

    texto = re.sub(r"\n{2,}", ". ", texto)
    texto = re.sub(r"[ \t]{2,}", " ", texto)
    texto = unicodedata.normalize("NFC", texto)

    return texto.strip()

def aplicar_pronuncias_tts(texto):
    for termo in sorted(PRONUNCIAS_TTS, key=len, reverse=True):
        substituto = PRONUNCIAS_TTS[termo]

        padrao = re.compile(
            rf"(?<!\w){re.escape(termo)}(?!\w)",
            flags=re.IGNORECASE,
        )

        texto = padrao.sub(substituto, texto)

    return texto

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
    """Gera o áudio via Fish Audio, aplica efeitos e toca."""

    if not text or not text.strip():
        return

    raw_audio = ASSETS_DIR / "jarvis_raw.mp3"

    request = TTSRequest(
        text=text,
        reference_id=FISH_AUDIO_VOICE_ID,
        normalize=True,
        speed=1.2,
    )

    with raw_audio.open("wb") as file:
        for chunk in fish_session.tts(
            request,
            backend=FISH_AUDIO_MODEL,
        ):
            file.write(chunk)

    aplicar_efeito_jarvis(
        raw_audio,
        AUDIO_FILE,
    )

    if OUTPUT_DEVICE:
        pygame.mixer.init(devicename="FN-B21B")
    else:
        pygame.mixer.init()
    pygame.mixer.music.load(AUDIO_FILE)
    pygame.mixer.music.play()

    while pygame.mixer.music.get_busy():
        time.sleep(0.1)