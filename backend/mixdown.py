from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import time

from audio_io import read_wave, read_wave_mono, resample_linear
from utils import ensure_parent, fade, normalize, save_wave


@dataclass(frozen=True)
class MixSettings:
    voice_volume: float = 1.0
    music_volume: float = 0.35
    binaural_volume: float = 0.25
    voice_offset_s: float = 0.0
    music_offset_s: float = 0.0
    binaural_offset_s: float = 0.0
    sample_rate: int = 8000
    # Simple sidechain ducking (helps keep voice intelligible in a single mixed track)
    ducking_enabled: bool = True
    ducking_strength_music: float = 0.65  # 0..1 (1 = full mute under voice)
    ducking_strength_binaural: float = 0.35
    ducking_threshold: float = 0.015  # abs amplitude threshold
    ducking_release_s: float = 0.08  # envelope smoothing time constant


def _place_with_offset(signal: np.ndarray, offset_s: float, sr: int) -> np.ndarray:
    """Décale un signal en ajoutant du silence au début (offset >= 0)."""
    if offset_s <= 0:
        return signal
    n0 = int(round(offset_s * sr))
    if n0 <= 0:
        return signal
    if signal.ndim == 1:
        return np.concatenate([np.zeros(n0, dtype=np.float32), signal.astype(np.float32)])
    # 2D: prepend silent frames for all channels
    return np.concatenate([np.zeros((n0, signal.shape[1]), dtype=np.float32), signal.astype(np.float32)], axis=0)


def _envelope_iir(abs_signal: np.ndarray, sr: int, tau_s: float) -> np.ndarray:
    """
    Cheap envelope follower (IIR low-pass) on |x|.
    abs_signal is 1D float.
    """
    if abs_signal.size == 0:
        return abs_signal
    tau_s = max(0.001, float(tau_s))
    alpha = float(np.exp(-1.0 / float(sr * tau_s)))
    out = np.empty_like(abs_signal, dtype=np.float32)
    y = 0.0
    for i in range(abs_signal.size):
        y = (alpha * y) + ((1.0 - alpha) * float(abs_signal[i]))
        out[i] = y
    return out


def mixdown_to_wav(
    voice_wav: Path,
    music_wav: Path,
    binaural_wav: Path,
    out_wav: Path,
    settings: Optional[MixSettings] = None,
) -> Path:
    """Charge 3 WAV, aligne (offset), applique volume, mixe et écrit un WAV stéréo."""
    settings = settings or MixSettings()
    ensure_parent(out_wav)

    # Attendre que les fichiers soient bien écrits (pyttsx3 peut prendre un instant).
    for _ in range(40):  # ~4s
        if voice_wav.exists() and music_wav.exists() and binaural_wav.exists():
            try:
                # Try opening voice WAV quickly to ensure it's readable
                read_wave_mono(voice_wav)
                break
            except Exception:
                time.sleep(0.1)
        else:
            time.sleep(0.1)

    sr_v, v_mono = read_wave_mono(voice_wav)
    sr_m, m = read_wave(music_wav)
    sr_b, b = read_wave(binaural_wav)

    # Force music/binaural to stereo (n,2)
    if m.ndim == 1:
        m = np.stack([m, m], axis=1)
    if b.ndim == 1:
        b = np.stack([b, b], axis=1)

    # Voice mono -> stereo (keep a mono copy for ducking)
    v_mono_rs = resample_linear(v_mono.astype(np.float32, copy=False), sr_v, settings.sample_rate).astype(np.float32, copy=False)
    v = np.stack([v_mono_rs, v_mono_rs], axis=1)

    v = v.astype(np.float32, copy=False)
    m = resample_linear(m, sr_m, settings.sample_rate).astype(np.float32, copy=False)
    b = resample_linear(b, sr_b, settings.sample_rate).astype(np.float32, copy=False)

    # Normalize stems lightly BEFORE applying user volumes.
    # This helps avoid cases where beds dominate the mix after global normalization.
    v = normalize(v, target_db=-16.0).astype(np.float32, copy=False)
    m = normalize(m, target_db=-24.0).astype(np.float32, copy=False)
    b = normalize(b, target_db=-28.0).astype(np.float32, copy=False)

    v = (_place_with_offset(v, settings.voice_offset_s, settings.sample_rate) * float(settings.voice_volume)).astype(np.float32)
    m = (_place_with_offset(m, settings.music_offset_s, settings.sample_rate) * float(settings.music_volume)).astype(np.float32)
    b = (_place_with_offset(b, settings.binaural_offset_s, settings.sample_rate) * float(settings.binaural_volume)).astype(np.float32)

    # Sidechain ducking: attenuate beds when voice is present
    if settings.ducking_enabled and v.shape[0] > 0 and (m.shape[0] > 0 or b.shape[0] > 0):
        # Build envelope from the *placed* voice track (mono)
        v_env_src = v[:, 0] if v.ndim == 2 else v
        env = _envelope_iir(np.abs(v_env_src).astype(np.float32, copy=False), settings.sample_rate, settings.ducking_release_s)
        # Soft knee above threshold
        thr = float(settings.ducking_threshold)
        # 0..1 mask
        mask = np.clip((env - thr) / max(1e-6, thr), 0.0, 1.0).astype(np.float32, copy=False)
        if m.shape[0] > 0:
            duck_m = (1.0 - float(settings.ducking_strength_music) * mask[: m.shape[0]]).astype(np.float32, copy=False)
            m[: duck_m.shape[0], :] *= duck_m[:, None]
        if b.shape[0] > 0:
            duck_b = (1.0 - float(settings.ducking_strength_binaural) * mask[: b.shape[0]]).astype(np.float32, copy=False)
            b[: duck_b.shape[0], :] *= duck_b[:, None]

    length = max(v.shape[0], m.shape[0], b.shape[0])
    mix = np.zeros((length, 2), dtype=np.float32)
    mix[: v.shape[0], :] += v[:, :2]
    mix[: m.shape[0], :] += m[:, :2]
    mix[: b.shape[0], :] += b[:, :2]

    # Fade & normalize
    mix[:, 0] = fade(mix[:, 0], fade_time=2.0, sr=settings.sample_rate)
    mix[:, 1] = fade(mix[:, 1], fade_time=2.0, sr=settings.sample_rate)
    np.clip(mix, -1.0, 1.0, out=mix)
    mix = normalize(mix, target_db=-14.0)
    save_wave(mix, settings.sample_rate, out_wav)
    return out_wav


