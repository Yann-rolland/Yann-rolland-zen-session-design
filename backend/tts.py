import hashlib
import math
import os
import wave
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
from utils import ensure_parent, fade, normalize, save_wave


def _text_to_duration_seconds(text: str, words_per_minute: int = 110) -> float:
    words = max(1, len(text.split()))
    return (words / words_per_minute) * 60.0

def _google_tts(full_text: str, output_path: Path) -> bool:
    """
    Alternative gratuite et robuste pour Render (Linux).
    """
    try:
        from gtts import gTTS
        ensure_parent(output_path)
        # Génère la voix en français
        tts = gTTS(text=full_text, lang='fr')
        tts.save(str(output_path))
        return output_path.exists()
    except Exception as e:
        print(f"❌ Erreur Google TTS : {e}")
        return False

def synthesize_tts(full_text: str, output_path: str, sample_rate: int = 22050) -> None:
    """
    TTS de secours : tente d'abord Google TTS, sinon génère un son sinus.
    """
    out_path = Path(output_path)

    # 1) Tentative avec Google TTS (fiable sur Render)
    if _google_tts(full_text, out_path):
        return

    # 2) Fallback ultime : onde sinus (pour éviter que le mixeur ne reçoive du vide)
    duration = max(5.0, _text_to_duration_seconds(full_text))
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    signal = np.sin(2 * math.pi * 440.0 * t) * 0.1
    save_wave(signal, sample_rate, out_path)

def _looks_like_mp3(data: bytes) -> bool:
    return data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)

def _wrap_pcm_to_wav(pcm16le: bytes, sample_rate: int, out_path: Path) -> None:
    ensure_parent(out_path)
    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm16le)

def _elevenlabs_tts_to_wav(
    full_text: str,
    out_path: Path,
    voice_id: str,
    *,
    stability: float,
    similarity_boost: float,
    style: float,
    use_speaker_boost: bool,
) -> None:
    import httpx
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY manquant.")
    
    voice_id = voice_id or os.environ.get("ELEVENLABS_VOICE_ID", "")
    if not voice_id:
        raise RuntimeError("voice_id manquant.")

    base = os.environ.get("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io")
    url = f"{base}/v1/text-to-speech/{voice_id}"

    headers = {
        "xi-api-key": api_key,
        "content-type": "application/json",
    }

    payload = {
        "text": full_text,
        "model_id": os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity_boost,
            "style": style,
            "use_speaker_boost": use_speaker_boost,
        },
    }

    with httpx.Client(timeout=90) as client:
        resp = client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            # Gestion simplifiée des erreurs ElevenLabs pour le log
            err_data = resp.json() if resp.content else {}
            msg = err_data.get("detail", {}).get("message", "Erreur inconnue")
            raise RuntimeError(f"ElevenLabs Error {resp.status_code}: {msg}")
            
        data = resp.content
        if data.startswith(b"RIFF"):
            out_path.write_bytes(data)
        elif _looks_like_mp3(data):
            # Conversion basique si ffmpeg est là, sinon erreur
            import shutil
            import subprocess
            import tempfile
            if not shutil.which("ffmpeg"):
                raise RuntimeError("ffmpeg requis pour MP3 -> WAV")
            with tempfile.TemporaryDirectory() as td:
                p = Path(td) / "v.mp3"
                p.write_bytes(data)
                subprocess.run(["ffmpeg", "-y", "-i", str(p), "-ac", "1", "-ar", "22050", str(out_path)], check=True, capture_output=True)
        else:
            _wrap_pcm_to_wav(data, 22050, out_path)

def tts_cache_key(full_text: str, provider: str, voice_id: str = "", extra: Optional[dict] = None) -> str:
    extra = extra or {}
    dumped = (provider + "|" + voice_id + "|" + full_text + "|" + repr(sorted(extra.items()))).encode("utf-8")
    return hashlib.sha256(dumped).hexdigest()[:24]

def synthesize_tts_cached(
    full_text: str,
    output_path: str,
    *,
    provider: str = "local",
    elevenlabs_voice_id: str = "",
    base_dir: Optional[Path] = None,
) -> Tuple[bool, str, Optional[str]]:
    out_path = Path(output_path)
    cache_hit = False
    error = None
    provider_used = provider

    # Params par défaut
    eleven_params = {"stability": 0.55, "similarity_boost": 0.75, "style": 0.15, "use_speaker_boost": True}

    if base_dir:
        cache_dir = base_dir / "assets" / "tts_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        key = tts_cache_key(full_text, provider, elevenlabs_voice_id, eleven_params if provider == "elevenlabs" else {})
        cache_file = cache_dir / f"voice_{key}.wav"
        if cache_file.exists():
            out_path.write_bytes(cache_file.read_bytes())
            return True, provider, None

    try:
        if provider == "elevenlabs":
            _elevenlabs_tts_to_wav(full_text, out_path, elevenlabs_voice_id, **eleven_params)
        else:
            synthesize_tts(full_text, str(out_path))
            provider_used = "local"
    except Exception as e:
        print(f"⚠️ Erreur Provider ({provider}): {e}. Basculement gTTS...")
        error = str(e)
        try:
            synthesize_tts(full_text, str(out_path))
            provider_used = "google_fallback"
        except Exception as e2:
            raise RuntimeError(f"Échec total TTS: {e2}")

    return cache_hit, provider_used, error