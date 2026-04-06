"""Audio transcription endpoints powered by faster-whisper."""

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import logging
import os
import tempfile
import math
from typing import Any, Optional
from pathlib import Path

router = APIRouter(tags=["audio"])
logger = logging.getLogger("aquaponic_ai.audio")

# Try to import faster-whisper; it's optional in Docker
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

MODEL_NAME = os.getenv("FASTER_WHISPER_MODEL", "large-v3")
REQUESTED_DEVICE = os.getenv("FASTER_WHISPER_DEVICE", "cpu").lower()
REQUESTED_COMPUTE_TYPE = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8")
RUNTIME_DEVICE = REQUESTED_DEVICE
RUNTIME_COMPUTE_TYPE = REQUESTED_COMPUTE_TYPE
_whisper_model: Optional["WhisperModel"] = None


def _build_model(device: str, compute_type: str) -> "WhisperModel":
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


class TranscribeRequest(BaseModel):
    """Request for audio transcription with question context."""
    language: str = "en"
    question_context: Optional[str] = None
    # question_id is used for domain-aware interpretation rules (e.g., farm_name entity).
    question_id: Optional[str] = None


class TranscribeResponse(BaseModel):
    """Response with transcribed text and confidence."""
    text: str
    confidence: float = 1.0
    provider: str = "faster-whisper"
    # Unique id to link STT + later user confirmation/corrections (debugging).
    audit_id: str
    # Interpretation is question-aware (e.g., farm-name entity + alternatives).
    interpretation: dict[str, Any] = {}
    # Flat alternatives list (primarily for UI confirmation).
    alternatives: list[str] = []
    # Confidence breakdown for debugging and UI decisions.
    confidence_details: dict[str, float] = {}


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = "en",
    question_context: Optional[str] = None,
    question_id: Optional[str] = None,
):
    """Transcribe an uploaded audio chunk using faster-whisper."""
    if not WHISPER_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="faster-whisper is not installed. Add faster-whisper to backend dependencies and rebuild."
        )

    audio_data = await file.read()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    # Local imports to avoid import overhead for optional dependencies.
    from services.voice_interpretation import (
        append_voice_audit_log,
        interpret_transcript,
        post_process_transcript,
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
                    # avg_logprob is typically negative; exp() maps it back to a 0..1-ish scale.
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
            segs, _ = model.transcribe(
                tmp_path,
                language=lang,
                beam_size=beam_size,
                initial_prompt=initial_prompt,
                vad_filter=vad_filter,
            )

            raw_text = " ".join(segment.text for segment in segs).strip()
            if not raw_text:
                return "", 0.0, {"segments": 0.0}

            stt_conf, conf_details = _segments_to_confidence(list(segs))
            return raw_text, stt_conf, conf_details

        # Attempt 1: default decoding with VAD.
        transcript_a_raw, stt_conf_a, conf_details_a = _transcribe_with_params(
            beam_size=5,
            initial_prompt=question_context,
            vad_filter=True,
        )

        # Attempt 2: targeted decode when farm_name is involved.
        transcript_b_raw = ""
        stt_conf_b = 0.0
        conf_details_b: dict[str, float] = {}

        low_conf_threshold = float(os.getenv("STT_LOW_CONFIDENCE_THRESHOLD", "0.45"))
        do_farm_fallback = question_id == "farm_name" and stt_conf_a < low_conf_threshold

        if do_farm_fallback:
            tuned_prompt = (question_context or "").strip()
            if tuned_prompt:
                tuned_prompt += "\n"
            tuned_prompt += "For the answer, output only the farm/project name (no extra words)."

            transcript_b_raw, stt_conf_b, conf_details_b = _transcribe_with_params(
                beam_size=1,
                initial_prompt=tuned_prompt,
                vad_filter=False,
            )

        # Choose the better transcript.
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

        cleaned_text = post_process_transcript(chosen_raw)
        if not cleaned_text:
            cleaned_text = chosen_raw.strip()

        interpretation = interpret_transcript(question_id, cleaned_text, chosen_stt_conf) if question_id else {}
        alternatives: list[str] = []
        if "farm_name" in interpretation:
            alternatives = interpretation["farm_name"].get("alternatives") or []

        audit_id = build_voice_audit_id()
        audit_record = {
            "audit_id": audit_id,
            "timestamp": None,  # filled in append_voice_audit_log
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
