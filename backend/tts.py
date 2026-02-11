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


def _sapi_tts(full_text: str, output_path: Path) -> bool:
    """
    Utilise pyttsx3 (SAPI Windows) si disponible pour générer une vraie voix.
    Renvoie True si réussi, sinon False.
    """
    try:
        import pyttsx3

        ensure_parent(output_path)
        engine = pyttsx3.init()
        engine.setProperty("rate", 130)  # voix calme
        engine.setProperty("volume", 0.9)
        engine.save_to_file(full_text, str(output_path))
        engine.runAndWait()
        return output_path.exists()
    except Exception:
        return False


def synthesize_tts(full_text: str, output_path: str, sample_rate: int = 22050) -> None:
    """
    TTS principal : tente d'abord pyttsx3 (voix système Windows hors-ligne).
    Si indisponible, génère une nappe douce (sine) en fallback pour débogage.
    Remplaçable facilement par Coqui XTTS / Kokoro / ElevenLabs.
    """
    out_path = Path(output_path)

    # 1) TTS système (pyttsx3/SAPI)
    if _sapi_tts(full_text, out_path):
        return

    # 2) Fallback synthétique (onde sinus modulée)
    duration = max(30.0, _text_to_duration_seconds(full_text))  # au moins 30s
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

    base_freq = 180.0  # proche d'une voix grave douce
    wobble = 2.0 * np.sin(2 * math.pi * 0.3 * t)  # vibrato lent
    carrier = np.sin(2 * math.pi * (base_freq + wobble) * t)

    # Enveloppe douce dépendant du texte (variations subtiles)
    shape = 0.5 + 0.5 * np.sin(2 * math.pi * 0.05 * t)
    signal = carrier * shape * 0.15

    signal = fade(signal, fade_time=2.5, sr=sample_rate)
    signal = normalize(signal, target_db=-16.0)

    save_wave(signal, sample_rate, out_path)


def _looks_like_mp3(data: bytes) -> bool:
    return data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)


def _wrap_pcm_to_wav(pcm16le: bytes, sample_rate: int, out_path: Path) -> None:
    """
    Enveloppe du PCM 16-bit little-endian mono dans un conteneur WAV.
    """
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
    """
    Génère une voix via ElevenLabs et écrit un WAV compatible mixdown.
    - Requiert ELEVENLABS_API_KEY dans l'env.
    - On tente de récupérer du PCM (output_format=pcm_*) pour éviter toute dépendance ffmpeg.
    """
    import httpx

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY manquant (variable d'environnement).")
    if not voice_id:
        voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "")
    if not voice_id:
        raise RuntimeError("elevenlabs_voice_id manquant (et ELEVENLABS_VOICE_ID non défini).")

    base = os.environ.get("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io")
    url = f"{base}/v1/text-to-speech/{voice_id}"

    headers = {
        "xi-api-key": api_key,
        "accept": "audio/mpeg",  # l'API peut ignorer, on gère la détection
        "content-type": "application/json",
    }

    payload = {
        "text": full_text,
        # Modèle par défaut (ElevenLabs). Optionnel, mais utile pour stabilité.
        "model_id": os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
        "voice_settings": {
            # Valeurs "calmes" par défaut (réglables via env si tu veux).
            "stability": float(stability),
            "similarity_boost": float(similarity_boost),
            "style": float(style),
            "use_speaker_boost": bool(use_speaker_boost),
        },
    }

    # On tente d'abord le format MP3 (par défaut, toujours supporté), puis les formats PCM
    # Le MP3 nécessite ffmpeg pour conversion, mais c'est plus fiable
    try_formats: Tuple[Tuple[Optional[str], int], ...] = (
        (None, 22050),  # MP3 par défaut (pas de output_format)
        ("pcm_22050", 22050),
        ("pcm_16000", 16000),
        ("pcm_24000", 24000),
    )

    last_err: Optional[Exception] = None
    last_err_details: Optional[str] = None
    with httpx.Client(timeout=90) as client:
        for fmt, sr in try_formats:
            try:
                params = {"output_format": fmt} if fmt else {}
                resp = client.post(url, headers=headers, params=params, json=payload)
                resp.raise_for_status()
                data = resp.content
                
                # Certaines configs renvoient déjà un WAV.
                if data.startswith(b"RIFF") and b"WAVE" in data[:32]:
                    ensure_parent(out_path)
                    out_path.write_bytes(data)
                    return
                # Si c'est un MP3, on convertit en WAV via ffmpeg
                if _looks_like_mp3(data):
                    import shutil
                    import subprocess
                    import tempfile

                    if not shutil.which("ffmpeg"):
                        raise RuntimeError(
                            "ElevenLabs a renvoyé du MP3; conversion en WAV nécessite ffmpeg. "
                            "Installe ffmpeg ou utilise TTS local."
                        )

                    ensure_parent(out_path)
                    with tempfile.TemporaryDirectory() as td:
                        mp3_path = Path(td) / "voice.mp3"
                        mp3_path.write_bytes(data)
                        # Convertit en WAV mono 22050Hz (standard de notre pipeline TTS)
                        cmd = [
                            "ffmpeg",
                            "-y",
                            "-i",
                            str(mp3_path),
                            "-ac",
                            "1",
                            "-ar",
                            "22050",
                            str(out_path),
                        ]
                        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return
                # Sinon on suppose PCM16LE mono.
                _wrap_pcm_to_wav(data, sr, out_path)
                return
            except httpx.HTTPStatusError as e:
                # Capture les détails de l'erreur HTTP
                error_text = ""
                try:
                    error_text = e.response.text[:500]  # Limite à 500 caractères
                except:
                    pass
                last_err = e
                last_err_details = f"Status {e.response.status_code}: {error_text}" if error_text else f"Status {e.response.status_code}"
                continue
            except Exception as e:
                last_err = e
                last_err_details = str(e)
                continue

    # Message d'erreur amélioré avec détection des cas spécifiques
    error_msg = f"ElevenLabs TTS failed: {last_err}"
    if last_err_details:
        error_msg += f" ({last_err_details})"
    
    if isinstance(last_err, httpx.HTTPStatusError):
        status_code = last_err.response.status_code
        # Détecter les erreurs spécifiques d'ElevenLabs
        try:
            error_data = last_err.response.json()
            detail = error_data.get("detail", {})
            status = detail.get("status", "")
            message = detail.get("message", "")
            
            if status_code == 401:
                if status == "detected_unusual_activity":
                    error_msg = (
                        f"ElevenLabs a détecté une activité inhabituelle et a désactivé le Free Tier.\n\n"
                        f"Message: {message}\n\n"
                        f"Solutions possibles :\n"
                        f"1. Vérifiez que vous n'utilisez pas de proxy/VPN\n"
                        f"2. Assurez-vous d'utiliser une seule clé API valide\n"
                        f"3. Si vous utilisez un plan payant, vérifiez que la clé API correspond au bon compte\n"
                        f"4. Contactez le support ElevenLabs si vous pensez que c'est une erreur"
                    )
                else:
                    error_msg = (
                        f"Erreur d'authentification ElevenLabs (401). "
                        f"Vérifiez que ELEVENLABS_API_KEY est correcte et valide.\n"
                        f"Détails: {message}"
                    )
            elif status_code == 400:
                if status == "voice_limit_reached":
                    error_msg = (
                        f"Limite de voix personnalisées atteinte ({message}). "
                        f"Solutions :\n"
                        f"1. Utilisez une voix publique/pré-définie (ex: 21m00Tcm4TlvDq8ikWAM pour Rachel)\n"
                        f"2. Laissez le champ voice_id vide pour utiliser la voix par défaut (ELEVENLABS_VOICE_ID)\n"
                        f"3. Mettez à niveau votre abonnement ElevenLabs"
                    )
                elif "voice" in message.lower() or "voice_id" in str(error_data).lower():
                    error_msg += f"\nErreur voix: {message}. Vérifiez que le voice_id est valide ou laissez-le vide pour utiliser la voix par défaut."
                else:
                    error_msg += " - Vérifiez que le voice_id est valide et que les paramètres sont corrects."
            elif status_code == 429:
                error_msg = (
                    f"Limite de taux atteinte (429). "
                    f"Vous avez dépassé votre quota d'utilisation ElevenLabs.\n"
                    f"Attendez quelques minutes ou mettez à niveau votre plan."
                )
        except:
            if status_code == 401:
                error_msg += " - Erreur d'authentification. Vérifiez que ELEVENLABS_API_KEY est correcte."
            elif status_code == 400:
                error_msg += " - Vérifiez que le voice_id est valide et que les paramètres sont corrects."
    
    raise RuntimeError(error_msg)


def tts_cache_key(full_text: str, provider: str, voice_id: str = "", extra: Optional[dict] = None) -> str:
    """
    Clé de cache TTS: stable sur texte + provider + voice + params.
    """
    extra = extra or {}
    dumped = (provider + "|" + voice_id + "|" + full_text + "|" + repr(sorted(extra.items()))).encode("utf-8", errors="ignore")
    return hashlib.sha256(dumped).hexdigest()[:24]


def synthesize_tts_cached(
    full_text: str,
    output_path: str,
    *,
    provider: str = "local",
    elevenlabs_voice_id: str = "",
    base_dir: Optional[Path] = None,
) -> Tuple[bool, str, Optional[str]]:
    """
    Génère une voix avec cache:
    - Écrit TOUJOURS un WAV dans output_path (pour rester compatible mixdown).
    - Renvoie: (cache_hit, provider_used, error_if_any)
    """
    out_path = Path(output_path)

    cache_hit = False
    error = None
    provider_used = provider

    # TTS params (influencent le cache!)
    eleven_params = {
        "stability": float(os.environ.get("ELEVENLABS_STABILITY", "0.55")),
        "similarity_boost": float(os.environ.get("ELEVENLABS_SIMILARITY_BOOST", "0.75")),
        "style": float(os.environ.get("ELEVENLABS_STYLE", "0.15")),
        "use_speaker_boost": True,
    }

    cache_file = None
    if base_dir is not None:
        cache_dir = base_dir / "assets" / "tts_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        key = tts_cache_key(full_text, provider=provider, voice_id=elevenlabs_voice_id, extra=eleven_params if provider == "elevenlabs" else {})
        cache_file = cache_dir / f"voice_{key}.wav"
        if cache_file.exists():
            ensure_parent(out_path)
            out_path.write_bytes(cache_file.read_bytes())
            return True, provider_used, None

    try:
        if provider == "elevenlabs":
            _elevenlabs_tts_to_wav(
                full_text,
                out_path,
                voice_id=elevenlabs_voice_id,
                stability=float(eleven_params["stability"]),
                similarity_boost=float(eleven_params["similarity_boost"]),
                style=float(eleven_params["style"]),
                use_speaker_boost=bool(eleven_params["use_speaker_boost"]),
            )
        else:
            synthesize_tts(full_text=full_text, output_path=str(out_path))
            provider_used = "local"
    except Exception as e:
        # --- C'EST ICI QUE TOUT SE JOUE ---
        print(f"⚠️ Erreur ElevenLabs ({e}). Basculement sur le TTS local...")
        error = str(e)
        
        # On force le fallback sur pyttsx3 (SAPI Windows) ou Sinus
        try:
            synthesize_tts(full_text=full_text, output_path=str(out_path))
            provider_used = "local_fallback" # On change le nom pour savoir que c'est un secours
        except Exception as e_inner:
            print(f"❌ Fallback local échoué : {e_inner}")
            raise  # Si même le local échoue, on s'arrête
    """
    try:
        if provider == "elevenlabs":
            _elevenlabs_tts_to_wav(
                full_text,
                out_path,
                voice_id=elevenlabs_voice_id,
                stability=float(eleven_params["stability"]),
                similarity_boost=float(eleven_params["similarity_boost"]),
                style=float(eleven_params["style"]),
                use_speaker_boost=bool(eleven_params["use_speaker_boost"]),
            )
        else:
            synthesize_tts(full_text=full_text, output_path=str(out_path))
            provider_used = "local"
    except Exception as e:
        error = str(e)
        # Fallback ultime: local
        try:
            synthesize_tts(full_text=full_text, output_path=str(out_path))
            provider_used = "local"
        except Exception:
            # On remonte l'erreur initiale
            provider_used = provider
            raise

    # Alimente le cache si dispo
    if cache_file is not None and out_path.exists():
        try:
            cache_file.write_bytes(out_path.read_bytes())
        except Exception:
            pass

    return cache_hit, provider_used, error
    """

