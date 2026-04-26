"""Anti-hallucination validator.

Extracts every number from an LLM response and verifies that each one is
present (or derivable in a trivial way) from the structured facts passed to
the LLM. If any number is invented, `validate_numbers` raises.

This is a guardrail. It does not replace careful prompt design, but it catches
the most common failure mode — the LLM confidently stating a figure that was
never in the input.
"""

from __future__ import annotations

import re
from typing import Any


class NumberValidationError(Exception):
    """Raised when the LLM output contains a number not found in the source facts."""


# Match integers, decimals (with . or ,), percentages, and French money formats.
# Examples matched: "12", "12,5", "12.5", "87 420", "87 420 €", "38,2%", "8,4 mois"
_NUMBER_PATTERN = re.compile(
    r"(?<![a-zA-Z])"                       # not preceded by a letter
    r"(\d{1,3}(?:[\s  ]\d{3})+|\d+)"       # integer with optional thousand separators
    r"(?:[,.]\d+)?"                         # optional decimal part
    r"(?:\s?%|\s?€|\s?mois|\s?ans?|\s?jours?)?"  # optional unit
)

# Numbers we always allow (trivially derivable or context-free)
_ALLOWED_STANDALONES = {0, 1, 2, 3, 4, 5, 10, 12, 100}


def extract_numbers(text: str) -> list[float]:
    """Return all numeric values mentioned in text, normalized to floats."""
    found: list[float] = []
    for match in _NUMBER_PATTERN.finditer(text):
        raw = match.group(0)
        # Strip units
        cleaned = re.sub(r"[%€a-zA-Z]", "", raw).strip()
        # Normalize French thousand/decimal separators
        # "87 420,5" → "87420.5"
        cleaned = cleaned.replace("\u00a0", " ").replace("\u202f", " ")
        cleaned = cleaned.replace(" ", "")
        cleaned = cleaned.replace(",", ".")
        try:
            found.append(float(cleaned))
        except ValueError:
            continue
    return found


def _collect_facts_numbers(facts: Any, out: list[float] | None = None) -> list[float]:
    """Recursively collect every number present in the facts structure."""
    if out is None:
        out = []
    if isinstance(facts, (int, float)) and not isinstance(facts, bool):
        out.append(float(facts))
    elif isinstance(facts, dict):
        for v in facts.values():
            _collect_facts_numbers(v, out)
    elif isinstance(facts, (list, tuple)):
        for v in facts:
            _collect_facts_numbers(v, out)
    # Strings / booleans / None ignored
    return out


def validate_numbers(text: str, facts: dict[str, Any], tolerance: float = 0.02) -> None:
    """Verify that every number in `text` is present in `facts`.

    `tolerance` is the relative tolerance when comparing (2% by default), which
    accounts for rounding ("8,4 mois" when the fact is 8.42).

    Also tries common derivations:
      - percentage conversion (0.382 → 38.2)
      - cents → euros (87_420_00 → 87 420)

    Raises NumberValidationError on a mismatch.
    """
    if not text.strip():
        return

    text_numbers = extract_numbers(text)
    fact_numbers = _collect_facts_numbers(facts)

    # Precompute derived forms of each fact number
    derived: set[float] = set()
    for n in fact_numbers:
        derived.add(round(n, 4))
        # % conversion: 0.382 → 38.2
        if 0 < abs(n) < 1:
            derived.add(round(n * 100, 4))
        # cents → euros
        if abs(n) >= 100 and n == int(n):
            derived.add(round(n / 100, 4))

    def _matches_any(x: float) -> bool:
        if x in _ALLOWED_STANDALONES:
            return True
        for d in derived:
            if d == 0:
                if x == 0:
                    return True
                continue
            if abs((x - d) / d) <= tolerance:
                return True
        return False

    for x in text_numbers:
        if not _matches_any(x):
            raise NumberValidationError(
                f"LLM output contains number {x!r} that is not present in facts. "
                f"Available: {sorted(set(fact_numbers))[:10]}"
            )
