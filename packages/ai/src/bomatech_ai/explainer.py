"""LLM Explainer — async wrapper over the Anthropic API.

Every call validates the output against the input facts. If the LLM invents a
number, the response is discarded and a deterministic template is used instead.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from bomatech_ai.prompts import (
    SYSTEM_PROMPT,
    build_dashboard_prompt,
    build_insight_prompt,
    build_scenario_prompt,
)
from bomatech_ai.validators import NumberValidationError, validate_numbers

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_TEMPERATURE = 0.3  # low for numerical explanations
DEFAULT_MAX_TOKENS = 280


class LLMExplainer:
    """Thin wrapper: structured input → validated French text."""

    def __init__(
        self,
        client: AsyncAnthropic,
        model: str = DEFAULT_MODEL,
        temperature: float = DEFAULT_TEMPERATURE,
    ) -> None:
        self.client = client
        self.model = model
        self.temperature = temperature

    # ---- Public methods ----

    async def explain_dashboard(self, state: dict[str, Any]) -> str:
        """High-level dashboard summary."""
        prompt = build_dashboard_prompt(state)
        return await self._generate(prompt, facts=state, fallback=self._fallback_dashboard(state))

    async def explain_insight(
        self, facts: dict[str, Any], insight_type: str, level: str
    ) -> str:
        """Reformulate a Decision Engine insight."""
        prompt = build_insight_prompt(facts, insight_type, level)
        return await self._generate(
            prompt, facts=facts, fallback=self._fallback_insight(facts, insight_type, level)
        )

    async def explain_scenario(
        self, scenario: dict[str, Any], result_summary: dict[str, Any]
    ) -> str:
        """Explain a simulation result."""
        prompt = build_scenario_prompt(scenario, result_summary)
        combined = {**scenario, **result_summary}
        return await self._generate(
            prompt, facts=combined, fallback=self._fallback_scenario(scenario, result_summary)
        )

    # ---- Internals ----

    async def _generate(
        self,
        prompt: str,
        facts: dict[str, Any],
        fallback: str,
    ) -> str:
        """Call the LLM, validate, fall back on failure."""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=DEFAULT_MAX_TOKENS,
                temperature=self.temperature,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            text = self._extract_text(response)
            validate_numbers(text, facts)
            return text.strip()
        except NumberValidationError as e:
            logger.warning("LLM hallucination detected, using fallback: %s", e)
            return fallback
        except Exception as e:
            logger.exception("LLM call failed, using fallback: %s", e)
            return fallback

    @staticmethod
    def _extract_text(response: Any) -> str:
        """Extract text from an Anthropic Messages response."""
        blocks = getattr(response, "content", [])
        parts = [getattr(b, "text", "") for b in blocks if getattr(b, "type", "") == "text"]
        return "\n".join(p for p in parts if p).strip()

    # ---- Deterministic fallbacks (no LLM) ----

    @staticmethod
    def _format_euros(cents: int) -> str:
        """Format cents as '87 420 €' with thin non-breaking space."""
        whole = abs(cents) // 100
        sign = "-" if cents < 0 else ""
        return f"{sign}{whole:,} €".replace(",", "\u202f")

    def _fallback_dashboard(self, state: dict[str, Any]) -> str:
        cash = state.get("cash_cents", 0)
        runway = state.get("runway_months")
        parts = [f"Trésorerie actuelle : **{self._format_euros(cash)}**."]
        if runway:
            parts.append(f"Runway estimé : **{runway:.1f} mois**.")
        return " ".join(parts)

    def _fallback_insight(
        self, facts: dict[str, Any], insight_type: str, level: str
    ) -> str:
        # Minimal deterministic version: title only.
        if insight_type == "runway_short":
            return (
                f"Runway de **{facts.get('runway_months', '?')} mois**. "
                "Surveille l'évolution de la trésorerie."
            )
        if insight_type == "concentration":
            client = facts.get("client", "un client")
            share = facts.get("share_pct", 0)
            return (
                f"**{client}** représente environ **{round(share * 100)}%** "
                "de ton chiffre d'affaires récent."
            )
        if insight_type == "margin_negative":
            return "Les charges dépassent actuellement les revenus. À surveiller."
        return f"Alerte {level} détectée."

    def _fallback_scenario(
        self, scenario: dict[str, Any], result: dict[str, Any]
    ) -> str:
        delta = result.get("end_cash_delta_cents", 0)
        risk = result.get("risk_level", "safe")
        sign = "+" if delta >= 0 else ""
        return (
            f"Impact estimé sur la trésorerie : **{sign}{self._format_euros(delta)}**. "
            f"Niveau de risque : **{risk}**."
        )
