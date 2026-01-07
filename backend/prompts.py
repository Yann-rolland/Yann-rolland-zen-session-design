from models import GenerationRequest

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


def build_prompt(req: GenerationRequest) -> str:
    """
    Construit un prompt détaillé pour guider Llama 3 afin d'obtenir
    un JSON structuré par phases avec les formulations PNL obligatoires.
    """
    pnl_clause = "; ".join(PNL_PHRASES)
    return f"""
Tu es un hypnothérapeute expert. Produis un JSON STRICT, sans texte avant/après, sans Markdown, sans ```.
IMPORTANT: chaque valeur DOIT être une CHAÎNE de texte (string). Pas d'objet, pas de liste.
Respecte STRICTEMENT les clés et le type:
{{
  "induction": "...",
  "approfondissement": "...",
  "travail": "...",
  "integration": "...",
  "reveil": "..."
}}

Contraintes:
- Langue: français, ton chaleureux, permissif.
- Objectif: {req.objectif}.
- Durée totale cible: {req.duree_minutes} minutes.
- Style: {req.style}.
- Chaque phase doit inclure explicitement les formulations PNL suivantes (au moins 4 par phase): {pnl_clause}.
- Phases:
  1) Induction: respiration, détente progressive, métaphores lentes.
  2) Approfondissement: comptage, descente symbolique, ralentissement cognitif.
  3) Travail: recadrage, visualisation, futurisation, ancrage positif.
  4) Intégration: suggestions post-hypnotiques, répétitions subtiles, langage permissif.
  5) Réveil: comptage inverse, réorientation sensorielle, état positif et stable.
- Longueur: phrases courtes, fluides, et un paragraphe cohérent par phase.

Réponds uniquement avec le JSON parsable.
"""

