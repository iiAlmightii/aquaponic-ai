"""Google Sheets sync for land-based farm planning outputs.

Layout (v5_direct_2026_04_13):
  Rows  1- 2  Title banner + subtitle
  Row   3     Spacer
  Rows  4- 6  Five KPI cards
  Row   7     Divider spacer
  Rows  8-20  Unit Economics (left A:G) | Scenario Analysis (right H:O)
  Row  21     Spacer
  Rows 22-23  Crop Profitability header + column labels
  Rows 24-35  Crop data rows (up to 12 crops)
  Row  36     Spacer
  Rows 37-38  Recommendations header + column labels
  Rows 39-52  Recommendation rows (up to 14)
  Row  53     Spacer
  Row  54     Footer
  Rows 57-96  Charts (4 charts, 2 × 2 grid, anchored at rows 57 and 80)
"""

from __future__ import annotations

import random
import time
from typing import Any

from services.google_sheets_financial_sync import _build_sheets_api


DASHBOARD_TEMPLATE_VERSION = "v5_direct_2026_04_13"


def _kv(rows: list[list[Any]]) -> dict[str, Any]:
    """Parse a two-column key-value list into a dict."""
    out: dict[str, Any] = {}
    for row in rows:
        if row and len(row) >= 2 and row[0] is not None and row[1] is not None:
            out[str(row[0])] = row[1]
    return out


def _fv(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


class LandSheetSync:
    # ── Colour palette (RGB 0‑1) ─────────────────────────────────────────
    _CLR_DARK   = {"red": 0.106, "green": 0.165, "blue": 0.290}   # #1B2A4A navy
    _CLR_ACCENT = {"red": 0.290, "green": 0.565, "blue": 0.851}   # #4A90D9 blue
    _CLR_GREEN  = {"red": 0.180, "green": 0.800, "blue": 0.443}   # #2ECC71
    _CLR_RED    = {"red": 0.906, "green": 0.298, "blue": 0.235}   # #E74C3C
    _CLR_AMBER  = {"red": 0.953, "green": 0.612, "blue": 0.071}   # #F39C12
    _CLR_PURPLE = {"red": 0.608, "green": 0.349, "blue": 0.714}   # #9B59B6
    _CLR_BG     = {"red": 0.969, "green": 0.976, "blue": 0.988}   # #F7F9FC
    _CLR_CARD   = {"red": 1,     "green": 1,     "blue": 1}       # white
    _CLR_BORDER = {"red": 0.878, "green": 0.878, "blue": 0.878}   # #E0E0E0
    _CLR_TXT    = {"red": 0.173, "green": 0.243, "blue": 0.314}   # #2C3E50
    _CLR_TXT2   = {"red": 0.498, "green": 0.549, "blue": 0.553}   # #7F8C8D
    _CLR_ALT    = {"red": 0.941, "green": 0.957, "blue": 0.973}   # #F0F4F8
    _CLR_FOOTER = {"red": 0.741, "green": 0.765, "blue": 0.780}   # #BDC3C7
    _CLR_WHITE  = {"red": 1,     "green": 1,     "blue": 1}

    def __init__(self):
        self.spreadsheet_id, self.sheets = _build_sheets_api()

    # ── Infrastructure helpers ───────────────────────────────────────────

    def _sheet_meta(self) -> list[dict[str, Any]]:
        meta = self.sheets.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            fields="sheets(properties(sheetId,title,index),charts(chartId))",
        ).execute()
        return meta.get("sheets", [])

    def _sheet_id_by_title(self, title: str) -> int | None:
        for sheet in self._sheet_meta():
            props = sheet.get("properties", {})
            if props.get("title") == title:
                return props.get("sheetId")
        return None

    def _sheet_titles(self) -> set[str]:
        meta = self.sheets.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            fields="sheets(properties(title))",
        ).execute()
        return {s["properties"]["title"] for s in meta.get("sheets", [])}

    @staticmethod
    def _is_rate_limit_error(exc: Exception) -> bool:
        status = getattr(getattr(exc, "resp", None), "status", None)
        text = str(exc)
        return status == 429 or "RATE_LIMIT_EXCEEDED" in text or "Write requests per minute" in text

    def _execute_with_retry(self, op_name: str, fn):
        for attempt in range(5):
            try:
                return fn()
            except Exception as exc:
                if not self._is_rate_limit_error(exc) or attempt == 4:
                    raise
                time.sleep(min(20.0, (2 ** attempt) + random.uniform(0.25, 1.0)))

    def _ensure_tabs(self, titles: list[str]) -> None:
        existing = self._sheet_titles()
        req = [{"addSheet": {"properties": {"title": t}}} for t in titles if t not in existing]
        if req:
            self._execute_with_retry(
                "ensure_tabs",
                lambda: self.sheets.spreadsheets().batchUpdate(
                    spreadsheetId=self.spreadsheet_id, body={"requests": req}
                ).execute(),
            )

    def _rename_sheet(self, old_title: str, new_title: str) -> None:
        meta = self.sheets.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            fields="sheets(properties(sheetId,title))",
        ).execute()
        for sheet in meta.get("sheets", []):
            props = sheet.get("properties", {})
            if props.get("title") == old_title:
                self._execute_with_retry(
                    "rename_sheet",
                    lambda: self.sheets.spreadsheets().batchUpdate(
                        spreadsheetId=self.spreadsheet_id,
                        body={"requests": [{"updateSheetProperties": {
                            "properties": {"sheetId": props["sheetId"], "title": new_title},
                            "fields": "title",
                        }}]},
                    ).execute(),
                )
                return

    def _clear(self, range_a1: str) -> None:
        self._execute_with_retry(
            f"clear_{range_a1}",
            lambda: self.sheets.spreadsheets().values().clear(
                spreadsheetId=self.spreadsheet_id, range=range_a1, body={}
            ).execute(),
        )

    def _update(self, range_a1: str, values: list[list[Any]]) -> None:
        self._execute_with_retry(
            f"update_{range_a1}",
            lambda: self.sheets.spreadsheets().values().update(
                spreadsheetId=self.spreadsheet_id,
                range=range_a1,
                valueInputOption="USER_ENTERED",
                body={"values": values},
            ).execute(),
        )

    def _values_get(self, range_a1: str) -> list[list[Any]]:
        res = self.sheets.spreadsheets().values().get(
            spreadsheetId=self.spreadsheet_id,
            range=range_a1,
            majorDimension="ROWS",
        ).execute()
        return res.get("values", [])

    def _batch_update(self, requests: list[dict[str, Any]]) -> None:
        if not requests:
            return
        # Send in chunks of 50 to avoid API limits
        for i in range(0, len(requests), 50):
            chunk = requests[i:i + 50]
            self._execute_with_retry(
                f"batch_update_chunk_{i}",
                lambda c=chunk: self.sheets.spreadsheets().batchUpdate(
                    spreadsheetId=self.spreadsheet_id, body={"requests": c}
                ).execute(),
            )

    # ── Dashboard data writing ───────────────────────────────────────────

    def _write_dashboard_canvas(self, payload: dict[str, list[list[Any]]]) -> None:
        """Write the dashboard with actual computed values — no VLOOKUP formulas."""
        self._clear("Dashboard!A:Z")
        self._update("Dashboard!Z1:Z1", [[DASHBOARD_TEMPLATE_VERSION]])

        # ── Parse payload into usable dicts ──────────────────────────────
        dash_kv = _kv(payload.get("Dashboard", []))
        summary_kv = _kv(payload.get("Summary", []))

        # Pull KPI values
        total_revenue = _fv(dash_kv.get("Total Revenue (Annual)") or summary_kv.get("total_revenue"))
        total_cost    = _fv(dash_kv.get("Total Cost (Annual)") or summary_kv.get("total_cost"))
        profit        = _fv(dash_kv.get("Profit (Annual)") or summary_kv.get("profit"))
        roi_pct       = _fv(dash_kv.get("ROI (%)") or summary_kv.get("roi_percent"))
        cost_per_kg   = _fv(dash_kv.get("Cost per KG") or summary_kv.get("cost_per_kg"))
        land_area     = _fv(dash_kv.get("Land Area (sqm)"))
        rev_per_sqm   = _fv(dash_kv.get("Revenue per sqm"))
        yield_per_sqm = _fv(dash_kv.get("Yield per sqm (kg)"))
        labor_eff     = _fv(dash_kv.get("Labor Efficiency Ratio") or summary_kv.get("labor_efficiency_ratio"))
        top_crop      = str(dash_kv.get("Top Revenue Crop") or "n/a")
        profit_margin = _fv(dash_kv.get("Profit Margin (%)"))
        total_yield   = _fv(dash_kv.get("Total Annual Yield (KG)") or summary_kv.get("total_annual_yield_kg"))
        sellable_yield = _fv(dash_kv.get("Sellable Yield (KG)") or summary_kv.get("sellable_yield_kg"))
        total_capex   = _fv(dash_kv.get("Total Capex") or summary_kv.get("total_capex"))
        spoilage_loss = _fv(dash_kv.get("Spoilage Loss Value") or summary_kv.get("spoilage_loss_value"))
        bep_per_kg    = _fv(dash_kv.get("Break-even Price per KG"))
        labor_share   = _fv(dash_kv.get("Labor Cost Share (%)"))
        electricity_share = _fv(dash_kv.get("Electricity Cost Share (%)"))

        # ── Scenario data ─────────────────────────────────────────────────
        scenario_rows = payload.get("ScenarioAnalysis", [])
        # scenario_rows[0] is header; data rows have [name, ..., projected_profit, margin_pct]
        scenario_data = [r for r in scenario_rows[1:] if r and len(r) >= 6]

        # ── Crop ranking ─────────────────────────────────────────────────
        crop_rows = payload.get("CropRanking", [])
        crop_data = [r for r in crop_rows[1:] if r and len(r) >= 4]

        # ── Recommendations ───────────────────────────────────────────────
        rec_rows = payload.get("Recommendations", [])
        rec_data = [r for r in rec_rows[1:] if r and len(r) >= 3]

        # ── Row 1: Title banner ───────────────────────────────────────────
        self._update("Dashboard!A1:O1", [[
            "Land Farm Financial Dashboard", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        ]])

        # ── Row 2: Subtitle ───────────────────────────────────────────────
        self._update("Dashboard!A2:O2", [[
            "Survey-driven financial analysis  ·  Revenue, cost, profitability & scenario modelling",
            "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        ]])

        # ── Row 3: Spacer (left empty) ────────────────────────────────────

        # ── Rows 4-6: KPI Cards ───────────────────────────────────────────
        # 5 cards × 3 cols = 15 cols (A-O)
        # Row 4 = labels, Row 5 = values, Row 6 = sub-labels
        self._update("Dashboard!A4:O4", [[
            "TOTAL REVENUE (Annual)", "", "",
            "TOTAL COST (Annual)", "", "",
            "NET PROFIT (Annual)", "", "",
            "RETURN ON INVESTMENT", "", "",
            "COST PER KG", "", "",
        ]])
        roi_display = f"{roi_pct:.1f}%" if roi_pct else "N/A"
        self._update("Dashboard!A5:O5", [[
            f"\u20b9{total_revenue:,.0f}", "", "",
            f"\u20b9{total_cost:,.0f}", "", "",
            f"\u20b9{profit:,.0f}", "", "",
            roi_display, "", "",
            f"\u20b9{cost_per_kg:,.2f}", "", "",
        ]])
        profit_margin_display = f"{profit_margin:.1f}% margin" if profit_margin else ""
        self._update("Dashboard!A6:O6", [[
            f"Yield: {total_yield:,.0f} kg/yr", "", "",
            f"Capex: \u20b9{total_capex:,.0f}", "", "",
            profit_margin_display, "", "",
            f"Payback from \u20b9{total_capex:,.0f} capex", "", "",
            f"Break-even: \u20b9{bep_per_kg:,.2f}/kg", "", "",
        ]])

        # ── Row 7: Divider (empty, formatted as separator via formatting) ──

        # ── Row 8: Section headers ────────────────────────────────────────
        self._update("Dashboard!A8:O8", [[
            "UNIT ECONOMICS", "", "", "", "", "", "",
            "SCENARIO ANALYSIS — PROJECTED PROFIT", "", "", "", "", "", "", "",
        ]])

        # ── Rows 9-20: Unit Economics (left) | Scenario data (right) ─────
        unit_econ = [
            ("Annual Yield (kg)",         f"{total_yield:,.0f}"),
            ("Sellable Yield (kg)",        f"{sellable_yield:,.0f}"),
            ("Total Capex",               f"\u20b9{total_capex:,.0f}"),
            ("Revenue per sqm",           f"\u20b9{rev_per_sqm:,.2f}"),
            ("Yield per sqm",             f"{yield_per_sqm:,.2f} kg"),
            ("Labor Efficiency Ratio",    f"{labor_eff:.2f}x"),
            ("Profit Margin",             f"{profit_margin:.1f}%"),
            ("Land Area",                 f"{land_area:,.0f} sqm"),
            ("Spoilage Loss",             f"\u20b9{spoilage_loss:,.0f}"),
            ("Top Revenue Crop",          top_crop),
            ("Labor Cost Share",          f"{labor_share:.1f}%"),
            ("Electricity Share",         f"{electricity_share:.1f}%"),
        ]

        for i, (label, value) in enumerate(unit_econ):
            row_num = 9 + i
            left_row = [label, "", value, "", "", "", ""]
            self._update(f"Dashboard!A{row_num}:G{row_num}", [left_row])

        for i, sc_row in enumerate(scenario_data[:12]):
            row_num = 9 + i
            sc_name   = str(sc_row[0])
            sc_profit = _fv(sc_row[5]) if len(sc_row) > 5 else 0.0
            sc_margin = _fv(sc_row[6]) if len(sc_row) > 6 else 0.0
            profit_str = f"\u20b9{sc_profit:,.0f}"
            margin_str = f"({sc_margin:.1f}%)"
            right_row = [sc_name, "", profit_str, margin_str, "", "", "", ""]
            self._update(f"Dashboard!H{row_num}:O{row_num}", [right_row])

        # ── Row 21: Spacer ────────────────────────────────────────────────

        # ── Row 22: Crop Performance header ──────────────────────────────
        self._update("Dashboard!A22:O22", [[
            "CROP PROFITABILITY", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        ]])

        # ── Row 23: Column labels ─────────────────────────────────────────
        self._update("Dashboard!A23:H23", [[
            "Crop", "Annual Revenue (\u20b9)", "Annual Cost (\u20b9)", "Profit (\u20b9)",
            "Margin %", "Revenue Share %", "Cost/KG (\u20b9)", "Yield/Yr (kg)",
        ]])

        # ── Rows 24+: Crop data ───────────────────────────────────────────
        for i, cr in enumerate(crop_data[:12]):
            row_num = 24 + i
            # CropRanking cols: crop, revenue_annual, allocated_cost_annual, profit_annual,
            #                   margin_percent, revenue_share_percent, cost_per_kg, yield_per_year_kg
            self._update(f"Dashboard!A{row_num}:H{row_num}", [[
                str(cr[0]),
                f"\u20b9{_fv(cr[1]):,.0f}",
                f"\u20b9{_fv(cr[2]):,.0f}",
                f"\u20b9{_fv(cr[3]):,.0f}",
                f"{_fv(cr[4]):.1f}%",
                f"{_fv(cr[5]):.1f}%",
                f"\u20b9{_fv(cr[6]):,.2f}",
                f"{_fv(cr[7]):,.0f}",
            ]])

        # ── Row 36: Spacer ────────────────────────────────────────────────

        # ── Row 37: Recommendations header ───────────────────────────────
        self._update("Dashboard!A37:O37", [[
            "KEY RECOMMENDATIONS", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        ]])

        # ── Row 38: Column labels ─────────────────────────────────────────
        self._update("Dashboard!A38:D38", [["Priority", "Category", "Title", "Detail"]])

        # ── Rows 39+: Recommendation data ────────────────────────────────
        for i, rec in enumerate(rec_data[:14]):
            row_num = 39 + i
            self._update(f"Dashboard!A{row_num}:D{row_num}", [[
                str(rec[0]),  # priority
                str(rec[1]),  # category
                str(rec[2]),  # title
                str(rec[3]) if len(rec) > 3 else "",  # detail
            ]])

        # ── Row 53: Spacer ────────────────────────────────────────────────

        # ── Row 54: Footer ────────────────────────────────────────────────
        self._update("Dashboard!A54:O54", [[
            "Auto-generated · Land Farm Financial Dashboard · Powered by AquaponicAI",
            "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        ]])

    # ── Dashboard formatting ─────────────────────────────────────────────

    def _format_dashboard(self, sid: int) -> None:
        """Apply professional formatting to the Dashboard tab."""
        C = self
        _THIN = {"style": "SOLID", "colorStyle": {"rgbColor": C._CLR_BORDER}}
        _CARD_BORDER = {"top": _THIN, "bottom": _THIN, "left": _THIN, "right": _THIN}

        def _cell(r0, r1, c0, c1):
            return {"sheetId": sid, "startRowIndex": r0, "endRowIndex": r1,
                    "startColumnIndex": c0, "endColumnIndex": c1}

        def _merge(r0, r1, c0, c1):
            return {"mergeCells": {"range": _cell(r0, r1, c0, c1), "mergeType": "MERGE_ALL"}}

        def _bg_txt(r0, r1, c0, c1, bg, fg, bold=False, size=10, italic=False, align="LEFT", pad_left=0):
            fmt: dict[str, Any] = {
                "backgroundColor": bg,
                "textFormat": {
                    "foregroundColor": fg, "bold": bold,
                    "fontSize": size, "fontFamily": "Arial",
                    "italic": italic,
                },
                "horizontalAlignment": align,
                "verticalAlignment": "MIDDLE",
            }
            if pad_left:
                fmt["padding"] = {"left": pad_left}
            return {"repeatCell": {"range": _cell(r0, r1, c0, c1), "cell": {"userEnteredFormat": fmt},
                                   "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)"}}

        def _row_height(r0, r1, px):
            return {"updateDimensionProperties": {
                "range": {"sheetId": sid, "dimension": "ROWS", "startIndex": r0, "endIndex": r1},
                "properties": {"pixelSize": px}, "fields": "pixelSize",
            }}

        def _col_width(c0, c1, px):
            return {"updateDimensionProperties": {
                "range": {"sheetId": sid, "dimension": "COLUMNS", "startIndex": c0, "endIndex": c1},
                "properties": {"pixelSize": px}, "fields": "pixelSize",
            }}

        reqs: list[dict[str, Any]] = []

        # Sheet to front + freeze + no gridlines
        reqs += [
            {"updateSheetProperties": {
                "properties": {"sheetId": sid, "index": 0}, "fields": "index",
            }},
            {"updateSheetProperties": {
                "properties": {"sheetId": sid, "gridProperties": {"frozenRowCount": 1, "hideGridlines": True}},
                "fields": "gridProperties.frozenRowCount,gridProperties.hideGridlines",
            }},
        ]

        # Entire sheet background
        reqs.append(_bg_txt(0, 60, 0, 15, C._CLR_BG, C._CLR_TXT))

        # ── Row 1: Title ─────────────────────────────────────────────────
        reqs += [_merge(0, 1, 0, 15),
                 _bg_txt(0, 1, 0, 15, C._CLR_DARK, C._CLR_WHITE, bold=True, size=18, pad_left=12),
                 _row_height(0, 1, 50)]

        # ── Row 2: Subtitle ───────────────────────────────────────────────
        reqs += [_merge(1, 2, 0, 15),
                 _bg_txt(1, 2, 0, 15, C._CLR_ALT, C._CLR_TXT2, italic=True, size=9, pad_left=12),
                 _row_height(1, 2, 28)]

        # ── Row 3: Spacer ─────────────────────────────────────────────────
        reqs.append(_row_height(2, 3, 10))

        # ── Rows 4-6: KPI Cards (5 × 3 cols) ─────────────────────────────
        kpi_value_colors = [C._CLR_ACCENT, C._CLR_RED,
                            C._CLR_GREEN if True else C._CLR_RED,  # profit — will refine
                            C._CLR_ACCENT, C._CLR_TXT]

        for i in range(5):
            cs, ce = i * 3, i * 3 + 3
            reqs += [
                _merge(3, 4, cs, ce),  # label row
                _merge(4, 5, cs, ce),  # value row
                _merge(5, 6, cs, ce),  # sub row
                _bg_txt(3, 6, cs, ce, C._CLR_CARD, C._CLR_TXT, align="CENTER"),
            ]
            # Card border
            reqs.append({"repeatCell": {
                "range": _cell(3, 6, cs, ce),
                "cell": {"userEnteredFormat": {"borders": _CARD_BORDER}},
                "fields": "userEnteredFormat.borders",
            }})
            # Label style
            reqs.append({"repeatCell": {
                "range": _cell(3, 4, cs, ce),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": C._CLR_TXT2, "fontSize": 8, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})
            # Value style — big bold
            reqs.append({"repeatCell": {
                "range": _cell(4, 5, cs, ce),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": kpi_value_colors[i],
                    "bold": True, "fontSize": 16, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})
            # Sub style
            reqs.append({"repeatCell": {
                "range": _cell(5, 6, cs, ce),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": C._CLR_TXT2, "fontSize": 8, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})

        reqs += [_row_height(3, 4, 20), _row_height(4, 5, 36), _row_height(5, 6, 18)]

        # ── Row 7: Divider spacer ─────────────────────────────────────────
        reqs.append(_row_height(6, 7, 10))

        # ── Row 8: Section headers ────────────────────────────────────────
        reqs += [
            _merge(7, 8, 0, 7),
            _bg_txt(7, 8, 0, 7, C._CLR_DARK, C._CLR_WHITE, bold=True, size=10, pad_left=8),
            _merge(7, 8, 7, 15),
            _bg_txt(7, 8, 7, 15, C._CLR_DARK, C._CLR_WHITE, bold=True, size=10, pad_left=8),
            _row_height(7, 8, 26),
        ]

        # ── Rows 9-20: alternating bg for unit econ (left) ───────────────
        for offset in range(12):
            r0 = 8 + offset
            bg = C._CLR_CARD if offset % 2 == 0 else C._CLR_ALT
            reqs.append(_bg_txt(r0, r0 + 1, 0, 7, bg, C._CLR_TXT, size=9))
            # Label col bold
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 0, 1),
                "cell": {"userEnteredFormat": {"textFormat": {"foregroundColor": C._CLR_TXT2, "fontSize": 9, "fontFamily": "Arial"}}},
                "fields": "userEnteredFormat.textFormat",
            }})
            # Value col accent
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 2, 3),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": C._CLR_ACCENT, "bold": True, "fontSize": 9, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})
            reqs.append(_row_height(r0, r0 + 1, 20))

        # ── Rows 9-20: alternating bg for scenario (right) ───────────────
        for offset in range(12):
            r0 = 8 + offset
            bg = C._CLR_CARD if offset % 2 == 0 else C._CLR_ALT
            reqs.append(_bg_txt(r0, r0 + 1, 7, 15, bg, C._CLR_TXT, size=9))
            # Scenario name col
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 7, 8),
                "cell": {"userEnteredFormat": {"textFormat": {"foregroundColor": C._CLR_TXT2, "fontSize": 9, "fontFamily": "Arial"}}},
                "fields": "userEnteredFormat.textFormat",
            }})
            # Profit value col — blue for positive scenarios, red for downside
            profit_color = C._CLR_GREEN if offset == 5 else (C._CLR_RED if offset == 4 else C._CLR_ACCENT)
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 9, 10),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": profit_color, "bold": True, "fontSize": 9, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})

        # ── Row 21: Spacer ────────────────────────────────────────────────
        reqs.append(_row_height(20, 21, 12))

        # ── Row 22: Crop Performance header ──────────────────────────────
        reqs += [
            _merge(21, 22, 0, 15),
            _bg_txt(21, 22, 0, 15, C._CLR_DARK, C._CLR_WHITE, bold=True, size=10, pad_left=8),
            _row_height(21, 22, 26),
        ]

        # ── Row 23: Column headers ────────────────────────────────────────
        reqs += [
            _bg_txt(22, 23, 0, 8, C._CLR_ALT, C._CLR_TXT, bold=True, size=9),
            _row_height(22, 23, 22),
        ]

        # ── Rows 24-35: Crop data rows ────────────────────────────────────
        for offset in range(12):
            r0 = 23 + offset
            bg = C._CLR_CARD if offset % 2 == 0 else C._CLR_ALT
            reqs.append(_bg_txt(r0, r0 + 1, 0, 8, bg, C._CLR_TXT, size=9))
            # Crop name col
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 0, 1),
                "cell": {"userEnteredFormat": {"textFormat": {"bold": True, "fontSize": 9, "fontFamily": "Arial"}}},
                "fields": "userEnteredFormat.textFormat",
            }})
            # Revenue col
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 1, 2),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": C._CLR_ACCENT, "bold": True, "fontSize": 9, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})
            # Profit col
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 3, 4),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": C._CLR_GREEN, "bold": True, "fontSize": 9, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})
            reqs.append(_row_height(r0, r0 + 1, 20))

        # ── Row 36: Spacer ────────────────────────────────────────────────
        reqs.append(_row_height(35, 36, 12))

        # ── Row 37: Recommendations header ───────────────────────────────
        reqs += [
            _merge(36, 37, 0, 15),
            _bg_txt(36, 37, 0, 15, C._CLR_DARK, C._CLR_WHITE, bold=True, size=10, pad_left=8),
            _row_height(36, 37, 26),
        ]

        # ── Row 38: Rec column headers ────────────────────────────────────
        reqs += [
            _bg_txt(37, 38, 0, 4, C._CLR_ALT, C._CLR_TXT, bold=True, size=9),
            _row_height(37, 38, 22),
        ]

        # ── Rows 39-52: Recommendation data ──────────────────────────────
        for offset in range(14):
            r0 = 38 + offset
            bg = C._CLR_CARD if offset % 2 == 0 else C._CLR_ALT
            reqs.append(_bg_txt(r0, r0 + 1, 0, 4, bg, C._CLR_TXT, size=9))
            # Priority col
            reqs.append({"repeatCell": {
                "range": _cell(r0, r0 + 1, 0, 1),
                "cell": {"userEnteredFormat": {"textFormat": {
                    "foregroundColor": C._CLR_AMBER, "bold": True, "fontSize": 9, "fontFamily": "Arial",
                }}},
                "fields": "userEnteredFormat.textFormat",
            }})
            reqs.append(_row_height(r0, r0 + 1, 20))

        # ── Row 53-54 ─────────────────────────────────────────────────────
        reqs.append(_row_height(52, 53, 12))

        # ── Row 54: Footer ────────────────────────────────────────────────
        reqs += [
            _merge(53, 54, 0, 15),
            {"repeatCell": {
                "range": _cell(53, 54, 0, 15),
                "cell": {"userEnteredFormat": {
                    "textFormat": {"foregroundColor": C._CLR_FOOTER, "fontSize": 8, "fontFamily": "Arial", "italic": True},
                    "horizontalAlignment": "CENTER",
                }},
                "fields": "userEnteredFormat(textFormat,horizontalAlignment)",
            }},
            _row_height(53, 54, 20),
        ]

        # ── Column widths ─────────────────────────────────────────────────
        #   A      B      C      D      E      F      G   (gap)  H      I      J     K    L    M    N    O
        col_widths = [160, 12, 120, 130, 12, 120, 50, 10, 180, 12, 120, 50, 50, 50, 50, 50]
        for idx, px in enumerate(col_widths[:15]):
            reqs.append(_col_width(idx, idx + 1, px))

        self._batch_update(reqs)

    # ── Chart creation ───────────────────────────────────────────────────

    def _rebuild_dashboard_charts(self, dashboard_sid: int, payload: dict[str, list[list[Any]]]) -> None:
        """Rebuild all 4 charts, anchored BELOW the data section (rows 57+)."""
        C = self
        W, H = 620, 340  # chart pixel dimensions

        # Delete existing charts first
        reqs: list[dict[str, Any]] = []
        for sheet in self._sheet_meta():
            if sheet.get("properties", {}).get("sheetId") == dashboard_sid:
                for ch in sheet.get("charts", []):
                    cid = ch.get("chartId")
                    if cid is not None:
                        reqs.append({"deleteEmbeddedObject": {"objectId": cid}})
                break

        cost_sid      = self._sheet_id_by_title("CostBreakdown")
        crop_sid      = self._sheet_id_by_title("CropRanking")
        monthly_sid   = self._sheet_id_by_title("MonthlyProjection")
        scenario_sid  = self._sheet_id_by_title("ScenarioAnalysis")

        monthly_rows  = payload.get("MonthlyProjection", [])
        scenario_rows = payload.get("ScenarioAnalysis", [])
        cost_rows     = payload.get("CostBreakdown", [])
        crop_r_rows   = payload.get("CropRanking", [])

        def _src(sheet_id, r0, r1, c0, c1):
            return {"sourceRange": {"sources": [{
                "sheetId": sheet_id,
                "startRowIndex": r0, "endRowIndex": r1,
                "startColumnIndex": c0, "endColumnIndex": c1,
            }]}}

        def _anchor(row_idx, col_idx):
            return {"overlayPosition": {
                "anchorCell": {"sheetId": dashboard_sid, "rowIndex": row_idx, "columnIndex": col_idx},
                "offsetXPixels": 0, "offsetYPixels": 0,
                "widthPixels": W, "heightPixels": H,
            }}

        def _chart_title(title):
            return {
                "foregroundColorStyle": {"rgbColor": C._CLR_TXT},
                "fontSize": 12, "bold": True, "fontFamily": "Arial",
            }

        # ── Chart 1: Cost Breakdown Donut (row 57, left) ─────────────────
        if cost_sid is not None and len(cost_rows) > 1:
            n = len(cost_rows)
            reqs.append({"addChart": {"chart": {
                "spec": {
                    "title": "Annual Cost Breakdown",
                    "titleTextFormat": _chart_title("Annual Cost Breakdown"),
                    "backgroundColor": C._CLR_CARD,
                    "pieChart": {
                        "legendPosition": "BOTTOM_LEGEND",
                        "pieHole": 0.4,
                        "domain": _src(cost_sid, 1, n, 0, 1),
                        "series": _src(cost_sid, 1, n, 1, 2),
                    },
                },
                "position": _anchor(56, 0),
            }}})

        # ── Chart 2: Revenue vs Profit by Crop (row 57, right) ───────────
        if crop_sid is not None and len(crop_r_rows) > 1:
            n = len(crop_r_rows)
            reqs.append({"addChart": {"chart": {
                "spec": {
                    "title": "Revenue vs Profit by Crop",
                    "titleTextFormat": _chart_title("Revenue vs Profit by Crop"),
                    "backgroundColor": C._CLR_CARD,
                    "basicChart": {
                        "chartType": "COLUMN",
                        "legendPosition": "BOTTOM_LEGEND",
                        "headerCount": 1,
                        "axis": [
                            {"position": "BOTTOM_AXIS", "title": "Crop"},
                            {"position": "LEFT_AXIS", "title": "Amount (\u20b9)"},
                        ],
                        "domains": [{"domain": _src(crop_sid, 0, n, 0, 1)}],
                        "series": [
                            {"series": _src(crop_sid, 0, n, 1, 2), "targetAxis": "LEFT_AXIS",
                             "colorStyle": {"rgbColor": C._CLR_ACCENT}},
                            {"series": _src(crop_sid, 0, n, 3, 4), "targetAxis": "LEFT_AXIS",
                             "colorStyle": {"rgbColor": C._CLR_GREEN}},
                        ],
                    },
                },
                "position": _anchor(56, 8),
            }}})

        # ── Chart 3: 12-Month Financial Trend (row 80, left) ─────────────
        if monthly_sid is not None and len(monthly_rows) > 1:
            n = len(monthly_rows)
            reqs.append({"addChart": {"chart": {
                "spec": {
                    "title": "12-Month Financial Trend",
                    "titleTextFormat": _chart_title("12-Month Financial Trend"),
                    "backgroundColor": C._CLR_CARD,
                    "basicChart": {
                        "chartType": "LINE",
                        "legendPosition": "BOTTOM_LEGEND",
                        "headerCount": 1,
                        "lineSmoothing": True,
                        "axis": [
                            {"position": "BOTTOM_AXIS", "title": "Month"},
                            {"position": "LEFT_AXIS", "title": "Amount (\u20b9)"},
                        ],
                        "domains": [{"domain": _src(monthly_sid, 0, n, 0, 1)}],
                        "series": [
                            {"series": _src(monthly_sid, 0, n, 1, 2), "targetAxis": "LEFT_AXIS",
                             "colorStyle": {"rgbColor": C._CLR_ACCENT},
                             "lineStyle": {"width": 3}},
                            {"series": _src(monthly_sid, 0, n, 2, 3), "targetAxis": "LEFT_AXIS",
                             "colorStyle": {"rgbColor": C._CLR_AMBER},
                             "lineStyle": {"width": 3, "type": "MEDIUM_DASHED"}},
                            {"series": _src(monthly_sid, 0, n, 3, 4), "targetAxis": "LEFT_AXIS",
                             "colorStyle": {"rgbColor": C._CLR_GREEN},
                             "lineStyle": {"width": 3},
                             "pointStyle": {"shape": "CIRCLE", "size": 5}},
                        ],
                    },
                },
                "position": _anchor(79, 0),
            }}})

        # ── Chart 4: Scenario Profit Comparison (row 80, right) ──────────
        if scenario_sid is not None and len(scenario_rows) > 1:
            n = len(scenario_rows)
            reqs.append({"addChart": {"chart": {
                "spec": {
                    "title": "Scenario Profit Comparison",
                    "titleTextFormat": _chart_title("Scenario Profit Comparison"),
                    "backgroundColor": C._CLR_CARD,
                    "basicChart": {
                        "chartType": "BAR",
                        "legendPosition": "NO_LEGEND",
                        "headerCount": 1,
                        "axis": [
                            {"position": "BOTTOM_AXIS", "title": "Profit (\u20b9)"},
                            {"position": "LEFT_AXIS", "title": "Scenario"},
                        ],
                        "domains": [{"domain": _src(scenario_sid, 0, n, 0, 1)}],
                        "series": [{"series": _src(scenario_sid, 0, n, 5, 6), "targetAxis": "BOTTOM_AXIS",
                                    "colorStyle": {"rgbColor": C._CLR_ACCENT},
                                    "dataLabel": {"placement": "OUTSIDE_END", "textFormat": {"fontSize": 9}}}],
                    },
                },
                "position": _anchor(79, 8),
            }}})

        if reqs:
            self._batch_update(reqs)

    # ── Dashboard init check ─────────────────────────────────────────────

    def _dashboard_initialized(self) -> bool:
        marker = self._values_get("Dashboard!Z1:Z1")
        value = str(marker[0][0]).strip() if marker and marker[0] else ""
        return value == DASHBOARD_TEMPLATE_VERSION

    # ── Public entry point ───────────────────────────────────────────────

    def write_dashboard(self, payload: dict[str, list[list[Any]]]) -> dict[str, Any]:
        existing = self._sheet_titles()
        if "Sheet1" in existing and "Dashboard" not in existing:
            self._rename_sheet("Sheet1", "Dashboard")

        tabs = [
            "Dashboard", "MonthlyProjection", "ScenarioAnalysis", "CropRanking",
            "CostBreakdown", "CostEfficiency", "BreakEvenAnalysis", "Recommendations",
            "Inputs", "Calculations", "Summary",
        ]
        self._ensure_tabs(tabs)

        # Write data tabs first (Dashboard tab is handled separately below)
        for tab in tabs:
            if tab == "Dashboard":
                continue
            rows = payload.get(tab, [])
            self._clear(f"{tab}!A:Z")
            if rows:
                end_row = max(1, len(rows))
                self._update(f"{tab}!A1:Z{end_row}", rows)

        # Dashboard tab: always rewrite canvas with fresh data (no stale VLOOKUPs)
        self._write_dashboard_canvas(payload)

        dashboard_sid = self._sheet_id_by_title("Dashboard")
        warnings: list[str] = []
        if dashboard_sid is not None:
            try:
                if not self._dashboard_initialized():
                    self._format_dashboard(dashboard_sid)
                    # re-write canvas after format (merges can clear cells)
                    self._write_dashboard_canvas(payload)
                # Always rebuild charts to stay in sync with latest data
                self._rebuild_dashboard_charts(dashboard_sid, payload)
            except Exception as exc:
                warnings.append(f"Dashboard formatting/charts skipped: {exc}")

        return {"spreadsheet_id": self.spreadsheet_id, "tabs": tabs, "warnings": warnings}


land_sheet_sync = LandSheetSync
