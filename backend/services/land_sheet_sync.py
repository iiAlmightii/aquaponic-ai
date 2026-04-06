"""Google Sheets sync for land-based farm planning outputs."""

from __future__ import annotations

import random
import time
from typing import Any

from services.google_sheets_financial_sync import _build_sheets_api


class LandSheetSync:
    DASHBOARD_TEMPLATE_VERSION = "v3_redesign_2026_04_02"

    def __init__(self):
        self.spreadsheet_id, self.sheets = _build_sheets_api()

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

    def _sheet_has_charts(self, sheet_id: int) -> bool:
        for sheet in self._sheet_meta():
            props = sheet.get("properties", {})
            if props.get("sheetId") == sheet_id:
                return bool(sheet.get("charts"))
        return False

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
        if status == 429:
            return True
        return "RATE_LIMIT_EXCEEDED" in text or "Write requests per minute per user" in text

    def _execute_with_retry(self, op_name: str, fn):
        max_attempts = 5
        for attempt in range(max_attempts):
            try:
                return fn()
            except Exception as exc:
                if not self._is_rate_limit_error(exc) or attempt == max_attempts - 1:
                    raise
                sleep_seconds = min(20.0, (2 ** attempt) + random.uniform(0.25, 1.0))
                time.sleep(sleep_seconds)

    def _ensure_tabs(self, titles: list[str]) -> None:
        existing = self._sheet_titles()
        req = []
        for t in titles:
            if t not in existing:
                req.append({"addSheet": {"properties": {"title": t}}})
        if req:
            self._execute_with_retry(
                "ensure_tabs_batch_update",
                lambda: self.sheets.spreadsheets().batchUpdate(
                    spreadsheetId=self.spreadsheet_id,
                    body={"requests": req},
                ).execute(),
            )

    def _rename_sheet(self, old_title: str, new_title: str) -> None:
        meta = self.sheets.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            fields="sheets(properties(sheetId,title))",
        ).execute()
        target = None
        for sheet in meta.get("sheets", []):
            props = sheet.get("properties", {})
            if props.get("title") == old_title:
                target = props
                break
        if not target:
            return
        self._execute_with_retry(
            "rename_sheet_batch_update",
            lambda: self.sheets.spreadsheets().batchUpdate(
                spreadsheetId=self.spreadsheet_id,
                body={
                    "requests": [
                        {
                            "updateSheetProperties": {
                                "properties": {"sheetId": target["sheetId"], "title": new_title},
                                "fields": "title",
                            }
                        }
                    ]
                },
            ).execute(),
        )

    def _clear(self, range_a1: str) -> None:
        self._execute_with_retry(
            f"clear_{range_a1}",
            lambda: self.sheets.spreadsheets().values().clear(
                spreadsheetId=self.spreadsheet_id,
                range=range_a1,
                body={},
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

    # ── Colour palette (RGB 0‑1) ─────────────────────────────────────────
    _CLR_DARK = {"red": 0.106, "green": 0.165, "blue": 0.290}       # #1B2A4A
    _CLR_ACCENT = {"red": 0.290, "green": 0.565, "blue": 0.851}     # #4A90D9
    _CLR_GREEN = {"red": 0.180, "green": 0.800, "blue": 0.443}      # #2ECC71
    _CLR_RED = {"red": 0.906, "green": 0.298, "blue": 0.235}        # #E74C3C
    _CLR_AMBER = {"red": 0.953, "green": 0.612, "blue": 0.071}      # #F39C12
    _CLR_PURPLE = {"red": 0.608, "green": 0.349, "blue": 0.714}     # #9B59B6
    _CLR_BG = {"red": 0.969, "green": 0.976, "blue": 0.988}         # #F7F9FC
    _CLR_CARD = {"red": 1, "green": 1, "blue": 1}                   # #FFFFFF
    _CLR_BORDER = {"red": 0.878, "green": 0.878, "blue": 0.878}     # #E0E0E0
    _CLR_TXT = {"red": 0.173, "green": 0.243, "blue": 0.314}        # #2C3E50
    _CLR_TXT2 = {"red": 0.498, "green": 0.549, "blue": 0.553}      # #7F8C8D
    _CLR_ALT = {"red": 0.941, "green": 0.957, "blue": 0.973}       # #F0F4F8
    _CLR_FOOTER = {"red": 0.741, "green": 0.765, "blue": 0.780}    # #BDC3C7
    _CLR_WHITE = {"red": 1, "green": 1, "blue": 1}

    def _write_dashboard_canvas(self) -> None:
        """Write the premium dashboard layout with formulas to the Dashboard tab."""
        self._clear("Dashboard!A:Z")

        # Template marker so future redesigns can safely reinitialize stale dashboards.
        self._update("Dashboard!Z1:Z1", [[self.DASHBOARD_TEMPLATE_VERSION]])

        # ── Row 1: Title banner ───────────────────────────────────────
        self._update("Dashboard!A1:O1", [
            ["Land Farm Financial Dashboard", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ])

        # ── Row 2: Subtitle ───────────────────────────────────────────
        self._update("Dashboard!A2:O2", [
            ["Financial Overview  ·  Generated from Survey Data", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ])

        # ── Row 3: spacer (empty) ─────────────────────────────────────

        # ── Rows 4‑6: KPI card labels (row 4), values (row 5), sub‑context (row 6)
        self._update("Dashboard!A4:O4", [[
            "TOTAL REVENUE", "", "",
            "TOTAL COST", "", "",
            "PROFIT", "", "",
            "ROI", "", "",
            "BREAK-EVEN / KG", "", "",
        ]])

        self._update("Dashboard!A5:O5", [[
            '=IFERROR(VLOOKUP("total_revenue",Summary!A:B,2,FALSE),0)', "", "",
            '=IFERROR(VLOOKUP("total_cost",Summary!A:B,2,FALSE),0)', "", "",
            '=IFERROR(VLOOKUP("profit",Summary!A:B,2,FALSE),0)', "", "",
            '=IFERROR(VLOOKUP("roi_percent",Summary!A:B,2,FALSE),0)/100', "", "",
            '=IFERROR(VLOOKUP("cost_per_kg",Summary!A:B,2,FALSE),0)', "", "",
        ]])

        self._update("Dashboard!A6:O6", [[
            "Annual", "", "",
            "Annual", "", "",
            "Net Annual", "", "",
            "Return on Investment", "", "",
            "Cost per Kilogram", "", "",
        ]])

        # ── Row 7: spacer ─────────────────────────────────────────────

        # ── Row 8: section divider (thin line applied via formatting)

        # ── Rows 9‑18: Left block — Unit Economics ────────────────────
        self._update("Dashboard!A9:G18", [
            ["UNIT ECONOMICS", "", "VALUE", "", "", "", ""],
            ["Annual Yield (kg)", "", '=IFERROR(VLOOKUP("total_annual_yield_kg",Summary!A:B,2,FALSE),0)', "", "", "", ""],
            ["Sellable Yield (kg)", "", '=IFERROR(VLOOKUP("sellable_yield_kg",Summary!A:B,2,FALSE),0)', "", "", "", ""],
            ["Capex", "", '=IFERROR(VLOOKUP("total_capex",Summary!A:B,2,FALSE),0)', "", "", "", ""],
            ["Revenue per sqm", "", '=IFERROR(VLOOKUP("total_revenue",Summary!A:B,2,FALSE),0)/MAX(1,IFERROR(VLOOKUP("land_area_sqm",Inputs!A:B,2,FALSE),1))', "", "", "", ""],
            ["Yield per sqm", "", '=IFERROR(VLOOKUP("sellable_yield_kg",Summary!A:B,2,FALSE),0)/MAX(1,IFERROR(VLOOKUP("land_area_sqm",Inputs!A:B,2,FALSE),1))', "", "", "", ""],
            ["Labor Efficiency Ratio", "", '=IFERROR(VLOOKUP("labor_efficiency_ratio",Summary!A:B,2,FALSE),0)', "", "", "", ""],
            ["Profit Margin", "", '=IFERROR(VLOOKUP("profit",Summary!A:B,2,FALSE),0)/MAX(1,IFERROR(VLOOKUP("total_revenue",Summary!A:B,2,FALSE),1))', "", "", "", ""],
            ["Labor Cost Share", "", '=IFERROR(VLOOKUP("Labor",CostBreakdown!A:B,2,FALSE),0)/MAX(1,IFERROR(VLOOKUP("total_cost",Summary!A:B,2,FALSE),1))', "", "", "", ""],
            ["Top Revenue Crop", "", '=IFERROR(INDEX(CropRanking!A:A, MATCH(MAX(CropRanking!B:B), CropRanking!B:B, 0)), "n/a")', "", "", "", ""],
        ])

        # ── Rows 9‑18: Right block — Scenario Profit Summary ─────────
        self._update("Dashboard!H9:O18", [
            ["SCENARIO PROFIT SUMMARY", "", "Projected Profit", "", "", "", "", ""],
            ['=IFERROR(ScenarioAnalysis!A2,"")', "", '=IFERROR(ScenarioAnalysis!F2,0)', "", "", "", "", ""],
            ['=IFERROR(ScenarioAnalysis!A3,"")', "", '=IFERROR(ScenarioAnalysis!F3,0)', "", "", "", "", ""],
            ['=IFERROR(ScenarioAnalysis!A4,"")', "", '=IFERROR(ScenarioAnalysis!F4,0)', "", "", "", "", ""],
            ['=IFERROR(ScenarioAnalysis!A5,"")', "", '=IFERROR(ScenarioAnalysis!F5,0)', "", "", "", "", ""],
            ['=IFERROR(ScenarioAnalysis!A6,"")', "", '=IFERROR(ScenarioAnalysis!F6,0)', "", "", "", "", ""],
            ['=IFERROR(ScenarioAnalysis!A7,"")', "", '=IFERROR(ScenarioAnalysis!F7,0)', "", "", "", "", ""],
            ["", "", "", "", "", "", "", ""],
            ["", "", "", "", "", "", "", ""],
            ["", "", "", "", "", "", "", ""],
        ])

        # ── Rows 19: spacer ──  Rows 20‑39: chart zone 1 ─────────────
        # ── Row 40: spacer  ──  Rows 41‑60: chart zone 2 ─────────────
        # (charts are overlaid by _rebuild_dashboard_charts)

        # ── Row 62: Footer ────────────────────────────────────────────
        self._update("Dashboard!A62:O62", [
            ["Auto-generated from survey  ·  Data synced via Google Sheets API", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ])

    def _dashboard_section_bounds(self, rows: list[list[Any]], section_name: str) -> tuple[int, int] | None:
        """Return 1-based [start, end] row bounds of a two-column section's data rows."""
        section_idx = None
        for i, row in enumerate(rows):
            if row and str(row[0]).strip().lower() == section_name.strip().lower():
                section_idx = i
                break
        if section_idx is None:
            return None

        data_start = section_idx + 1
        data_end = data_start
        while data_end < len(rows):
            row = rows[data_end] if data_end < len(rows) else []
            if not row or all(str(c).strip() == "" for c in row):
                break
            data_end += 1
        # Convert to 1-based row numbers in sheet.
        return data_start + 1, data_end

    def _dashboard_crop_bounds(self, rows: list[list[Any]]) -> tuple[int, int] | None:
        """Return 1-based [start, end] row bounds for crop profitability data rows."""
        marker_idx = None
        for i, row in enumerate(rows):
            if row and str(row[0]).strip().lower() == "crop profitability":
                marker_idx = i
                break
        if marker_idx is None:
            return None

        data_start = marker_idx + 1
        data_end = data_start
        while data_end < len(rows):
            row = rows[data_end] if data_end < len(rows) else []
            if not row or all(str(c).strip() == "" for c in row):
                break
            data_end += 1
        return data_start + 1, data_end

    def _format_dashboard(self, dashboard_sheet_id: int, dashboard_rows: list[list[Any]]) -> None:
        C = self  # shorthand for colour constants
        _THIN_BORDER = {"style": "SOLID", "colorStyle": {"rgbColor": C._CLR_BORDER}}
        _CARD_BORDER = {
            "top": _THIN_BORDER, "bottom": _THIN_BORDER,
            "left": _THIN_BORDER, "right": _THIN_BORDER,
        }

        requests: list[dict[str, Any]] = [
            # ── Sheet-level properties ────────────────────────────────
            {
                "updateSheetProperties": {
                    "properties": {
                        "sheetId": dashboard_sheet_id,
                        "index": 0,
                    },
                    "fields": "index",
                }
            },
            {
                "updateSheetProperties": {
                    "properties": {
                        "sheetId": dashboard_sheet_id,
                        "gridProperties": {"frozenRowCount": 1, "hideGridlines": True},
                    },
                    "fields": "gridProperties.frozenRowCount,gridProperties.hideGridlines",
                }
            },

            # ── Entire dashboard background #F7F9FC ───────────────────
            {
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 0, "endRowIndex": 65,
                        "startColumnIndex": 0, "endColumnIndex": 15,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": C._CLR_BG,
                            "textFormat": {
                                "fontFamily": "Arial",
                                "fontSize": 10,
                                "foregroundColor": C._CLR_TXT,
                            },
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat)",
                }
            },

            # ── Row 1: Title banner (merge A1:O1) ────────────────────
            {
                "mergeCells": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 0, "endRowIndex": 1,
                        "startColumnIndex": 0, "endColumnIndex": 15,
                    },
                    "mergeType": "MERGE_ALL",
                }
            },
            {
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 0, "endRowIndex": 1,
                        "startColumnIndex": 0, "endColumnIndex": 15,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": C._CLR_DARK,
                            "textFormat": {
                                "foregroundColor": C._CLR_WHITE,
                                "bold": True,
                                "fontSize": 18,
                                "fontFamily": "Arial",
                            },
                            "horizontalAlignment": "LEFT",
                            "verticalAlignment": "MIDDLE",
                            "padding": {"left": 12},
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
                }
            },
            {
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "dimension": "ROWS",
                        "startIndex": 0, "endIndex": 1,
                    },
                    "properties": {"pixelSize": 48},
                    "fields": "pixelSize",
                }
            },

            # ── Row 2: Subtitle (merge A2:O2) ────────────────────────
            {
                "mergeCells": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 1, "endRowIndex": 2,
                        "startColumnIndex": 0, "endColumnIndex": 15,
                    },
                    "mergeType": "MERGE_ALL",
                }
            },
            {
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 1, "endRowIndex": 2,
                        "startColumnIndex": 0, "endColumnIndex": 15,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": C._CLR_ALT,
                            "textFormat": {
                                "foregroundColor": C._CLR_TXT2,
                                "italic": True,
                                "fontSize": 10,
                                "fontFamily": "Arial",
                            },
                            "horizontalAlignment": "LEFT",
                            "verticalAlignment": "MIDDLE",
                            "padding": {"left": 12},
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
                }
            },
            {
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "dimension": "ROWS",
                        "startIndex": 1, "endIndex": 2,
                    },
                    "properties": {"pixelSize": 30},
                    "fields": "pixelSize",
                }
            },

            # ── Row 3: spacer ─────────────────────────────────────────
            {
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "dimension": "ROWS",
                        "startIndex": 2, "endIndex": 3,
                    },
                    "properties": {"pixelSize": 12},
                    "fields": "pixelSize",
                }
            },
        ]

        # ── KPI Cards (rows 4‑6, 0‑indexed 3‑5) ─────────────────────
        # 5 cards, each 3 columns wide.  Merge each card block.
        kpi_label_colors = [
            C._CLR_TXT2, C._CLR_TXT2, C._CLR_TXT2, C._CLR_TXT2, C._CLR_TXT2,
        ]
        kpi_value_colors = [
            C._CLR_ACCENT,   # Revenue → blue
            C._CLR_RED,      # Cost → red
            C._CLR_RED,      # Profit (negative) → red
            C._CLR_ACCENT,   # ROI → blue
            C._CLR_TXT,      # Break-even → dark text
        ]

        for i in range(5):
            col_start = i * 3
            col_end = col_start + 3

            # Merge label row (row 4)
            requests.append({
                "mergeCells": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 3, "endRowIndex": 4,
                        "startColumnIndex": col_start, "endColumnIndex": col_end,
                    },
                    "mergeType": "MERGE_ALL",
                }
            })
            # Merge value row (row 5)
            requests.append({
                "mergeCells": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 4, "endRowIndex": 5,
                        "startColumnIndex": col_start, "endColumnIndex": col_end,
                    },
                    "mergeType": "MERGE_ALL",
                }
            })
            # Merge sub-context row (row 6)
            requests.append({
                "mergeCells": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 5, "endRowIndex": 6,
                        "startColumnIndex": col_start, "endColumnIndex": col_end,
                    },
                    "mergeType": "MERGE_ALL",
                }
            })

            # Card background + border for rows 4‑6
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 3, "endRowIndex": 6,
                        "startColumnIndex": col_start, "endColumnIndex": col_end,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": C._CLR_CARD,
                            "borders": _CARD_BORDER,
                            "horizontalAlignment": "CENTER",
                            "verticalAlignment": "MIDDLE",
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,borders,horizontalAlignment,verticalAlignment)",
                }
            })

            # Label style (row 4)
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 3, "endRowIndex": 4,
                        "startColumnIndex": col_start, "endColumnIndex": col_end,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {
                                "foregroundColor": kpi_label_colors[i],
                                "fontSize": 9,
                                "fontFamily": "Arial",
                            },
                        }
                    },
                    "fields": "userEnteredFormat.textFormat",
                }
            })

            # Value style (row 5) — big bold number
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 4, "endRowIndex": 5,
                        "startColumnIndex": col_start, "endColumnIndex": col_end,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {
                                "foregroundColor": kpi_value_colors[i],
                                "bold": True,
                                "fontSize": 18,
                                "fontFamily": "Arial",
                            },
                            "numberFormat": {"type": "NUMBER", "pattern": "#,##0.00"} if i < 3 or i == 4 else {"type": "PERCENT", "pattern": "0.0%"},
                        }
                    },
                    "fields": "userEnteredFormat(textFormat,numberFormat)",
                }
            })

            # Sub-context style (row 6)
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": 5, "endRowIndex": 6,
                        "startColumnIndex": col_start, "endColumnIndex": col_end,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {
                                "foregroundColor": C._CLR_TXT2,
                                "fontSize": 8,
                                "fontFamily": "Arial",
                            },
                        }
                    },
                    "fields": "userEnteredFormat.textFormat",
                }
            })

        # ── KPI row heights ───────────────────────────────────────────
        requests.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "dimension": "ROWS",
                    "startIndex": 3, "endIndex": 4,
                },
                "properties": {"pixelSize": 22},
                "fields": "pixelSize",
            }
        })
        requests.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "dimension": "ROWS",
                    "startIndex": 4, "endIndex": 5,
                },
                "properties": {"pixelSize": 38},
                "fields": "pixelSize",
            }
        })
        requests.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "dimension": "ROWS",
                    "startIndex": 5, "endIndex": 6,
                },
                "properties": {"pixelSize": 20},
                "fields": "pixelSize",
            }
        })

        # ── Row 7‑8: spacers ──────────────────────────────────────────
        for row_idx in (6, 7):
            requests.append({
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "dimension": "ROWS",
                        "startIndex": row_idx, "endIndex": row_idx + 1,
                    },
                    "properties": {"pixelSize": 8},
                    "fields": "pixelSize",
                }
            })

        # ── Row 8 (0‑based 7): thin divider line ─────────────────────
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 7, "endRowIndex": 8,
                    "startColumnIndex": 0, "endColumnIndex": 15,
                },
                "cell": {
                    "userEnteredFormat": {
                        "borders": {
                            "bottom": {"style": "SOLID", "colorStyle": {"rgbColor": C._CLR_BORDER}},
                        },
                    }
                },
                "fields": "userEnteredFormat.borders",
            }
        })

        # ── Left block header (row 9 = 0‑based 8): Unit Economics ─────
        requests.append({
            "mergeCells": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 8, "endRowIndex": 9,
                    "startColumnIndex": 0, "endColumnIndex": 7,
                },
                "mergeType": "MERGE_ALL",
            }
        })
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 8, "endRowIndex": 9,
                    "startColumnIndex": 0, "endColumnIndex": 7,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": C._CLR_DARK,
                        "textFormat": {
                            "foregroundColor": C._CLR_WHITE,
                            "bold": True,
                            "fontSize": 11,
                            "fontFamily": "Arial",
                        },
                        "horizontalAlignment": "LEFT",
                        "verticalAlignment": "MIDDLE",
                        "padding": {"left": 8},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
            }
        })

        # Unit economics data rows (rows 10‑17 = 0‑based 9‑16): alternating colours
        for offset in range(8):
            row_0 = 9 + offset
            bg = C._CLR_CARD if offset % 2 == 0 else C._CLR_ALT
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": row_0, "endRowIndex": row_0 + 1,
                        "startColumnIndex": 0, "endColumnIndex": 7,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": bg,
                            "textFormat": {
                                "foregroundColor": C._CLR_TXT,
                                "fontSize": 10,
                                "fontFamily": "Arial",
                            },
                            "verticalAlignment": "MIDDLE",
                            "borders": {
                                "bottom": {"style": "SOLID", "colorStyle": {"rgbColor": C._CLR_BORDER}},
                            },
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,borders)",
                }
            })

        # ── Right block header (row 9 = 0‑based 8): Scenario Summary ─
        requests.append({
            "mergeCells": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 8, "endRowIndex": 9,
                    "startColumnIndex": 7, "endColumnIndex": 15,
                },
                "mergeType": "MERGE_ALL",
            }
        })
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 8, "endRowIndex": 9,
                    "startColumnIndex": 7, "endColumnIndex": 15,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": C._CLR_DARK,
                        "textFormat": {
                            "foregroundColor": C._CLR_WHITE,
                            "bold": True,
                            "fontSize": 11,
                            "fontFamily": "Arial",
                        },
                        "horizontalAlignment": "LEFT",
                        "verticalAlignment": "MIDDLE",
                        "padding": {"left": 8},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
            }
        })

        # Scenario data rows (rows 10‑16 = 0‑based 9‑15): alternating colours + red text for profit
        for offset in range(7):
            row_0 = 9 + offset
            bg = C._CLR_CARD if offset % 2 == 0 else C._CLR_ALT
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "startRowIndex": row_0, "endRowIndex": row_0 + 1,
                        "startColumnIndex": 7, "endColumnIndex": 15,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": bg,
                            "textFormat": {
                                "foregroundColor": C._CLR_TXT,
                                "fontSize": 10,
                                "fontFamily": "Arial",
                            },
                            "verticalAlignment": "MIDDLE",
                            "borders": {
                                "bottom": {"style": "SOLID", "colorStyle": {"rgbColor": C._CLR_BORDER}},
                            },
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,borders)",
                }
            })

        # Scenario profit values column (col J = index 9) — number formatting
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 9, "endRowIndex": 16,
                    "startColumnIndex": 9, "endColumnIndex": 11,
                },
                "cell": {
                    "userEnteredFormat": {
                        "numberFormat": {"type": "NUMBER", "pattern": "#,##0"},
                        "textFormat": {
                            "foregroundColor": C._CLR_RED,
                            "bold": True,
                        },
                    }
                },
                "fields": "userEnteredFormat(numberFormat,textFormat)",
            }
        })

        # Best scenario row (row 16 = Upside, 0‑based 14) — green left border
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 14, "endRowIndex": 15,
                    "startColumnIndex": 7, "endColumnIndex": 8,
                },
                "cell": {
                    "userEnteredFormat": {
                        "borders": {
                            "left": {"style": "SOLID_MEDIUM", "colorStyle": {"rgbColor": C._CLR_GREEN}},
                        },
                    }
                },
                "fields": "userEnteredFormat.borders",
            }
        })
        # Worst scenario row (row 14 = Downside, 0‑based 13) — red left border
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 13, "endRowIndex": 14,
                    "startColumnIndex": 7, "endColumnIndex": 8,
                },
                "cell": {
                    "userEnteredFormat": {
                        "borders": {
                            "left": {"style": "SOLID_MEDIUM", "colorStyle": {"rgbColor": C._CLR_RED}},
                        },
                    }
                },
                "fields": "userEnteredFormat.borders",
            }
        })

        # ── Unit economics value column number formatting ─────────────
        # Row 10‑11 (yield, capex): number
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 9, "endRowIndex": 11,
                    "startColumnIndex": 2, "endColumnIndex": 3,
                },
                "cell": {
                    "userEnteredFormat": {
                        "numberFormat": {"type": "NUMBER", "pattern": "#,##0"},
                        "textFormat": {"bold": True, "foregroundColor": C._CLR_ACCENT},
                    }
                },
                "fields": "userEnteredFormat(numberFormat,textFormat)",
            }
        })
        # Row 12‑13 (revenue/sqm, yield/sqm): decimal
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 11, "endRowIndex": 13,
                    "startColumnIndex": 2, "endColumnIndex": 3,
                },
                "cell": {
                    "userEnteredFormat": {
                        "numberFormat": {"type": "NUMBER", "pattern": "#,##0.00"},
                        "textFormat": {"bold": True, "foregroundColor": C._CLR_ACCENT},
                    }
                },
                "fields": "userEnteredFormat(numberFormat,textFormat)",
            }
        })
        # Row 14‑16 (profit margin, labor share, elec share): percentage
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 13, "endRowIndex": 16,
                    "startColumnIndex": 2, "endColumnIndex": 3,
                },
                "cell": {
                    "userEnteredFormat": {
                        "numberFormat": {"type": "PERCENT", "pattern": "0.0%"},
                        "textFormat": {"bold": True, "foregroundColor": C._CLR_TXT},
                    }
                },
                "fields": "userEnteredFormat(numberFormat,textFormat)",
            }
        })

        # ── Row 62 (0‑based 61): Footer ──────────────────────────────
        requests.append({
            "mergeCells": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 61, "endRowIndex": 62,
                    "startColumnIndex": 0, "endColumnIndex": 15,
                },
                "mergeType": "MERGE_ALL",
            }
        })
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": dashboard_sheet_id,
                    "startRowIndex": 61, "endRowIndex": 62,
                    "startColumnIndex": 0, "endColumnIndex": 15,
                },
                "cell": {
                    "userEnteredFormat": {
                        "textFormat": {
                            "foregroundColor": C._CLR_FOOTER,
                            "fontSize": 8,
                            "fontFamily": "Arial",
                            "italic": True,
                        },
                        "horizontalAlignment": "CENTER",
                    }
                },
                "fields": "userEnteredFormat(textFormat,horizontalAlignment)",
            }
        })

        # ── Column widths (fixed for card-like appearance) ────────────
        col_widths = [130, 50, 120, 130, 50, 120, 130, 10, 160, 50, 120, 50, 50, 50, 50]
        for idx, px in enumerate(col_widths):
            requests.append({
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": dashboard_sheet_id,
                        "dimension": "COLUMNS",
                        "startIndex": idx, "endIndex": idx + 1,
                    },
                    "properties": {"pixelSize": px},
                    "fields": "pixelSize",
                }
            })

        self._execute_with_retry(
            "format_dashboard_batch_update",
            lambda: self.sheets.spreadsheets().batchUpdate(
                spreadsheetId=self.spreadsheet_id,
                body={"requests": requests},
            ).execute(),
        )

    def _rebuild_dashboard_charts(self, dashboard_sheet_id: int, payload: dict[str, list[list[Any]]]) -> None:
        """Rebuild all embedded charts with premium styling."""
        C = self  # shorthand for colour constants
        chart_width = 620
        chart_height = 360

        # ── Delete existing charts to prevent duplicates on re-sync ───
        sheet_meta = None
        for sheet in self._sheet_meta():
            props = sheet.get("properties", {})
            if props.get("sheetId") == dashboard_sheet_id:
                sheet_meta = sheet
                break

        requests: list[dict[str, Any]] = []
        if sheet_meta:
            for ch in sheet_meta.get("charts", []):
                chart_id = ch.get("chartId")
                if chart_id is not None:
                    requests.append({"deleteEmbeddedObject": {"objectId": chart_id}})

        # ── Resolve data sheet IDs and row counts ─────────────────────
        cost_sheet_id = self._sheet_id_by_title("CostBreakdown")
        crop_sheet_id = self._sheet_id_by_title("CropRanking")
        monthly_sheet_id = self._sheet_id_by_title("MonthlyProjection")
        scenario_sheet_id = self._sheet_id_by_title("ScenarioAnalysis")

        monthly_rows = payload.get("MonthlyProjection", [])
        scenario_rows = payload.get("ScenarioAnalysis", [])

        # ── Chart 1: Annual Cost Breakdown (PIE / donut-style) ────────
        # Anchored at row 20, col 0 — left side of chart zone 1
        if cost_sheet_id is not None and len(payload.get("CostBreakdown", [])) > 1:
            cost_start = 1
            cost_end = len(payload.get("CostBreakdown", []))
            # Per-slice colours: Labor, Electricity, Seeds, Maintenance, Land Rent
            _cost_colors = [
                {"red": 0.290, "green": 0.565, "blue": 0.851},   # #4A90D9 Labor
                {"red": 0.953, "green": 0.612, "blue": 0.071},   # #F39C12 Electricity
                {"red": 0.180, "green": 0.800, "blue": 0.443},   # #2ECC71 Seeds
                {"red": 0.608, "green": 0.349, "blue": 0.714},   # #9B59B6 Maintenance
                {"red": 0.906, "green": 0.298, "blue": 0.235},   # #E74C3C Land Rent
            ]
            requests.append({
                "addChart": {
                    "chart": {
                        "spec": {
                            "title": "Annual Cost Breakdown",
                            "titleTextFormat": {
                                "foregroundColorStyle": {"rgbColor": C._CLR_TXT},
                                "fontSize": 12,
                                "bold": True,
                                "fontFamily": "Arial",
                            },
                            "pieChart": {
                                "legendPosition": "BOTTOM_LEGEND",
                                "pieHole": 0.45,
                                "domain": {
                                    "sourceRange": {
                                        "sources": [{
                                            "sheetId": cost_sheet_id,
                                            "startRowIndex": cost_start,
                                            "endRowIndex": cost_end,
                                            "startColumnIndex": 0,
                                            "endColumnIndex": 1,
                                        }]
                                    }
                                },
                                "series": {
                                    "sourceRange": {
                                        "sources": [{
                                            "sheetId": cost_sheet_id,
                                            "startRowIndex": cost_start,
                                            "endRowIndex": cost_end,
                                            "startColumnIndex": 1,
                                            "endColumnIndex": 2,
                                        }]
                                    }
                                },
                            },
                            "backgroundColor": C._CLR_CARD,
                        },
                        "position": {
                            "overlayPosition": {
                                "anchorCell": {
                                    "sheetId": dashboard_sheet_id,
                                    "rowIndex": 19,
                                    "columnIndex": 0,
                                },
                                "offsetXPixels": 0,
                                "offsetYPixels": 0,
                                "widthPixels": chart_width,
                                "heightPixels": chart_height,
                            }
                        },
                    }
                }
            })

        # ── Chart 2: Revenue vs Profit by Crop (COLUMN) ──────────────
        # Anchored at row 20, col 8 — right side of chart zone 1
        if crop_sheet_id is not None and len(payload.get("CropRanking", [])) > 1:
            # Include header row so legend labels are preserved.
            crop_start = 0
            crop_end = len(payload.get("CropRanking", []))
            requests.append({
                "addChart": {
                    "chart": {
                        "spec": {
                            "title": "Revenue vs Profit by Crop",
                            "titleTextFormat": {
                                "foregroundColorStyle": {"rgbColor": C._CLR_TXT},
                                "fontSize": 12,
                                "bold": True,
                                "fontFamily": "Arial",
                            },
                            "basicChart": {
                                "chartType": "COLUMN",
                                "legendPosition": "BOTTOM_LEGEND",
                                "headerCount": 1,
                                "axis": [
                                    {
                                        "position": "BOTTOM_AXIS",
                                        "title": "Crop",
                                        "format": {"fontFamily": "Arial", "fontSize": 10, "foregroundColorStyle": {"rgbColor": C._CLR_TXT2}},
                                    },
                                    {
                                        "position": "LEFT_AXIS",
                                        "title": "Amount (₹)",
                                        "format": {"fontFamily": "Arial", "fontSize": 10, "foregroundColorStyle": {"rgbColor": C._CLR_TXT2}},
                                    },
                                ],
                                "domains": [{
                                    "domain": {
                                        "sourceRange": {
                                            "sources": [{
                                                "sheetId": crop_sheet_id,
                                                "startRowIndex": crop_start,
                                                "endRowIndex": crop_end,
                                                "startColumnIndex": 0,
                                                "endColumnIndex": 1,
                                            }]
                                        }
                                    }
                                }],
                                "series": [
                                    {
                                        "series": {
                                            "sourceRange": {
                                                "sources": [{
                                                    "sheetId": crop_sheet_id,
                                                    "startRowIndex": crop_start,
                                                    "endRowIndex": crop_end,
                                                    "startColumnIndex": 1,
                                                    "endColumnIndex": 2,
                                                }]
                                            }
                                        },
                                        "targetAxis": "LEFT_AXIS",
                                        "colorStyle": {"rgbColor": C._CLR_ACCENT},
                                        "dataLabel": {"placement": "OUTSIDE_END", "textFormat": {"fontSize": 9}},
                                    },
                                    {
                                        "series": {
                                            "sourceRange": {
                                                "sources": [{
                                                    "sheetId": crop_sheet_id,
                                                    "startRowIndex": crop_start,
                                                    "endRowIndex": crop_end,
                                                    "startColumnIndex": 3,
                                                    "endColumnIndex": 4,
                                                }]
                                            }
                                        },
                                        "targetAxis": "LEFT_AXIS",
                                        "colorStyle": {"rgbColor": C._CLR_GREEN},
                                        "dataLabel": {"placement": "OUTSIDE_END", "textFormat": {"fontSize": 9}},
                                    },
                                ],
                            },
                            "backgroundColor": C._CLR_CARD,
                        },
                        "position": {
                            "overlayPosition": {
                                "anchorCell": {
                                    "sheetId": dashboard_sheet_id,
                                    "rowIndex": 19,
                                    "columnIndex": 8,
                                },
                                "offsetXPixels": 0,
                                "offsetYPixels": 0,
                                "widthPixels": chart_width,
                                "heightPixels": chart_height,
                            }
                        },
                    }
                }
            })

        # ── Chart 3: 12-Month Financial Trend (LINE) ─────────────────
        # Anchored at row 41, col 0 — left side of chart zone 2
        if monthly_sheet_id is not None and len(monthly_rows) > 1:
            # Include header row so legend/series names are not lost.
            month_start = 0
            month_end = len(monthly_rows)
            requests.append({
                "addChart": {
                    "chart": {
                        "spec": {
                            "title": "12-Month Financial Trend",
                            "titleTextFormat": {
                                "foregroundColorStyle": {"rgbColor": C._CLR_TXT},
                                "fontSize": 12,
                                "bold": True,
                                "fontFamily": "Arial",
                            },
                            "basicChart": {
                                "chartType": "LINE",
                                "legendPosition": "BOTTOM_LEGEND",
                                "headerCount": 1,
                                "lineSmoothing": True,
                                "axis": [
                                    {
                                        "position": "BOTTOM_AXIS",
                                        "title": "Month",
                                        "format": {"fontFamily": "Arial", "fontSize": 10, "foregroundColorStyle": {"rgbColor": C._CLR_TXT2}},
                                    },
                                    {
                                        "position": "LEFT_AXIS",
                                        "title": "Amount (₹)",
                                        "format": {"fontFamily": "Arial", "fontSize": 10, "foregroundColorStyle": {"rgbColor": C._CLR_TXT2}},
                                    },
                                ],
                                "domains": [{
                                    "domain": {
                                        "sourceRange": {
                                            "sources": [{
                                                "sheetId": monthly_sheet_id,
                                                "startRowIndex": month_start,
                                                "endRowIndex": month_end,
                                                "startColumnIndex": 0,
                                                "endColumnIndex": 1,
                                            }]
                                        }
                                    }
                                }],
                                "series": [
                                    {
                                        "series": {
                                            "sourceRange": {
                                                "sources": [{
                                                    "sheetId": monthly_sheet_id,
                                                    "startRowIndex": month_start,
                                                    "endRowIndex": month_end,
                                                    "startColumnIndex": 1,
                                                    "endColumnIndex": 2,
                                                }]
                                            }
                                        },
                                        "targetAxis": "LEFT_AXIS",
                                        "colorStyle": {"rgbColor": C._CLR_ACCENT},
                                        "lineStyle": {"width": 3},
                                    },
                                    {
                                        "series": {
                                            "sourceRange": {
                                                "sources": [{
                                                    "sheetId": monthly_sheet_id,
                                                    "startRowIndex": month_start,
                                                    "endRowIndex": month_end,
                                                    "startColumnIndex": 2,
                                                    "endColumnIndex": 3,
                                                }]
                                            }
                                        },
                                        "targetAxis": "LEFT_AXIS",
                                        "colorStyle": {"rgbColor": C._CLR_AMBER},
                                        "lineStyle": {"width": 3, "type": "MEDIUM_DASHED"},
                                    },
                                    {
                                        "series": {
                                            "sourceRange": {
                                                "sources": [{
                                                    "sheetId": monthly_sheet_id,
                                                    "startRowIndex": month_start,
                                                    "endRowIndex": month_end,
                                                    "startColumnIndex": 3,
                                                    "endColumnIndex": 4,
                                                }]
                                            }
                                        },
                                        "targetAxis": "LEFT_AXIS",
                                        "colorStyle": {"rgbColor": C._CLR_RED},
                                        "lineStyle": {"width": 3},
                                        "pointStyle": {"shape": "CIRCLE", "size": 5},
                                    },
                                ],
                            },
                            "backgroundColor": C._CLR_CARD,
                        },
                        "position": {
                            "overlayPosition": {
                                "anchorCell": {
                                    "sheetId": dashboard_sheet_id,
                                    "rowIndex": 40,
                                    "columnIndex": 0,
                                },
                                "offsetXPixels": 0,
                                "offsetYPixels": 0,
                                "widthPixels": chart_width,
                                "heightPixels": chart_height,
                            }
                        },
                    }
                }
            })

        # ── Chart 4: Scenario Analysis — Projected Profit (BAR) ──────
        # Anchored at row 41, col 8 — right side of chart zone 2
        if scenario_sheet_id is not None and len(scenario_rows) > 1:
            # Include header row so axis/series metadata stays consistent.
            scenario_start = 0
            scenario_end = len(scenario_rows)
            requests.append({
                "addChart": {
                    "chart": {
                        "spec": {
                            "title": "Scenario Analysis: Projected Profit",
                            "titleTextFormat": {
                                "foregroundColorStyle": {"rgbColor": C._CLR_TXT},
                                "fontSize": 12,
                                "bold": True,
                                "fontFamily": "Arial",
                            },
                            "basicChart": {
                                "chartType": "BAR",
                                "legendPosition": "NO_LEGEND",
                                "headerCount": 1,
                                "axis": [
                                    {
                                        "position": "BOTTOM_AXIS",
                                        "title": "Profit (₹)",
                                        "format": {"fontFamily": "Arial", "fontSize": 10, "foregroundColorStyle": {"rgbColor": C._CLR_TXT2}},
                                    },
                                    {
                                        "position": "LEFT_AXIS",
                                        "title": "Scenario",
                                        "format": {"fontFamily": "Arial", "fontSize": 10, "foregroundColorStyle": {"rgbColor": C._CLR_TXT2}},
                                    },
                                ],
                                "domains": [{
                                    "domain": {
                                        "sourceRange": {
                                            "sources": [{
                                                "sheetId": scenario_sheet_id,
                                                "startRowIndex": scenario_start,
                                                "endRowIndex": scenario_end,
                                                "startColumnIndex": 0,
                                                "endColumnIndex": 1,
                                            }]
                                        }
                                    }
                                }],
                                "series": [{
                                    "series": {
                                        "sourceRange": {
                                            "sources": [{
                                                "sheetId": scenario_sheet_id,
                                                "startRowIndex": scenario_start,
                                                "endRowIndex": scenario_end,
                                                "startColumnIndex": 5,
                                                "endColumnIndex": 6,
                                            }]
                                        }
                                    },
                                    "targetAxis": "BOTTOM_AXIS",
                                    "colorStyle": {"rgbColor": C._CLR_RED},
                                    "dataLabel": {"placement": "OUTSIDE_END", "textFormat": {"fontSize": 9}},
                                }],
                            },
                            "backgroundColor": C._CLR_CARD,
                        },
                        "position": {
                            "overlayPosition": {
                                "anchorCell": {
                                    "sheetId": dashboard_sheet_id,
                                    "rowIndex": 40,
                                    "columnIndex": 8,
                                },
                                "offsetXPixels": 0,
                                "offsetYPixels": 0,
                                "widthPixels": chart_width,
                                "heightPixels": chart_height,
                            }
                        },
                    }
                }
            })

        if requests:
            self._execute_with_retry(
                "rebuild_dashboard_charts_batch_update",
                lambda: self.sheets.spreadsheets().batchUpdate(
                    spreadsheetId=self.spreadsheet_id,
                    body={"requests": requests},
                ).execute(),
            )

    def _dashboard_initialized(self) -> bool:
        # Dashboard is considered initialized only if template marker matches current code version.
        marker = self._values_get("Dashboard!Z1:Z1")
        marker_value = (
            str(marker[0][0]).strip()
            if marker and marker[0] and len(marker[0]) > 0
            else ""
        )
        return marker_value == self.DASHBOARD_TEMPLATE_VERSION

    def write_dashboard(self, payload: dict[str, list[list[Any]]]) -> dict[str, Any]:
        existing = self._sheet_titles()
        if "Sheet1" in existing and "Dashboard" not in existing:
            self._rename_sheet("Sheet1", "Dashboard")

        tabs = ["Dashboard", "MonthlyProjection", "ScenarioAnalysis", "CropRanking", "CostBreakdown", "Inputs", "Calculations", "Summary"]
        self._ensure_tabs(tabs)
        dashboard_prepared = self._dashboard_initialized()
        for tab in tabs:
            rows = payload.get(tab, [])
            if tab == "Dashboard":
                if not dashboard_prepared:
                    self._write_dashboard_canvas()
                continue

            self._clear(f"{tab}!A:Z")
            if rows:
                end_row = max(1, len(rows))
                self._update(f"{tab}!A1:Z{end_row}", rows)

        dashboard_sheet_id = self._sheet_id_by_title("Dashboard")
        dashboard_rows = payload.get("Dashboard", [])
        warnings: list[str] = []
        if dashboard_sheet_id is not None:
            try:
                if not dashboard_prepared:
                    self._format_dashboard(dashboard_sheet_id, dashboard_rows)
                # Always rebuild charts so stale embedded objects never survive syncs.
                self._rebuild_dashboard_charts(dashboard_sheet_id, payload)
            except Exception as exc:
                warnings.append(f"Dashboard formatting/charts skipped: {exc}")

        return {"spreadsheet_id": self.spreadsheet_id, "tabs": tabs, "warnings": warnings}


land_sheet_sync = LandSheetSync
