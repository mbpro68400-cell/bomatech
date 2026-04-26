"""Unit tests for the Financial State Engine."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import uuid4

import pytest

from bomatech_engines.financial_state import (
    FinancialState,
    FinancialStateEngine,
    Transaction,
    TxKind,
)


@pytest.fixture
def engine() -> FinancialStateEngine:
    return FinancialStateEngine()


@pytest.fixture
def company_id():
    return uuid4()


@pytest.fixture
def today():
    return date(2026, 11, 18)


def _tx(
    company_id,
    days_ago: int,
    amount: int,
    kind: TxKind,
    counterparty: str | None = None,
    category: str | None = None,
) -> Transaction:
    """Build a transaction shortcut."""
    return Transaction(
        company_id=company_id,
        date=date(2026, 11, 18) - timedelta(days=days_ago),
        amount_cents=amount,
        kind=kind,
        counterparty=counterparty,
        category=category,
        label=f"Test tx {amount}",
        created_at=datetime(2026, 11, 18) - timedelta(days=days_ago),
    )


class TestApply:
    def test_empty_state_has_zero_values(self, engine, company_id, today):
        s = engine.empty_state(company_id, today)
        assert s.cash_cents == 0
        assert s.revenue_90d == 0
        assert s.runway_months is None

    def test_revenue_increases_cash(self, engine, company_id, today):
        s = engine.empty_state(company_id, today)
        tx = _tx(company_id, days_ago=1, amount=420_00, kind=TxKind.REVENUE)
        s = engine.apply(s, tx)
        assert s.cash_cents == 420_00
        assert s.revenue_30d == 420_00
        assert s.revenue_90d == 420_00

    def test_expense_decreases_cash(self, engine, company_id, today):
        s = engine.empty_state(company_id, today)
        tx = _tx(company_id, days_ago=1, amount=-148_00, kind=TxKind.COST_FIX)
        s = engine.apply(s, tx)
        assert s.cash_cents == -148_00
        assert s.costs_fix_90d == 148_00

    def test_apply_is_pure_does_not_mutate_input(self, engine, company_id, today):
        s = engine.empty_state(company_id, today)
        tx = _tx(company_id, days_ago=1, amount=100_00, kind=TxKind.REVENUE)
        s2 = engine.apply(s, tx)
        assert s.cash_cents == 0  # original unchanged
        assert s2.cash_cents == 100_00
        assert s2.version == s.version + 1

    def test_transaction_outside_90d_window_does_not_affect_rolling(
        self, engine, company_id, today
    ):
        s = engine.empty_state(company_id, today)
        tx_old = _tx(company_id, days_ago=120, amount=500_00, kind=TxKind.REVENUE)
        s = engine.apply(s, tx_old)
        assert s.cash_cents == 500_00  # cash still increases
        assert s.revenue_90d == 0  # but outside window
        assert s.revenue_30d == 0

    def test_company_mismatch_raises(self, engine, company_id, today):
        s = engine.empty_state(company_id, today)
        other = uuid4()
        tx = Transaction(
            company_id=other,
            date=today,
            amount_cents=100_00,
            kind=TxKind.REVENUE,
            label="wrong company",
        )
        with pytest.raises(ValueError):
            engine.apply(s, tx)


class TestRatios:
    def test_gross_margin_computed_correctly(self, engine, company_id, today):
        s = engine.empty_state(company_id, today)
        s = engine.apply(s, _tx(company_id, 1, 1_000_00, TxKind.REVENUE))
        s = engine.apply(s, _tx(company_id, 1, -400_00, TxKind.COST_VAR))
        # margin = (1000 - 400) / 1000 = 0.6
        assert s.gross_margin_pct == pytest.approx(0.6, rel=1e-3)

    def test_runway_none_when_no_burn(self, engine, company_id, today):
        """If costs < revenue, there is no burn — runway is None (effectively infinite)."""
        s = engine.empty_state(company_id, today)
        s = engine.apply(s, _tx(company_id, 1, 10_000_00, TxKind.REVENUE))
        s = engine.apply(s, _tx(company_id, 1, -1_000_00, TxKind.COST_FIX))
        assert s.runway_months is None

    def test_runway_computed_when_burn_positive(self, engine, company_id, today):
        """With no revenue and fixed costs, burn is positive."""
        s = engine.empty_state(company_id, today)
        # Seed cash with non-90d-window income so cash > 0
        s = engine.apply(s, _tx(company_id, 200, 100_000_00, TxKind.REVENUE))
        # Add cost inside 90d window
        s = engine.apply(s, _tx(company_id, 10, -3_000_00, TxKind.COST_FIX))
        assert s.runway_months is not None
        assert s.runway_months > 0


class TestRecomputeFull:
    def test_full_recompute_matches_incremental(self, engine, company_id, today):
        """Full recompute should match applying transactions one-by-one."""
        txs = [
            _tx(company_id, 80, 500_00, TxKind.REVENUE),
            _tx(company_id, 60, -200_00, TxKind.COST_VAR),
            _tx(company_id, 40, 800_00, TxKind.REVENUE),
            _tx(company_id, 20, -150_00, TxKind.COST_FIX),
            _tx(company_id, 5, 300_00, TxKind.REVENUE),
        ]

        # Incremental
        s_inc = engine.empty_state(company_id, today)
        for tx in txs:
            s_inc = engine.apply(s_inc, tx)

        # Full recompute
        s_full = engine.recompute_full(company_id, txs, today)

        assert s_inc.cash_cents == s_full.cash_cents
        assert s_inc.revenue_90d == s_full.revenue_90d
        assert s_inc.costs_var_90d == s_full.costs_var_90d
        assert s_inc.costs_fix_90d == s_full.costs_fix_90d


class TestConcentration:
    def test_top_client_detected_after_full_recompute(self, engine, company_id, today):
        txs = [
            _tx(company_id, 20, 500_00, TxKind.REVENUE, counterparty="Duval"),
            _tx(company_id, 30, 400_00, TxKind.REVENUE, counterparty="Duval"),
            _tx(company_id, 40, 100_00, TxKind.REVENUE, counterparty="Belmont"),
        ]
        s = engine.recompute_full(company_id, txs, today)
        assert s.top_client_name == "Duval"
        assert s.top_client_share_pct == pytest.approx(0.9, rel=1e-3)  # 900/1000
