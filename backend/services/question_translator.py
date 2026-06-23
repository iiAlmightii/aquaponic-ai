"""
question_translator.py — Translate question text to the user's selected language.

Uses the Sarvam Translate API (mayura:v1, formal mode).
Translations are cached in-process so each (text, lang) pair is only fetched once per restart.
Falls back to original English text on any error.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

# Sarvam language code mapping from our short codes
_LANG_MAP: dict[str, str] = {
    "hi": "hi-IN",
    "kn": "kn-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "mr": "mr-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "pa": "pa-IN",
}

_SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"

# in-process cache: {(text_hash, lang): translated_text}
_cache: dict[tuple[str, str], str] = {}


def _key(text: str, lang: str) -> tuple[str, str]:
    return (hashlib.md5(text.encode()).hexdigest(), lang)


async def translate_question(text: str, language: str) -> str:
    """Return translated text. Returns original if language is 'en' or translation fails."""
    if not text or language == "en" or language not in _LANG_MAP:
        return text

    k = _key(text, language)
    if k in _cache:
        return _cache[k]

    if not settings.SARVAM_API_KEY:
        return text

    target_code = _LANG_MAP[language]
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                _SARVAM_TRANSLATE_URL,
                json={
                    "input": text,
                    "source_language_code": "en-IN",
                    "target_language_code": target_code,
                    "speaker_gender": "Male",
                    "mode": "formal",
                    "model": "mayura:v1",
                    "enable_preprocessing": True,
                },
                headers={
                    "api-subscription-key": settings.SARVAM_API_KEY.strip(),
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            translated = resp.json().get("translated_text", text)
            _cache[k] = translated
            return translated
    except Exception as exc:
        logger.warning("question_translator: failed for lang=%s: %s", language, exc)
        return text


async def translate_questions_batch(
    texts: list[str],
    language: str,
) -> list[str]:
    """Translate a list of texts. Each call is independent (no batch API)."""
    import asyncio
    return list(await asyncio.gather(*(translate_question(t, language) for t in texts)))
