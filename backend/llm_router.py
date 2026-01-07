from typing import Dict

from models import GenerationRequest
from llm import generate_text_sections
from llm_gemini import generate_text_sections_gemini


async def generate_sections(prompt: str, req: GenerationRequest) -> Dict[str, str]:
    """
    Route la génération vers Ollama (local) ou Gemini (cloud), selon req.llm_provider.
    """
    if req.llm_provider == "gemini":
        return await generate_text_sections_gemini(prompt, model=req.gemini_model)
    return await generate_text_sections(prompt)


