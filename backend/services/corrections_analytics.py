"""
corrections_analytics.py — Query and analyse stt_corrections data.

Used by:
  - /audio/corrections/stats  (monitoring dashboard)
  - /audio/corrections/patterns  (substitution analysis)
  - audio.py prompt-enrichment cache (refreshed every 5 min)
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def get_stats(db: AsyncSession) -> dict[str, Any]:
    """Per-language and per-question correction counts."""
    by_lang = await db.execute(
        text(
            """
            SELECT language, COUNT(*) AS corrections, COUNT(DISTINCT audit_id) AS unique_audits
            FROM stt_corrections
            GROUP BY language
            ORDER BY corrections DESC
            """
        )
    )
    by_question = await db.execute(
        text(
            """
            SELECT question_id, language, COUNT(*) AS corrections
            FROM stt_corrections
            WHERE question_id IS NOT NULL
            GROUP BY question_id, language
            ORDER BY corrections DESC
            LIMIT 20
            """
        )
    )
    total = await db.execute(text("SELECT COUNT(*) FROM stt_corrections"))

    return {
        "total_corrections": total.scalar(),
        "by_language": [dict(r._mapping) for r in by_lang],
        "by_question": [dict(r._mapping) for r in by_question],
    }


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


async def get_substitution_patterns(
    db: AsyncSession,
    min_count: int = 2,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """
    Find word-level substitution pairs: words that users consistently replace.

    Algorithm:
      1. Load recent corrections (up to `limit`).
      2. Align tokens in original vs corrected using a simple greedy diff.
      3. Count (language, original_word, corrected_word) triples.
      4. Return pairs that appear >= min_count times, sorted by frequency.

    These pairs drive two uses:
      a. Analytics — admins see what the model keeps mishearing.
      b. Prompt enrichment — corrected words added to Whisper initial_prompt.
    """
    rows = await db.execute(
        text(
            """
            SELECT language, original_transcript, corrected_transcript
            FROM stt_corrections
            ORDER BY flagged_at DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    )
    records = rows.fetchall()

    # Count (lang, orig_word, corr_word) substitution triples
    counts: dict[tuple[str, str, str], int] = defaultdict(int)

    for row in records:
        lang = row.language or "en"
        orig_tokens = _tokenize(row.original_transcript or "")
        corr_tokens = _tokenize(row.corrected_transcript or "")

        # Simple positional alignment — works well for short survey answers
        for i, (o, c) in enumerate(zip(orig_tokens, corr_tokens)):
            if o != c:
                counts[(lang, o, c)] += 1

        # Extra corrected words not in original → additions
        if len(corr_tokens) > len(orig_tokens):
            for c in corr_tokens[len(orig_tokens):]:
                counts[(lang, "", c)] += 1

    results = [
        {
            "language": lang,
            "original_word": orig,
            "corrected_word": corr,
            "count": cnt,
        }
        for (lang, orig, corr), cnt in sorted(counts.items(), key=lambda x: -x[1])
        if cnt >= min_count
    ]
    return results


async def get_enriched_primer_terms(
    db: AsyncSession,
    min_count: int = 2,
) -> dict[str, list[str]]:
    """
    Return {language: [corrected_word, ...]} for use in Whisper initial_prompt.

    Only includes meaningful words (length >= 3, not pure digits).
    """
    patterns = await get_substitution_patterns(db, min_count=min_count)
    enriched: dict[str, list[str]] = defaultdict(list)
    seen: set[tuple[str, str]] = set()

    for p in patterns:
        lang = p["language"]
        word = p["corrected_word"]
        if len(word) >= 3 and not word.isdigit() and (lang, word) not in seen:
            enriched[lang].append(word)
            seen.add((lang, word))

    return dict(enriched)
