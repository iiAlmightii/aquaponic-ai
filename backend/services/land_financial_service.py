"""Financial calculations and exports for land-based farm planning."""

from __future__ import annotations

from io import StringIO
from typing import Any
import csv


def compute_land_financials(context: dict[str, Any]) -> dict[str, Any]:
    answers = context.get("answers", {})
    crops = context.get("crops", [])
    market_price_source = context.get("market_price_source", {})

    def f(name: str, default: float = 0.0) -> float:
        try:
            return float(answers.get(name, default) or default)
        except (TypeError, ValueError):
            return default

    workers = f("worker_count")
    salary = f("salary_per_worker_month")
    electricity_units = f("electricity_units_per_month")
    electricity_cost_unit = f("electricity_cost_per_unit")
    maintenance_month = f("maintenance_cost_month")
    land_rent_month = f("land_rent_month")
    seed_per_cycle = f("seed_cost_per_cycle")
    spoilage_percent = min(100.0, max(0.0, f("post_harvest_spoilage_percent")))
    seasonal_labor_month = f("seasonal_labor_cost_month")
    pesticide_month = f("pesticide_cost_month")
    fuel_month = f("fuel_cost_month")
    transport_month = f("transport_cost_month")
    fertilizer_month = f("fertilizer_cost_month")
    water_cost_month = f("water_cost_month")
    machines_capex = f("machines_cost_total")
    setup_capex = f("setup_cost_total")

    total_cycles = sum(float(c.get("cycles_per_year") or 0.0) for c in crops)

    cost_labor_annual = workers * salary * 12
    cost_electricity_annual = electricity_units * electricity_cost_unit * 12
    cost_maintenance_annual = maintenance_month * 12
    cost_land_rent_annual = land_rent_month * 12
    cost_seeds_annual = seed_per_cycle * total_cycles
    cost_seasonal_labor_annual = seasonal_labor_month * 12
    cost_pesticide_annual = pesticide_month * 12
    cost_fuel_annual = fuel_month * 12
    cost_transport_annual = transport_month * 12
    cost_fertilizer_annual = fertilizer_month * 12
    cost_water_annual = water_cost_month * 12

    annual_cost = (
        cost_labor_annual
        + cost_seasonal_labor_annual
        + cost_electricity_annual
        + cost_maintenance_annual
        + cost_land_rent_annual
        + cost_seeds_annual
        + cost_pesticide_annual
        + cost_fuel_annual
        + cost_transport_annual
        + cost_fertilizer_annual
        + cost_water_annual
    )
    total_capex = machines_capex + setup_capex

    crop_rows: list[dict[str, Any]] = []
    total_revenue = 0.0
    total_raw_revenue = 0.0
    total_yield_kg = 0.0
    total_sellable_yield_kg = 0.0
    for crop in crops:
        crop_name = str(crop.get("name", "unknown"))
        cycles = float(crop.get("cycles_per_year") or 0.0)
        yph = float(crop.get("yield_kg_per_harvest") or 0.0)
        price = float(crop.get("price_per_kg") or 0.0)
        annual_yield = cycles * yph
        sellable_yield = annual_yield * (1.0 - spoilage_percent / 100.0)
        raw_revenue = annual_yield * price
        revenue = sellable_yield * price
        total_raw_revenue += raw_revenue
        total_revenue += revenue
        total_yield_kg += annual_yield
        total_sellable_yield_kg += sellable_yield
        source_meta = market_price_source.get(crop_name, {})
        source_label = source_meta.get("source") if isinstance(source_meta, dict) else source_meta
        crop_rows.append(
            {
                "crop": crop_name,
                "cycles_per_year": cycles,
                "months_to_harvest": float(crop.get("months_to_harvest") or 0.0),
                "yield_per_harvest_kg": yph,
                "annual_yield_kg": round(annual_yield, 2),
                "sellable_yield_kg": round(sellable_yield, 2),
                "price_per_kg": round(price, 2),
                "revenue_annual": round(revenue, 2),
                "price_source": source_label or "manual/unknown",
            }
        )

    if total_revenue > 0:
        for r in crop_rows:
            ratio = float(r["revenue_annual"]) / total_revenue
            alloc_cost = annual_cost * ratio
            r["allocated_cost_annual"] = round(alloc_cost, 2)
            r["profit_annual"] = round(float(r["revenue_annual"]) - alloc_cost, 2)
            sellable = float(r.get("sellable_yield_kg") or 0.0)
            r["cost_per_kg"] = round(alloc_cost / sellable, 2) if sellable > 0 else 0.0
    else:
        n = len(crop_rows) or 1
        alloc_cost = annual_cost / n
        for r in crop_rows:
            r["allocated_cost_annual"] = round(alloc_cost, 2)
            r["profit_annual"] = round(float(r["revenue_annual"]) - alloc_cost, 2)
            sellable = float(r.get("sellable_yield_kg") or 0.0)
            r["cost_per_kg"] = round(alloc_cost / sellable, 2) if sellable > 0 else 0.0

    profit = total_revenue - annual_cost
    cost_per_kg_overall = annual_cost / total_sellable_yield_kg if total_sellable_yield_kg > 0 else 0.0
    roi = (profit / total_capex * 100.0) if total_capex > 0 else None
    spoilage_loss_value = max(0.0, total_raw_revenue - total_revenue)
    total_labor_cost = cost_labor_annual + cost_seasonal_labor_annual
    labor_efficiency_ratio = (total_revenue / total_labor_cost) if total_labor_cost > 0 else 0.0

    warnings: list[str] = []
    land = f("land_area_sqm")
    if land > 0 and total_yield_kg > 0 and (total_yield_kg / land) > 20:
        warnings.append("Yield per square meter looks high; please review yield/cycle inputs.")
    if workers <= 0:
        warnings.append("Worker count is zero or missing.")
    if total_revenue <= 0:
        warnings.append("Revenue is zero; verify crop prices and yields.")
    if spoilage_percent > 30:
        warnings.append("Spoilage percentage is high; verify post-harvest assumptions.")

    costs_breakdown = {
        "labor": round(cost_labor_annual, 2),
        "seasonal_labor": round(cost_seasonal_labor_annual, 2),
        "electricity": round(cost_electricity_annual, 2),
        "seeds": round(cost_seeds_annual, 2),
        "maintenance": round(cost_maintenance_annual, 2),
        "land_rent": round(cost_land_rent_annual, 2),
        "pesticide": round(cost_pesticide_annual, 2),
        "fuel": round(cost_fuel_annual, 2),
        "transport": round(cost_transport_annual, 2),
        "fertilizer": round(cost_fertilizer_annual, 2),
        "water": round(cost_water_annual, 2),
    }

    summary = {
        "total_revenue": round(total_revenue, 2),
        "total_cost": round(annual_cost, 2),
        "profit": round(profit, 2),
        "cost_per_kg": round(cost_per_kg_overall, 2),
        "roi_percent": round(roi, 2) if roi is not None else None,
        "total_capex": round(total_capex, 2),
        "total_annual_yield_kg": round(total_yield_kg, 2),
        "sellable_yield_kg": round(total_sellable_yield_kg, 2),
        "spoilage_percent": round(spoilage_percent, 2),
        "spoilage_loss_value": round(spoilage_loss_value, 2),
        "total_labor_cost": round(total_labor_cost, 2),
        "labor_efficiency_ratio": round(labor_efficiency_ratio, 3),
    }

    recommendations = _generate_land_recommendations(
        summary=summary,
        costs=costs_breakdown,
        crop_rows=crop_rows,
        workers=workers,
        salary=salary,
        spoilage_percent=spoilage_percent,
        total_revenue=total_revenue,
        annual_cost=annual_cost,
        total_capex=total_capex,
    )

    return {
        "summary": summary,
        "cost_breakdown": costs_breakdown,
        "crop_performance": crop_rows,
        "warnings": warnings,
        "recommendations": recommendations,
    }


def _generate_land_recommendations(
    summary: dict,
    costs: dict,
    crop_rows: list,
    workers: float,
    salary: float,
    spoilage_percent: float,
    total_revenue: float,
    annual_cost: float,
    total_capex: float,
) -> list[dict]:
    """Rule-based financial recommendations for land-based farm operations."""
    recs = []
    profit = float(summary.get("profit", 0) or 0)
    roi = summary.get("roi_percent")

    def c(key: str) -> float:
        return float(costs.get(key, 0) or 0)

    # ── Profitability ───────────────────────────────────────────────────────
    if total_revenue > 0 and profit < 0:
        recs.append({
            "category": "Cash Flow",
            "priority": "high",
            "title": "Farm is operating at a loss",
            "detail": (
                f"Annual costs exceed revenue by ₹{abs(profit):,.0f}. "
                "Immediate actions: (1) identify the highest cost line and negotiate/reduce it, "
                "(2) check crop prices — are you selling at market rate or below?, "
                "(3) review spoilage — every % saved is pure margin."
            ),
        })
    elif total_revenue > 0:
        margin = profit / total_revenue * 100
        if margin < 10:
            recs.append({
                "category": "Cash Flow",
                "priority": "high",
                "title": f"Profit margin is only {margin:.1f}%",
                "detail": (
                    "Below 10% leaves no buffer for bad seasons or price drops. "
                    "Target 20%+ by either cutting the two largest cost lines by 10% each, "
                    "or adding one high-margin crop (e.g., vegetables for local restaurant supply)."
                ),
            })

    # ── Spoilage ────────────────────────────────────────────────────────────
    spoilage_loss = float(summary.get("spoilage_loss_value", 0) or 0)
    if spoilage_percent > 15:
        recs.append({
            "category": "Post-Harvest",
            "priority": "high",
            "title": f"{spoilage_percent:.0f}% spoilage is destroying ₹{spoilage_loss:,.0f}/year",
            "detail": (
                "Common fixes: (1) harvest in early morning to reduce heat damage, "
                "(2) use shade nets for field stacking, (3) establish buyer agreements so produce "
                "moves within 24 hours. A basic cold room (₹1–2L) often pays for itself in 1 season."
            ),
        })
    elif spoilage_percent > 8:
        recs.append({
            "category": "Post-Harvest",
            "priority": "medium",
            "title": f"Spoilage at {spoilage_percent:.0f}% — room to improve",
            "detail": (
                f"You are losing ₹{spoilage_loss:,.0f}/year to spoilage. "
                "Reducing to 5% through better harvest timing and grading could recover a significant portion."
            ),
        })

    # ── Labor efficiency ────────────────────────────────────────────────────
    total_labor = c("labor") + c("seasonal_labor")
    if total_revenue > 0 and total_labor > 0:
        labor_ratio = total_labor / annual_cost
        if labor_ratio > 0.50:
            recs.append({
                "category": "Operations",
                "priority": "medium",
                "title": f"Labor is {labor_ratio*100:.0f}% of total cost",
                "detail": (
                    "High labor share indicates manual-heavy operations. "
                    "Evaluate: (1) drip irrigation (reduces water + weeding labor), "
                    "(2) raised-bed layout for faster harvesting, "
                    "(3) piece-rate pay for harvest season vs. fixed salary for permanent staff."
                ),
            })

    # ── Fertilizer & input costs ────────────────────────────────────────────
    fertilizer_cost = c("fertilizer")
    if annual_cost > 0 and fertilizer_cost / annual_cost > 0.20:
        recs.append({
            "category": "Input Costs",
            "priority": "medium",
            "title": "Fertilizer is a high cost share",
            "detail": (
                "Consider: (1) soil testing to apply only what's needed (saves 15–25%), "
                "(2) vermicompost or green manure to partially replace chemical fertilizer, "
                "(3) group buying with neighboring farmers for volume discounts."
            ),
        })

    # ── Crop diversification ─────────────────────────────────────────────────
    if crop_rows and total_revenue > 0:
        top_crop_rev = max((float(r.get("revenue_annual", 0) or 0) for r in crop_rows), default=0)
        top_share = top_crop_rev / total_revenue
        if top_share > 0.80 and len(crop_rows) == 1:
            recs.append({
                "category": "Diversification",
                "priority": "medium",
                "title": "Single-crop operation — high concentration risk",
                "detail": (
                    "A pest outbreak, weather event, or price crash on one crop can wipe out the season. "
                    "Add at least one complementary crop on 20–30% of land area. "
                    "Inter-cropping (e.g., tomato + marigold) also naturally reduces pest pressure."
                ),
            })

        # Identify lowest-profit crop
        if len(crop_rows) > 1:
            worst = min(crop_rows, key=lambda r: float(r.get("profit_annual", 0) or 0))
            worst_profit = float(worst.get("profit_annual", 0) or 0)
            if worst_profit < 0:
                recs.append({
                    "category": "Crop Mix",
                    "priority": "medium",
                    "title": f"'{worst.get('crop', 'Unknown')}' is loss-making",
                    "detail": (
                        f"This crop generates a loss of ₹{abs(worst_profit):,.0f}/year after cost allocation. "
                        "Either negotiate better selling price, reduce its area, or replace with a higher-margin crop."
                    ),
                })

    # ── ROI and CAPEX recovery ───────────────────────────────────────────────
    if roi is not None:
        if roi < 5:
            recs.append({
                "category": "Viability",
                "priority": "high",
                "title": f"ROI is only {roi:.1f}% — below cost of capital",
                "detail": (
                    "Returns are below bank FD rates. Review whether the CAPEX items can be deferred, "
                    "shared with other farmers, or leased instead of purchased."
                ),
            })
        elif roi > 30:
            recs.append({
                "category": "Growth",
                "priority": "low",
                "title": f"Strong ROI at {roi:.1f}% — consider reinvestment",
                "detail": (
                    f"Annual surplus of ₹{profit:,.0f} is strong. "
                    "Options: (1) expand to adjacent land, (2) invest in storage/cold chain to capture "
                    "off-season premium prices, (3) set up a small processing unit for value addition."
                ),
            })

    # ── Transport & market access ────────────────────────────────────────────
    transport_cost = c("transport") + c("fuel")
    if annual_cost > 0 and transport_cost / annual_cost > 0.15:
        recs.append({
            "category": "Market Access",
            "priority": "low",
            "title": "Transport & fuel are a significant cost",
            "detail": (
                "Consider: (1) aggregating with nearby farmers for shared transport, "
                "(2) approaching local wholesalers for farm gate pickup, "
                "(3) FPO membership often provides subsidised logistics."
            ),
        })

    if not recs:
        recs.append({
            "category": "Performance",
            "priority": "low",
            "title": "Farm financials are in a healthy range",
            "detail": (
                "Cost and revenue mix look balanced. Track your KPIs monthly and "
                "compare actual vs. plan every harvest to catch deviations early."
            ),
        })

    return recs


def export_sheet_payload(context: dict[str, Any], calc: dict[str, Any]) -> dict[str, list[list[Any]]]:
    answers = context.get("answers", {})
    crops = context.get("crops", [])
    price_meta = context.get("market_price_source", {})

    inputs_rows: list[list[Any]] = [["field", "value"]]
    for k, v in answers.items():
        inputs_rows.append([k, v])
    for idx, crop in enumerate(crops, start=1):
        crop_name = str(crop.get("name") or "")
        raw_meta = price_meta.get(crop_name, {})
        meta = raw_meta if isinstance(raw_meta, dict) else {"source": raw_meta} if isinstance(raw_meta, str) else {}
        inputs_rows.append([f"crop_{idx}_name", crop.get("name")])
        inputs_rows.append([f"crop_{idx}_cycles_per_year", crop.get("cycles_per_year")])
        inputs_rows.append([f"crop_{idx}_months_to_harvest", crop.get("months_to_harvest")])
        inputs_rows.append([f"crop_{idx}_yield_kg_per_harvest", crop.get("yield_kg_per_harvest")])
        inputs_rows.append([f"crop_{idx}_price_per_kg", crop.get("price_per_kg")])
        inputs_rows.append([f"crop_{idx}_price_source", meta.get("source", "")])
        inputs_rows.append([f"crop_{idx}_price_fetched_at", meta.get("fetched_at", "")])
        inputs_rows.append([f"crop_{idx}_price_record_count", meta.get("record_count", "")])
        inputs_rows.append([f"crop_{idx}_price_confidence", meta.get("confidence", "")])

    calc_rows: list[list[Any]] = [[
        "crop", "cycles_per_year", "months_to_harvest", "yield_per_harvest_kg", "annual_yield_kg", "sellable_yield_kg",
        "price_per_kg", "price_source", "revenue_annual", "allocated_cost_annual", "profit_annual", "cost_per_kg",
    ]]
    for row in calc.get("crop_performance", []):
        calc_rows.append([
            row.get("crop"), row.get("cycles_per_year"), row.get("months_to_harvest"), row.get("yield_per_harvest_kg"),
            row.get("annual_yield_kg"), row.get("sellable_yield_kg"), row.get("price_per_kg"), row.get("price_source"), row.get("revenue_annual"), row.get("allocated_cost_annual"),
            row.get("profit_annual"), row.get("cost_per_kg"),
        ])

    summary_rows = [["metric", "value"]]
    for k, v in (calc.get("summary") or {}).items():
        summary_rows.append([k, v])

    summary = calc.get("summary") or {}
    costs = calc.get("cost_breakdown") or {}
    total_revenue = float(summary.get("total_revenue", 0) or 0)
    total_cost = float(summary.get("total_cost", 0) or 0)
    total_profit = float(summary.get("profit", 0) or 0)
    total_yield_kg = float(summary.get("total_annual_yield_kg", 0) or 0)
    sellable_yield_kg = float(summary.get("sellable_yield_kg", total_yield_kg) or 0)
    total_capex = float(summary.get("total_capex", 0) or 0)
    spoilage_loss_value = float(summary.get("spoilage_loss_value", 0) or 0)
    land_area_sqm = float(answers.get("land_area_sqm", 0) or 0)

    profit_margin_pct = (total_profit / total_revenue * 100.0) if total_revenue > 0 else 0.0
    break_even_price_per_kg = (total_cost / sellable_yield_kg) if sellable_yield_kg > 0 else 0.0
    revenue_per_sqm = (total_revenue / land_area_sqm) if land_area_sqm > 0 else 0.0
    yield_per_sqm = (sellable_yield_kg / land_area_sqm) if land_area_sqm > 0 else 0.0

    labor_share_pct = (float(costs.get("labor", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    seasonal_labor_share_pct = (float(costs.get("seasonal_labor", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    electricity_share_pct = (float(costs.get("electricity", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    seeds_share_pct = (float(costs.get("seeds", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    maintenance_share_pct = (float(costs.get("maintenance", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    pesticide_share_pct = (float(costs.get("pesticide", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    fuel_share_pct = (float(costs.get("fuel", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    transport_share_pct = (float(costs.get("transport", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0

    crop_perf = sorted(
        list(calc.get("crop_performance") or []),
        key=lambda r: float(r.get("revenue_annual") or 0.0),
        reverse=True,
    )
    warnings = list(calc.get("warnings") or [])

    crop_ranking_rows: list[list[Any]] = [[
        "crop", "revenue_annual", "allocated_cost_annual", "profit_annual", "margin_percent",
        "revenue_share_percent", "cost_per_kg", "yield_per_year_kg",
    ]]
    for row in crop_perf:
        crop_revenue = float(row.get("revenue_annual", 0) or 0)
        crop_profit = float(row.get("profit_annual", 0) or 0)
        margin_pct = (crop_profit / crop_revenue * 100.0) if crop_revenue > 0 else 0.0
        revenue_share_pct = (crop_revenue / total_revenue * 100.0) if total_revenue > 0 else 0.0
        crop_ranking_rows.append([
            row.get("crop", "unknown"),
            crop_revenue,
            float(row.get("allocated_cost_annual", 0) or 0),
            crop_profit,
            round(margin_pct, 2),
            round(revenue_share_pct, 2),
            float(row.get("cost_per_kg", 0) or 0),
            float(row.get("annual_yield_kg", 0) or 0),
        ])

    scenario_rows: list[list[Any]] = [[
        "scenario", "revenue_factor", "cost_factor", "projected_revenue", "projected_cost", "projected_profit", "margin_percent"
    ]]
    scenarios = [
        ("Base", 1.0, 1.0),
        ("Price -10%", 0.9, 1.0),
        ("Yield -10%", 0.9, 1.0),
        ("Cost +10%", 1.0, 1.1),
        ("Downside (-10% rev, +10% cost)", 0.9, 1.1),
        ("Upside (+10% rev, -10% cost)", 1.1, 0.9),
    ]
    for name, rev_factor, cost_factor in scenarios:
        scenario_revenue = total_revenue * rev_factor
        scenario_cost = total_cost * cost_factor
        scenario_profit = scenario_revenue - scenario_cost
        scenario_margin = (scenario_profit / scenario_revenue * 100.0) if scenario_revenue > 0 else 0.0
        scenario_rows.append([
            name,
            rev_factor,
            cost_factor,
            round(scenario_revenue, 2),
            round(scenario_cost, 2),
            round(scenario_profit, 2),
            round(scenario_margin, 2),
        ])

    monthly_rows: list[list[Any]] = [[
        "month", "projected_revenue", "projected_cost", "projected_profit", "cumulative_profit"
    ]]
    revenue_month = total_revenue / 12.0
    cost_month = total_cost / 12.0
    profit_month = total_profit / 12.0
    cumulative = 0.0
    for month in range(1, 13):
        cumulative += profit_month
        monthly_rows.append([
            month,
            round(revenue_month, 2),
            round(cost_month, 2),
            round(profit_month, 2),
            round(cumulative, 2),
        ])

    top_crop = crop_perf[0].get("crop", "n/a") if crop_perf else "n/a"

    fertilizer_share_pct = (float(costs.get("fertilizer", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0
    water_share_pct = (float(costs.get("water", 0) or 0) / total_cost * 100.0) if total_cost > 0 else 0.0

    cost_breakdown_rows: list[list[Any]] = [["cost_component", "annual_cost"]]
    cost_breakdown_rows.append(["Labor", costs.get("labor", 0)])
    cost_breakdown_rows.append(["Seasonal Labor", costs.get("seasonal_labor", 0)])
    cost_breakdown_rows.append(["Electricity", costs.get("electricity", 0)])
    cost_breakdown_rows.append(["Seeds", costs.get("seeds", 0)])
    cost_breakdown_rows.append(["Fertilizer", costs.get("fertilizer", 0)])
    cost_breakdown_rows.append(["Water", costs.get("water", 0)])
    cost_breakdown_rows.append(["Maintenance", costs.get("maintenance", 0)])
    cost_breakdown_rows.append(["Land Rent", costs.get("land_rent", 0)])
    cost_breakdown_rows.append(["Pesticide", costs.get("pesticide", 0)])
    cost_breakdown_rows.append(["Fuel", costs.get("fuel", 0)])
    cost_breakdown_rows.append(["Transport", costs.get("transport", 0)])

    dashboard_rows: list[list[Any]] = [
        ["Land Farm Financial Dashboard"],
        ["Generated from survey answers for planning, sensitivity, and KPI monitoring"],
        [],
        ["Executive KPIs", "Value"],
        ["Total Revenue (Annual)", summary.get("total_revenue", 0)],
        ["Total Cost (Annual)", summary.get("total_cost", 0)],
        ["Profit (Annual)", summary.get("profit", 0)],
        ["Profit Margin (%)", round(profit_margin_pct, 2)],
        ["ROI (%)", summary.get("roi_percent", 0)],
        ["Break-even Price per KG", round(break_even_price_per_kg, 2)],
        ["Cost per KG", summary.get("cost_per_kg", 0)],
        ["Total Annual Yield (KG)", summary.get("total_annual_yield_kg", 0)],
        ["Sellable Yield (KG)", summary.get("sellable_yield_kg", 0)],
        ["Spoilage Loss Value", round(spoilage_loss_value, 2)],
        ["Total Capex", summary.get("total_capex", 0)],
        [],
        ["Operating Efficiency", "Value"],
        ["Land Area (sqm)", round(land_area_sqm, 2)],
        ["Revenue per sqm", round(revenue_per_sqm, 2)],
        ["Yield per sqm (kg)", round(yield_per_sqm, 2)],
        ["Labor Efficiency Ratio", summary.get("labor_efficiency_ratio", 0)],
        ["Top Revenue Crop", top_crop],
        ["Labor Cost Share (%)", round(labor_share_pct, 2)],
        ["Seasonal Labor Share (%)", round(seasonal_labor_share_pct, 2)],
        ["Electricity Cost Share (%)", round(electricity_share_pct, 2)],
        ["Seeds Cost Share (%)", round(seeds_share_pct, 2)],
        ["Fertilizer Cost Share (%)", round(fertilizer_share_pct, 2)],
        ["Water Cost Share (%)", round(water_share_pct, 2)],
        ["Maintenance Cost Share (%)", round(maintenance_share_pct, 2)],
        ["Pesticide Cost Share (%)", round(pesticide_share_pct, 2)],
        ["Fuel Cost Share (%)", round(fuel_share_pct, 2)],
        ["Transport Cost Share (%)", round(transport_share_pct, 2)],
        [],
        ["Cost Breakdown", "Annual Cost"],
        ["Labor", costs.get("labor", 0)],
        ["Seasonal Labor", costs.get("seasonal_labor", 0)],
        ["Electricity", costs.get("electricity", 0)],
        ["Seeds", costs.get("seeds", 0)],
        ["Fertilizer", costs.get("fertilizer", 0)],
        ["Water", costs.get("water", 0)],
        ["Maintenance", costs.get("maintenance", 0)],
        ["Land Rent", costs.get("land_rent", 0)],
        ["Pesticide", costs.get("pesticide", 0)],
        ["Fuel", costs.get("fuel", 0)],
        ["Transport", costs.get("transport", 0)],
        [],
        ["Crop Profitability", "Revenue Annual", "Allocated Cost Annual", "Profit Annual", "Cost per KG", "Margin (%)", "Revenue Share (%)"],
    ]

    for row in crop_perf:
        crop_revenue = float(row.get("revenue_annual", 0) or 0)
        crop_profit = float(row.get("profit_annual", 0) or 0)
        margin_pct = (crop_profit / crop_revenue * 100.0) if crop_revenue > 0 else 0.0
        revenue_share_pct = (crop_revenue / total_revenue * 100.0) if total_revenue > 0 else 0.0
        dashboard_rows.append([
            row.get("crop", "unknown"),
            crop_revenue,
            float(row.get("allocated_cost_annual", 0) or 0),
            crop_profit,
            float(row.get("cost_per_kg", 0) or 0),
            round(margin_pct, 2),
            round(revenue_share_pct, 2),
        ])

    dashboard_rows.append([])
    dashboard_rows.append(["Scenario Summary", "Projected Profit"])
    for scenario_row in scenario_rows[1:]:
        dashboard_rows.append([scenario_row[0], scenario_row[5]])

    if warnings:
        dashboard_rows.append([])
        dashboard_rows.append(["Warnings"])
        for warning in warnings:
            dashboard_rows.append([warning])

    # ── Break-Even Analysis ──────────────────────────────────────────────────
    # Monthly cashflow showing when cumulative profit covers CAPEX.
    breakeven_rows: list[list[Any]] = [[
        "month", "monthly_revenue", "monthly_cost", "monthly_profit",
        "cumulative_profit", "remaining_capex", "break_even_reached",
    ]]
    cumulative = 0.0
    remaining_capex = total_capex
    be_reached = False
    for month in range(1, 13):
        m_profit = total_profit / 12.0
        cumulative += m_profit
        if not be_reached and remaining_capex > 0:
            remaining_capex = max(0.0, remaining_capex - max(0.0, m_profit))
        if not be_reached and remaining_capex <= 0:
            be_reached = True
        breakeven_rows.append([
            month,
            round(total_revenue / 12.0, 2),
            round(total_cost / 12.0, 2),
            round(total_profit / 12.0, 2),
            round(cumulative, 2),
            round(remaining_capex, 2),
            "Yes" if be_reached else "No",
        ])

    # Payback period estimate
    payback_months = None
    if total_profit > 0 and total_capex > 0:
        payback_months = round(total_capex / (total_profit / 12.0), 1)
    breakeven_rows.append([""])
    breakeven_rows.append(["payback_period_months", payback_months if payback_months else "N/A (no profit)"])
    breakeven_rows.append(["break_even_price_per_kg", round(break_even_price_per_kg, 2)])

    # ── Recommendations ─────────────────────────────────────────────────────
    recs = calc.get("recommendations") or []
    recommendations_rows: list[list[Any]] = [["priority", "category", "title", "detail"]]
    for r in recs:
        recommendations_rows.append([
            r.get("priority", ""),
            r.get("category", ""),
            r.get("title", ""),
            r.get("detail", ""),
        ])

    # ── Cost Efficiency ──────────────────────────────────────────────────────
    cost_efficiency_rows: list[list[Any]] = [[
        "cost_component", "annual_cost", "share_pct", "cost_per_kg_contribution"
    ]]
    all_costs_items = [
        ("Labor", costs.get("labor", 0)),
        ("Seasonal Labor", costs.get("seasonal_labor", 0)),
        ("Electricity", costs.get("electricity", 0)),
        ("Seeds", costs.get("seeds", 0)),
        ("Fertilizer", costs.get("fertilizer", 0)),
        ("Water", costs.get("water", 0)),
        ("Maintenance", costs.get("maintenance", 0)),
        ("Land Rent", costs.get("land_rent", 0)),
        ("Pesticide", costs.get("pesticide", 0)),
        ("Fuel", costs.get("fuel", 0)),
        ("Transport", costs.get("transport", 0)),
    ]
    for name, cost_val in all_costs_items:
        cost_val_f = float(cost_val or 0)
        share = (cost_val_f / total_cost * 100.0) if total_cost > 0 else 0.0
        cpk = (cost_val_f / sellable_yield_kg) if sellable_yield_kg > 0 else 0.0
        cost_efficiency_rows.append([
            name,
            round(cost_val_f, 2),
            round(share, 2),
            round(cpk, 2),
        ])

    return {
        "Dashboard": dashboard_rows,
        "MonthlyProjection": monthly_rows,
        "ScenarioAnalysis": scenario_rows,
        "CropRanking": crop_ranking_rows,
        "CostBreakdown": cost_breakdown_rows,
        "BreakEvenAnalysis": breakeven_rows,
        "Recommendations": recommendations_rows,
        "CostEfficiency": cost_efficiency_rows,
        "Inputs": inputs_rows,
        "Calculations": calc_rows,
        "Summary": summary_rows,
    }


def export_csv_text(sheet_payload: dict[str, list[list[Any]]]) -> str:
    out = StringIO()
    writer = csv.writer(out)
    sheet_order = [
        "Dashboard", "MonthlyProjection", "ScenarioAnalysis", "CropRanking",
        "CostBreakdown", "CostEfficiency", "BreakEvenAnalysis", "Recommendations",
        "Inputs", "Calculations", "Summary",
    ]
    for sheet_name in sheet_order:
        rows = sheet_payload.get(sheet_name, [])
        if not rows:
            continue

        header = rows[0]
        writer.writerow(["sheet", *header])
        for row in rows[1:]:
            writer.writerow([sheet_name, *row])

    return out.getvalue()
