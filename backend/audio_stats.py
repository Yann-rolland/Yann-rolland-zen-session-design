from __future__ import annotations

import math
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np


@dataclass(frozen=True)
class WavStats:
    exists: bool
    bytes: int = 0
    sample_rate: Optional[int] = None
    channels: Optional[int] = None
    frames: Optional[int] = None
    duration_s: Optional[float] = None
    peak_dbfs: Optional[float] = None
    rms_dbfs: Optional[float] = None
    error: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "exists": self.exists,
            "bytes": self.bytes,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "frames": self.frames,
            "duration_s": self.duration_s,
            "peak_dbfs": self.peak_dbfs,
            "rms_dbfs": self.rms_dbfs,
            "error": self.error,
        }


def wav_stats(path: Path, *, max_seconds: Optional[float] = None) -> WavStats:
    """
    Compute light stats for a WAV file without loading it all in memory.
    - peak_dbfs: 20*log10(peak)
    - rms_dbfs: 20*log10(rms)
    If max_seconds is set, the scan is limited to that duration (from start).
    """
    try:
        if not path.exists():
            return WavStats(exists=False)
        size = int(path.stat().st_size)
        if size <= 44:  # header only
            return WavStats(exists=True, bytes=size, error="File too small")

        with wave.open(str(path), "rb") as wf:
            nch = int(wf.getnchannels())
            sw = int(wf.getsampwidth())
            sr = int(wf.getframerate())
            nframes = int(wf.getnframes())

            # Only PCM 8/16/24/32-bit supported by our decoder here.
            if sw not in (1, 2, 3, 4):
                return WavStats(
                    exists=True,
                    bytes=size,
                    sample_rate=sr,
                    channels=nch,
                    frames=nframes,
                    duration_s=float(nframes) / float(sr) if sr > 0 else None,
                    error=f"Unsupported sample width: {sw}",
                )

            frames_to_read = nframes
            if max_seconds is not None and sr > 0:
                frames_to_read = min(frames_to_read, int(max_seconds * sr))

            peak = 0.0
            sumsq = 0.0
            count = 0

            # Read in chunks to keep memory stable.
            chunk_frames = 1_000_000
            remaining = frames_to_read
            while remaining > 0:
                n = min(chunk_frames, remaining)
                raw = wf.readframes(n)
                if not raw:
                    break

                # Decode to float64 in [-1, 1]
                if sw == 1:
                    x = np.frombuffer(raw, dtype=np.uint8).astype(np.float64)
                    x = (x - 128.0) / 128.0
                elif sw == 2:
                    x = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
                elif sw == 3:
                    b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
                    signed = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
                    signed = np.where(signed & 0x800000, signed - 0x1000000, signed).astype(np.int32)
                    x = signed.astype(np.float64) / 8388608.0
                else:  # sw == 4
                    x = np.frombuffer(raw, dtype=np.int32).astype(np.float64) / 2147483648.0

                if x.size == 0:
                    break

                # Mixdown across channels for RMS/peak stats
                if nch > 1:
                    try:
                        x = x.reshape(-1, nch).mean(axis=1)
                    except Exception:
                        # If the file is malformed, just keep raw vector stats
                        pass

                ax = np.abs(x)
                peak = max(peak, float(ax.max(initial=0.0)))
                sumsq += float(np.dot(x, x))
                count += int(x.size)
                remaining -= n

            duration = float(nframes) / float(sr) if sr > 0 else None
            if count <= 0:
                return WavStats(
                    exists=True,
                    bytes=size,
                    sample_rate=sr,
                    channels=nch,
                    frames=nframes,
                    duration_s=duration,
                    error="No frames decoded",
                )
            rms = math.sqrt((sumsq / float(count)) + 1e-12)
            peak_db = 20.0 * math.log10(max(peak, 1e-12))
            rms_db = 20.0 * math.log10(max(rms, 1e-12))

            return WavStats(
                exists=True,
                bytes=size,
                sample_rate=sr,
                channels=nch,
                frames=nframes,
                duration_s=duration,
                peak_dbfs=float(peak_db),
                rms_dbfs=float(rms_db),
                error=None,
            )
    except Exception as e:
        return WavStats(exists=bool(path.exists()), bytes=int(path.stat().st_size) if path.exists() else 0, error=str(e))

