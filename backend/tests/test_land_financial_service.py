from services.land_financial_service import compute_land_financials


def _base_context():
    return {
        "answers": {
            "worker_count": 2,
            "salary_per_worker_month": 10000,
            "seasonal_labor_cost_month": 2000,
            "electricity_units_per_month": 100,
            "electricity_cost_per_unit": 8,
            "maintenance_cost_month": 1000,
            "land_rent_month": 3000,
            "seed_cost_per_cycle": 1000,
            "pesticide_cost_month": 1200,
            "fuel_cost_month": 1500,
            "transport_cost_month": 1800,
            "post_harvest_spoilage_percent": 10,
            "machines_cost_total": 100000,
            "setup_cost_total": 50000,
            "land_area_sqm": 1000,
        },
        "crops": [
            {
                "name": "tomato",
                "cycles_per_year": 4,
                "months_to_harvest": 3,
                "yield_kg_per_harvest": 100,
                "price_per_kg": 20,
            }
        ],
        "market_price_source": {
            "tomato": {"source": "data.gov.in agmarknet"}
        },
    }


def test_spoilage_and_new_costs_affect_profit():
    ctx = _base_context()
    out = compute_land_financials(ctx)

    summary = out["summary"]
    costs = out["cost_breakdown"]

    assert summary["sellable_yield_kg"] < summary["total_annual_yield_kg"]
    assert costs["seasonal_labor"] > 0
    assert costs["pesticide"] > 0
    assert costs["fuel"] > 0
    assert costs["transport"] > 0
    assert "labor_efficiency_ratio" in summary


def test_backward_compat_keys_still_exist():
    ctx = _base_context()
    out = compute_land_financials(ctx)
    summary = out["summary"]

    for key in (
        "total_revenue",
        "total_cost",
        "profit",
        "cost_per_kg",
        "roi_percent",
        "total_capex",
        "total_annual_yield_kg",
    ):
        assert key in summary
