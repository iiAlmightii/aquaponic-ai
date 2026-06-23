"""Audio transcription endpoints — supports faster-whisper (local) and Sarvam Saarika (API).

Set STT_PROVIDER=sarvam in .env to use Sarvam's cloud STT (no GPU required).
Set STT_PROVIDER=whisper (default) to use local faster-whisper.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
import logging
import os
import tempfile
import math
from typing import Any, Optional
from pathlib import Path

import asyncio
import time
import httpx

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from core.database import get_db, AsyncSessionLocal

router = APIRouter(tags=["audio"])
logger = logging.getLogger("aquaponic_ai.audio")

# ── STT provider selection ────────────────────────────────────────────────────
# STT_PROVIDER=sarvam  → use Sarvam Saarika v2 API (no GPU, needs SARVAM_API_KEY)
# STT_PROVIDER=whisper → use faster-whisper locally (default)
STT_PROVIDER = os.getenv("STT_PROVIDER", "whisper").lower()
_SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
_SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "").strip()

# Try to import faster-whisper; it's optional in Docker
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

# Default to large-v3 — multilingual, best accuracy across all supported languages.
MODEL_NAME = os.getenv("FASTER_WHISPER_MODEL", "large-v3")
# Default to cuda — CPU is not acceptable for real-time transcription latency.
REQUESTED_DEVICE = os.getenv("FASTER_WHISPER_DEVICE", "cuda").lower()
REQUESTED_COMPUTE_TYPE = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8_float16")
RUNTIME_DEVICE = REQUESTED_DEVICE
RUNTIME_COMPUTE_TYPE = REQUESTED_COMPUTE_TYPE
_whisper_model: Optional["WhisperModel"] = None


def _build_model(device: str, compute_type: str) -> "WhisperModel":
    if device == "cuda":
        try:
            import torch
            if not torch.cuda.is_available():
                raise RuntimeError(
                    "FASTER_WHISPER_DEVICE=cuda but CUDA is not available. "
                    "Ensure nvidia-container-toolkit is installed and the Docker "
                    "compose 'deploy.resources.reservations.devices' GPU section is present."
                )
        except ImportError:
            pass  # torch not installed; let ctranslate2 surface the CUDA error directly
    return WhisperModel(MODEL_NAME, device=device, compute_type=compute_type)


def get_whisper_model() -> "WhisperModel":
    """Lazily initialize and cache the faster-whisper model."""
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = _build_model(RUNTIME_DEVICE, RUNTIME_COMPUTE_TYPE)
    return _whisper_model


def preload_whisper_model() -> bool:
    """Best-effort preload to avoid first-transcription latency in UI."""
    if not WHISPER_AVAILABLE:
        return False
    try:
        get_whisper_model()
        return True
    except Exception:
        return False


def infer_audio_suffix(upload: UploadFile) -> str:
    """Infer a safe file extension for decoder compatibility."""
    if upload.filename:
        ext = Path(upload.filename).suffix.lower()
        if ext in {".webm", ".wav", ".mp3", ".m4a", ".mp4", ".ogg", ".flac"}:
            return ext

    content_type = (upload.content_type or "").lower()
    mapping = {
        "audio/webm": ".webm",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".mp4",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
    }
    return mapping.get(content_type, ".webm")


# ---------------------------------------------------------------------------
# Corrections cache — enriched terms derived from user-submitted corrections.
# Refreshed every 5 minutes by a background task; never blocks transcription.
# ---------------------------------------------------------------------------
_CORRECTIONS_CACHE: dict[str, list[str]] = {}   # lang -> [corrected_word, ...]
_CORRECTIONS_CACHE_TS: float = 0.0
_CORRECTIONS_CACHE_TTL: float = 300.0           # seconds


async def _refresh_corrections_cache() -> None:
    global _CORRECTIONS_CACHE, _CORRECTIONS_CACHE_TS
    try:
        from services.corrections_analytics import get_enriched_primer_terms
        async with AsyncSessionLocal() as db:
            enriched = await get_enriched_primer_terms(db, min_count=2)
        _CORRECTIONS_CACHE = enriched
        _CORRECTIONS_CACHE_TS = time.monotonic()
    except Exception:
        pass  # never let analytics failure break transcription


async def _corrections_cache_loop() -> None:
    """Background loop — refreshes corrections cache every TTL seconds."""
    while True:
        await asyncio.sleep(_CORRECTIONS_CACHE_TTL)
        await _refresh_corrections_cache()


# Domain vocabulary primers in each supported language.
# Prepended as initial_prompt so Whisper's decoder is primed for agricultural/financial terms
# before it sees the first audio token — improves recognition of loanwords and number scales.
_LANG_DOMAIN_PRIMERS: dict[str, str] = {
    "hi": "खेती, फसल, आय, लाख, करोड़, रुपये, हेक्टेयर, सिंचाई।",
    "kn": "ಕೃಷಿ, ಬೆಳೆ, ಆದಾಯ, ಲಕ್ಷ, ಕೋಟಿ, ರೂಪಾಯಿ, ಹೆಕ್ಟೇರ್, ನೀರಾವರಿ.",
    "ta": "விவசாயம், பயிர், வருமானம், லட்சம், கோடி, ரூபாய், ஹெக்டேர், நீர்ப்பாசனம்.",
    "te": "వ్యవసాయం, పంట, ఆదాయం, లక్ష, కోటి, రూపాయలు, హెక్టారు, సాగునీరు.",
    "mr": "शेती, पीक, उत्पन्न, लाख, कोटी, रुपये, हेक्टेयर, सिंचन.",
}

# Number hints in target language — guide Whisper to output digits rather than spelled-out words.
_LANG_NUMBER_HINTS: dict[str, str] = {
    "hi": "संख्या अंकों में लिखें।",
    "kn": "ಸಂಖ್ಯೆಯನ್ನು ಅಂಕೆಗಳಲ್ಲಿ ಬರೆಯಿರಿ.",
    "ta": "எண்களை இலக்கங்களில் எழுதுங்கள்.",
    "te": "సంఖ్యను అంకెలలో రాయండి.",
    "mr": "संख्या अंकांमध्ये लिहा.",
}


def _build_whisper_prompt(
    lang: str,
    question_context: Optional[str],
    question_type: Optional[str],
) -> Optional[str]:
    """Build an initial_prompt appropriate for the transcription language.

    Enriches the primer with correction-derived terms from the live cache so
    the model sees vocabulary it has previously misheard.
    """
    parts: list[str] = []
    if lang == "en":
        if question_context:
            parts.append(question_context)
        if question_type == "number":
            parts.append("The answer is a number. Write numbers as digits, not words.")
    else:
        primer = _LANG_DOMAIN_PRIMERS.get(lang)
        if primer:
            parts.append(primer)
        if question_type == "number":
            parts.append(_LANG_NUMBER_HINTS.get(lang, "Write numbers as digits."))

    # Append up to 10 correction-derived terms for this language.
    # These are words users have consistently corrected Whisper on — priming
    # the decoder with them improves recognition of those specific terms.
    extra = _CORRECTIONS_CACHE.get(lang, [])[:10]
    if extra:
        parts.append(", ".join(extra) + ".")

    return "\n".join(parts) if parts else None


def _build_retry_prompt(
    lang: str,
    question_context: Optional[str],
    question_type: Optional[str],
    question_id: Optional[str],
) -> Optional[str]:
    """Build a retry initial_prompt (tighter, more directive) for low-confidence attempts."""
    parts: list[str] = []
    if lang == "en":
        if question_context:
            parts.append(question_context)
        if question_type == "number":
            parts.append("The answer is a single number. Write only digits.")
        elif question_id == "farm_name":
            parts.append("Output only the farm or project name.")
    else:
        primer = _LANG_DOMAIN_PRIMERS.get(lang)
        if primer:
            parts.append(primer)
        if question_type == "number":
            parts.append(_LANG_NUMBER_HINTS.get(lang, "Write numbers as digits."))
    return "\n".join(parts) if parts else None


class TranscribeRequest(BaseModel):
    """Request for audio transcription with question context."""
    language: str = "en"
    question_context: Optional[str] = None
    question_id: Optional[str] = None


class TranscribeResponse(BaseModel):
    """Response with transcribed text and confidence."""
    text: str
    confidence: float = 1.0
    provider: str = "faster-whisper"
    audit_id: str
    interpretation: dict[str, Any] = {}
    alternatives: list[str] = []
    confidence_details: dict[str, float] = {}


async def _transcribe_with_sarvam(
    audio_data: bytes,
    audio_suffix: str,
    language: str = "en",
) -> tuple[str, float]:
    """Call Sarvam Saarika v2 STT API. Returns (raw_transcript, confidence)."""
    if not _SARVAM_API_KEY:
        raise HTTPException(
            status_code=501,
            detail="SARVAM_API_KEY is not set. Add it to .env to use Sarvam STT."
        )
    lang_code_map = {"hi": "hi-IN", "kn": "kn-IN", "ta": "ta-IN",
                     "te": "te-IN", "mr": "mr-IN", "en": "en-IN"}
    lang_code = lang_code_map.get(language, "en-IN")
    mime = "audio/webm" if audio_suffix in {".webm", ""} else "audio/wav"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _SARVAM_STT_URL,
                headers={"API-Subscription-Key": _SARVAM_API_KEY},
                files={"file": (f"audio{audio_suffix}", audio_data, mime)},
                data={"model": "saarika:v2", "language_code": lang_code},
            )
        if not resp.is_success:
            raise HTTPException(
                status_code=502,
                detail=f"Sarvam STT error {resp.status_code}: {resp.text[:200]}"
            )
        transcript = (resp.json().get("transcript") or "").strip()
        if not transcript:
            raise HTTPException(status_code=400, detail="Could not transcribe audio")
        return transcript, 0.9  # Sarvam doesn't expose confidence; use 0.9
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Sarvam STT failed: {exc}")


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = "en",
    question_context: Optional[str] = None,
    question_id: Optional[str] = None,
    question_type: Optional[str] = None,
):
    """Transcribe audio using the configured STT provider (Sarvam or Whisper)."""
    audio_data = await file.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    lang = (language or "en").split("-")[0]

    # ── Sarvam STT path ───────────────────────────────────────────────────────
    if STT_PROVIDER == "sarvam":
        from services.voice_interpretation import (
            append_voice_audit_log, interpret_transcript,
            post_process_transcript, normalize_number_transcript,
            build_voice_audit_id,
        )
        raw_text, stt_conf = await _transcribe_with_sarvam(
            audio_data, infer_audio_suffix(file), lang
        )
        cleaned_text = post_process_transcript(raw_text, language=lang) or raw_text.strip()
        if question_type == "number" and cleaned_text:
            normalized = normalize_number_transcript(cleaned_text)
            if normalized != cleaned_text:
                cleaned_text = normalized
        interpretation = interpret_transcript(question_id, cleaned_text, stt_conf) if question_id else {}
        alternatives: list[str] = []
        if "farm_name" in interpretation:
            alternatives = interpretation["farm_name"].get("alternatives") or []
        audit_id = build_voice_audit_id()
        append_voice_audit_log({
            "audit_id": audit_id, "timestamp": None, "question_id": question_id,
            "provider": "sarvam-saarika", "question_context_present": bool(question_context),
            "transcript_raw": raw_text, "transcript_clean": cleaned_text,
            "stt_confidence": stt_conf, "confidence_details": {}, "interpretation": interpretation,
        })
        return TranscribeResponse(
            text=cleaned_text, confidence=stt_conf, provider="sarvam-saarika",
            audit_id=audit_id, interpretation=interpretation,
            alternatives=alternatives, confidence_details={},
        )

    # ── Whisper path (default) ────────────────────────────────────────────────
    if not WHISPER_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="faster-whisper is not installed. Add faster-whisper to backend dependencies and rebuild."
        )

    from services.voice_interpretation import (
        append_voice_audit_log,
        interpret_transcript,
        post_process_transcript,
        normalize_number_transcript,
        build_voice_audit_id,
        clamp01,
    )

    tmp_path = None
    try:
        model = get_whisper_model()
        lang = (language or "en").split("-")[0]

        with tempfile.NamedTemporaryFile(delete=False, suffix=infer_audio_suffix(file)) as tmp_audio:
            tmp_audio.write(audio_data)
            tmp_path = tmp_audio.name

        def _segments_to_confidence(segments: list[Any]) -> tuple[float, dict[str, float]]:
            seg_confs: list[float] = []
            avg_logprob_vals: list[float] = []
            no_speech_vals: list[float] = []
            for s in segments:
                avg_lp = getattr(s, "avg_logprob", None)
                no_speech = getattr(s, "no_speech_prob", None)
                if avg_lp is None:
                    conf = 0.45
                else:
                    conf = math.exp(float(avg_lp))
                if no_speech is not None:
                    no_speech_f = clamp01(1.0 - float(no_speech))
                    conf *= no_speech_f
                    no_speech_vals.append(float(no_speech))
                seg_confs.append(float(conf))
                if avg_lp is not None:
                    avg_logprob_vals.append(float(avg_lp))

            if not seg_confs:
                return 0.0, {"segments": 0.0}

            overall = sum(seg_confs) / len(seg_confs)
            overall = clamp01(overall)
            details = {
                "segments": float(len(seg_confs)),
                "avg_logprob": float(sum(avg_logprob_vals) / len(avg_logprob_vals)) if avg_logprob_vals else -1.0,
                "avg_no_speech_prob": float(sum(no_speech_vals) / len(no_speech_vals)) if no_speech_vals else 0.0,
            }
            return overall, details

        def _transcribe_with_params(*, beam_size: int, initial_prompt: Optional[str], vad_filter: bool) -> tuple[str, float, dict[str, float]]:
            segs_gen, _ = model.transcribe(
                tmp_path,
                language=lang,
                beam_size=beam_size,
                initial_prompt=initial_prompt,
                vad_filter=vad_filter,
            )
            segments = list(segs_gen)
            raw_text = " ".join(s.text for s in segments).strip()
            if not raw_text:
                return "", 0.0, {"segments": 0.0}

            stt_conf, conf_details = _segments_to_confidence(segments)
            return raw_text, stt_conf, conf_details

        whisper_prompt = _build_whisper_prompt(lang, question_context, question_type)

        # Attempt A: with VAD filter (removes silence around speech)
        transcript_a_raw, stt_conf_a, conf_details_a = _transcribe_with_params(
            beam_size=5,
            initial_prompt=whisper_prompt,
            vad_filter=True,
        )

        transcript_b_raw = ""
        stt_conf_b = 0.0
        conf_details_b: dict[str, float] = {}

        low_conf_threshold = float(os.getenv("STT_LOW_CONFIDENCE_THRESHOLD", "0.45"))

        # Retry without VAD when: (a) VAD discarded everything, or (b) number question with low confidence
        # VAD can aggressively discard short utterances like "2000" or "five thousand"
        do_retry = (not transcript_a_raw) or (question_type == "number" and stt_conf_a < low_conf_threshold)
        if not do_retry and question_id == "farm_name" and stt_conf_a < low_conf_threshold:
            do_retry = True

        if do_retry:
            retry_prompt = _build_retry_prompt(lang, question_context, question_type, question_id)
            transcript_b_raw, stt_conf_b, conf_details_b = _transcribe_with_params(
                beam_size=3,
                initial_prompt=retry_prompt,
                vad_filter=False,
            )

        if transcript_b_raw and stt_conf_b >= stt_conf_a:
            chosen_raw = transcript_b_raw
            chosen_stt_conf = stt_conf_b
            chosen_conf_details = conf_details_b
        else:
            chosen_raw = transcript_a_raw
            chosen_stt_conf = stt_conf_a
            chosen_conf_details = conf_details_a

        if not chosen_raw:
            raise HTTPException(status_code=400, detail="Could not transcribe audio")

        cleaned_text = post_process_transcript(chosen_raw, language=lang)
        if not cleaned_text:
            cleaned_text = chosen_raw.strip()

        if question_type == "number" and cleaned_text:
            normalized = normalize_number_transcript(cleaned_text)
            if normalized != cleaned_text:
                cleaned_text = normalized

        interpretation = interpret_transcript(question_id, cleaned_text, chosen_stt_conf) if question_id else {}
        alternatives: list[str] = []
        if "farm_name" in interpretation:
            alternatives = interpretation["farm_name"].get("alternatives") or []

        audit_id = build_voice_audit_id()
        audit_record = {
            "audit_id": audit_id,
            "timestamp": None,
            "question_id": question_id,
            "provider": "faster-whisper",
            "question_context_present": bool(question_context),
            "transcript_raw": chosen_raw,
            "transcript_clean": cleaned_text,
            "stt_confidence": chosen_stt_conf,
            "confidence_details": chosen_conf_details,
            "attempts": {
                "a": {"stt_confidence": stt_conf_a, "text_present": bool(transcript_a_raw)},
                "b": {"stt_confidence": stt_conf_b, "text_present": bool(transcript_b_raw)},
            },
            "interpretation": interpretation,
        }
        append_voice_audit_log(audit_record)

        return TranscribeResponse(
            text=cleaned_text,
            confidence=chosen_stt_conf,
            provider="faster-whisper",
            audit_id=audit_id,
            interpretation=interpretation,
            alternatives=alternatives,
            confidence_details=chosen_conf_details,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


class CorrectionRequest(BaseModel):
    audit_id: str
    original_transcript: str
    corrected_transcript: str
    language: str = "en"
    question_id: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/correct", status_code=201)
async def submit_correction(
    body: CorrectionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Record a user correction for a bad transcription.

    Called from the frontend when the user edits the transcribed text
    and confirms it was wrong. Stored in stt_corrections for analysis.
    """
    if not body.audit_id or not body.corrected_transcript.strip():
        raise HTTPException(status_code=400, detail="audit_id and corrected_transcript are required")

    await db.execute(
        text(
            """
            INSERT INTO stt_corrections
                (audit_id, session_id, original_transcript, corrected_transcript, language, question_id)
            VALUES
                (:audit_id, :session_id, :original, :corrected, :language, :question_id)
            """
        ),
        {
            "audit_id": body.audit_id,
            "session_id": body.session_id or None,
            "original": body.original_transcript,
            "corrected": body.corrected_transcript.strip(),
            "language": body.language or "en",
            "question_id": body.question_id or None,
        },
    )
    await db.commit()
    return {"status": "recorded"}


@router.get("/corrections/stats")
async def corrections_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate stats over submitted STT corrections — per language and per question."""
    from services.corrections_analytics import get_stats
    return await get_stats(db)


@router.get("/corrections/patterns")
async def corrections_patterns(
    min_count: int = 2,
    db: AsyncSession = Depends(get_db),
):
    """Word-level substitution patterns derived from user corrections.

    Returns pairs where users consistently corrected one word to another,
    sorted by frequency. Use this to identify systematic Whisper errors
    and add new domain corrections.
    """
    from services.corrections_analytics import get_substitution_patterns
    return await get_substitution_patterns(db, min_count=min_count)


@router.get("/health")
async def audio_health():
    """Check if transcription provider is available."""
    return {
        "whisper_available": WHISPER_AVAILABLE,
        "provider": "faster-whisper" if WHISPER_AVAILABLE else "disabled",
        "model": MODEL_NAME if WHISPER_AVAILABLE else None,
        "requested_device": REQUESTED_DEVICE if WHISPER_AVAILABLE else None,
        "requested_compute_type": REQUESTED_COMPUTE_TYPE if WHISPER_AVAILABLE else None,
        "device": RUNTIME_DEVICE if WHISPER_AVAILABLE else None,
        "compute_type": RUNTIME_COMPUTE_TYPE if WHISPER_AVAILABLE else None,
    }
