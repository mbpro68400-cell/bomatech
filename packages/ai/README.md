# bomatech-ai

LLM layer for Bomatech. **Explanation only, never calculation.**

## Principle

The LLM receives structured JSON (a `FinancialState`, an `Insight`, a `SimulationResult`) and produces natural-language French text for the dirigeant. It never multiplies, forecasts, or estimates — those jobs belong to `packages/engines`.

## Anti-hallucination

Three guardrails:

1. **Fact extraction** — every number that appears in the LLM's output is extracted via regex and compared against the `facts` dict of the input. If a number is not present in the input, the response is rejected and a deterministic template fallback is used.
2. **Low temperature** — explanations of numerical data use `temperature=0.3`. Higher temperatures are only used for tone/synthesis tasks where no numbers are generated.
3. **System prompt constraints** — the system prompt forbids fiscal advice and invented numbers, and is tested via a golden-set eval in CI.

## Usage

```python
from bomatech_ai import LLMExplainer
from anthropic import AsyncAnthropic

client = AsyncAnthropic(api_key="sk-ant-...")
explainer = LLMExplainer(client)

# Explain an insight
text = await explainer.explain_insight(insight)

# Explain a dashboard state
text = await explainer.explain_dashboard(state)

# Explain a simulation
text = await explainer.explain_scenario(scenario, result)
```
