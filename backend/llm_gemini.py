import json
import os
from typing import Dict, Optional

import httpx
from llm import DEFAULT_SECTIONS, _parse_sections  # reuse robust JSON parsing

GEMINI_API_KEY_ENV = "GEMINI_API_KEY"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-pro-latest")

def _redact_secrets(s: str) -> str:
    """
    Évite de faire remonter des secrets (ex: ...?key=AIza... ) dans les erreurs renvoyées au frontend.
    """
    if not s:
        return s
    # Redact query param "key="
    try:
        import re

        s = re.sub(r"([?&]key=)[^&\s]+", r"\1REDACTED", s)
        # Redact common Google API key pattern if ever present outside query
        s = re.sub(r"AIza[0-9A-Za-z\-_]{20,}", "AIzaREDACTED", s)
    except Exception:
        # Best effort only
        pass
    return s


class GeminiConfigError(RuntimeError):
    pass


async def generate_text_sections_gemini(prompt: str, model: str = GEMINI_DEFAULT_MODEL) -> Dict[str, str]:
    """
    Appelle Gemini via l'API Google Generative Language (v1beta).
    La clé doit être dans l'env: GEMINI_API_KEY
    """
    api_key = os.environ.get(GEMINI_API_KEY_ENV)
    if not api_key:
        raise GeminiConfigError("GEMINI_API_KEY manquant (variable d'environnement).")

    # L'API /models renvoie des noms comme "models/gemini-pro-latest".
    # L'endpoint attend "models/{model}:generateContent". On accepte donc:
    # - "gemini-pro-latest"
    # - "models/gemini-pro-latest"
    if model.startswith("models/"):
        model = model[len("models/") :]

    url = f"{GEMINI_BASE}/models/{model}:generateContent"
    params = {"key": api_key}
    # On renforce l'instruction "JSON only" (utile si le modèle ignore le prompt principal).
    strong_prompt = (
        "IMPORTANT: Réponds uniquement avec un JSON strict parsable, sans texte avant/après.\n"
        "Chaque valeur doit être une chaîne (string).\n\n"
        + prompt
    )

    def build_payload(json_mode: bool) -> Dict[str, object]:
        generation_config: Dict[str, object] = {
            "temperature": 0.4,
            "topP": 0.9,
            # Plus haut pour éviter que le JSON soit tronqué en plein milieu.
            "maxOutputTokens": 2600,
        }
        if json_mode:
            # Certains modèles supportent ce champ, d'autres non.
            generation_config["responseMimeType"] = "application/json"
        return {
            "contents": [{"role": "user", "parts": [{"text": strong_prompt}]}],
            "generationConfig": generation_config,
        }

    async with httpx.AsyncClient(timeout=90) as client:
        # Certains noms de modèles changent selon les versions; si 404, on tente un fallback.
        # Fallbacks génériques (les noms exacts dépendent de la clé/région)
        try_models = [model, "gemini-pro-latest", "gemini-flash-latest", "gemini-2.0-flash"]
        last_exc: Optional[Exception] = None
        data = None
        for m in try_models:
            try:
                url_m = f"{GEMINI_BASE}/models/{m}:generateContent"
                # 1) tentative avec json_mode
                for json_mode in (True, False):
                    try:
                        resp = await client.post(url_m, params=params, json=build_payload(json_mode=json_mode))
                        resp.raise_for_status()
                        data = resp.json()
                        break
                    except httpx.HTTPStatusError as exc2:
                        # Remonte une erreur utile (message Google) sans jamais leak la clé.
                        status = exc2.response.status_code if exc2.response is not None else "?"
                        body_text = ""
                        try:
                            body_text = exc2.response.text or ""
                        except Exception:
                            body_text = ""

                        details = ""
                        try:
                            body = exc2.response.json()
                            # Format courant: {"error":{"message":"...","status":"INVALID_ARGUMENT"}}
                            err = body.get("error") if isinstance(body, dict) else None
                            if isinstance(err, dict):
                                msg = err.get("message") or ""
                                st = err.get("status") or ""
                                details = f"{st}: {msg}".strip(": ").strip()
                            else:
                                details = json.dumps(body, ensure_ascii=False)[:800]
                        except Exception:
                            details = (body_text or "")[:800]

                        last_exc = RuntimeError(
                            _redact_secrets(
                                f"Gemini HTTP {status} (model={m}, json_mode={json_mode}). {details}".strip()
                            )
                        )
                        continue
                    except Exception as exc2:
                        # Ne jamais leak l'URL complète qui contient ?key=
                        last_exc = RuntimeError(_redact_secrets(str(exc2)))
                        continue
                if data is not None:
                    break
            except Exception as exc:
                last_exc = RuntimeError(_redact_secrets(str(exc)))
                continue
        if data is None:
            raise last_exc or RuntimeError("Gemini request failed")

    # Gemini returns candidates[].content.parts[].text
    candidates = data.get("candidates", [])
    text = ""
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)

    # Si Gemini n'a renvoyé aucun texte, on remonte un diagnostic utile
    if not text.strip():
        snippet = json.dumps(data, ensure_ascii=False)[:800]
        raise RuntimeError(f"Gemini returned empty text. Raw snippet: {snippet}")

    sections = _parse_sections(text)
    # Si non-parsable, on force une erreur pour que l'API /generate marque "fallback" explicitement.
    if sections is DEFAULT_SECTIONS:
        raise RuntimeError(f"Gemini response not parsable as JSON. Sample: {text[:300]}")
    return sections


async def list_gemini_models() -> Dict[str, object]:
    """
    Liste les modèles visibles par la clé (utile pour trouver le bon nom).
    """
    api_key = os.environ.get(GEMINI_API_KEY_ENV)
    if not api_key:
        raise GeminiConfigError("GEMINI_API_KEY manquant (variable d'environnement).")
    url = f"{GEMINI_BASE}/models"
    params = {"key": api_key}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


