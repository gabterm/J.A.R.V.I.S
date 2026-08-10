import os
import numpy as np
import pygame


SAMPLE_RATE = 44100
SOUNDS_DIR = "sounds"

SOUND_FILES = {
    "startup": "startup.wav",
    "thinking": "thinking.wav",
    "working": "working.wav",
    "speaking": "speaking.wav",
    "notification": "notification.wav",
    "error": "error.wav",
    "shutdown": "shutdown.wav",
}


def _envelope(n_samples, attack=0.05, release=0.15):
    env = np.ones(n_samples)
    a = int(n_samples * attack)
    r = int(n_samples * release)
    if a > 0:
        env[:a] = np.linspace(0.0, 1.0, a)
    if r > 0:
        env[-r:] = np.linspace(1.0, 0.0, r)
    return env


def _to_stereo_int16(mono_wave):
    mono_wave = np.clip(mono_wave, -1.0, 1.0)
    audio = (mono_wave * 32767).astype(np.int16)
    stereo = np.column_stack([audio, audio])
    return np.ascontiguousarray(stereo)


def generate_tone(freq, duration, wave_type="sine", volume=0.5,
                   attack=0.05, release=0.2, sample_rate=SAMPLE_RATE):
    n = int(sample_rate * duration)
    t = np.linspace(0, duration, n, endpoint=False)

    if wave_type == "sine":
        wave = np.sin(2 * np.pi * freq * t)
    elif wave_type == "square":
        wave = np.sign(np.sin(2 * np.pi * freq * t))
    elif wave_type == "triangle":
        wave = 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1
    else:
        wave = np.sin(2 * np.pi * freq * t)

    wave *= _envelope(n, attack, release) * volume
    return wave


def generate_sweep(start_freq, end_freq, duration, volume=0.5,
                    attack=0.02, release=0.1, sample_rate=SAMPLE_RATE):
    n = int(sample_rate * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    freq_t = np.linspace(start_freq, end_freq, n)
    phase = 2 * np.pi * np.cumsum(freq_t) / sample_rate
    wave = np.sin(phase)
    wave *= _envelope(n, attack, release) * volume
    return wave


def generate_chime(freqs, duration, volume=0.4, sample_rate=SAMPLE_RATE):
    n = int(sample_rate * duration)
    wave = np.zeros(n)
    for f in freqs:
        wave += generate_tone(f, duration, volume=1.0, sample_rate=sample_rate)
    wave = wave / len(freqs)
    wave *= _envelope(n, 0.02, 0.3) * volume
    return wave


def _concat(*waves, gap=0.02, sample_rate=SAMPLE_RATE):
    silence = np.zeros(int(sample_rate * gap))
    parts = []
    for i, w in enumerate(waves):
        parts.append(w)
        if i < len(waves) - 1:
            parts.append(silence)
    return np.concatenate(parts)


FALLBACK_GENERATORS = {
    "thinking": lambda: generate_sweep(600, 1200, 0.18, volume=0.35),
    "working": lambda: _concat(
        generate_tone(420, 0.06, wave_type="square", volume=0.3),
        generate_tone(420, 0.06, wave_type="square", volume=0.3),
    ),
    "speaking": lambda: generate_tone(880, 0.08, volume=0.25),
    "notification": lambda: _concat(
        generate_tone(880, 0.1, volume=0.3),
        generate_tone(1320, 0.14, volume=0.3),
    ),
    "startup": lambda: _concat(
        generate_sweep(220, 880, 0.35, volume=0.4),
        generate_chime([523, 659, 784], 0.35, volume=0.35),
    ),
    "shutdown": lambda: generate_sweep(880, 220, 0.4, volume=0.4),
    "error": lambda: _concat(
        generate_tone(220, 0.12, wave_type="square", volume=0.35),
        generate_tone(180, 0.16, wave_type="square", volume=0.35),
    ),
}


class SoundManager:

    def __init__(self, volume=0.5, sounds_dir=SOUNDS_DIR):
        self.volume = volume
        self.sounds_dir = sounds_dir
        self._cache = {}

    def _ensure_mixer(self):
        if not pygame.mixer.get_init():
            pygame.mixer.init(frequency=SAMPLE_RATE, size=-16, channels=2)

    def _load_from_file(self, name):
        filename = SOUND_FILES.get(name)
        if not filename:
            return None
        path = os.path.join(self.sounds_dir, filename)
        if not os.path.isfile(path):
            return None
        try:
            return pygame.mixer.Sound(path)
        except Exception:
            return None

    def _build_fallback(self, name):
        generator = FALLBACK_GENERATORS.get(name)
        if not generator:
            return None
        wave = generator()
        stereo = _to_stereo_int16(wave)
        return pygame.sndarray.make_sound(stereo)

    def _get(self, name):
        if name in self._cache:
            return self._cache[name]

        self._ensure_mixer()

        sound = self._load_from_file(name)
        if sound is None:
            sound = self._build_fallback(name)

        self._cache[name] = sound
        return sound

    def play(self, name, block=False):
        sound = self._get(name)
        if sound is None:
            return

        sound.set_volume(self.volume)
        channel = sound.play()

        if block and channel is not None:
            while channel.get_busy():
                pygame.time.wait(10)


sounds = SoundManager(volume=0.5)


if __name__ == "__main__":
    import time

    for nome in ("startup", "thinking", "working", "speaking",
                 "notification", "error", "shutdown"):
        print(nome)
        sounds.play(nome, block=True)
        time.sleep(0.3)