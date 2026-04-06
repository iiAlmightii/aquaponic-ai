from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from services.financial_service import FinancialInputs


INPUTS_TAB = "Inputs"
ASSUMPTIONS_TAB = "Assumptions"
AUDIT_LOG_TAB = "AuditLog"
SUMMARY_TAB = "Summary"
PROJECTIONS_TAB = "Projections"

# Expected stable schema (header row in row 1):
# Inputs columns (A..P)
# A: farm_id
# B: state_version
# C: updated_at (ISO)
# D: infrastructure_cost
# E: equipment_cost
# F: initial_stock_cost
# G: monthly_feed_cost
# H: monthly_labor_cost
# I: monthly_utilities_cost
# J: monthly_maintenance_cost
# K: monthly_other_cost
# L: monthly_fish_revenue
# M: monthly_crop_revenue
# N: monthly_other_revenue
# O: land_area_sqm
# P: horizon_months
INPUTS_RANGE_A1 = "A1:P200"

# Assumptions columns (A..C)
# A: farm_id
# B: discount_rate_annual
# C: updated_at (ISO)
ASSUMPTIONS_RANGE_A1 = "A1:C200"

# Minimal AuditLog columns:
# A: timestamp
# B: direction (push|pull|conflict)
# C: farm_id
# D: action
# E: session_id
# F: sheet_version_before
# G: sheet_version_after
# H: details_json
AUDIT_LOG_RANGE_A1 = "A1:H1000"
SUMMARY_RANGE_A1 = "A1:AC500"
PROJECTIONS_RANGE_A1 = "A1:I5000"

INPUTS_HEADERS = [
    "farm_id", "state_version", "updated_at",
    "infrastructure_cost", "equipment_cost", "initial_stock_cost",
    "monthly_feed_cost", "monthly_labor_cost", "monthly_utilities_cost",
    "monthly_maintenance_cost", "monthly_other_cost",
    "monthly_fish_revenue", "monthly_crop_revenue", "monthly_other_revenue",
    "land_area_sqm",
    "horizon_months",
]
ASSUMPTIONS_HEADERS = ["farm_id", "discount_rate_annual", "updated_at"]
AUDIT_HEADERS = [
    "timestamp", "direction", "farm_id", "action", "session_id",
    "sheet_version_before", "sheet_version_after", "details_json",
]
SUMMARY_HEADERS = [
    "farm_id", "state_version", "updated_at",
    "total_capex", "total_opex_annual", "total_revenue_annual", "net_profit_annual",
    "roi_percent", "payback_period_months", "break_even_month",
    "npv_base", "npv_pessimistic", "npv_optimistic",
    "land_area_sqm", "revenue_per_sqm", "profit_per_sqm", "capex_per_sqm", "opex_per_sqm",
    "profit_margin_percent", "cost_of_goods_sold_percent", "opex_as_percent_of_revenue",
    "fish_revenue_share_percent", "crop_revenue_share_percent", "other_revenue_share_percent",
    "feed_cost_share_percent", "labor_cost_share_percent", "utilities_cost_share_percent",
    "maintenance_cost_share_percent", "other_cost_share_percent",
]
PROJECTIONS_HEADERS = [
    "farm_id", "state_version", "updated_at", "scenario", "month",
    "revenue", "opex", "net", "cumulative",
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_int(value: Any, default: int = 0) -> int:
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _is_sheets_credentials_configured() -> bool:
    """Check if Google Sheets credentials are configured without raising errors."""
    creds_file = os.getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE", "").strip()
    if creds_file and os.path.isfile(creds_file):
        return True

    raw_json = os.getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON", "").strip()
    if raw_json:
        return True
    
    client_email = os.getenv("GOOGLE_SHEETS_CLIENT_EMAIL", "").strip()
    private_key = os.getenv("GOOGLE_SHEETS_PRIVATE_KEY", "").strip()
    return bool(client_email and private_key)


def _get_service_account_info() -> dict[str, Any]:
    # Preferred: service account JSON file path.
    creds_file = os.getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE", "").strip()
    if creds_file:
        if not os.path.isfile(creds_file):
            raise ValueError(
                f"GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE points to a missing file: {creds_file}. "
                "Please verify the file path and mount."
            )
        try:
            with open(creds_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE is not valid JSON: {str(e)}. "
                "Please verify the service account key file content."
            )

    # Preferred: full JSON in one env var.
    raw_json = os.getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON", "")
    if raw_json.strip():
        try:
            return json.loads(raw_json)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON is invalid JSON: {str(e)}. "
                "Please check the formatting in your .env file."
            )

    # Fallback: split fields.
    client_email = os.getenv("GOOGLE_SHEETS_CLIENT_EMAIL", "").strip()
    private_key = os.getenv("GOOGLE_SHEETS_PRIVATE_KEY", "").strip()
    if client_email and private_key:
        # The google library expects PEM newlines.
        private_key = private_key.replace("\\n", "\n")
        project_id = os.getenv("GOOGLE_SHEETS_PROJECT_ID", "").strip() or None
        private_key_id = os.getenv("GOOGLE_SHEETS_PRIVATE_KEY_ID", "").strip() or None
        client_id = os.getenv("GOOGLE_SHEETS_CLIENT_ID", "").strip() or None
        return {
            "type": "service_account",
            "project_id": project_id,
            "private_key_id": private_key_id,
            "client_email": client_email,
            "private_key": private_key,
            "client_id": client_id,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email}",
            "universe_domain": "googleapis.com",
        }

    # Provide detailed error message with setup instructions
    raise ValueError(
        "Google Sheets credentials are not configured. Please set one of the following:\n"
        "  Option A (recommended): GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE=/path/to/service-account.json\n"
        "  Option B: GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON='<full service account JSON>'\n"
        "  Option C: GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY\n"
        "\n"
        "Also ensure GOOGLE_SHEETS_SPREADSHEET_ID is set.\n"
        "See GOOGLE_SHEETS_SETUP.md for step-by-step setup instructions."
    )


def _build_sheets_api():
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
    if not spreadsheet_id:
        raise ValueError(
            "GOOGLE_SHEETS_SPREADSHEET_ID environment variable is not set. "
            "Please configure it in your .env file. "
            "See GOOGLE_SHEETS_SETUP.md for instructions."
        )

    # Lazy import: allows unit tests to run without Google SDK installed.
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    try:
        creds_info = _get_service_account_info()
    except ValueError as e:
        raise ValueError(str(e)) from e

    try:
        scopes = ["https://www.googleapis.com/auth/spreadsheets"]
        creds = service_account.Credentials.from_service_account_info(creds_info, scopes=scopes)
        return spreadsheet_id, build("sheets", "v4", credentials=creds, cache_discovery=False)
    except Exception as e:
        raise ValueError(
            f"Failed to authenticate with Google Sheets: {str(e)}. "
            "Please verify your Google Sheets credentials are correct. "
            "See GOOGLE_SHEETS_SETUP.md for configuration help."
        ) from e


@dataclass
class SheetRowRef:
    row_number: int
    state_version: int
    updated_at_iso: str


class GoogleSheetsFinanceSync:
    """
    Service-account based Sheets sync for financial planning.
    Reads/writes ONLY input/assumption ranges (never formula tabs).
    """

    def __init__(self, api_client=None):
        self.spreadsheet_id, self.sheets = api_client or _build_sheets_api()
        self._ensure_workbook_layout()

    def _values_clear(self, range_a1: str):
        self.sheets.spreadsheets().values().clear(
            spreadsheetId=self.spreadsheet_id,
            range=range_a1,
            body={},
        ).execute()

    def _sheet_titles(self) -> set[str]:
        meta = self.sheets.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            fields="sheets(properties(title))",
        ).execute()
        return {s["properties"]["title"] for s in meta.get("sheets", [])}

    def _ensure_tabs_exist(self, titles: list[str]) -> None:
        existing = self._sheet_titles()
        requests = []
        for title in titles:
            if title not in existing:
                requests.append({"addSheet": {"properties": {"title": title}}})
        if requests:
            self.sheets.spreadsheets().batchUpdate(
                spreadsheetId=self.spreadsheet_id,
                body={"requests": requests},
            ).execute()

    def _ensure_headers(self, tab: str, headers: list[str]) -> None:
        current = self._values_get(f"{tab}!1:1")
        row = current[0] if current else []
        if row[: len(headers)] != headers:
            end_col = chr(ord("A") + len(headers) - 1)
            self._values_update(f"{tab}!A1:{end_col}1", [headers])

    def _ensure_workbook_layout(self) -> None:
        self._ensure_tabs_exist([INPUTS_TAB, ASSUMPTIONS_TAB, AUDIT_LOG_TAB, SUMMARY_TAB, PROJECTIONS_TAB])
        self._ensure_headers(INPUTS_TAB, INPUTS_HEADERS)
        self._ensure_headers(ASSUMPTIONS_TAB, ASSUMPTIONS_HEADERS)
        self._ensure_headers(AUDIT_LOG_TAB, AUDIT_HEADERS)
        self._ensure_headers(SUMMARY_TAB, SUMMARY_HEADERS)
        self._ensure_headers(PROJECTIONS_TAB, PROJECTIONS_HEADERS)

    def _values_get(self, range_a1: str) -> list[list[str]]:
        res = self.sheets.spreadsheets().values().get(
            spreadsheetId=self.spreadsheet_id,
            range=range_a1,
            majorDimension="ROWS",
        ).execute()
        return res.get("values", [])

    def _values_update(self, range_a1: str, values: list[list[Any]]):
        self.sheets.spreadsheets().values().update(
            spreadsheetId=self.spreadsheet_id,
            range=range_a1,
            valueInputOption="USER_ENTERED",
            body={"values": values},
        ).execute()

    def _values_append(self, range_a1: str, values: list[list[Any]]):
        self.sheets.spreadsheets().values().append(
            spreadsheetId=self.spreadsheet_id,
            range=range_a1,
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": values},
        ).execute()

    def _find_row_by_farm_id(self, all_rows: list[list[str]], farm_id: str) -> Optional[int]:
        for i, row in enumerate(all_rows):
            if len(row) > 0 and str(row[0]).strip() == str(farm_id).strip():
                return i  # 0-based offset within `all_rows`
        return None

    def read_inputs_row(self, farm_id: str) -> tuple[Optional[SheetRowRef], Optional[FinancialInputs]]:
        inputs_rows = self._values_get(f"{INPUTS_TAB}!{INPUTS_RANGE_A1}")
        idx = self._find_row_by_farm_id(inputs_rows, farm_id)
        if idx is None:
            return None, None

        row = inputs_rows[idx]
        # Values indexes aligned to columns A..P
        state_version = _parse_int(row[1] if len(row) > 1 else None, 0)
        updated_at_iso = str(row[2] if len(row) > 2 else "") or _utc_now_iso()

        fin = FinancialInputs(
            infrastructure_cost=_parse_float(row[3] if len(row) > 3 else None, 0.0),
            equipment_cost=_parse_float(row[4] if len(row) > 4 else None, 0.0),
            initial_stock_cost=_parse_float(row[5] if len(row) > 5 else None, 0.0),
            monthly_feed_cost=_parse_float(row[6] if len(row) > 6 else None, 0.0),
            monthly_labor_cost=_parse_float(row[7] if len(row) > 7 else None, 0.0),
            monthly_utilities_cost=_parse_float(row[8] if len(row) > 8 else None, 0.0),
            monthly_maintenance_cost=_parse_float(row[9] if len(row) > 9 else None, 0.0),
            monthly_other_cost=_parse_float(row[10] if len(row) > 10 else None, 0.0),
            monthly_fish_revenue=_parse_float(row[11] if len(row) > 11 else None, 0.0),
            monthly_crop_revenue=_parse_float(row[12] if len(row) > 12 else None, 0.0),
            monthly_other_revenue=_parse_float(row[13] if len(row) > 13 else None, 0.0),
            land_area_sqm=_parse_float(row[14] if len(row) > 14 else None, 0.0),
            horizon_months=_parse_int(row[15] if len(row) > 15 else None, 12),
        )

        row_ref = SheetRowRef(row_number=idx + 1, state_version=state_version, updated_at_iso=updated_at_iso)
        return row_ref, fin

    def read_assumptions(self, farm_id: str, default_discount_rate_annual: float = 0.08) -> float:
        rows = self._values_get(f"{ASSUMPTIONS_TAB}!{ASSUMPTIONS_RANGE_A1}")
        idx = self._find_row_by_farm_id(rows, farm_id)
        if idx is None:
            return default_discount_rate_annual
        row = rows[idx]
        return _parse_float(row[1] if len(row) > 1 else None, default_discount_rate_annual)

    def write_inputs_row(
        self,
        farm_id: str,
        fin: FinancialInputs,
        plan_state: Optional[dict[str, Any]] = None,
        *,
        expected_state_version: Optional[int],
        force: bool,
        session_id: Optional[str] = None,
        audit_action: str,
        direction: str,
    ) -> tuple[int, str]:
        """
        Writes only Inputs!A..P (data row) for the given farm_id.
        Returns (new_state_version, updated_at_iso).
        """
        current_ref, _ = self.read_inputs_row(farm_id)
        current_version = current_ref.state_version if current_ref else 0
        current_updated_at = current_ref.updated_at_iso if current_ref else ""

        if expected_state_version is not None and int(expected_state_version) != int(current_version) and not force:
            # Conflict: do not overwrite.
            details = {
                "expected_state_version": expected_state_version,
                "current_state_version": current_version,
                "current_updated_at": current_updated_at,
            }
            self.append_audit_log(
                direction="conflict",
                action=audit_action,
                farm_id=farm_id,
                session_id=session_id,
                sheet_version_before=current_version,
                sheet_version_after=current_version,
                details=details,
            )
            raise PermissionError("Sheet state version conflict")

        new_version = current_version + 1
        updated_at_iso = _utc_now_iso()

        payload = [
            str(farm_id),
            str(new_version),
            updated_at_iso,
            fin.infrastructure_cost,
            fin.equipment_cost,
            fin.initial_stock_cost,
            fin.monthly_feed_cost,
            fin.monthly_labor_cost,
            fin.monthly_utilities_cost,
            fin.monthly_maintenance_cost,
            fin.monthly_other_cost,
            fin.monthly_fish_revenue,
            fin.monthly_crop_revenue,
            fin.monthly_other_revenue,
            fin.land_area_sqm,
            fin.horizon_months,
        ]

        if current_ref:
            # Update only B..P columns (inputs) to avoid clobbering A/farm_id.
            start_col = "B"
            end_col = "P"
            range_a1 = f"{INPUTS_TAB}!{start_col}{current_ref.row_number}:{end_col}{current_ref.row_number}"
            # Slice payload to B..P.
            values = [payload[1:]]
            self._values_update(range_a1, values)
        else:
            # Append full A..P row.
            self._values_append(f"{INPUTS_TAB}!A1", [payload])

        # Assumptions: update discount rate too, but keep it explicit via fin.discount_rate_annual.
        self.write_assumptions_row(farm_id, fin.discount_rate_annual, updated_at_iso)
        if plan_state:
            self.write_summary_row(farm_id, plan_state, new_version, updated_at_iso)
            self.write_projections_rows(farm_id, plan_state, new_version, updated_at_iso)

        self.append_audit_log(
            direction=direction,
            action=audit_action,
            farm_id=farm_id,
            session_id=session_id,
            sheet_version_before=current_version,
            sheet_version_after=new_version,
            details={"updated_at": updated_at_iso},
        )

        return new_version, updated_at_iso

    def write_summary_row(
        self,
        farm_id: str,
        plan_state: dict[str, Any],
        state_version: int,
        updated_at_iso: str,
    ) -> None:
        rows = self._values_get(f"{SUMMARY_TAB}!{SUMMARY_RANGE_A1}")
        idx = self._find_row_by_farm_id(rows, farm_id)

        scenarios = plan_state.get("scenarios", {}) or {}
        base_npv = (scenarios.get("base") or {}).get("npv")
        pess_npv = (scenarios.get("pessimistic") or {}).get("npv")
        opt_npv = (scenarios.get("optimistic") or {}).get("npv")

        payload = [
            str(farm_id),
            str(state_version),
            updated_at_iso,
            plan_state.get("total_capex", 0),
            plan_state.get("total_opex_annual", 0),
            plan_state.get("total_revenue_annual", 0),
            plan_state.get("net_profit_annual", 0),
            plan_state.get("roi_percent", 0),
            plan_state.get("payback_period_months", ""),
            plan_state.get("break_even_month", ""),
            base_npv if base_npv is not None else "",
            pess_npv if pess_npv is not None else "",
            opt_npv if opt_npv is not None else "",
            plan_state.get("land_area_sqm", 0),
            plan_state.get("revenue_per_sqm", 0),
            plan_state.get("profit_per_sqm", 0),
            plan_state.get("capex_per_sqm", 0),
            plan_state.get("opex_per_sqm", 0),
            plan_state.get("profit_margin_percent", 0),
            plan_state.get("cost_of_goods_sold_percent", 0),
            plan_state.get("opex_as_percent_of_revenue", 0),
            plan_state.get("fish_revenue_share_percent", 0),
            plan_state.get("crop_revenue_share_percent", 0),
            plan_state.get("other_revenue_share_percent", 0),
            plan_state.get("feed_cost_share_percent", 0),
            plan_state.get("labor_cost_share_percent", 0),
            plan_state.get("utilities_cost_share_percent", 0),
            plan_state.get("maintenance_cost_share_percent", 0),
            plan_state.get("other_cost_share_percent", 0),
        ]

        if idx is None:
            self._values_append(f"{SUMMARY_TAB}!A1", [payload])
        else:
            row_number = idx + 1
            self._values_update(f"{SUMMARY_TAB}!A{row_number}:AC{row_number}", [payload])

    def write_projections_rows(
        self,
        farm_id: str,
        plan_state: dict[str, Any],
        state_version: int,
        updated_at_iso: str,
    ) -> None:
        existing = self._values_get(f"{PROJECTIONS_TAB}!{PROJECTIONS_RANGE_A1}")
        if not existing:
            existing = [PROJECTIONS_HEADERS]

        header = existing[0]
        data_rows = existing[1:]
        retained = [r for r in data_rows if not r or str(r[0]).strip() != str(farm_id).strip()]

        new_rows: list[list[Any]] = []
        scenarios = plan_state.get("scenarios", {}) or {}
        for scenario_name in ["base", "pessimistic", "optimistic"]:
            scenario = scenarios.get(scenario_name) or {}
            for cf in scenario.get("cash_flows", []) or []:
                new_rows.append([
                    str(farm_id),
                    str(state_version),
                    updated_at_iso,
                    scenario_name,
                    cf.get("month", ""),
                    cf.get("revenue", ""),
                    cf.get("opex", ""),
                    cf.get("net", ""),
                    cf.get("cumulative", ""),
                ])

        all_rows = [header] + retained + new_rows
        self._values_clear(f"{PROJECTIONS_TAB}!{PROJECTIONS_RANGE_A1}")
        end_row = max(1, len(all_rows))
        self._values_update(f"{PROJECTIONS_TAB}!A1:I{end_row}", all_rows)

    def write_assumptions_row(self, farm_id: str, discount_rate_annual: float, updated_at_iso: str):
        rows = self._values_get(f"{ASSUMPTIONS_TAB}!{ASSUMPTIONS_RANGE_A1}")
        idx = self._find_row_by_farm_id(rows, farm_id)
        payload = [str(farm_id), discount_rate_annual, updated_at_iso]
        if idx is None:
            self._values_append(f"{ASSUMPTIONS_TAB}!A1", [payload])
        else:
            row_number = idx + 1
            self._values_update(
                f"{ASSUMPTIONS_TAB}!B{row_number}:C{row_number}",
                [[discount_rate_annual, updated_at_iso]],
            )

    def append_audit_log(
        self,
        *,
        direction: str,
        action: str,
        farm_id: str,
        session_id: Optional[str],
        sheet_version_before: int,
        sheet_version_after: int,
        details: dict[str, Any],
    ):
        payload = [
            _utc_now_iso(),
            direction,
            str(farm_id),
            action,
            session_id or "",
            str(sheet_version_before),
            str(sheet_version_after),
            json.dumps(details, ensure_ascii=False),
        ]
        self._values_append(f"{AUDIT_LOG_TAB}!A1", [payload])

    def sync_status(self, farm_id: str) -> dict[str, Any]:
        ref, _ = self.read_inputs_row(farm_id)
        if not ref:
            return {"sheet_version": 0, "updated_at": "", "farm_id": farm_id}
        return {"sheet_version": ref.state_version, "updated_at": ref.updated_at_iso, "farm_id": farm_id}

    def read_full_financial_inputs(self, farm_id: str) -> FinancialInputs:
        ref, fin = self.read_inputs_row(farm_id)
        if not ref or not fin:
            # Default empty inputs.
            fin = FinancialInputs(
                horizon_months=12,
                discount_rate_annual=0.08,
            )
        discount_rate = self.read_assumptions(farm_id, default_discount_rate_annual=fin.discount_rate_annual)
        fin.discount_rate_annual = discount_rate
        return fin

