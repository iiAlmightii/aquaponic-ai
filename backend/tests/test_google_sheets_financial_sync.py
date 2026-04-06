import pytest

from services.financial_service import FinancialInputs
from services.google_sheets_financial_sync import GoogleSheetsFinanceSync, SheetRowRef


@pytest.fixture
def sync_service(monkeypatch):
    monkeypatch.setattr(GoogleSheetsFinanceSync, "_ensure_workbook_layout", lambda self: None)
    return GoogleSheetsFinanceSync(api_client=("dummy_sheet", object()))


def test_read_inputs_row_parses_expected_values(monkeypatch, sync_service):
    farm_id = "farm_123"
    expected = FinancialInputs(
        infrastructure_cost=1000,
        equipment_cost=2000,
        initial_stock_cost=3000,
        monthly_feed_cost=4000,
        monthly_labor_cost=5000,
        monthly_utilities_cost=6000,
        monthly_maintenance_cost=7000,
        monthly_other_cost=8000,
        monthly_fish_revenue=9000,
        monthly_crop_revenue=10000,
        monthly_other_revenue=11000,
        land_area_sqm=750,
        horizon_months=24,
    )

    svc = sync_service

    def fake_values_get(range_a1: str):
        # Inputs!A1:P200 -> columns A..P
        return [
            [
                farm_id,
                "3",
                "2026-01-01T00:00:00Z",
                "1000",
                "2000",
                "3000",
                "4000",
                "5000",
                "6000",
                "7000",
                "8000",
                "9000",
                "10000",
                "11000",
                "750",
                "24",
            ]
        ]

    monkeypatch.setattr(svc, "_values_get", lambda range_a1: fake_values_get(range_a1))

    ref, fin = svc.read_inputs_row(farm_id)
    assert ref is not None
    assert ref.row_number == 1
    assert ref.state_version == 3
    assert fin is not None
    assert fin.infrastructure_cost == expected.infrastructure_cost
    assert fin.land_area_sqm == expected.land_area_sqm
    assert fin.horizon_months == expected.horizon_months


def test_write_inputs_row_conflict_raises_and_does_not_overwrite(monkeypatch, sync_service):
    farm_id = "farm_conflict"
    svc = sync_service
    fin = FinancialInputs(horizon_months=12, monthly_fish_revenue=100)

    current_ref = SheetRowRef(row_number=5, state_version=2, updated_at_iso="2026-01-02T00:00:00Z")

    monkeypatch.setattr(svc, "read_inputs_row", lambda fid: (current_ref, fin))

    called = {"update": 0, "append": 0, "audit": 0}
    monkeypatch.setattr(svc, "_values_update", lambda *args, **kwargs: called.__setitem__("update", called["update"] + 1))
    monkeypatch.setattr(svc, "_values_append", lambda *args, **kwargs: called.__setitem__("append", called["append"] + 1))
    monkeypatch.setattr(svc, "write_assumptions_row", lambda *args, **kwargs: None)
    monkeypatch.setattr(svc, "append_audit_log", lambda *args, **kwargs: called.__setitem__("audit", called["audit"] + 1))

    with pytest.raises(PermissionError):
        svc.write_inputs_row(
            farm_id,
            fin,
            expected_state_version=1,
            force=False,
            session_id="sess_1",
            audit_action="app_push_financial_inputs",
            direction="push",
        )

    assert called["update"] == 0
    assert called["append"] == 0
    assert called["audit"] == 1


def test_write_inputs_row_updates_only_B_to_P(monkeypatch, sync_service):
    farm_id = "farm_update"
    svc = sync_service
    fin = FinancialInputs(horizon_months=12, monthly_fish_revenue=100, monthly_crop_revenue=50)

    current_ref = SheetRowRef(row_number=7, state_version=10, updated_at_iso="2026-01-02T00:00:00Z")
    monkeypatch.setattr(svc, "read_inputs_row", lambda fid: (current_ref, fin))
    monkeypatch.setattr(svc, "write_assumptions_row", lambda *args, **kwargs: None)
    monkeypatch.setattr(svc, "append_audit_log", lambda *args, **kwargs: None)

    captured = {"range_a1": None, "values": None}

    def fake_update(range_a1: str, values):
        captured["range_a1"] = range_a1
        captured["values"] = values

    monkeypatch.setattr(svc, "_values_update", fake_update)
    monkeypatch.setattr(svc, "_values_append", lambda *args, **kwargs: None)

    new_version, updated_at_iso = svc.write_inputs_row(
        farm_id,
        fin,
        expected_state_version=None,
        force=False,
        session_id="sess_1",
        audit_action="app_push_financial_inputs",
        direction="push",
    )

    assert captured["range_a1"] == "Inputs!B7:P7"
    assert captured["values"] is not None
    # payload[1:] length (B..P) should be 15 columns for a single row.
    assert len(captured["values"][0]) == 15
    assert new_version == 11
    assert isinstance(updated_at_iso, str)

