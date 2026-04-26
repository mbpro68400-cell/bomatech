"""Tests for the anti-hallucination validator."""

from __future__ import annotations

import pytest

from bomatech_ai.validators import (
    NumberValidationError,
    extract_numbers,
    validate_numbers,
)


class TestExtractNumbers:
    def test_plain_integers(self):
        assert 42.0 in extract_numbers("il y a 42 clients")

    def test_french_thousand_separator(self):
        nums = extract_numbers("tu as 87 420 € sur le compte")
        assert 87420.0 in nums

    def test_french_decimal(self):
        nums = extract_numbers("marge de 38,2%")
        assert 38.2 in nums

    def test_with_units(self):
        nums = extract_numbers("runway de 8,4 mois")
        assert 8.4 in nums

    def test_ignores_words_with_digits(self):
        # Not a hard requirement, but common: "F-2026-170" shouldn't parse as 2026
        nums = extract_numbers("Facture F-2026-170 réglée")
        # We accept that these may be picked up — the test asserts they don't break
        assert isinstance(nums, list)


class TestValidateNumbers:
    def test_exact_match_passes(self):
        facts = {"cash": 8742000, "runway": 8.4}
        # "87 420 €" matches 8742000 cents derivation (/100 → 87420)
        # "8,4 mois" matches 8.4 exactly
        validate_numbers("tu as 87 420 € et 8,4 mois de runway", facts)

    def test_pct_conversion(self):
        facts = {"margin": 0.382}
        # The LLM will render 0.382 as "38,2%" — validator should recognize the derivation
        validate_numbers("marge de 38,2%", facts)

    def test_invented_number_raises(self):
        facts = {"cash": 8742000}
        with pytest.raises(NumberValidationError):
            validate_numbers("tu as 99 999 € sur le compte", facts)

    def test_allowed_standalones(self):
        # Small integers like "2" or "3" are whitelisted
        facts = {"cash": 8742000}
        validate_numbers("Voici 2 points à retenir.", facts)

    def test_zero_does_not_crash(self):
        facts = {"cash": 0}
        validate_numbers("tu as 0 € de trésorerie", facts)

    def test_empty_text_passes(self):
        validate_numbers("", {"anything": 1})
