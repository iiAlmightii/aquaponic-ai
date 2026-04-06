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

    return {
        "summary": summary,
        "cost_breakdown": costs_breakdown,
        "crop_performance": crop_rows,
        "warnings": warnings,
    }


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
        "crop", "revenue_annual", "allocated_cost_annual", "profit_annual", "margin_percent", "revenue_share_percent"
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

    cost_breakdown_rows: list[list[Any]] = [["cost_component", "annual_cost"]]
    cost_breakdown_rows.append(["Labor", costs.get("labor", 0)])
    cost_breakdown_rows.append(["Seasonal Labor", costs.get("seasonal_labor", 0)])
    cost_breakdown_rows.append(["Electricity", costs.get("electricity", 0)])
    cost_breakdown_rows.append(["Seeds", costs.get("seeds", 0)])
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

    return {
        "Dashboard": dashboard_rows,
        "MonthlyProjection": monthly_rows,
        "ScenarioAnalysis": scenario_rows,
        "CropRanking": crop_ranking_rows,
        "CostBreakdown": cost_breakdown_rows,
        "Inputs": inputs_rows,
        "Calculations": calc_rows,
        "Summary": summary_rows,
    }


def export_csv_text(sheet_payload: dict[str, list[list[Any]]]) -> str:
    out = StringIO()
    writer = csv.writer(out)
    sheet_order = ["Dashboard", "MonthlyProjection", "ScenarioAnalysis", "CropRanking", "CostBreakdown", "Inputs", "Calculations", "Summary"]
    for sheet_name in sheet_order:
        rows = sheet_payload.get(sheet_name, [])
        if not rows:
            continue

        header = rows[0]
        writer.writerow(["sheet", *header])
        for row in rows[1:]:
            writer.writerow([sheet_name, *row])

    return out.getvalue()
