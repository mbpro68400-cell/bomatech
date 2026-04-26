"""Unit tests for the Decision Engine."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import uuid4

import pytest

from bomatech_engines.decision import AlertLevel, AlertType, DecisionEngine
from bomatech_engines.financial_state.models import (
    FinancialState,
    Transaction,
    TxKind,
)


@pytest.fixture
def engine() -> DecisionEngine:
    return DecisionEngine()


@pytest.fixture
def company_id():
    return uuid4()


@pytest.fixture
def today():
    return date(2026, 11, 18)


def _make_state(company_id, today, **overrides) -> FinancialState:
    base = dict(
        company_id=company_id,
        as_of=today,
        cash_cents=87_420_00,
        revenue_90d=67_000_00,
        costs_var_90d=41_500_00,
        costs_fix_90d=31_000_00,
        gross_margin_pct=0.38,
        operating_margin_pct=-0.07,
        runway_months=8.5,
        top_client_name="Duval",
        top_client_share_pct=0.20,
    )
    base.update(overrides)
    return FinancialState(**base)


def _tx(
    company_id,
    days_ago: int,
    amount: int,
    kind: TxKind,
    counterparty: str | None = None,
    category: str | None = None,
) -> Transaction:
    return Transaction(
        company_id=company_id,
        date=date(2026, 11, 18) - timedelta(days=days_ago),
        amount_cents=amount,
        kind=kind,
        counterparty=counterparty,
        category=category,
        label="test",
        created_at=datetime(2026, 11, 18) - timedelta(days=days_ago),
    )


class TestRunway:
    def test_no_alert_when_runway_is_comfortable(self, engine, company_id, today):
        s = _make_state(company_id, today, runway_months=12.0)
        insights = engine.evaluate(s, [])
        runway_alerts = [i for i in insights if i.type == AlertType.RUNWAY_SHORT]
        assert runway_alerts == []

    def test_warning_when_runway_under_6(self, engine, company_id, today):
        s = _make_state(company_id, today, runway_months=5.0)
        insights = engine.evaluate(s, [])
        runway = [i for i in insights if i.type == AlertType.RUNWAY_SHORT]
        assert len(runway) == 1
        assert runway[0].level == AlertLevel.WARNING

    def test_critical_when_runway_under_3(self, engine, company_id, today):
        s = _make_state(company_id, today, runway_months=2.0)
        insights = engine.evaluate(s, [])
        runway = [i for i in insights if i.type == AlertType.RUNWAY_SHORT]
        assert len(runway) == 1
        assert runway[0].level == AlertLevel.CRITICAL


class TestConcentration:
    def test_no_alert_under_30pct(self, engine, company_id, today):
        s = _make_state(company_id, today, top_client_share_pct=0.25)
        insights = engine.evaluate(s, [])
        assert not any(i.type == AlertType.CONCENTRATION for i in insights)

    def test_warning_at_34pct(self, engine, company_id, today):
        s = _make_state(company_id, today, top_client_share_pct=0.34)
        insights = engine.evaluate(s, [])
        conc = [i for i in insights if i.type == AlertType.CONCENTRATION]
        assert len(conc) == 1
        assert conc[0].level == AlertLevel.WARNING
        assert conc[0].facts["client"] == "Duval"

    def test_critical_at_55pct(self, engine, company_id, today):
        s = _make_state(company_id, today, top_client_share_pct=0.55)
        insights = engine.evaluate(s, [])
        conc = [i for i in insights if i.type == AlertType.CONCENTRATION]
        assert len(conc) == 1
        assert conc[0].level == AlertLevel.CRITICAL


class TestMarginNegative:
    def test_critical_when_operating_margin_negative(self, engine, company_id, today):
        # Note: our fixture has operating_margin=-0.07 by default
        s = _make_state(company_id, today, operating_margin_pct=-0.15)
        insights = engine.evaluate(s, [])
        neg = [i for i in insights if i.type == AlertType.MARGIN_NEGATIVE]
        assert len(neg) == 1
        assert neg[0].level == AlertLevel.CRITICAL


class TestCostAnomalies:
    def test_detects_50pct_growth_in_category(self, engine, company_id, today):
        s = _make_state(company_id, today)
        txs = [
            # Previous 90d: 1000 total in SaaS
            _tx(company_id, 120, -500_00, TxKind.COST_FIX, category="saas"),
            _tx(company_id, 150, -500_00, TxKind.COST_FIX, category="saas"),
            # Recent 90d: 2000 total in SaaS (+100%)
            _tx(company_id, 30, -1000_00, TxKind.COST_FIX, category="saas"),
            _tx(company_id, 60, -1000_00, TxKind.COST_FIX, category="saas"),
        ]
        insights = engine.evaluate(s, txs)
        anomalies = [i for i in insights if i.type == AlertType.COST_ANOMALY]
        assert len(anomalies) == 1
        assert anomalies[0].facts["category"] == "saas"
        assert anomalies[0].level == AlertLevel.CRITICAL  # +100% = critical


class TestFacts:
    def test_insights_always_include_raw_numbers(self, engine, company_id, today):
        """Every insight must have `facts` populated for the LLM layer."""
        s = _make_state(
            company_id, today,
            runway_months=2.0,
            top_client_share_pct=0.6,
            operating_margin_pct=-0.2,
        )
        insights = engine.evaluate(s, [])
        assert all(isinstance(i.facts, dict) and len(i.facts) > 0 for i in insights)
