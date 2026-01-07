import wave
from pathlib import Path
from typing import Tuple

import numpy as np


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def save_wave(signal: np.ndarray, sample_rate: int, path: Path) -> None:
    """
    Enregistre un signal mono/stéréo float [-1,1] en WAV PCM 16-bit.
    - mono: shape (n,)
    - multi-canaux: shape (n, channels)
    """
    ensure_parent(path)
    clipped = np.clip(signal, -1.0, 1.0)
    if clipped.ndim == 1:
        channels = 1
        n = len(clipped)
    elif clipped.ndim == 2:
        channels = int(clipped.shape[1])
        n = int(clipped.shape[0])
    else:
        raise ValueError("signal must be 1D (mono) or 2D (n, channels)")
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        # Écriture en chunks pour éviter de gros pics RAM sur de longues durées.
        chunk_size = 1_000_000  # frames (~2MB/ch en int16)
        for start in range(0, n, chunk_size):
            chunk = clipped[start : start + chunk_size]
            int16 = np.int16(chunk * 32767)
            wav_file.writeframes(int16.tobytes())


def fade(signal: np.ndarray, fade_time: float, sr: int) -> np.ndarray:
    """Applique un fade in/out simple."""
    n = int(fade_time * sr)
    if n == 0 or n * 2 > len(signal):
        return signal
    window = np.linspace(0.0, 1.0, n)
    out = signal.copy()
    out[:n] *= window
    out[-n:] *= window[::-1]
    return out


def normalize(signal: np.ndarray, target_db: float = -12.0) -> np.ndarray:
    """Normalise RMS vers target_db."""
    if signal.size == 0:
        return signal
    # RMS sans allouer un énorme temporaire (évite signal**2 sur de longues pistes)
    flat = signal.reshape(-1)
    rms = float(np.sqrt((float(np.dot(flat, flat)) / float(flat.size)) + 1e-9))
    target_linear = float(10 ** (target_db / 20))
    if rms == 0.0:
        return signal
    signal *= (target_linear / rms)
    return signal


def combine_tracks(tracks: Tuple[np.ndarray, ...]) -> np.ndarray:
    """Somme naïve de plusieurs pistes mono."""
    if not tracks:
        return np.array([], dtype=np.float64)
    length = max(len(t) for t in tracks)
    mix = np.zeros(length, dtype=np.float64)
    for t in tracks:
        mix[: len(t)] += t
    # évite clipping
    return np.clip(mix, -1.0, 1.0)

