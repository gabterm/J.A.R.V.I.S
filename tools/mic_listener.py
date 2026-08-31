"""
tools/mic_listener.py

Escuta contínua do microfone para o JARVIS:
- Captura áudio em pequenos frames (20ms) via sounddevice, na taxa NATIVA
  do dispositivo (48kHz na esmagadora maioria dos casos) — evitar pedir
  16kHz direto no InputStream, porque em vários drivers (sobretudo Linux/
  ALSA) isso força uma reamostragem ruim por baixo dos panos e distorce
  o áudio antes mesmo de chegar no VAD/Whisper.
- Usa WebRTC VAD (que aceita 48kHz nativamente) para detectar início/fim
  de fala na taxa nativa.
- Ao detectar silêncio após um trecho de fala, reamostra o segmento
  completo pra 16kHz (uma única vez, com qualidade) e transcreve com
  faster-whisper.
- Joga o texto transcrito na fila ui_bridge.mensagens_entrada,
  igual ao escutar_terminal() do main.py — sem precisar mexer no resto do pipeline.
- Respeita ui_bridge.microfone_ativo: enquanto esse Event estiver limpo
  (mic desligado pela interface, seja pelo botão ou pela tool
  toggle_microphone), qualquer áudio capturado é descartado sem passar
  pelo VAD/Whisper.

Instalação:
    pip install sounddevice webrtcvad faster-whisper numpy scipy
"""

import time
import numpy as np
import sounddevice as sd
import webrtcvad
from scipy.signal import resample_poly
from faster_whisper import WhisperModel

import tools.ui_bridge as ui_bridge

 
INPUT_DEVICE = None


_VAD_RATES_VALIDAS = (8000, 16000, 32000, 48000)
_device_info = sd.query_devices(INPUT_DEVICE, kind="input")
_native_rate = int(_device_info["default_samplerate"])
CAPTURE_SAMPLE_RATE = _native_rate if _native_rate in _VAD_RATES_VALIDAS else 48000

WHISPER_SAMPLE_RATE = 16000 

FRAME_MS = 20               
FRAME_SIZE = int(CAPTURE_SAMPLE_RATE * FRAME_MS / 1000)

VAD_AGGRESSIVENESS = 2        
SILENCE_TIMEOUT_MS = 700       
MIN_SPEECH_MS = 300          

POS_FALA_COOLDOWN_S = 0.4

WHISPER_MODEL_SIZE = "small"
WHISPER_DEVICE = "cpu"        
WHISPER_COMPUTE_TYPE = "int8"  
DEBUG_SALVAR_WAV = False
DEBUG_WAV_DIR = "debug_audio"


def _resample_para_whisper(audio, taxa_origem):
    if taxa_origem == WHISPER_SAMPLE_RATE:
        return audio

    from math import gcd
    g = gcd(taxa_origem, WHISPER_SAMPLE_RATE)
    up = WHISPER_SAMPLE_RATE // g
    down = taxa_origem // g
    return resample_poly(audio, up, down).astype(np.float32)


def _salvar_debug_wav(audio, taxa):
    import os
    import wave

    os.makedirs(DEBUG_WAV_DIR, exist_ok=True)
    caminho = os.path.join(DEBUG_WAV_DIR, f"segmento_{int(time.time() * 1000)}.wav")
    pcm16 = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(caminho, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(taxa)
        wf.writeframes(pcm16.tobytes())
    print(f"🩺 Áudio de debug salvo em: {caminho}")


def escutar_microfone():
    vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
    modelo = WhisperModel(
        WHISPER_MODEL_SIZE,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE_TYPE,
    )

    print(
        f"🎙️  Escuta contínua ativada — dispositivo: \"{_device_info['name']}\" "
        f"(captura a {CAPTURE_SAMPLE_RATE}Hz, Whisper a {WHISPER_SAMPLE_RATE}Hz)."
    )
    if "bluetooth" in _device_info["name"].lower() or CAPTURE_SAMPLE_RATE == 16000:
        print(
            "⚠️  Esse dispositivo parece ser um mic Bluetooth (ou está reportando "
            "16kHz nativo, típico de headset via HFP) — qualidade de captura "
            "costuma ser ruim pra reconhecimento de voz. Se a transcrição estiver "
            "errada, tente forçar INPUT_DEVICE pro mic embutido do Mac."
        )

    silence_frames_limit = SILENCE_TIMEOUT_MS // FRAME_MS
    min_speech_frames = MIN_SPEECH_MS // FRAME_MS

    buffer_fala = []
    frames_silencio = 0
    em_fala = False
    fim_cooldown = 0.0

    def callback(indata, frames, time_info, status):
        nonlocal buffer_fala, frames_silencio, em_fala, fim_cooldown

        # Microfone desligado pela interface (botão do HUD ou tool
        # toggle_microphone): descarta tudo e nem chega a rodar o VAD.
        if not ui_bridge.microfone_ativo.is_set():
            if em_fala:
                # Estava no meio de uma fala quando foi desligado — sem
                # isso o HUD ficaria preso em "OUVINDO" pra sempre.
                ui_bridge.broadcast({"type": "status", "state": "idle"})
            buffer_fala = []
            frames_silencio = 0
            em_fala = False
            return

        # Enquanto o JARVIS está falando, ignora tudo e descarta o que
        # já estava no buffer (evita ele se ouvir e entrar em loop).
        if ui_bridge.jarvis_falando.is_set():
            buffer_fala = []
            frames_silencio = 0
            em_fala = False
            fim_cooldown = time.monotonic() + POS_FALA_COOLDOWN_S
            return

        # Ainda dentro do período de cooldown pós-fala: também ignora.
        if time.monotonic() < fim_cooldown:
            return

        # sounddevice entrega float32 [-1,1]; webrtcvad quer PCM16 bytes
        pcm16 = (indata[:, 0] * 32767).astype(np.int16).tobytes()

        try:
            is_speech = vad.is_speech(pcm16, CAPTURE_SAMPLE_RATE)
        except Exception:
            is_speech = False

        if is_speech:
            if not em_fala:
                # Início de uma nova fala: acende o estado "OUVINDO" no HUD
                # (o anel do núcleo pulsa e o botão de mic acende, via setEstado
                # no main.js — mesmo mecanismo que o status 'thinking'/'speaking').
                ui_bridge.broadcast({"type": "status", "state": "listening"})
            buffer_fala.append(indata[:, 0].copy())
            frames_silencio = 0
            em_fala = True
        elif em_fala:
            buffer_fala.append(indata[:, 0].copy())
            frames_silencio += 1

            if frames_silencio >= silence_frames_limit:
                se_valido = len(buffer_fala) - frames_silencio >= min_speech_frames
                if se_valido:
                    audio_bruto = np.concatenate(buffer_fala).astype(np.float32)

                    if DEBUG_SALVAR_WAV:
                        _salvar_debug_wav(audio_bruto, CAPTURE_SAMPLE_RATE)

                    audio_16k = _resample_para_whisper(audio_bruto, CAPTURE_SAMPLE_RATE)
                    transcrever_e_enviar(modelo, audio_16k)
                else:
                    # Ruído curto demais pra virar transcrição (tosse, etc) —
                    # não vai gerar 'thinking', então precisa voltar pro idle
                    # manualmente, senão o HUD fica preso em "OUVINDO".
                    ui_bridge.broadcast({"type": "status", "state": "idle"})

                buffer_fala = []
                frames_silencio = 0
                em_fala = False

    with sd.InputStream(
        device=INPUT_DEVICE,
        samplerate=CAPTURE_SAMPLE_RATE,
        channels=1,
        dtype="float32",
        blocksize=FRAME_SIZE,
        callback=callback,
    ):
        # mantém a stream viva; o processamento acontece no callback
        threading_event_forever()


def threading_event_forever():
    import threading
    threading.Event().wait()


def transcrever_e_enviar(modelo, audio):
    segments, _ = modelo.transcribe(audio, language="pt", vad_filter=False)
    texto = "".join(seg.text for seg in segments).strip()

    if not texto:
        # Áudio válido pro VAD, mas o Whisper não reconheceu nada
        # inteligível — sem isso o HUD ficaria preso em "OUVINDO".
        ui_bridge.broadcast({"type": "status", "state": "idle"})
        return

    print(f"\n🗣️  Ouvido: {texto}")
    ui_bridge.mensagens_entrada.put(texto)