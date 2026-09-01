import os
import numpy as np
import pygame


SAMPLE_RATE = 44100
SOUNDS_DIR = "sounds"


SOUND_FILES = {
    "select": "select.wav",
    "confirm": "confirm.wav",

    "core_slow": "core_slow.wav",
    "core_normal": "core_normal.wav",
    "core_fast": "core_fast.wav",

    "voice_start": "voice_start.wav",
    "voice_end": "voice_end.wav",

    "processing": "processing.wav",
    "thinking": "thinking.wav",

    "system_ready": "system_ready.wav",
    "standby": "standby.wav",

    "shutdown": "shutdown.wav",

    # Compatibilidade com o código antigo
    "startup": "startup.wav",
    "working": "working.wav",
    "speaking": "speaking.wav",
}



def _envelope(
    n_samples,
    attack=0.02,
    release=0.15,
):
    """
    Envelope suave para evitar estalos.
    """

    if n_samples <= 0:
        return np.array([], dtype=np.float32)

    env = np.ones(
        n_samples,
        dtype=np.float32
    )

    attack_samples = min(
        int(SAMPLE_RATE * attack),
        n_samples
    )

    release_samples = min(
        int(SAMPLE_RATE * release),
        n_samples
    )

    if attack_samples > 0:
        env[:attack_samples] = np.linspace(
            0.0,
            1.0,
            attack_samples
        )

    if release_samples > 0:
        env[-release_samples:] = np.linspace(
            1.0,
            0.0,
            release_samples
        )

    return env


def _normalize(wave):
    """
    Normaliza sem aumentar demais sons muito pequenos.
    """

    wave = np.asarray(
        wave,
        dtype=np.float32
    )

    peak = np.max(
        np.abs(wave)
    )

    if peak > 1.0:
        wave = wave / peak

    return wave


def _to_stereo_int16(mono_wave):
    """
    Converte mono float [-1, 1] para stereo int16.
    """

    mono_wave = _normalize(
        mono_wave
    )

    mono_wave = np.clip(
        mono_wave,
        -1.0,
        1.0
    )

    audio = (
        mono_wave * 32767
    ).astype(np.int16)

    stereo = np.column_stack([
        audio,
        audio,
    ])

    return np.ascontiguousarray(
        stereo
    )

def generate_tone(
    freq,
    duration,
    wave_type="sine",
    volume=0.5,
    attack=0.002,
    release=0.08,
):
    n = int(
        SAMPLE_RATE * duration
    )

    if n <= 0:
        return np.array([], dtype=np.float32)

    t = (
        np.arange(n)
        / SAMPLE_RATE
    )

    phase = (
        2
        * np.pi
        * freq
        * t
    )

    if wave_type == "sine":

        wave = np.sin(
            phase
        )

    elif wave_type == "square":

        wave = np.sign(
            np.sin(phase)
        )

    elif wave_type == "triangle":

        wave = (
            2
            * np.abs(
                2
                * (
                    t * freq
                    -
                    np.floor(
                        t * freq + 0.5
                    )
                )
            )
            - 1
        )

    else:

        wave = np.sin(
            phase
        )

    wave *= _envelope(
        n,
        attack,
        release
    )

    wave *= volume

    return wave.astype(
        np.float32
    )


# ============================================================
# CLICK
# ============================================================

def generate_click(
    frequency=1500,
    duration=0.035,
    volume=0.07,
):
    """
    Click de interface.

    Curto e suave.
    """

    n = int(
        SAMPLE_RATE * duration
    )

    if n <= 0:
        return np.array([], dtype=np.float32)

    t = (
        np.arange(n)
        / SAMPLE_RATE
    )

    fundamental = np.sin(
        2
        * np.pi
        * frequency
        * t
    )

    harmonic = np.sin(
        2
        * np.pi
        * frequency
        * 1.73
        * t
    )

    wave = (
        fundamental * 0.70
        +
        harmonic * 0.20
    )

    wave *= _envelope(
        n,
        attack=0.0005,
        release=duration * 0.75
    )

    wave *= volume

    return wave.astype(
        np.float32
    )


# ============================================================
# SWEEP
# ============================================================

def generate_sweep(
    start_freq,
    end_freq,
    duration,
    volume=0.05,
    attack=0.01,
    release=0.10,
):
    """
    Sweep suave usando frequência variável.

    Usado principalmente nos sons de movimento.
    """

    n = int(
        SAMPLE_RATE * duration
    )

    if n <= 0:
        return np.array([], dtype=np.float32)

    frequencies = np.linspace(
        start_freq,
        end_freq,
        n
    )

    phase = (
        2
        * np.pi
        * np.cumsum(
            frequencies
        )
        / SAMPLE_RATE
    )

    wave = np.sin(
        phase
    )

    wave *= _envelope(
        n,
        attack,
        release
    )

    wave *= volume

    return wave.astype(
        np.float32
    )


# ============================================================
# CONCAT
# ============================================================

def _concat(
    *waves,
    gap=0.02,
):
    """
    Junta vários sons com pequeno espaço.
    """

    silence = np.zeros(
        int(
            SAMPLE_RATE * gap
        ),
        dtype=np.float32
    )

    parts = []

    for index, wave in enumerate(waves):

        parts.append(
            wave
        )

        if index < len(waves) - 1:
            parts.append(
                silence
            )

    if not parts:
        return np.array(
            [],
            dtype=np.float32
        )

    return np.concatenate(
        parts
    )


# ============================================================
# CORE
# ============================================================

def generate_core(
    duration=1.0,
    speed=1.0,
    volume=0.05,
):
    """
    Núcleo do JARVIS girando.

    A sensação de movimento é criada por pequenos pulsos
    passando por diferentes frequências.

    speed:

        0.25  -> quase parado
        0.40  -> standby
        0.55  -> lento
        1.00  -> normal
        1.50  -> rápido
        1.70  -> muito rápido
    """

    n = int(
        SAMPLE_RATE * duration
    )

    if n <= 0:
        return np.array([], dtype=np.float32)

    audio = np.zeros(
        n,
        dtype=np.float32
    )

    # Número de eventos do rotor
    rotations = max(
        1,
        int(
            8
            * speed
            * duration
        )
    )

    for rotation in range(rotations):

        position = (
            rotation
            / rotations
        )

        start = int(
            position * n
        )

        angle = (
            position
            * np.pi
            * 2
        )

        # Frequência varia durante a rotação
        frequency = (
            650
            +
            np.sin(angle)
            * 280
            +
            np.sin(angle * 2)
            * 90
        )

        pulse_volume = (
            volume
            *
            (
                0.72
                +
                0.28
                * (
                    np.sin(angle)
                    * 0.5
                    + 0.5
                )
            )
        )

        pulse = generate_click(
            frequency,
            0.045,
            pulse_volume
        )

        end = min(
            start + len(pulse),
            n
        )

        if start < n:

            audio[
                start:end
            ] += pulse[
                :end - start
            ]

    # --------------------------------------------------------
    # Ressonância do núcleo
    # --------------------------------------------------------

    t = (
        np.arange(n)
        / SAMPLE_RATE
    )

    rotor = np.sin(
        2
        * np.pi
        * 175
        * t
    )

    modulation_frequency = (
        1.5
        +
        speed
    )

    modulation = (
        np.sin(
            2
            * np.pi
            * modulation_frequency
            * t
        )
        * 0.5
        + 0.5
    )

    rotor *= modulation

    rotor *= (
        volume * 0.30
    )

    audio += rotor

    audio *= _envelope(
        n,
        attack=0.015,
        release=min(
            0.2,
            duration * 0.3
        )
    )

    return audio.astype(
        np.float32
    )


# ============================================================
# 01 — SELECT
# ============================================================

def select():
    return _concat(
        generate_click(
            1500,
            0.025,
            0.055
        ),

        generate_tone(
            900,
            0.080,
            volume=0.045
        ),

        gap=0.035
    )


# ============================================================
# 02 — CONFIRM
# ============================================================

def confirm():
    return _concat(
        generate_tone(
            660,
            0.08,
            volume=0.055
        ),

        generate_tone(
            880,
            0.13,
            volume=0.060
        ),

        gap=0.025
    )


# ============================================================
# 03 — CORE SLOW
# ============================================================

def core_slow():

    return generate_core(
        duration=1.0,
        speed=0.55,
        volume=0.045
    )


# ============================================================
# 04 — CORE NORMAL
# ============================================================

def core_normal():

    return generate_core(
        duration=1.0,
        speed=1.0,
        volume=0.050
    )


# ============================================================
# 05 — CORE FAST
# ============================================================

def core_fast():

    return generate_core(
        duration=1.2,
        speed=1.7,
        volume=0.055
    )


# ============================================================
# 06 — VOICE START
# ============================================================

def voice_start():

    """
    Ativação do núcleo antes da fala.
    """

    slow = generate_core(
        duration=0.25,
        speed=0.45,
        volume=0.035
    )

    acceleration = generate_core(
        duration=0.28,
        speed=1.7,
        volume=0.050
    )

    final_click = generate_click(
        1500,
        0.025,
        0.035
    )

    return np.concatenate([
        slow,
        acceleration,
        final_click
    ])


# ============================================================
# 07 — VOICE END
# ============================================================

def voice_end():

    """
    Desaceleração do núcleo depois da fala.
    """

    fast = generate_core(
        duration=0.22,
        speed=1.7,
        volume=0.045
    )

    slow = generate_core(
        duration=0.38,
        speed=0.40,
        volume=0.025
    )

    return np.concatenate([
        fast,
        slow
    ])


# ============================================================
# 08 — PROCESSING
# ============================================================

def processing():

    return generate_core(
        duration=1.4,
        speed=1.25,
        volume=0.045
    )


# ============================================================
# 09 — THINKING
# ============================================================

def thinking():

    return generate_core(
        duration=1.0,
        speed=0.40,
        volume=0.030
    )


# ============================================================
# 10 — SYSTEM READY
# ============================================================

def system_ready():

    start = generate_core(
        duration=0.22,
        speed=0.40,
        volume=0.030
    )

    acceleration = generate_core(
        duration=0.28,
        speed=1.7,
        volume=0.045
    )

    confirmation = _concat(
        generate_tone(
            523.25,
            0.07,
            volume=0.040
        ),

        generate_tone(
            783.99,
            0.12,
            volume=0.045
        ),

        gap=0.025
    )

    return np.concatenate([
        start,
        acceleration,
        confirmation
    ])


# ============================================================
# 11 — STANDBY
# ============================================================

def standby():

    return generate_core(
        duration=1.2,
        speed=0.25,
        volume=0.018
    )


# ============================================================
# 12 — SHUTDOWN
# ============================================================

def shutdown():

    fast = generate_core(
        duration=0.30,
        speed=1.6,
        volume=0.045
    )

    medium = generate_core(
        duration=0.30,
        speed=0.85,
        volume=0.035
    )

    slow = generate_core(
        duration=0.42,
        speed=0.25,
        volume=0.020
    )

    final = generate_tone(
        300,
        0.18,
        volume=0.025,
        attack=0.01,
        release=0.15
    )

    return np.concatenate([
        fast,
        medium,
        slow,
        final
    ])


# ============================================================
# FALLBACK GENERATORS
# ============================================================

FALLBACK_GENERATORS = {

    "select": select,

    "confirm": confirm,

    "core_slow": core_slow,

    "core_normal": core_normal,

    "core_fast": core_fast,

    "voice_start": voice_start,

    "voice_end": voice_end,

    "processing": processing,

    "thinking": thinking,

    "system_ready": system_ready,

    "standby": standby,

    "shutdown": shutdown,

    # --------------------------------------------------------
    # Compatibilidade com o código antigo
    # --------------------------------------------------------

    "startup": system_ready,

    "working": processing,

    "speaking": voice_start,
}


# ============================================================
# SOUND MANAGER
# ============================================================

class SoundManager:

    def __init__(
        self,
        volume=0.5,
        sounds_dir=SOUNDS_DIR,
    ):
        self.volume = volume
        self.sounds_dir = sounds_dir
        self._cache = {}

    # --------------------------------------------------------
    # Mixer
    # --------------------------------------------------------

    def _ensure_mixer(self):

        if not pygame.mixer.get_init():

            pygame.mixer.init(
                frequency=SAMPLE_RATE,
                size=-16,
                channels=2
            )

    # --------------------------------------------------------
    # Arquivo WAV
    # --------------------------------------------------------

    def _load_from_file(
        self,
        name,
    ):

        filename = SOUND_FILES.get(
            name
        )

        if not filename:
            return None

        path = os.path.join(
            self.sounds_dir,
            filename
        )

        if not os.path.isfile(path):
            return None

        try:

            return pygame.mixer.Sound(
                path
            )

        except Exception:

            return None

    # --------------------------------------------------------
    # Gerador
    # --------------------------------------------------------

    def _build_fallback(
        self,
        name,
    ):

        generator = (
            FALLBACK_GENERATORS.get(
                name
            )
        )

        if not generator:
            return None

        wave = generator()

        stereo = _to_stereo_int16(
            wave
        )

        return pygame.sndarray.make_sound(
            stereo
        )

    # --------------------------------------------------------
    # Cache
    # --------------------------------------------------------

    def _get(
        self,
        name,
    ):

        if name in self._cache:

            return self._cache[name]

        self._ensure_mixer()

        # Primeiro tenta WAV
        sound = self._load_from_file(
            name
        )

        # Se não existir, gera
        if sound is None:

            sound = self._build_fallback(
                name
            )

        if sound is not None:

            self._cache[name] = sound

        return sound

    # --------------------------------------------------------
    # Play
    # --------------------------------------------------------

    def play(
        self,
        name,
        block=False,
    ):

        sound = self._get(
            name
        )

        if sound is None:
            return

        sound.set_volume(
            self.volume
        )

        channel = sound.play()

        if block and channel is not None:

            while channel.get_busy():

                pygame.time.wait(
                    10
                )


# ============================================================
# INSTÂNCIA GLOBAL
# ============================================================

sounds = SoundManager(
    volume=0.5
)


# ============================================================
# TESTE DIRETO
# ============================================================

if __name__ == "__main__":

    import time

    pygame.init()

    test_sounds = [

        "select",
        "confirm",

        "core_slow",
        "core_normal",
        "core_fast",

        "voice_start",
        "voice_end",

        "processing",
        "thinking",

        "system_ready",
        "standby",

        "shutdown",
    ]

    print()
    print(
        "J.A.R.V.I.S — CORE SOUND TEST"
    )
    print()

    for name in test_sounds:

        print(
            f"▶ {name}"
        )

        sounds.play(
            name,
            block=True
        )

        time.sleep(
            0.3
        )

    pygame.quit()
