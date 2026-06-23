"""Looker Studio (Google Data Studio) dashboard URL generator.

Approach:
  - Users connect their Supabase PostgreSQL to a Looker Studio report template.
  - This service generates a pre-filtered URL pointing to that report,
    filtered by session_id so each user sees their own data.
  - No Looker Studio API is required — URL-parameter filtering is sufficient.

Setup instructions (returned in the response when LOOKER_STUDIO_REPORT_ID is unset):
  1. Open Looker Studio → Create report → Add data source → PostgreSQL connector.
  2. Enter Supabase host / port / database / user credentials.
  3. Connect to the `sessions`, `financial_plans`, and `session_answers` tables.
  4. Add a "Filter control" for the `session_id` field.
  5. Publish the report and copy its 32-char report ID from the URL.
  6. Set LOOKER_STUDIO_REPORT_ID=<id> in your .env file.
"""

from __future__ import annotations

import json
import urllib.parse
from typing import Any

from core.config import settings

BASE_URL = "https://lookerstudio.google.com/reporting"


def get_dashboard_url(session_id: str) -> dict[str, Any]:
    """Return a Looker Studio URL filtered to the given session_id.

    If LOOKER_STUDIO_REPORT_ID is not configured, returns setup instructions
    so the frontend can display them instead of a broken link.
    """
    report_id = (settings.LOOKER_STUDIO_REPORT_ID or "").strip()

    if not report_id:
        return {
            "configured": False,
            "url": None,
            "session_id": session_id,
            "setup_instructions": _setup_instructions(),
            "supabase_connection": _supabase_connection_info(),
        }

    # Build Looker Studio URL with session filter.
    # Looker Studio supports filter parameters via the `params` query arg.
    # The value is a JSON object where keys are filter widget IDs defined in the report.
    # We use the conventional key "session_id" — the report template must have a
    # filter control with matching parameter name.
    filter_params = {"session_id": session_id}
    params_encoded = urllib.parse.quote(json.dumps(filter_params))

    page_id = (settings.LOOKER_STUDIO_PAGE_ID or "p_page1").strip()
    url = f"{BASE_URL}/{report_id}/page/{page_id}?params={params_encoded}"

    return {
        "configured": True,
        "url": url,
        "session_id": session_id,
        "report_id": report_id,
        "setup_instructions": None,
        "supabase_connection": None,
    }


def _supabase_connection_info() -> dict[str, Any]:
    """Return non-sensitive Supabase connection details for the setup guide."""
    return {
        "host": settings.SUPABASE_DB_HOST or "<your-project>.supabase.co",
        "port": settings.SUPABASE_DB_PORT,
        "database": settings.SUPABASE_DB_NAME,
        "user": settings.SUPABASE_DB_USER,
        "ssl_mode": "require",
        "note": (
            "Use the Supabase service role credentials for read-only Looker Studio access. "
            "Never expose the service role key in client-side code."
        ),
    }


def _setup_instructions() -> list[str]:
    return [
        "1. Open Looker Studio (lookerstudio.google.com) and click '+ Create → Report'.",
        "2. Click 'Add data' → search for 'PostgreSQL' connector → select it.",
        "3. Enter your Supabase connection details (host, port 5432, database 'postgres', user 'postgres', SSL required).",
        "4. Connect to the 'sessions' table. Add more tables (session_answers, financial_plans) as blended sources.",
        "5. Design charts: KPI cards for revenue/cost/profit, bar chart for crop revenue, line chart for monthly projection.",
        "6. Add a 'Filter control' widget → set the field to 'session_id' → enable 'Include in report filter'.",
        "7. Publish the report. Copy the report ID from the URL (32-char hex after '/reporting/').",
        "8. Set LOOKER_STUDIO_REPORT_ID=<report_id> in your backend .env file and restart.",
    ]
