"""Bomatech AI — LLM explanation layer."""

from bomatech_ai.explainer import LLMExplainer
from bomatech_ai.prompts import SYSTEM_PROMPT
from bomatech_ai.validators import NumberValidationError, validate_numbers

__version__ = "0.1.0"

__all__ = [
    "LLMExplainer",
    "NumberValidationError",
    "SYSTEM_PROMPT",
    "validate_numbers",
]
