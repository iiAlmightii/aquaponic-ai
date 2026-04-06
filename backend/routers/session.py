"""
routers/session.py — Questionnaire session lifecycle endpoints.

POST /session/start       → create new session, return first question
POST /session/answer      → submit answer, return next question
GET  /session/{id}        → retrieve session state
DELETE /session/{id}      → abandon session
"""

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Session, SessionAnswer
from routers.auth import get_current_user
from services.questionnaire_engine import engine as qe, QUESTION_INDEX

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    farm_id: Optional[str] = None


class AnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer_text: str
    input_method: str = "text"          # text | voice | select
    confidence_score: Optional[float] = None
    # Optional voice-side audit metadata for debugging and UX confidence confirmation.
    voice_meta: Optional[dict[str, Any]] = None


class BackRequest(BaseModel):
    session_id: str


class QuestionPayload(BaseModel):
    id: str
    text: str
    type: str
    options: list[str] = []
    unit: Optional[str] = None
    hint: str = ""
    category: str = ""


class SessionState(BaseModel):
    session_id: str
    status: str
    current_question: Optional[QuestionPayload]
    progress_answered: int
    progress_total: int
    context: dict[str, Any]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _question_to_payload(q) -> QuestionPayload:
    return QuestionPayload(
        id=q.id, text=q.text, type=q.type.value,
        options=q.options, unit=q.unit, hint=q.hint, category=q.category,
    )


async def _get_session_or_404(session_id: str, user_id: str, db: AsyncSession) -> Session:
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return sess


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/start", response_model=SessionState, status_code=status.HTTP_201_CREATED)
async def start_session(
    body: StartSessionRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new questionnaire session and return the first question."""
    sess = Session(
        user_id=current_user.id,
        farm_id=body.farm_id,
        context_data={"answered": [], "answers": {}},
        total_steps=len(qe.questions),
    )
    db.add(sess)
    await db.flush()

    context = sess.context_data
    next_q = qe.get_next_question(context)
    answered, total = qe.progress(context)

    return SessionState(
        session_id=sess.id,
        status=sess.status,
        current_question=_question_to_payload(next_q) if next_q else None,
        progress_answered=answered,
        progress_total=total,
        context=context,
    )


@router.post("/answer", response_model=SessionState)
async def submit_answer(
    body: AnswerRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record an answer and return the next question (or completion signal)."""
    sess = await _get_session_or_404(body.session_id, current_user.id, db)

    if sess.status != "in_progress":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not active.")

    question = QUESTION_INDEX.get(body.question_id)
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown question: {body.question_id}")

    # Parse answer
    try:
        parsed = qe.parse_answer(question, body.answer_text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # Persist answer row
    # Normalize answer_data shape and attach voice audit when provided.
    if isinstance(parsed, dict):
        answer_data = parsed
    else:
        answer_data = {"parsed": parsed}
    if body.voice_meta:
        answer_data = {**answer_data, "voice_audit": body.voice_meta}

    answer_row = SessionAnswer(
        session_id=sess.id,
        question_id=body.question_id,
        question_text=question.text,
        answer_text=body.answer_text,
        answer_data=answer_data,
        input_method=body.input_method,
        confidence_score=body.confidence_score,
    )
    db.add(answer_row)

    # Update session context
    # Copy JSON context before mutation so SQLAlchemy detects assignment as changed.
    context = deepcopy(sess.context_data) if sess.context_data else {"answered": [], "answers": {}, "draft_answers": {}}
    context = qe.record_answer(context, question, parsed)
    if isinstance(context.get("draft_answers"), dict):
        context["draft_answers"].pop(question.id, None)
    sess.context_data = context

    # Advance to next question
    next_q = qe.get_next_question(context)
    answered, total = qe.progress(context)
    sess.current_step = answered

    if qe.is_complete(context):
        sess.status = "completed"
        sess.completed_at = datetime.now(timezone.utc)

    await db.flush()

    return SessionState(
        session_id=sess.id,
        status=sess.status,
        current_question=_question_to_payload(next_q) if next_q else None,
        progress_answered=answered,
        progress_total=total,
        context=context,
    )


@router.post("/back", response_model=SessionState)
async def go_back_one_question(
    body: BackRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rollback the latest answered question so user can re-answer it."""
    sess = await _get_session_or_404(body.session_id, current_user.id, db)

    context = deepcopy(sess.context_data) if sess.context_data else {"answered": [], "answers": {}, "draft_answers": {}}
    answered = list(context.get("answered", []))
    if not answered:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No previous question to go back to.")

    previous_question_id = answered.pop()
    answers = dict(context.get("answers", {}))
    previous_value = answers.pop(previous_question_id, None)
    draft_answers = dict(context.get("draft_answers", {}))
    if previous_value is not None:
        draft_answers[previous_question_id] = previous_value
    context["answered"] = answered
    context["answers"] = answers
    context["draft_answers"] = draft_answers
    sess.context_data = context
    sess.current_step = len(answered)
    sess.status = "in_progress"
    sess.completed_at = None

    # Remove the latest persisted answer row for this question.
    result = await db.execute(
        select(SessionAnswer)
        .where(SessionAnswer.session_id == sess.id, SessionAnswer.question_id == previous_question_id)
        .order_by(SessionAnswer.id.desc())
    )
    latest_answer_row = result.scalars().first()
    if latest_answer_row:
        await db.delete(latest_answer_row)

    next_q = qe.get_next_question(context)
    answered_count, total = qe.progress(context)

    await db.flush()

    return SessionState(
        session_id=sess.id,
        status=sess.status,
        current_question=_question_to_payload(next_q) if next_q else None,
        progress_answered=answered_count,
        progress_total=total,
        context=context,
    )


@router.get("/{session_id}", response_model=SessionState)
async def get_session(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current state of a session."""
    sess = await _get_session_or_404(session_id, current_user.id, db)
    context = sess.context_data or {"answered": [], "answers": {}, "draft_answers": {}}
    next_q = qe.get_next_question(context) if sess.status == "in_progress" else None
    answered, total = qe.progress(context)

    return SessionState(
        session_id=sess.id,
        status=sess.status,
        current_question=_question_to_payload(next_q) if next_q else None,
        progress_answered=answered,
        progress_total=total,
        context=context,
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def abandon_session(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a session as abandoned."""
    sess = await _get_session_or_404(session_id, current_user.id, db)
    sess.status = "abandoned"
    await db.flush()
