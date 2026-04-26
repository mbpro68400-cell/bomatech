# Engines

Les quatre moteurs qui constituent le cœur métier de Bomatech.

## Financial State Engine

**Rôle** : maintenir un snapshot de l'état financier à partir du journal de transactions.

**API** :

```python
engine = FinancialStateEngine()
state = engine.empty_state(company_id, as_of=date.today())
state = engine.apply(state, transaction)   # pure, non-mutating
state = engine.recompute_full(company_id, transactions, as_of)
```

**Propriétés garanties** :

- `apply` est pure : `apply(s, tx)` produit toujours le même `s'` pour les mêmes `s` et `tx`.
- Le mode incrémental et le mode full-recompute produisent le même résultat.
- `version` est monotone (utile pour l'optimistic concurrency).

## Forecast Engine

**Rôle** : projeter cash/revenue/net sur N mois.

**Algorithme** :

```
forecast[i] = 0.5 · EWMA + 0.3 · trend_linéaire + 0.2 · (EWMA + saisonnalité)
```

- EWMA : pondération exponentielle favorisant les mois récents
- Trend : régression linéaire sur la série complète
- Saisonnalité : écart mensuel vs moyenne sur les 12 derniers mois (si disponibles)

**Fallback** : si l'historique < 3 mois, projection naïve depuis les moyennes 90j de l'état.

## Simulation Engine

**Rôle** : appliquer des deltas de scénario à une baseline forecast.

**Invariant critique** :

```python
sim.run(state, history, Scenario()).summary.end_cash_delta_cents == 0
```

Autrement dit : avec tous les sliders à zéro, le scénario est identique à la baseline. C'est testé dans `test_simulation.py::test_zero_delta_matches_baseline`.

**Deltas supportés** :

- `revenue_delta_pct` : variation relative du CA mensuel
- `recurring_charges_delta_cents` : charges fixes additionnelles par mois
- `one_shot_capex_cents` : sortie ponctuelle à t=0
- `gross_margin_delta_pts` : variation de la marge brute (en points)
- `lost_client_share_pct` : perte d'un client (effet à partir du M+1)
- `new_hire_monthly_cost_cents` : embauche (salaire + charges)

## Decision Engine

**Rôle** : détecter les situations notables via des règles déterministes.

**Alertes actuellement implémentées** :

| Type | Condition | Niveau |
|---|---|---|
| `runway_short` | runway < 6 mois | `warning` |
| `runway_short` | runway < 3 mois | `critical` |
| `concentration` | top client ≥ 30% du CA 90j | `warning` |
| `concentration` | top client ≥ 50% du CA 90j | `critical` |
| `margin_negative` | marge opérationnelle < 0% | `critical` |
| `cost_anomaly` | catégorie +50% vs 90j précédents | `warning` |
| `cost_anomaly` | catégorie +100% vs 90j précédents | `critical` |
| `margin_improving` | marge brute > 40% | `positive` |

**Chaque Insight contient** :

- `facts` : dict avec TOUS les nombres utilisés (pour le LLM)
- `source_refs` : liste d'UUIDs de transactions liées
- `level` : info / warning / critical / positive
- `type` : catégorisation stable pour l'UI

## Tests

```bash
cd packages/engines
uv run pytest -v
```

30+ tests couvrent les engines. À maintenir à ≥90% de couverture.
