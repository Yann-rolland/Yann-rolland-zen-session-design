from pathlib import Path

import numpy as np

from utils import fade, normalize, save_wave


def generate_binaural_track(
    duration_minutes: int,
    output_path: str,
    sample_rate: int = 8000,
    carrier_hz: float = 180.0,
    beat_hz: float = 4.5,
) -> None:
    """
    Binaural beats stéréo:
    - oreille gauche: carrier_hz
    - oreille droite: carrier_hz + beat_hz
    La bande (delta/theta/alpha/beta/gamma) est déterminée côté API en choisissant beat_hz.
    """
    duration = max(60, duration_minutes * 60)
    n = int(sample_rate * duration)
    t = (np.arange(n, dtype=np.float32) / np.float32(sample_rate)).astype(np.float32)

    two_pi = np.float32(2.0 * np.pi)
    left = np.sin(two_pi * np.float32(carrier_hz) * t).astype(np.float32)
    right = np.sin(two_pi * np.float32(carrier_hz + beat_hz) * t).astype(np.float32)

    # Vrai binaural stéréo: L=carrier, R=carrier+beat
    envelope = np.float32(0.6) + np.float32(0.4) * np.sin(two_pi * np.float32(0.1) * t)
    l = (left * envelope * np.float32(0.12)).astype(np.float32)
    r = (right * envelope * np.float32(0.12)).astype(np.float32)

    l = fade(l, fade_time=4.0, sr=sample_rate)
    r = fade(r, fade_time=4.0, sr=sample_rate)
    stereo = np.stack([l, r], axis=1)
    stereo = normalize(stereo, target_db=-22.0)

    save_wave(stereo, sample_rate, Path(output_path))

