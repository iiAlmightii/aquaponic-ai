"""
tests/test_financial_service.py — Unit tests for the financial planning engine.
Run: pytest tests/ -v
"""

import pytest
from services.financial_service import FinancialCalculator, FinancialInputs


@pytest.fixture
def base_inputs():
    return FinancialInputs(
        infrastructure_cost=300_000,
        equipment_cost=150_000,
        initial_stock_cost=50_000,
        monthly_feed_cost=8_000,
        monthly_labor_cost=15_000,
        monthly_utilities_cost=5_000,
        monthly_maintenance_cost=2_000,
        monthly_fish_revenue=40_000,
        monthly_crop_revenue=15_000,
        land_area_sqm=1_000,
        horizon_months=24,
    )


@pytest.fixture
def calc():
    return FinancialCalculator()


# ── CAPEX / OPEX ───────────────────────────────────────────────────────────────

class TestFinancialInputs:
    def test_total_capex(self, base_inputs):
        assert base_inputs.total_capex == 500_000

    def test_monthly_opex(self, base_inputs):
        assert base_inputs.monthly_opex == 30_000

    def test_monthly_revenue(self, base_inputs):
        assert base_inputs.monthly_revenue == 55_000

    def test_monthly_net_positive(self, base_inputs):
        assert base_inputs.monthly_net == 25_000

    def test_zero_revenue_negative_net(self):
        inp = FinancialInputs(monthly_labor_cost=10_000)
        assert inp.monthly_net == -10_000


# ── Metrics Computation ────────────────────────────────────────────────────────

class TestFinancialCalculator:
    def test_base_scenario_roi(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        # Annual net = 25k * 12 = 300k; CAPEX = 500k; ROI = 60%
        assert metrics.roi_percent == pytest.approx(60.0, rel=0.01)

    def test_payback_period(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        # Payback = 500_000 / 25_000 = 20 months
        assert metrics.payback_period_months == pytest.approx(20.0, rel=0.01)

    def test_break_even_month(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        # Cumulative cash flow turns positive at month 20
        assert metrics.break_even_month == 20

    def test_pessimistic_lower_roi(self, calc, base_inputs):
        base    = calc.compute(base_inputs, scenario_factor=1.0)
        pessim  = calc.compute(base_inputs, scenario_factor=0.75)
        assert pessim.roi_percent < base.roi_percent

    def test_optimistic_higher_roi(self, calc, base_inputs):
        base   = calc.compute(base_inputs, scenario_factor=1.0)
        optim  = calc.compute(base_inputs, scenario_factor=1.3)
        assert optim.roi_percent > base.roi_percent

    def test_cash_flows_length(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        assert len(metrics.cash_flows) == base_inputs.horizon_months

    def test_cash_flows_structure(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        first = metrics.cash_flows[0]
        assert 'month' in first
        assert 'revenue' in first
        assert 'opex' in first
        assert 'cumulative' in first

    def test_npv_positive_profitable(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        assert metrics.npv > 0

    def test_npv_negative_unprofitable(self, calc):
        inp = FinancialInputs(
            infrastructure_cost=1_000_000,
            monthly_fish_revenue=5_000,
            monthly_crop_revenue=0.0,
            monthly_other_revenue=0.0,
            monthly_labor_cost=10_000,
            horizon_months=12,
        )
        metrics = calc.compute(inp)
        assert metrics.npv < 0

    def test_no_payback_when_losing_money(self, calc):
        inp = FinancialInputs(
            infrastructure_cost=500_000,
            monthly_labor_cost=30_000,
            monthly_fish_revenue=10_000,
        )
        metrics = calc.compute(inp)
        assert metrics.payback_period_months is None

    def test_zero_capex_infinite_roi(self, calc):
        inp = FinancialInputs(monthly_fish_revenue=50_000, monthly_labor_cost=10_000)
        metrics = calc.compute(inp)
        assert metrics.roi_percent == 0.0  # division by zero guard → 0

    def test_irr_reasonable_range(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        if metrics.irr_percent is not None:
            assert 0 < metrics.irr_percent < 500   # sanity bounds

    def test_per_sqm_metrics_use_real_land_area(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        assert metrics.revenue_per_sqm == pytest.approx(660.0, rel=0.01)
        assert metrics.profit_per_sqm == pytest.approx(300.0, rel=0.01)
        assert metrics.capex_per_sqm == pytest.approx(500.0, rel=0.01)
        assert metrics.opex_per_sqm == pytest.approx(360.0, rel=0.01)

    def test_margin_and_cost_mix_percentages(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        assert metrics.profit_margin_percent == pytest.approx(45.45, rel=0.01)
        assert metrics.opex_as_percent_of_revenue == pytest.approx(54.55, rel=0.01)
        assert metrics.cost_of_goods_sold_percent == pytest.approx(14.55, rel=0.01)

    def test_revenue_mix_shares_sum_to_100(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        total = (
            metrics.fish_revenue_share_percent
            + metrics.crop_revenue_share_percent
            + metrics.other_revenue_share_percent
        )
        assert total == pytest.approx(100.0, rel=0.001)

    def test_opex_mix_shares_sum_to_100(self, calc, base_inputs):
        metrics = calc.compute(base_inputs)
        total = (
            metrics.feed_cost_share_percent
            + metrics.labor_cost_share_percent
            + metrics.utilities_cost_share_percent
            + metrics.maintenance_cost_share_percent
            + metrics.other_cost_share_percent
        )
        assert total == pytest.approx(100.0, rel=0.001)


# ── Questionnaire Engine ───────────────────────────────────────────────────────

class TestQuestionnaireEngine:
    def setup_method(self):
        from services.questionnaire_engine import QuestionnaireEngine, QUESTION_BANK
        self.engine = QuestionnaireEngine(QUESTION_BANK)

    def test_first_question_returned(self):
        context = {"answered": [], "answers": {}}
        q = self.engine.get_next_question(context)
        assert q is not None
        assert q.id == "farm_name"

    def test_skips_answered_questions(self):
        context = {
            "answered": ["farm_name"],
            "answers":  {"farm_name": "Test Farm"},
        }
        q = self.engine.get_next_question(context)
        assert q is not None
        assert q.id != "farm_name"

    def test_none_when_complete(self):
        from services.questionnaire_engine import QUESTION_BANK
        all_ids = [q.id for q in QUESTION_BANK]
        context = {"answered": all_ids, "answers": {q: "val" for q in all_ids}}
        assert self.engine.get_next_question(context) is None

    def test_parse_number_from_text(self):
        from services.questionnaire_engine import QUESTION_BANK, QuestionType, Question
        q = Question(id="test", text="?", type=QuestionType.NUMBER, unit="L")
        assert self.engine.parse_answer(q, "about 2000 litres") == 2000.0

    def test_parse_boolean_yes(self):
        from services.questionnaire_engine import QuestionType, Question
        q = Question(id="test", text="?", type=QuestionType.BOOLEAN)
        assert self.engine.parse_answer(q, "yes, I do") is True

    def test_parse_boolean_no(self):
        from services.questionnaire_engine import QuestionType, Question
        q = Question(id="test", text="?", type=QuestionType.BOOLEAN)
        assert self.engine.parse_answer(q, "nope") is False

    def test_parse_invalid_number_raises(self):
        from services.questionnaire_engine import QuestionType, Question
        q = Question(id="test", text="?", type=QuestionType.NUMBER)
        with pytest.raises(ValueError):
            self.engine.parse_answer(q, "no idea")

    def test_progress_tracking(self):
        context = {"answered": ["farm_name", "farm_location"], "answers": {}}
        answered, total = self.engine.progress(context)
        assert answered == 2
        assert total > 0

    def test_is_not_complete_initially(self):
        context = {"answered": [], "answers": {}}
        assert not self.engine.is_complete(context)
