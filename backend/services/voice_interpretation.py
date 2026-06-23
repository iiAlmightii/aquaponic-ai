from __future__ import annotations

import json
import math
import os
import re
import uuid
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional


FILLER_NOISE_RE = re.compile(
    r"\b("
    r"um|uh|erm|uhh|eh|like|you know|i mean|actually|basically|literally|sort of|kind of|right"
    r")\b",
    flags=re.IGNORECASE,
)

# Phrases Whisper hallucinates on near-silent audio or when it picks up TTS echo.
# Compared case-insensitively after stripping punctuation/whitespace.
_WHISPER_HALLUCINATIONS: frozenset[str] = frozenset({
    # English
    "thank you very much",
    "thank you",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "subscribe to our channel",
    "like and subscribe",
    "play it back",
    "play it",
    "subtitles by",
    "transcribed by",
    "www.mooji.org",
    "you",
    "i",
    # Hindi — common Whisper hallucinations on near-silent Hindi audio
    "धन्यवाद",           # dhanyavaad — "thank you"
    "शुक्रिया",           # shukriya — "thanks"
    "नमस्ते",             # namaste
    "सब्सक्राइब करें",   # "please subscribe"
    # Kannada
    "ಧನ್ಯವಾದಗಳು",        # dhanyavadagalu — "thank you"
    "ನಮಸ್ಕಾರ",            # namaskara
    # Tamil
    "நன்றி",              # nandri — "thank you"
    "வணக்கம்",            # vanakkam — greeting
    # Telugu
    "ధన్యవాదాలు",         # dhanyavaadaalu — "thank you"
    "నమస్కారం",           # namaskaram
    # Marathi
    "धन्यवाद",            # dhanyavaad (same script as Hindi)
    "नमस्कार",             # namaskar
})

# Spoken number words including STT homophones → integer value
_SPOKEN_UNITS: dict[str, int] = {
    "zero": 0, "oh": 0,
    "one": 1, "won": 1,
    "two": 2, "to": 2, "too": 2,
    "three": 3, "tree": 3, "free": 3,
    "four": 4, "for": 4, "fore": 4,
    "five": 5, "fife": 5,
    "six": 6,
    "seven": 7,
    "eight": 8, "ate": 8,
    "nine": 9, "nein": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
_SPOKEN_SCALES: dict[str, int] = {
    "hundred": 100,
    "thousand": 1_000,
    "lakh": 100_000,
    "million": 1_000_000,
    "crore": 10_000_000,
}


def extract_spoken_number(text: str) -> Optional[float]:
    """Extract numeric value from speech text, resolving homophones and word-numbers."""
    cleaned = re.sub(r"[,\s]+", " ", str(text or "").strip().lower())

    # Direct digit match first
    m = re.search(r"[-+]?\d*\.?\d+", cleaned)
    if m:
        try:
            return float(m.group())
        except ValueError:
            pass

    # Word-based number building
    tokens = re.findall(r"[a-z]+", cleaned)
    current = 0
    total = 0
    found = False
    for token in tokens:
        if token in _SPOKEN_UNITS:
            current += _SPOKEN_UNITS[token]
            found = True
        elif token in _SPOKEN_SCALES:
            scale = _SPOKEN_SCALES[token]
            if current == 0:
                current = 1
            if scale >= 1_000:
                total += current * scale
                current = 0
            else:
                current *= scale
            found = True
        elif token in ("and", "point"):
            continue
        # ignore other words
    if found:
        return float(total + current)
    return None


def normalize_number_transcript(text: str) -> str:
    """
    For number-type questions, convert the raw STT transcript to a clean digit string.
    E.g. "for" → "4", "two hundred fifty" → "250", "twenty thousand" → "20000".
    Falls back to the original text if no number can be extracted.
    """
    val = extract_spoken_number(text)
    if val is None:
        return text
    # Format as integer when possible, otherwise use general float format
    if val == int(val) and val < 1e12:
        return str(int(val))
    return f"{val:g}"

logger = logging.getLogger("aquaponic_ai.voice_interpretation")


DOMAIN_REPLACEMENTS = [
    # STT variants -> canonical aquaponics terms
    (re.compile(r"\b(hydroponic|aquaponic)\b", flags=re.IGNORECASE), "aquaponics"),
    (re.compile(r"\b(media\s*(bed|bead|bid|bad|bread))\b", flags=re.IGNORECASE), "media bed"),
    (re.compile(r"\b(till|tell|app|apia|telepathy|talapia|tilapya|tila\s*pia|tilapiya|telapia|to lapia)\b", flags=re.IGNORECASE), "tilapia"),
    (re.compile(r"\b(troat|trowt|traut)\b", flags=re.IGNORECASE), "trout"),
    (re.compile(r"\b(kaarp|carf|cap)\b", flags=re.IGNORECASE), "carp"),
    (re.compile(r"\b(barry|mundi|bear a monday|barra|baramundi|baramandi|barramandy|baramundy|barramundi)\b", flags=re.IGNORECASE), "barramundi"),
    (re.compile(r"\b(parch|purch|persh)\b", flags=re.IGNORECASE), "perch"),
    (re.compile(r"\b(samon|salman)\b", flags=re.IGNORECASE), "salmon"),
    (re.compile(r"\b(nft|empty|an empty|and ft|n f t)\b", flags=re.IGNORECASE), "nft"),
    (re.compile(r"\b(dwc|do you see|deep water)\b", flags=re.IGNORECASE), "dwc"),
]


FARM_NAME_STOPWORDS = {
    "my",
    "the",
    "a",
    "an",
    "name",
    "is",
    "its",
    "it",
    "called",
    "um",
    "uh",
    "erm",
}


FARM_NAME_PREFIX_RE = re.compile(
    r"(?i)^(?:"
    r"name\s*(?:is|is:|it'?s|it'?s:)?"
    r"|my\s+farm\s*(?:is|is:|called)?"
    r"|farm\s*(?:is|is:|called)?"
    r"|project\s*(?:is|is:|called)?"
    r"|it'?s\s+called"
    r"|called"
    r")\s*[:\-]?\s*",
)


def clamp01(v: float) -> float:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0.0
    return max(0.0, min(1.0, float(v)))


def post_process_transcript(text: str, language: str = "en") -> str:
    """
    General STT transcript cleanup:
      - reject known Whisper hallucinations (near-silent audio / TTS echo)
      - remove filler tokens
      - apply aquaponics vocabulary normalization (English only)
      - normalize whitespace (keep casing as much as possible)
    """
    t = str(text or "").strip()
    if not t:
        return ""

    # Reject hallucinations: strip trailing punctuation/whitespace before comparing
    normalized_check = re.sub(r"[^\w\s]", "", t).strip().lower()
    if normalized_check in _WHISPER_HALLUCINATIONS:
        return ""

    t = FILLER_NOISE_RE.sub("", t)
    t = re.sub("[\u201c\u201d]", '"', t)
    t = re.sub('[\u2018\u2019]', "'", t)
    # Domain corrections are English-specific — skip for other languages to avoid
    # corrupting non-English words that happen to match English phonetic patterns.
    if language == "en":
        for pattern, replacement in DOMAIN_REPLACEMENTS:
            t = pattern.sub(replacement, t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\s+([,.;!?])", r"\1", t)
    return t.strip()


def _title_case_words(s: str) -> str:
    small_words = {"of", "and", "or", "the", "in", "on", "for", "to", "at", "by"}
    words = re.split(r"(\s+)", s.strip())
    out = []
    for w in words:
        if w.isspace() or w == "":
            out.append(w)
            continue
        wl = w.lower()
        if wl in small_words:
            out.append(wl)
        else:
            out.append(w[:1].upper() + w[1:].lower() if len(w) > 1 else w.upper())
    return "".join(out).strip()


def _tokenize_alpha_num(s: str) -> list[str]:
    # Keep digits inside tokens (e.g., "Green Ridge 2")
    return re.findall(r"[A-Za-z0-9][A-Za-z0-9\-']*", s)


def _score_name_candidate(words: list[str]) -> float:
    # Heuristic scoring: proper noun-ish words + length balance + 'farm/project' hints.
    if not words:
        return 0.0
    if len(words) == 1:
        return 0.2
    alphaish = sum(1 for w in words if any(c.isalpha() for c in w))
    capish = sum(1 for w in words if w[:1].isalpha() and w[:1].upper() == w[:1])
    farm_hint = sum(1 for w in words if w.lower() in {"farm", "project"})
    length_penalty = 0.0
    if len(words) > 6:
        length_penalty = (len(words) - 6) * 0.05
    score = 0.2
    score += 0.35 * (alphaish / len(words))
    score += 0.25 * (capish / len(words))
    score += 0.2 * min(1.0, farm_hint / 2.0)
    score -= length_penalty
    return clamp01(score)


@dataclass(frozen=True)
class FarmNameInterpretation:
    best: str
    alternatives: list[str]
    confidence: float


def extract_farm_name_candidates(transcript: str) -> FarmNameInterpretation:
    """
    Farm name is a critical entity:
      - prioritize proper noun extraction
      - prefer sequences that end with 'Farm'/'Project'
      - provide alternatives for user confirmation when ambiguous
    """
    raw = str(transcript or "").strip()
    cleaned = post_process_transcript(raw)
    if not cleaned:
        return FarmNameInterpretation(best="", alternatives=[], confidence=0.0)

    # If the transcript includes a phrase like "the name is ...", extract after it.
    after_prefix = FARM_NAME_PREFIX_RE.sub("", cleaned, count=1).strip()
    working = after_prefix or cleaned

    # Tokenize and drop obvious stopwords for candidate generation.
    tokens = [t for t in _tokenize_alpha_num(working) if t.lower() not in FARM_NAME_STOPWORDS]
    if not tokens:
        title = _title_case_words(working)
        return FarmNameInterpretation(best=title, alternatives=[], confidence=0.35)

    # Generate n-gram candidates (2..6 tokens) and keep top scoring.
    candidates: list[tuple[float, list[str]]] = []
    for start in range(0, len(tokens)):
        for end in range(start + 2, min(len(tokens), start + 6) + 1):
            chunk = tokens[start:end]
            # Prefer candidates that end with Farm/Project when present.
            if chunk[-1].lower() in {"farm", "project"}:
                conf = _score_name_candidate(chunk) + 0.15
            else:
                conf = _score_name_candidate(chunk)
            candidates.append((conf, chunk))

    # If no candidates were created (too short), fall back to a 2-token join.
    if not candidates:
        best_words = tokens[: min(4, len(tokens))]
        best = _title_case_words(" ".join(best_words))
        return FarmNameInterpretation(best=best, alternatives=[], confidence=0.45)

    candidates.sort(key=lambda x: x[0], reverse=True)
    top = candidates[:5]

    def canonicalize(words: list[str]) -> str:
        # Title-case to preserve entity presentation, even if STT is lowercased.
        return _title_case_words(" ".join(words)).replace("Aquaponics", "Aquaponics")

    best_conf, best_words = top[0]
    best = canonicalize(best_words)

    # Alternatives: avoid duplicates and keep "reasonable" variants.
    alt_set = set([best.lower()])
    alternatives: list[str] = []
    for conf, words in top[1:]:
        title = canonicalize(words)
        if title.lower() in alt_set:
            continue
        if len(words) < 2:
            continue
        alternatives.append(title)
        alt_set.add(title.lower())
        if len(alternatives) >= 2:
            break

    return FarmNameInterpretation(best=best, alternatives=alternatives, confidence=clamp01(0.35 + 0.65 * best_conf))


def interpret_transcript(question_id: Optional[str], transcript: str, stt_confidence: float) -> dict[str, Any]:
    """
    Return question-aware interpretation.
    For now only implements farm-name entity extraction.
    """
    qid = question_id or ""
    stt_conf = clamp01(stt_confidence if stt_confidence is not None else 0.5)

    if qid == "farm_name":
        interp = extract_farm_name_candidates(transcript)
        # Blend STT confidence with extraction confidence (both 0..1).
        combined = clamp01(0.6 * stt_conf + 0.4 * interp.confidence)
        entity_threshold = float(os.getenv("FARM_NAME_ENTITY_CONF_THRESHOLD", "0.65"))
        stt_threshold = float(os.getenv("FARM_NAME_STT_CONF_THRESHOLD", "0.45"))
        needs_confirmation = combined < entity_threshold or stt_conf < stt_threshold
        return {
            "farm_name": {
                "best": interp.best,
                "alternatives": interp.alternatives,
                "confidence": combined,
                "extraction_confidence": interp.confidence,
                "stt_confidence": stt_conf,
                "needs_confirmation": needs_confirmation,
                "thresholds": {
                    "entity_conf_threshold": entity_threshold,
                    "stt_conf_threshold": stt_threshold,
                },
            }
        }

    return {}


def build_voice_audit_id() -> str:
    return str(uuid.uuid4())


def voice_audit_log_path() -> str:
    # Keep it simple and filesystem-based; the container can mount a volume for debugging.
    return os.getenv("VOICE_AUDIT_PATH", "./storage/voice_audit.jsonl")


def append_voice_audit_log(record: dict[str, Any]) -> str:
    """
    Append a single JSONL audit record and return the audit_id.
    Logging must never break user transcription flow.
    """
    audit_id = record.get("audit_id") or build_voice_audit_id()
    record["audit_id"] = audit_id
    record.setdefault("timestamp", datetime.now(timezone.utc).isoformat())

    primary_path = voice_audit_log_path()
    fallback_path = os.getenv("VOICE_AUDIT_FALLBACK_PATH", "/tmp/voice_audit.jsonl")

    def _append(path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    try:
        _append(primary_path)
    except OSError as exc:
        logger.warning(
            "Primary voice audit log path is not writable (%s): %s. Falling back to %s.",
            primary_path,
            exc,
            fallback_path,
        )
        try:
            _append(fallback_path)
        except OSError as fallback_exc:
            logger.error(
                "Fallback voice audit log path is also not writable (%s): %s. "
                "Continuing without audit persistence for audit_id=%s.",
                fallback_path,
                fallback_exc,
                audit_id,
            )
    return audit_id

