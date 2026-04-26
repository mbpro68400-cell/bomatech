"""Financial State Engine — incremental state machine over the transactions journal.

Design:
  * `apply(state, tx)` is a PURE function. Given the same state and tx, it always
    produces the same new state. No I/O, no randomness.
  * The engine is incremental: applying N transactions one by one yields the
    same state as applying them in a single batch.
  * `recompute_full(transactions, as_of)` rebuilds a state from scratch. Used as
    a nightly job to catch any drift from incremental updates.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from uuid import UUID

from bomatech_engines.financial_state.models import (
    FinancialState,
    Transaction,
    TxKind,
)


class FinancialStateEngine:
    """Stateless engine. Hold no references to DB; caller wires persistence."""

    # ---- Factory helpers ----

    def empty_state(self, company_id: UUID, as_of: date) -> FinancialState:
        return FinancialState.empty(company_id, as_of)

    # ---- Core: incremental apply ----

    def apply(self, state: FinancialState, tx: Transaction) -> FinancialState:
        """Return a NEW state with `tx` applied. `state` is not mutated."""
        if tx.company_id != state.company_id:
            raise ValueError("Transaction company mismatch")

        new = state.model_copy(deep=True)
        new.version += 1
        new.cash_cents += tx.amount_cents
        new.transaction_count += 1
        new.last_transaction_at = tx.created_at

        # Rolling window updates
        days_old = (state.as_of - tx.date).days

        if 0 <= days_old <= 30 and tx.kind == TxKind.REVENUE:
            new.revenue_30d += tx.amount_cents

        if 0 <= days_old <= 90:
            if tx.kind == TxKind.REVENUE:
                new.revenue_90d += tx.amount_cents
            elif tx.kind == TxKind.COST_VAR:
                new.costs_var_90d += abs(tx.amount_cents)
            elif tx.kind == TxKind.COST_FIX:
                new.costs_fix_90d += abs(tx.amount_cents)

        if 0 <= days_old <= 365 and tx.kind == TxKind.REVENUE:
            new.revenue_365d += tx.amount_cents

        # VAT bookkeeping (simplified: current quarter only)
        if tx.vat_amount_cents is not None and self._in_current_quarter(tx.date, state.as_of):
            if tx.kind == TxKind.REVENUE:
                new.vat_collected_quarter_cents += tx.vat_amount_cents
            elif tx.kind in (TxKind.COST_VAR, TxKind.COST_FIX, TxKind.CAPEX):
                new.vat_deductible_quarter_cents += tx.vat_amount_cents
            new.vat_balance_cents = (
                new.vat_collected_quarter_cents - new.vat_deductible_quarter_cents
            )

        # Recompute derived ratios
        new = self._recompute_ratios(new)
        return new

    def recompute_full(
        self,
        company_id: UUID,
        transactions: list[Transaction],
        as_of: date,
    ) -> FinancialState:
        """Rebuild state from scratch. Deterministic."""
        state = self.empty_state(company_id, as_of)
        # Sort by (date, created_at) to ensure deterministic ordering
        ordered = sorted(transactions, key=lambda t: (t.date, t.created_at))
        for tx in ordered:
            state = self.apply(state, tx)
        state = self._recompute_concentration(state, transactions)
        return state

    # ---- Derived calculations ----

    def _recompute_ratios(self, s: FinancialState) -> FinancialState:
        if s.revenue_90d > 0:
            s.gross_margin_pct = round(
                (s.revenue_90d - s.costs_var_90d) / s.revenue_90d, 4
            )
            s.operating_margin_pct = round(
                (s.revenue_90d - s.costs_var_90d - s.costs_fix_90d) / s.revenue_90d, 4
            )
        else:
            s.gross_margin_pct = 0.0
            s.operating_margin_pct = 0.0

        monthly_costs = (s.costs_var_90d + s.costs_fix_90d) / 3.0
        monthly_revenue = s.revenue_90d / 3.0
        burn = monthly_costs - monthly_revenue
        s.burn_rate_monthly_cents = int(burn)

        if burn > 0 and s.cash_cents > 0:
            s.runway_months = round(s.cash_cents / burn, 2)
        else:
            s.runway_months = None

        return s

    def _recompute_concentration(
        self, s: FinancialState, transactions: list[Transaction]
    ) -> FinancialState:
        """Compute the share of the largest client over the last 90 days."""
        window = [
            t
            for t in transactions
            if t.kind == TxKind.REVENUE
            and 0 <= (s.as_of - t.date).days <= 90
            and t.counterparty
        ]
        if not window:
            s.top_client_name = None
            s.top_client_share_pct = 0.0
            return s

        totals: dict[str, int] = defaultdict(int)
        grand_total = 0
        for t in window:
            assert t.counterparty is not None  # narrowed above
            totals[t.counterparty] += t.amount_cents
            grand_total += t.amount_cents

        top_name = max(totals, key=lambda k: totals[k])
        s.top_client_name = top_name
        s.top_client_share_pct = (
            round(totals[top_name] / grand_total, 4) if grand_total > 0 else 0.0
        )
        return s

    # ---- Utilities ----

    @staticmethod
    def _in_current_quarter(tx_date: date, as_of: date) -> bool:
        """Check if tx_date is in the same calendar quarter as as_of."""
        q_tx = (tx_date.month - 1) // 3
        q_ref = (as_of.month - 1) // 3
        return tx_date.year == as_of.year and q_tx == q_ref
