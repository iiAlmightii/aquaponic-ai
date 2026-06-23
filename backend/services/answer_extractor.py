"""
answer_extractor.py — Extract a parseable answer value from a conversational sentence.

Problem: Users often answer survey questions with full sentences in their native language.
  - "Hum teen baar ukaate hai" → the answer is "3"
  - "Main do hectare mein kheti karta hoon" → "2"
  - "Mere paas paanch sau kilo hai" → "500"

Strategy (in order, stops at first match):
  1. If transcript already contains a digit → return as-is (fastest path)
  2. Map Indic number words to digits via regex
  3. Translate to English via Sarvam, then re-apply step 1-2

Only used for NUMBER-type questions. Other question types are sent through as-is.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

_SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"

# Hindi/Hindustani number words (covers most North Indian languages partially)
_HI_UNITS = {
    "ek": 1, "do": 2, "teen": 3, "tin": 3, "chaar": 4, "char": 4,
    "paanch": 5, "panch": 5, "chhah": 6, "chhe": 6, "chheh": 6,
    "saat": 7, "sat": 7, "aath": 8, "ath": 8, "nau": 9, "nao": 9,
    "das": 10, "gyarah": 11, "barah": 12, "terah": 13, "chaudah": 14,
    "pandrah": 15, "pandrah": 15, "solah": 16, "satrah": 17, "atharah": 18,
    "unnees": 19, "unnis": 19, "bees": 20,
    "iikkis": 21, "baais": 22, "teis": 23, "chaubis": 24, "pachees": 25,
    "chhabbis": 26, "sattaees": 27, "athaees": 28, "untees": 29, "tees": 30,
    "iktees": 31, "battees": 32, "taitees": 33, "chautees": 34, "paintees": 35,
    "chhattees": 36, "saintees": 37, "artees": 38, "untaalees": 39, "chaalees": 40,
    "ek-chaalees": 41, "byaalees": 42, "taintaalees": 43, "chauaalees": 44,
    "paintaalees": 45, "chhiyaalis": 46, "saintaalees": 47, "artaalees": 48,
    "unchaas": 49, "pachaas": 50,
    "saath": 60, "sattar": 70, "assi": 80, "nabbe": 90,
    "sau": 100, "hazaar": 1000, "lakh": 100000, "crore": 10000000,
}

# Scale words that multiply what came before
_SCALE = {
    "sau": 100,
    "hazaar": 1000,
    "hazar": 1000,
    "lakh": 100000,
    "crore": 10000000,
}


def _extract_indic_number(text: str) -> Optional[str]:
    """Try to extract a number from Indic number words. Returns digit string or None."""
    lower = text.lower()
    tokens = re.findall(r"[a-zऀ-ॿఀ-౿஀-௿ಀ-೿ऀ-ॿ]+", lower)

    result = 0
    current = 0
    found_any = False

    for token in tokens:
        if token in _HI_UNITS:
            val = _HI_UNITS[token]
            found_any = True
            if token in _SCALE:
                # "teen sau" → 3 * 100, "do hazaar" → 2000
                if current == 0:
                    current = 1
                current *= val
                result += current
                current = 0
            else:
                current = val

    if current:
        result += current

    return str(result) if found_any else None


async def _translate_to_english(text: str, source_lang: str) -> str:
    """Translate to English using Sarvam API. Returns original on failure."""
    from services.question_translator import _LANG_MAP
    source_code = _LANG_MAP.get(source_lang, "hi-IN")
    if not settings.SARVAM_API_KEY:
        return text
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(
                _SARVAM_TRANSLATE_URL,
                json={
                    "input": text,
                    "source_language_code": source_code,
                    "target_language_code": "en-IN",
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
            return resp.json().get("translated_text", text)
    except Exception as exc:
        logger.warning("answer_extractor: translate failed (%s): %s", source_lang, exc)
        return text


async def extract_answer(
    transcript: str,
    question_type: str,
    language: str,
) -> str:
    """
    Return a cleaned answer string suitable for questionnaire_engine.parse_answer().
    For non-NUMBER types or English, returns transcript unchanged.
    """
    if language == "en" or question_type != "number":
        return transcript

    # Step 1: Already has a digit?
    if re.search(r"\d", transcript):
        # Pull out just the numeric part (e.g. "about 50 times" → "50")
        nums = re.findall(r"[\d,]+\.?\d*", transcript.replace(",", ""))
        if nums:
            return nums[0]
        return transcript

    # Step 2: Try Indic number word map
    extracted = _extract_indic_number(transcript)
    if extracted:
        logger.info("answer_extractor: indic word map '%s' → '%s'", transcript, extracted)
        return extracted

    # Step 3: Translate to English, then check for digits or English number words
    english = await _translate_to_english(transcript, language)
    logger.info("answer_extractor: translated '%s' → '%s'", transcript, english)

    # Check digits in translation
    if re.search(r"\d", english):
        nums = re.findall(r"[\d,]+\.?\d*", english.replace(",", ""))
        if nums:
            return nums[0]

    # Check English number words in translation
    _EN_WORDS = {
        "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
        "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
        "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14",
        "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18",
        "nineteen": "19", "twenty": "20", "thirty": "30", "forty": "40",
        "fifty": "50", "sixty": "60", "seventy": "70", "eighty": "80",
        "ninety": "90", "hundred": "100", "thousand": "1000",
    }
    lower = english.lower()
    for word, val in _EN_WORDS.items():
        if re.search(rf"\b{word}\b", lower):
            return val

    # Fall back to original transcript (let parse_answer raise a useful error)
    return transcript
