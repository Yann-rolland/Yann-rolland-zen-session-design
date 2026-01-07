import ast
import json
import logging
import os
from typing import Dict

import httpx

PNL_PHRASES = [
    "maintenant",
    "pendant que",
    "tu peux remarquer",
    "naturellement",
    "inconsciemment",
    "à ton propre rythme",
    "comme si",
    "peut-être",
]

OLLAMA_URL = "http://localhost:11434/api/chat"
# Par défaut on utilise un tag existant (vu dans /api/tags). Surchargable via env.
MODEL = os.environ.get("OLLAMA_MODEL", "llama3:latest")
OLLAMA_NUM_GPU = int(os.environ.get("OLLAMA_NUM_GPU", "0"))  # 0 = CPU only (évite CUDA OOM)
OLLAMA_TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT_S", "240"))

DEFAULT_SECTIONS: Dict[str, str] = {
    "induction": "Respiration calme, maintenant, pendant que tu peux remarquer la détente, comme si chaque muscle se relâchait naturellement, à ton propre rythme.",
    "approfondissement": "Comptage lent, peut-être du 10 vers 1, comme si tu descendais un escalier tranquille, naturellement plus profondément, inconsciemment plus calme.",
    "travail": "Recadrage positif, visualisation d'un futur serein, tu peux remarquer comment la confiance se renforce maintenant, pendant que tu crées un ancrage positif, comme si c'était déjà acquis.",
    "integration": "Suggestions permissives, répétitions douces, à ton propre rythme les bénéfices s'installent, peut-être plus profondément que tu ne penses, naturellement et inconsciemment.",
    "reveil": "Comptage inverse 1 à 5, tu peux remarquer l'énergie revenir, comme si tes sens se réorientaient, pendant que tu t'éveilles dans un état positif et stable.",
}

logger = logging.getLogger("hypnotic_ai.llm")

def _sanitize_json_text(text: str) -> str:
    """
    Tente de rendre un "JSON presque valide" parsable par json.loads:
    - échappe les retours à la ligne dans les strings (Gemini/LLM met parfois de vrais \n)
    - garde les séquences d'échappement existantes
    """
    s = text.strip()
    in_str = False
    escaped = False
    out_chars = []
    for ch in s:
        if in_str:
            if escaped:
                out_chars.append(ch)
                escaped = False
                continue
            if ch == "\\":
                out_chars.append(ch)
                escaped = True
                continue
            if ch == "\n":
                out_chars.append("\\n")
                continue
            if ch == "\r":
                # ignore CR
                continue
            if ch == "\"":
                out_chars.append(ch)
                in_str = False
                continue
            out_chars.append(ch)
            continue
        # not in string
        if ch == "\"":
            out_chars.append(ch)
            in_str = True
            escaped = False
            continue
        out_chars.append(ch)
    return "".join(out_chars)


def _extract_json_block(text: str) -> str:
    """
    Extrait un bloc JSON même s'il est entouré de ``` / 'json' / texte parasite.
    Stratégie robuste: prendre la sous-chaîne entre le 1er '{' et le dernier '}'.
    """
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text.strip()


def _parse_sections(text: str) -> Dict[str, str]:
    try:
        cleaned = _extract_json_block(text)
        cleaned = _sanitize_json_text(cleaned)
        data = json.loads(cleaned)
        wanted_keys = ["induction", "approfondissement", "travail", "integration", "reveil"]
        if all(k in data for k in wanted_keys):
            out: Dict[str, str] = {}
            for k in wanted_keys:
                v = data[k]
                # Si le modèle renvoie un objet/list au lieu d'une string, on "aplati" en texte.
                if isinstance(v, dict):
                    out[k] = "\n".join(str(x) for x in v.values())
                elif isinstance(v, list):
                    out[k] = "\n".join(str(x) for x in v)
                elif isinstance(v, str):
                    # Cas fréquent: string qui ressemble à un dict Python "{'a': 'b'}"
                    s = v.strip()
                    if s.startswith("{") and s.endswith("}") and "':" in s:
                        try:
                            parsed = ast.literal_eval(s)
                            if isinstance(parsed, dict):
                                out[k] = "\n".join(str(x) for x in parsed.values())
                            else:
                                out[k] = str(v)
                        except Exception:
                            out[k] = str(v)
                    else:
                        out[k] = v
                else:
                    out[k] = str(v)
            return out
    except Exception:
        pass
    return DEFAULT_SECTIONS


async def generate_text_sections(prompt: str) -> Dict[str, str]:
    """
    Appelle Ollama (LLama 3) en mode chat et extrait les sections.
    Renvoie un fallback cohérent si l'appel échoue.
    """
    try:
        payload = {
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "Tu produis des scripts d'hypnose structurés en français, format JSON strict.",
                },
                {"role": "user", "content": prompt},
            ],
            # Options Ollama: on force CPU par défaut pour stabilité (beaucoup de setups GPU ont peu de VRAM)
            "options": {"num_gpu": OLLAMA_NUM_GPU},
            "stream": False,
        }
        timeout = httpx.Timeout(OLLAMA_TIMEOUT_S, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            # 2 tentatives: CPU peut être lent, et Ollama peut être occupé.
            for attempt in range(2):
                try:
                    resp = await client.post(OLLAMA_URL, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    text = data.get("message", {}).get("content", "")
                    sections = _parse_sections(text)
                    if sections is DEFAULT_SECTIONS:
                        logger.warning(
                            "LLM response not parsable as expected JSON. Raw content starts with: %r",
                            text[:200],
                        )
                    return sections
                except (httpx.ReadTimeout, httpx.ConnectTimeout) as exc:
                    logger.warning("Ollama timeout (attempt %s/2): %s", attempt + 1, exc)
                    if attempt == 0:
                        continue
                    raise
            resp.raise_for_status()
            data = resp.json()
            text = data.get("message", {}).get("content", "")
            sections = _parse_sections(text)
            if sections is DEFAULT_SECTIONS:
                logger.warning("LLM response not parsable as expected JSON. Raw content starts with: %r", text[:200])
            return sections
    except Exception:
        logger.exception("LLM call failed; returning DEFAULT_SECTIONS")
        return DEFAULT_SECTIONS


async def debug_ollama_once() -> Dict[str, str]:
    """
    Appel simple pour vérifier qu'Ollama répond depuis le process backend.
    """
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": 'Réponds uniquement avec le JSON suivant: {"induction":"ok","approfondissement":"ok","travail":"ok","integration":"ok","reveil":"ok"}',
            }
        ],
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(OLLAMA_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "")
        return {
            "model": MODEL,
            "content_sample": content[:500],
        }

