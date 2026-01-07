import wave
from pathlib import Path
from typing import Tuple

import numpy as np


def _decode_pcm(raw: bytes, sampwidth: int) -> np.ndarray:
    if sampwidth == 1:
        x = np.frombuffer(raw, dtype=np.uint8).astype(np.float64)
        return (x - 128.0) / 128.0
    if sampwidth == 2:
        return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    if sampwidth == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        signed = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        signed = np.where(signed & 0x800000, signed - 0x1000000, signed).astype(np.int32)
        return signed.astype(np.float64) / 8388608.0
    if sampwidth == 4:
        return np.frombuffer(raw, dtype=np.int32).astype(np.float64) / 2147483648.0
    raise ValueError(f"Unsupported WAV sample width: {sampwidth}")


def read_wave(path: Path) -> Tuple[int, np.ndarray]:
    """
    Lit un WAV et renvoie (sample_rate, signal_float64[-1,1]).
    - mono: shape (n,)
    - stéréo+: shape (n, channels)
    """
    with wave.open(str(path), "rb") as wf:
        nch = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        sr = wf.getframerate()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)

    x = _decode_pcm(raw, sampwidth)
    if nch > 1:
        x = x.reshape(-1, nch)
    return sr, np.clip(x, -1.0, 1.0)


def read_wave_mono(path: Path) -> Tuple[int, np.ndarray]:
    """
    Lit un WAV et renvoie (sample_rate, signal_mono_float64[-1,1]).
    - Si stéréo: downmix vers mono.
    - Si 8/16/24/32-bit PCM: convertit vers float.
    """
    sr, x = read_wave(path)
    if x.ndim == 2:
        x = x.mean(axis=1)
    return sr, x


def resample_linear(signal: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Resampling linéaire simple (suffisant pour MVP)."""
    if sr_in == sr_out:
        return signal
    if len(signal) < 2:
        return signal
    ratio = sr_out / sr_in
    if signal.ndim == 1:
        n_out = int(round(len(signal) * ratio))
        x_in = np.linspace(0.0, 1.0, num=len(signal), endpoint=True)
        x_out = np.linspace(0.0, 1.0, num=n_out, endpoint=True)
        return np.interp(x_out, x_in, signal).astype(np.float64)
    # 2D: resample each channel
    n_out = int(round(signal.shape[0] * ratio))
    x_in = np.linspace(0.0, 1.0, num=signal.shape[0], endpoint=True)
    x_out = np.linspace(0.0, 1.0, num=n_out, endpoint=True)
    out = np.zeros((n_out, signal.shape[1]), dtype=np.float64)
    for ch in range(signal.shape[1]):
        out[:, ch] = np.interp(x_out, x_in, signal[:, ch])
    return out


