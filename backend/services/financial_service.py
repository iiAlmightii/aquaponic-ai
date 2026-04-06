"""
services/financial_service.py — AI-driven financial planning engine for aquaponics.

Computes:
  - CAPEX / OPEX breakdowns
  - Monthly cash-flow projections
  - ROI, payback period, break-even
  - Scenario analysis (pessimistic / base / optimistic)
  - AI-powered recommendations via LLM
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models import FinancialPlan

logger = logging.getLogger(__name__)

# ── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class FinancialInputs:
    # Capital
    infrastructure_cost: float = 0.0
    equipment_cost: float = 0.0
    initial_stock_cost: float = 0.0
    # Monthly operating
    monthly_feed_cost: float = 0.0
    monthly_labor_cost: float = 0.0
    monthly_utilities_cost: float = 0.0
    monthly_maintenance_cost: float = 0.0
    monthly_other_cost: float = 0.0
    # Monthly revenue
    monthly_fish_revenue: float = 0.0
    monthly_crop_revenue: float = 0.0
    monthly_other_revenue: float = 0.0
    # Land / area
    land_area_sqm: float = 0.0
    # Config
    horizon_months: int = 12
    discount_rate_annual: float = 0.08     # 8% for NPV

    @property
    def total_capex(self) -> float:
        return self.infrastructure_cost + self.equipment_cost + self.initial_stock_cost

    @property
    def monthly_opex(self) -> float:
        return (
            self.monthly_feed_cost + self.monthly_labor_cost +
            self.monthly_utilities_cost + self.monthly_maintenance_cost +
            self.monthly_other_cost
        )

    @property
    def monthly_revenue(self) -> float:
        return self.monthly_fish_revenue + self.monthly_crop_revenue + self.monthly_other_revenue

    @property
    def monthly_net(self) -> float:
        return self.monthly_revenue - self.monthly_opex


@dataclass
class FinancialMetrics:
    total_capex: float
    annual_opex: float
    annual_revenue: float
    gross_profit_annual: float
    net_profit_annual: float
    roi_percent: float
    payback_period_months: float
    break_even_month: int
    npv: float
    irr_percent: float
    land_area_sqm: float
    revenue_per_sqm: float
    profit_per_sqm: float
    capex_per_sqm: float
    opex_per_sqm: float
    profit_margin_percent: float
    cost_of_goods_sold_percent: float
    opex_as_percent_of_revenue: float
    fish_revenue_share_percent: float
    crop_revenue_share_percent: float
    other_revenue_share_percent: float
    feed_cost_share_percent: float
    labor_cost_share_percent: float
    utilities_cost_share_percent: float
    maintenance_cost_share_percent: float
    other_cost_share_percent: float
    cash_flows: list[dict[str, Any]] = field(default_factory=list)
    scenarios: dict[str, Any] = field(default_factory=dict)


# ── Core Calculator ───────────────────────────────────────────────────────────

class FinancialCalculator:
    """Pure financial maths — no DB, no LLM."""

    @staticmethod
    def _safe_ratio(numerator: float, denominator: float) -> float:
        if denominator <= 0:
            return 0.0
        return numerator / denominator

    def compute(self, inp: FinancialInputs, scenario_factor: float = 1.0) -> FinancialMetrics:
        """
        Compute all financial metrics for a given scenario.
        scenario_factor: 1.0 = base, 0.8 = pessimistic, 1.2 = optimistic (applied to revenue).
        """
        adj_monthly_rev = inp.monthly_revenue * scenario_factor

        capex = inp.total_capex
        monthly_opex = inp.monthly_opex
        annual_opex = monthly_opex * 12
        annual_revenue = adj_monthly_rev * 12
        gross_profit = annual_revenue - annual_opex
        net_profit = gross_profit  # simplified (no tax model here)

        land_area_sqm = max(inp.land_area_sqm, 0.0)
        revenue_per_sqm = self._safe_ratio(annual_revenue, land_area_sqm)
        profit_per_sqm = self._safe_ratio(net_profit, land_area_sqm)
        capex_per_sqm = self._safe_ratio(capex, land_area_sqm)
        opex_per_sqm = self._safe_ratio(annual_opex, land_area_sqm)

        profit_margin_percent = self._safe_ratio(net_profit, annual_revenue) * 100
        # Estimated COGS based on direct biological input cost currently captured in survey.
        estimated_cogs_annual = inp.monthly_feed_cost * 12
        cost_of_goods_sold_percent = self._safe_ratio(estimated_cogs_annual, annual_revenue) * 100
        opex_as_percent_of_revenue = self._safe_ratio(annual_opex, annual_revenue) * 100

        fish_revenue_share_percent = self._safe_ratio(inp.monthly_fish_revenue, inp.monthly_revenue) * 100
        crop_revenue_share_percent = self._safe_ratio(inp.monthly_crop_revenue, inp.monthly_revenue) * 100
        other_revenue_share_percent = self._safe_ratio(inp.monthly_other_revenue, inp.monthly_revenue) * 100

        feed_cost_share_percent = self._safe_ratio(inp.monthly_feed_cost, monthly_opex) * 100
        labor_cost_share_percent = self._safe_ratio(inp.monthly_labor_cost, monthly_opex) * 100
        utilities_cost_share_percent = self._safe_ratio(inp.monthly_utilities_cost, monthly_opex) * 100
        maintenance_cost_share_percent = self._safe_ratio(inp.monthly_maintenance_cost, monthly_opex) * 100
        other_cost_share_percent = self._safe_ratio(inp.monthly_other_cost, monthly_opex) * 100

        roi = (net_profit / capex * 100) if capex > 0 else 0.0
        monthly_net = adj_monthly_rev - monthly_opex
        payback = (capex / monthly_net) if monthly_net > 0 else float("inf")

        # Month-by-month cash flow
        cash_flows: list[dict] = []
        cumulative = -capex
        break_even_month = -1
        monthly_discount = (1 + inp.discount_rate_annual) ** (1 / 12) - 1

        for m in range(1, inp.horizon_months + 1):
            inflow = adj_monthly_rev
            outflow = monthly_opex + (capex if m == 1 else 0)
            net = inflow - outflow + (capex if m == 1 else 0)  # adjust month 1
            if m == 1:
                net = adj_monthly_rev - monthly_opex - capex
            else:
                net = adj_monthly_rev - monthly_opex
            cumulative += (adj_monthly_rev - monthly_opex)
            if cumulative >= 0 and break_even_month == -1:
                break_even_month = m
            cash_flows.append({
                "month": m,
                "revenue": round(adj_monthly_rev, 2),
                "opex": round(monthly_opex, 2),
                "net": round(adj_monthly_rev - monthly_opex, 2),
                "cumulative": round(cumulative, 2),
            })

        # NPV
        monthly_rate = (1 + inp.discount_rate_annual) ** (1 / 12) - 1
        npv = -capex + sum(
            (adj_monthly_rev - monthly_opex) / ((1 + monthly_rate) ** m)
            for m in range(1, inp.horizon_months + 1)
        )

        # IRR approximation via bisection
        irr = self._approx_irr(capex, adj_monthly_rev - monthly_opex, inp.horizon_months)

        return FinancialMetrics(
            total_capex=round(capex, 2),
            annual_opex=round(annual_opex, 2),
            annual_revenue=round(annual_revenue, 2),
            gross_profit_annual=round(gross_profit, 2),
            net_profit_annual=round(net_profit, 2),
            roi_percent=round(roi, 2),
            payback_period_months=round(payback, 1) if payback != float("inf") else None,
            break_even_month=break_even_month,
            npv=round(npv, 2),
            irr_percent=round(irr * 100, 2) if irr else None,
            land_area_sqm=round(land_area_sqm, 2),
            revenue_per_sqm=round(revenue_per_sqm, 2),
            profit_per_sqm=round(profit_per_sqm, 2),
            capex_per_sqm=round(capex_per_sqm, 2),
            opex_per_sqm=round(opex_per_sqm, 2),
            profit_margin_percent=round(profit_margin_percent, 2),
            cost_of_goods_sold_percent=round(cost_of_goods_sold_percent, 2),
            opex_as_percent_of_revenue=round(opex_as_percent_of_revenue, 2),
            fish_revenue_share_percent=round(fish_revenue_share_percent, 2),
            crop_revenue_share_percent=round(crop_revenue_share_percent, 2),
            other_revenue_share_percent=round(other_revenue_share_percent, 2),
            feed_cost_share_percent=round(feed_cost_share_percent, 2),
            labor_cost_share_percent=round(labor_cost_share_percent, 2),
            utilities_cost_share_percent=round(utilities_cost_share_percent, 2),
            maintenance_cost_share_percent=round(maintenance_cost_share_percent, 2),
            other_cost_share_percent=round(other_cost_share_percent, 2),
            cash_flows=cash_flows,
        )

    def _approx_irr(self, capex: float, monthly_net: float, months: int) -> float | None:
        """Bisection search for monthly IRR, then annualise."""
        if monthly_net <= 0 or capex <= 0:
            return None
        lo, hi = -0.999, 10.0
        for _ in range(200):
            mid = (lo + hi) / 2
            npv = -capex + sum(monthly_net / ((1 + mid) ** m) for m in range(1, months + 1))
            if abs(npv) < 0.01:
                break
            if npv > 0:
                lo = mid
            else:
                hi = mid
        monthly_irr = (lo + hi) / 2
        return (1 + monthly_irr) ** 12 - 1   # annualised


# ── Financial Service (DB + LLM) ──────────────────────────────────────────────

class FinancialService:
    """Orchestrates computation, persistence, and AI recommendations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.calc = FinancialCalculator()

    async def create_plan(self, farm_id: str, session_id: str, inputs: FinancialInputs) -> FinancialPlan:
        """Run full financial analysis and persist to DB."""
        base = self.calc.compute(inputs, scenario_factor=1.0)
        pessimistic = self.calc.compute(inputs, scenario_factor=0.75)
        optimistic = self.calc.compute(inputs, scenario_factor=1.30)

        recommendations = self._generate_recommendations(inputs, base)

        plan = FinancialPlan(
            farm_id=farm_id,
            session_id=session_id,
            horizon_months=inputs.horizon_months,
            infrastructure_cost=inputs.infrastructure_cost,
            equipment_cost=inputs.equipment_cost,
            initial_stock_cost=inputs.initial_stock_cost,
            monthly_feed_cost=inputs.monthly_feed_cost,
            monthly_labor_cost=inputs.monthly_labor_cost,
            monthly_utilities_cost=inputs.monthly_utilities_cost,
            monthly_maintenance_cost=inputs.monthly_maintenance_cost,
            monthly_other_cost=inputs.monthly_other_cost,
            monthly_fish_revenue=inputs.monthly_fish_revenue,
            monthly_crop_revenue=inputs.monthly_crop_revenue,
            monthly_other_revenue=inputs.monthly_other_revenue,
            total_capex=base.total_capex,
            total_opex_annual=base.annual_opex,
            total_revenue_annual=base.annual_revenue,
            gross_profit_annual=base.gross_profit_annual,
            net_profit_annual=base.net_profit_annual,
            roi_percent=base.roi_percent,
            payback_period_months=base.payback_period_months,
            break_even_month=base.break_even_month,
            scenarios={
                "base": {**base.__dict__, "cash_flows": base.cash_flows},
                "pessimistic": {**pessimistic.__dict__, "cash_flows": pessimistic.cash_flows},
                "optimistic": {**optimistic.__dict__, "cash_flows": optimistic.cash_flows},
            },
            ai_recommendations=recommendations,
        )
        self.db.add(plan)
        await self.db.flush()
        logger.info("Financial plan created for farm %s", farm_id)
        return plan

    def compute_plan_state(self, inputs: FinancialInputs) -> dict[str, Any]:
        """
        Compute the financial plan state without persisting.
        Used for Google Sheets pull-sync polling to avoid DB churn.
        """
        base = self.calc.compute(inputs, scenario_factor=1.0)
        pessimistic = self.calc.compute(inputs, scenario_factor=0.75)
        optimistic = self.calc.compute(inputs, scenario_factor=1.30)

        recommendations = self._generate_recommendations(inputs, base)

        def _scenario_dict(metrics):
            # Keep scenario payload JSON-serializable and aligned with FinancialPlan.scenarios.
            d = {**metrics.__dict__}
            d["cash_flows"] = metrics.cash_flows
            return d

        return {
            "id": None,
            "horizon_months": inputs.horizon_months,
            "total_capex": base.total_capex,
            "total_opex_annual": base.annual_opex,
            "total_revenue_annual": base.annual_revenue,
            "gross_profit_annual": base.gross_profit_annual,
            "net_profit_annual": base.net_profit_annual,
            "roi_percent": base.roi_percent,
            "payback_period_months": base.payback_period_months,
            "break_even_month": base.break_even_month,
            "land_area_sqm": base.land_area_sqm,
            "revenue_per_sqm": base.revenue_per_sqm,
            "profit_per_sqm": base.profit_per_sqm,
            "capex_per_sqm": base.capex_per_sqm,
            "opex_per_sqm": base.opex_per_sqm,
            "profit_margin_percent": base.profit_margin_percent,
            "cost_of_goods_sold_percent": base.cost_of_goods_sold_percent,
            "opex_as_percent_of_revenue": base.opex_as_percent_of_revenue,
            "fish_revenue_share_percent": base.fish_revenue_share_percent,
            "crop_revenue_share_percent": base.crop_revenue_share_percent,
            "other_revenue_share_percent": base.other_revenue_share_percent,
            "feed_cost_share_percent": base.feed_cost_share_percent,
            "labor_cost_share_percent": base.labor_cost_share_percent,
            "utilities_cost_share_percent": base.utilities_cost_share_percent,
            "maintenance_cost_share_percent": base.maintenance_cost_share_percent,
            "other_cost_share_percent": base.other_cost_share_percent,
            "scenarios": {
                "base": _scenario_dict(base),
                "pessimistic": _scenario_dict(pessimistic),
                "optimistic": _scenario_dict(optimistic),
            },
            "ai_recommendations": recommendations,
        }

    def _generate_recommendations(self, inp: FinancialInputs, metrics: FinancialMetrics) -> list[dict]:
        """Rule-based recommendations (to be replaced / augmented with LLM)."""
        recs = []

        # Feed cost optimisation
        feed_ratio = inp.monthly_feed_cost / inp.monthly_opex if inp.monthly_opex > 0 else 0
        if feed_ratio > 0.40:
            recs.append({
                "category": "Cost Reduction",
                "priority": "high",
                "title": "High feed cost ratio",
                "detail": (
                    f"Feed costs represent {feed_ratio*100:.0f}% of your operating expenses. "
                    "Consider bulk purchasing, growing duckweed as a supplement, or optimising FCR."
                ),
            })

        # Payback period
        if metrics.payback_period_months and metrics.payback_period_months > 24:
            recs.append({
                "category": "Revenue",
                "priority": "medium",
                "title": "Long payback period",
                "detail": (
                    f"Estimated payback is {metrics.payback_period_months:.0f} months. "
                    "Adding a direct-to-consumer sales channel or value-added products can accelerate this."
                ),
            })

        # Positive ROI
        if metrics.roi_percent > 20:
            recs.append({
                "category": "Growth",
                "priority": "low",
                "title": "Strong ROI — consider scaling",
                "detail": (
                    f"ROI of {metrics.roi_percent:.1f}% is excellent. "
                    "Consider reinvesting profit to add a second grow bed or expand fish tanks."
                ),
            })

        # Revenue diversification
        rev_fish_share = inp.monthly_fish_revenue / inp.monthly_revenue if inp.monthly_revenue > 0 else 0
        if rev_fish_share > 0.85:
            recs.append({
                "category": "Diversification",
                "priority": "medium",
                "title": "Revenue concentration risk",
                "detail": (
                    "Over 85% of revenue comes from fish. Introducing high-value crops like basil, "
                    "lettuce, or microgreens can reduce risk and improve margins."
                ),
            })

        return recs
