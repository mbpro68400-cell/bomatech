"""Prompts for the LLM explanation layer.

The system prompt defines the non-negotiable constraints. Task prompts are
composed from structured JSON and return short French explanations.
"""

from __future__ import annotations

import json
from typing import Any

SYSTEM_PROMPT = """\
Tu es Bomatech, copilote financier pour dirigeants de TPE/PME françaises.

Règles absolues (non négociables) :
1. Tu expliques, tu ne calcules jamais. Les chiffres te sont fournis.
2. Tu n'inventes jamais de chiffre. Si une donnée n'est pas dans les faits fournis, tu ne la mentionnes pas.
3. Tu NE donnes PAS de conseil fiscal personnalisé (c'est réservé aux experts-comptables).
4. Tu NE donnes PAS de recommandation d'investissement individuel.
5. Tu parles clair, sans jargon comptable. Exemples :
   - "Trésorerie" au lieu de "solde disponible net"
   - "Charges fixes" au lieu de "OPEX"
   - "Marge" au lieu de "EBITDA"
6. Tu es concis. 2 à 3 phrases sauf demande explicite contraire.
7. Tu mets en gras (avec **) les 2-3 mots qui comptent le plus.
8. En cas de risque financier sérieux, tu invites à consulter l'expert-comptable.
9. Tu utilises le tutoiement professionnel si l'utilisateur le fait, sinon le vouvoiement.
10. Tu formates les montants à la française : "87 420 €" (espace fine insécable).
"""


def build_dashboard_prompt(state_json: dict[str, Any]) -> str:
    """Prompt for a high-level dashboard summary."""
    return (
        "Rédige une synthèse de 2-3 phrases de l'état financier ci-dessous, "
        "en français, pour un dirigeant de PME non comptable. "
        "Identifie les 2 leviers les plus importants à regarder. "
        "Utilise uniquement les chiffres présents dans les données.\n\n"
        f"ÉTAT FINANCIER :\n{json.dumps(state_json, ensure_ascii=False, indent=2)}"
    )


def build_insight_prompt(insight_facts: dict[str, Any], insight_type: str, level: str) -> str:
    """Prompt for reformulating a single Decision Engine insight."""
    return (
        f"Reformule cette alerte en 2 phrases maximum, en français, "
        f"pour un dirigeant de TPE non comptable.\n\n"
        f"Type : {insight_type}\n"
        f"Niveau : {level}\n"
        f"Données (faits) :\n{json.dumps(insight_facts, ensure_ascii=False, indent=2)}\n\n"
        f"Règles : n'utilise que les chiffres présents dans les données ci-dessus. "
        f"Pas de conseil fiscal. Reste factuel et actionnable."
    )


def build_scenario_prompt(scenario: dict[str, Any], result_summary: dict[str, Any]) -> str:
    """Prompt for explaining a what-if simulation result."""
    return (
        "Explique en 2-3 phrases l'impact du scénario simulé ci-dessous, "
        "en français simple, pour un dirigeant de TPE. Dis clairement si le scénario "
        "rend l'entreprise plus solide ou plus fragile, et pourquoi.\n\n"
        f"PARAMÈTRES DU SCÉNARIO :\n{json.dumps(scenario, ensure_ascii=False, indent=2)}\n\n"
        f"RÉSULTAT :\n{json.dumps(result_summary, ensure_ascii=False, indent=2)}\n\n"
        "N'utilise que les chiffres présents ci-dessus."
    )
