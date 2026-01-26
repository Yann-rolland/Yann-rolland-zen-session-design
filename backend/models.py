from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, validator


class Objectif(str, Enum):
    sommeil = "sommeil"
    stress = "stress"
    confiance = "confiance"
    performance = "performance"
    douleur = "douleur"


class Style(str, Enum):
    ericksonien = "ericksonien"
    classique = "classique"
    metaphorique = "métaphorique"
    cinematographique = "cinématographique"

class LLMProvider(str, Enum):
    ollama = "ollama"
    gemini = "gemini"

class BinauralBand(str, Enum):
    auto = "auto"
    delta = "delta"
    theta = "theta"
    alpha = "alpha"
    beta = "beta"
    gamma = "gamma"

class TTSProvider(str, Enum):
    local = "local"
    elevenlabs = "elevenlabs"


class GenerationRequest(BaseModel):
    objectif: Objectif
    duree_minutes: int = Field(ge=5, le=90)
    style: Style

    # LLM provider (default local Ollama)
    llm_provider: LLMProvider = LLMProvider.ollama
    # Note: sur l'API Google Generative Language, les noms valides peuvent être
    # "gemini-1.5-pro-latest", "gemini-1.5-flash-latest", etc.
    gemini_model: str = Field(default="gemini-pro-latest")

    # Mixdown (optionnel, backward compatible)
    mixdown: bool = False
    voice_volume: float = Field(default=1.0, ge=0.0, le=2.0)
    music_volume: float = Field(default=0.35, ge=0.0, le=2.0)
    binaural_volume: float = Field(default=0.25, ge=0.0, le=2.0)
    voice_offset_s: float = Field(default=0.0, ge=0.0, le=30.0)
    music_offset_s: float = Field(default=0.0, ge=0.0, le=30.0)
    binaural_offset_s: float = Field(default=0.0, ge=0.0, le=30.0)

    # Binaural beats:
    # - auto => choisit la bande en fonction de l'objectif
    # - sinon: delta/theta/alpha/beta/gamma
    binaural_band: BinauralBand = BinauralBand.auto
    # Optionnel: forcer un beat exact (Hz). Si > 0, priorité sur binaural_band.
    binaural_beat_hz: float = Field(default=0.0, ge=0.0, le=80.0)

    # TTS
    # - local: pyttsx3/SAPI Windows (offline)
    # - elevenlabs: API (ELEVENLABS_API_KEY requis côté backend)
    tts_provider: TTSProvider = TTSProvider.local
    # Optionnel: voice_id ElevenLabs (UUID). Si vide, le backend tentera ELEVENLABS_VOICE_ID.
    elevenlabs_voice_id: str = ""
    elevenlabs_stability: float = Field(default=0.55, ge=0.0, le=1.0)
    elevenlabs_similarity_boost: float = Field(default=0.75, ge=0.0, le=1.0)
    elevenlabs_style: float = Field(default=0.15, ge=0.0, le=1.0)
    elevenlabs_use_speaker_boost: bool = True

    @validator("duree_minutes")
    def validate_duration(cls, v):  # pylint: disable=no-self-argument
        if v % 5 != 0:
            raise ValueError("duree_minutes doit être un multiple de 5 pour cadrer la structure.")
        return v


class HypnosisText(BaseModel):
    induction: str
    approfondissement: str
    travail: str
    integration: str
    reveil: str


class GenerationResponse(BaseModel):
    texte: HypnosisText
    tts_audio_path: str
    music_path: str
    binaural_path: str
    mix_path: Optional[str] = None
    run_id: Optional[str] = None
    llm_provider_used: Optional[str] = None
    llm_fallback: Optional[bool] = None
    llm_error: Optional[str] = None
    binaural_band_used: Optional[str] = None
    binaural_beat_hz_used: Optional[float] = None
    tts_provider_used: Optional[str] = None
    tts_cache_hit: Optional[bool] = None
    tts_error: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "texte": {
                    "induction": "...",
                    "approfondissement": "...",
                    "travail": "...",
                    "integration": "...",
                    "reveil": "...",
                },
                "tts_audio_path": "assets/audio/session.wav",
                "music_path": "assets/music/ambient.wav",
                "binaural_path": "assets/audio/binaural.wav",
                "mix_path": "assets/audio/mix.wav",
            }
        }


class WellBeingFeedback(BaseModel):
    """
    Feedback "ressenti" envoyé depuis le frontend (opt-in côté UI).
    On stocke côté backend pour analyse produit.
    """
    id: str = Field(default="", max_length=128)
    device_id: str = Field(default="", max_length=128)
    # Supabase Auth identity (required): we link each event to a user profile
    user_id: str = Field(min_length=1, max_length=64)
    user_email: str = Field(min_length=3, max_length=320)
    at: str
    rating: float = Field(ge=1.0, le=5.0)
    tag: str = Field(default="autre", max_length=32)
    note: str = Field(default="", max_length=4000)
    session_id: str = Field(default="", max_length=128)

