# bomatech-engines

Pure Python engines for Bomatech. **No I/O, no DB, no HTTP** — these are deterministic, testable functions.

## Engines

| Engine | Role |
|---|---|
| `financial_state` | Maintains the current state from the journal of transactions (source of truth) |
| `simulation` | Runs what-if scenarios against a baseline |
| `decision` | Rule-based engine that emits structured insights from a state |
| `forecast` | Projects the state forward using EWMA + linear trend + seasonality |

## Install

```bash
uv sync
```

## Test

```bash
uv run pytest
```

## Usage

```python
from bomatech_engines.financial_state import FinancialStateEngine, Transaction, TxKind
from bomatech_engines.simulation import SimulationEngine, Scenario
from bomatech_engines.decision import DecisionEngine
from bomatech_engines.forecast import ForecastEngine

# Apply transactions to build state
fs = FinancialStateEngine()
state = fs.empty_state(company_id=uuid4(), as_of=date.today())
for tx in transactions:
    state = fs.apply(state, tx)

# Detect issues
decision = DecisionEngine()
insights = decision.evaluate(state, transactions)

# Project forward
forecast = ForecastEngine()
points = forecast.project(state, history, months=6)

# Run a scenario
sim = SimulationEngine(forecast)
result = sim.run(state, history, Scenario(revenue_delta_pct=0.10, horizon_months=6))
```

## Design principles

- **Money is integer cents.** Never float, never Decimal in hot paths.
- **Engines are pure.** They take data in, produce data out. No side effects.
- **Facts over opinions.** Insights include raw numbers; humanization is the LLM layer's job.
- **Deterministic.** Same input → same output. No randomness, no time of day.
