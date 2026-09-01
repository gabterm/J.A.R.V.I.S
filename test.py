
import numpy as np
import sounddevice as sd


# ============================================================
# J.A.R.V.I.S — CORE UI SOUND LAB
#
# Sound design:
#   - clicks
#   - ticks
#   - soft pings
#   - core rotation
#   - scan
#   - voice activation
#   - processing
#
# Não utiliza arquivos de áudio.
# Tudo é sintetizado em tempo real.
# ============================================================


SR = 44100


# ============================================================
# CORE AUDIO
# ============================================================

def envelope(size, attack, release):
    """Envelope suave para evitar clicks desagradáveis."""

    env = np.ones(size)

    attack_size = min(
        max(1, int(SR * attack)),
        size
    )

    release_size = min(
        max(1, int(SR * release)),
        size
    )

    env[:attack_size] = np.linspace(
        0,
        1,
        attack_size
    )

    env[-release_size:] = np.linspace(
        1,
        0,
        release_size
    )

    return env


def tone(
    frequency,
    duration,
    volume=0.1,
    attack=0.002,
    release=0.08,
):
    """Tom senoidal suave."""

    size = int(
        SR * duration
    )

    t = np.arange(size) / SR

    audio = np.sin(
        2 * np.pi * frequency * t
    )

    audio *= envelope(
        size,
        attack,
        release
    )

    return audio * volume


def click(
    frequency=1700,
    duration=0.035,
    volume=0.07,
):
    """
    Click de interface.

    Curto, seco e discreto.
    """

    size = int(
        SR * duration
    )

    t = np.arange(size) / SR

    fundamental = np.sin(
        2 * np.pi * frequency * t
    )

    harmonic = np.sin(
        2 * np.pi * frequency * 1.73 * t
    )

    audio = (
        fundamental * 0.70
        +
        harmonic * 0.20
    )

    audio *= envelope(
        size,
        0.0005,
        duration * 0.75
    )

    return audio * volume


def silence(duration):
    return np.zeros(
        int(SR * duration)
    )


def play(audio, volume=1.0):
    """Reproduz o áudio."""

    audio = np.asarray(
        audio,
        dtype=np.float32
    )

    peak = np.max(
        np.abs(audio)
    )

    if peak > 0:
        audio /= peak

    sd.play(
        audio * volume,
        SR
    )

    sd.wait()


# ============================================================
# SOFT SWEEP
# ============================================================

def soft_sweep(
    start,
    end,
    duration,
    volume=0.05,
):
    """
    Sweep suave.

    Usado para representar movimento do núcleo.
    """

    size = int(
        SR * duration
    )

    t = np.arange(size) / SR

    frequencies = np.linspace(
        start,
        end,
        size
    )

    phase = (
        2
        * np.pi
        * np.cumsum(frequencies)
        / SR
    )

    audio = np.sin(phase)

    audio *= envelope(
        size,
        0.01,
        duration * 0.65
    )

    return audio * volume


# ============================================================
# CORE ROTATION
# ============================================================

def rotating_core(
    duration=0.8,
    speed=1.0,
    volume=0.05,
):
    """
    Simula o núcleo central do JARVIS girando.

    A rotação é criada por pequenos eventos sonoros
    distribuídos ao longo do tempo.

    speed:
        0.3 = quase parado
        0.7 = lento
        1.0 = normal
        1.5 = rápido
        2.0 = muito rápido
    """

    size = int(
        SR * duration
    )

    audio = np.zeros(size)

    rotations = max(
        1,
        int(8 * speed * duration)
    )

    for rotation in range(rotations):

        position = (
            rotation / rotations
        )

        start = int(
            position * size
        )

        # Movimento circular da frequência
        angle = (
            position
            * np.pi
            * 2
        )

        frequency = (
            650
            +
            np.sin(angle) * 280
            +
            np.sin(angle * 2) * 90
        )

        pulse_volume = (
            volume
            *
            (
                0.75
                +
                0.25
                *
                np.sin(angle)
            )
        )

        pulse = click(
            frequency,
            0.045,
            pulse_volume
        )

        end = min(
            start + len(pulse),
            size
        )

        if start < size:
            audio[
                start:end
            ] += pulse[
                :end - start
            ]

    # --------------------------------------------------------
    # Corpo/resonância do núcleo
    # --------------------------------------------------------

    t = np.arange(size) / SR

    rotor = np.sin(
        2 * np.pi * 175 * t
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

    # Fade final
    audio *= envelope(
        size,
        0.015,
        min(0.2, duration * 0.3)
    )

    return audio


# ============================================================
# 01 — BASIC CLICK
# ============================================================

def basic_click():

    play(
        click(
            1700,
            0.035,
            0.075
        )
    )


# ============================================================
# 02 — SOFT CLICK
# ============================================================

def soft_click():

    play(
        click(
            1250,
            0.045,
            0.065
        )
    )


# ============================================================
# 03 — GLASS CLICK
# ============================================================

def glass_click():

    audio = (
        tone(
            1750,
            0.055,
            0.045
        )
        +
        tone(
            3000,
            0.040,
            0.018
        )
    )

    play(audio)


# ============================================================
# 04 — DEEP UI CLICK
# ============================================================

def deep_click():

    body = tone(
        520,
        0.055,
        0.065
    )

    top = click(
        1250,
        0.025,
        0.035
    )

    audio = (
        body
        +
        top
    )

    play(audio)


# ============================================================
# 05 — DOUBLE CLICK
# ============================================================

def double_click():

    audio = np.concatenate([
        click(
            1600,
            0.030,
            0.065
        ),

        silence(0.055),

        click(
            1600,
            0.030,
            0.050
        ),
    ])

    play(audio)


# ============================================================
# 06 — TICK
# ============================================================

def tick():

    play(
        click(
            2200,
            0.022,
            0.050
        )
    )


# ============================================================
# 07 — SOFT TICK
# ============================================================

def soft_tick():

    play(
        click(
            1050,
            0.028,
            0.042
        )
    )


# ============================================================
# 08 — HOVER
# ============================================================

def hover():

    audio = tone(
        1150,
        0.055,
        0.032,
        attack=0.012,
        release=0.040
    )

    play(audio)


# ============================================================
# 09 — SELECT
# ============================================================

def select():

    audio = np.concatenate([
        click(
            1500,
            0.025,
            0.055
        ),

        silence(0.035),

        tone(
            900,
            0.080,
            0.045
        ),
    ])

    play(audio)


# ============================================================
# 10 — SOFT PING
# ============================================================

def soft_ping():

    audio = tone(
        880,
        0.18,
        0.065,
        attack=0.005,
        release=0.13
    )

    play(audio)


# ============================================================
# 11 — HIGH PING
# ============================================================

def high_ping():

    audio = tone(
        1320,
        0.16,
        0.050,
        attack=0.003,
        release=0.12
    )

    play(audio)


# ============================================================
# 12 — CONFIRM
# ============================================================

def confirm():

    audio = np.concatenate([
        tone(
            660,
            0.08,
            0.055
        ),

        silence(0.025),

        tone(
            880,
            0.13,
            0.060
        ),
    ])

    play(audio)


# ============================================================
# 13 — UI OPEN
# ============================================================

def ui_open():

    click_sound = click(
        1300,
        0.025,
        0.050
    )

    movement = soft_sweep(
        500,
        1100,
        0.18,
        0.050
    )

    audio = np.concatenate([
        click_sound,
        movement
    ])

    play(audio)


# ============================================================
# 14 — UI CLOSE
# ============================================================

def ui_close():

    movement = soft_sweep(
        1100,
        500,
        0.18,
        0.050
    )

    play(movement)


# ============================================================
# 15 — SCAN
# ============================================================

def scan():

    """
    Scan como movimento de leitura.

    A ideia é parecer que uma linha está atravessando
    uma superfície holográfica.
    """

    duration = 0.48

    size = int(
        SR * duration
    )

    audio = np.zeros(size)

    # Passagem principal
    main = soft_sweep(
        650,
        1900,
        0.16,
        0.050
    )

    start = int(
        0.045 * SR
    )

    audio[
        start:start + len(main)
    ] += main

    # Pequena ressonância depois da passagem
    resonance = soft_sweep(
        1000,
        2400,
        0.09,
        0.022
    )

    start = int(
        0.15 * SR
    )

    audio[
        start:start + len(resonance)
    ] += resonance

    # Marca o centro do scan
    scan_tick = click(
        1650,
        0.025,
        0.030
    )

    start = int(
        0.19 * SR
    )

    audio[
        start:start + len(scan_tick)
    ] += scan_tick

    play(audio)


# ============================================================
# 16 — REVERSE SCAN
# ============================================================

def reverse_scan():

    movement = soft_sweep(
        1900,
        650,
        0.16,
        0.050
    )

    resonance = soft_sweep(
        2400,
        1000,
        0.09,
        0.022
    )

    audio = np.concatenate([
        movement,
        silence(0.04),
        resonance
    ])

    play(audio)


# ============================================================
# 17 — CORE SLOW
# ============================================================

def core_slow():

    audio = rotating_core(
        duration=1.0,
        speed=0.55,
        volume=0.045
    )

    play(audio)


# ============================================================
# 18 — CORE NORMAL
# ============================================================

def core_normal():

    audio = rotating_core(
        duration=1.0,
        speed=1.0,
        volume=0.050
    )

    play(audio)


# ============================================================
# 19 — CORE FAST
# ============================================================

def core_fast():

    audio = rotating_core(
        duration=1.2,
        speed=1.7,
        volume=0.055
    )

    play(audio)


# ============================================================
# 20 — VOICE START
# ============================================================

def voice_start():

    """
    O núcleo começa a girar antes da voz.
    """

    slow = rotating_core(
        duration=0.25,
        speed=0.45,
        volume=0.035
    )

    accelerate = rotating_core(
        duration=0.28,
        speed=1.7,
        volume=0.050
    )

    final_click = click(
        1500,
        0.025,
        0.035
    )

    audio = np.concatenate([
        slow,
        accelerate,
        final_click
    ])

    play(audio)


# ============================================================
# 21 — VOICE END
# ============================================================

def voice_end():

    """
    Núcleo desacelerando depois da fala.
    """

    fast = rotating_core(
        duration=0.22,
        speed=1.7,
        volume=0.045
    )

    slow = rotating_core(
        duration=0.38,
        speed=0.40,
        volume=0.025
    )

    audio = np.concatenate([
        fast,
        slow
    ])

    play(audio)


# ============================================================
# 22 — PROCESSING
# ============================================================

def processing():

    """
    JARVIS processando alguma coisa.
    """

    audio = rotating_core(
        duration=1.4,
        speed=1.25,
        volume=0.045
    )

    play(audio)


# ============================================================
# 23 — THINKING
# ============================================================

def thinking():

    """
    Pensamento: núcleo lento e discreto.
    """

    audio = rotating_core(
        duration=1.0,
        speed=0.40,
        volume=0.030
    )

    play(audio)


# ============================================================
# 24 — SYSTEM READY
# ============================================================

def system_ready():

    """
    Núcleo acorda, acelera e estabiliza.
    """

    start = rotating_core(
        duration=0.22,
        speed=0.40,
        volume=0.030
    )

    acceleration = rotating_core(
        duration=0.28,
        speed=1.7,
        volume=0.045
    )

    confirmation = np.concatenate([
        tone(
            523.25,
            0.07,
            0.040
        ),

        silence(0.025),

        tone(
            783.99,
            0.12,
            0.045
        ),
    ])

    audio = np.concatenate([
        start,
        acceleration,
        confirmation
    ])

    play(audio)


# ============================================================
# 25 — STANDBY
# ============================================================

def standby():

    """
    Núcleo praticamente em repouso.
    """

    audio = rotating_core(
        duration=1.2,
        speed=0.25,
        volume=0.018
    )

    play(audio)


# ============================================================
# 26 — SHUTDOWN
# ============================================================

def shutdown():

    """
    Núcleo desacelerando até parar.
    """

    fast = rotating_core(
        duration=0.30,
        speed=1.6,
        volume=0.045
    )

    medium = rotating_core(
        duration=0.30,
        speed=0.85,
        volume=0.035
    )

    slow = rotating_core(
        duration=0.42,
        speed=0.25,
        volume=0.020
    )

    final = tone(
        300,
        0.18,
        0.025,
        attack=0.01,
        release=0.15
    )

    audio = np.concatenate([
        fast,
        medium,
        slow,
        final
    ])

    play(audio)


# ============================================================
# MENU
# ============================================================

SOUNDS = {

    "1": (
        "Basic Click",
        basic_click
    ),

    "2": (
        "Soft Click",
        soft_click
    ),

    "3": (
        "Glass Click",
        glass_click
    ),

    "4": (
        "Deep UI Click",
        deep_click
    ),

    "5": (
        "Double Click",
        double_click
    ),

    "6": (
        "Tick",
        tick
    ),

    "7": (
        "Soft Tick",
        soft_tick
    ),

    "8": (
        "Hover",
        hover
    ),

    "9": (
        "Select",
        select
    ),

    "10": (
        "Soft Ping",
        soft_ping
    ),

    "11": (
        "High Ping",
        high_ping
    ),

    "12": (
        "Confirm",
        confirm
    ),

    "13": (
        "UI Open",
        ui_open
    ),

    "14": (
        "UI Close",
        ui_close
    ),

    "15": (
        "Scan",
        scan
    ),

    "16": (
        "Reverse Scan",
        reverse_scan
    ),

    "17": (
        "Core Slow",
        core_slow
    ),

    "18": (
        "Core Normal",
        core_normal
    ),

    "19": (
        "Core Fast",
        core_fast
    ),

    "20": (
        "Voice Start",
        voice_start
    ),

    "21": (
        "Voice End",
        voice_end
    ),

    "22": (
        "Processing",
        processing
    ),

    "23": (
        "Thinking",
        thinking
    ),

    "24": (
        "System Ready",
        system_ready
    ),

    "25": (
        "Standby",
        standby
    ),

    "26": (
        "Shutdown",
        shutdown
    ),
}


# ============================================================
# MENU
# ============================================================

def show_menu():

    print()

    print(
        "╔════════════════════════════════════════════╗"
    )

    print(
        "║        J.A.R.V.I.S CORE SOUND LAB         ║"
    )

    print(
        "╠════════════════════════════════════════════╣"
    )

    for key, (name, _) in SOUNDS.items():

        print(
            f"║ [{key:>2}] {name:<35} ║"
        )

    print(
        "║                                            ║"
    )

    print(
        "║ [q] Sair                                   ║"
    )

    print(
        "╚════════════════════════════════════════════╝"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print()

    print(
        "J.A.R.V.I.S CORE SOUND LAB"
    )

    print(
        "Interface / Core / HUD / Interaction"
    )

    print()

    while True:

        show_menu()

        choice = input(
            "\nSom: "
        ).strip().lower()

        if choice == "q":

            break

        if choice not in SOUNDS:

            print(
                "Opção inválida."
            )

            continue

        name, function = SOUNDS[
            choice
        ]

        print(
            f"\n▶ {name}"
        )

        try:

            function()

            print(
                "✓ terminado"
            )

        except Exception as error:

            print(
                f"❌ {error}"
            )

    sd.stop()

    print(
        "\nSound Lab encerrado."
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()
