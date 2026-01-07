from pathlib import Path

import numpy as np

from utils import fade, normalize, save_wave


def generate_music_bed(duration_minutes: int, output_path: str, sample_rate: int = 8000) -> None:
    """
    Placeholder musique: pad cinématographique simple (sinus empilés, modulation lente).
    Remplaçable par un générateur AI (par ex. Riffusion, API musique).
    """
    duration = max(60, duration_minutes * 60)
    n = int(sample_rate * duration)
    # np.linspace crée souvent des float64 (gros RAM). Ici on évite.
    t = (np.arange(n, dtype=np.float32) / np.float32(sample_rate)).astype(np.float32)

    two_pi = np.float32(2.0 * np.pi)
    left = np.zeros(n, dtype=np.float32)
    right = np.zeros(n, dtype=np.float32)

    # accords graves simples, 2 couches pour limiter la RAM
    base_freqs = [55.0, 110.0]
    amps = [0.08, 0.05]
    for i, (f0, amp) in enumerate(zip(base_freqs, amps)):
        drift_l = np.float32(0.4) * np.sin(two_pi * np.float32(0.01) * t + np.float32(i))
        drift_r = np.float32(0.4) * np.sin(two_pi * np.float32(0.011) * t + np.float32(i) + np.float32(0.7))
        left += (np.sin(two_pi * (np.float32(f0) + drift_l) * t) * np.float32(amp)).astype(np.float32)
        right += (np.sin(two_pi * (np.float32(f0) + drift_r) * t) * np.float32(amp)).astype(np.float32)

    shimmer_l = np.float32(0.02) * np.sin(two_pi * np.float32(1.5) * t)
    shimmer_r = np.float32(0.02) * np.sin(two_pi * np.float32(1.53) * t + np.float32(0.25))
    left += shimmer_l.astype(np.float32)
    right += shimmer_r.astype(np.float32)

    left = fade(left, fade_time=5.0, sr=sample_rate)
    right = fade(right, fade_time=5.0, sr=sample_rate)
    stereo = np.stack([left, right], axis=1)
    stereo = normalize(stereo, target_db=-20.0)

    save_wave(stereo, sample_rate, Path(output_path))

