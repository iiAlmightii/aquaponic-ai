"""Voice-driven land farming survey module (guided form, not chatbot)."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Session, SessionAnswer
from routers.auth import get_current_user
from services.farm_link_service import link_session_to_farm
from services.land_farm_survey_engine import engine, Prompt
from services.land_market_price_service import market_price_service
from services.land_financial_service import compute_land_financials, export_sheet_payload, export_csv_text
from services.land_sheet_sync import land_sheet_sync
from services.looker_studio_service import get_dashboard_url
from services.question_translator import translate_question
from services.answer_extractor import extract_answer


router = APIRouter(tags=["Land Farm Voice Survey"])


class LandStartRequest(BaseModel):
    farm_id: Optional[str] = None
    language: str = "en"
    enable_validation_question: bool = True


class LandAnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer_text: str
    language: str = "en"
    input_method: str = "voice"
    confidence_score: Optional[float] = None
    enable_validation_question: Optional[bool] = None


class CropPriceOverrideRequest(BaseModel):
    crop_name: str
    price_per_kg: Optional[float] = None
    use_market_price: bool = False


class LandQuestionPayload(BaseModel):
    id: str
    text: str
    type: str
    options: list[str] = []
    example: Optional[str] = None


class LandSurveyState(BaseModel):
    session_id: str
    status: str
    current_question: Optional[LandQuestionPayload]
    requires_confirmation: bool
    progress_answered: int
    progress_total: int
    context: dict[str, Any]


class ExportJsonResponse(BaseModel):
    Inputs: list[list[Any]]
    Calculations: list[list[Any]]
    Summary: list[list[Any]]


async def _prompt_payload(p: Prompt | None, language: str = "en") -> Optional[LandQuestionPayload]:
    if not p:
        return None
    text = await translate_question(p.text, language)
    example = await translate_question(p.example or "", language) if p.example else p.example
    return LandQuestionPayload(
        id=p.id,
        text=text,
        type=p.kind,
        options=p.options or [],
        example=example,
    )


async def _get_session_or_404(session_id: str, user_id: str, db: AsyncSession) -> Session:
    result = await db.execute(select(Session).where(Session.id == session_id, Session.user_id == user_id))
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found.")
    return sess


def _is_land_module(sess: Session) -> bool:
    ctx = sess.context_data or {}
    return ctx.get("module") == "land_farm_voice"


async def _state_response(sess: Session, language: str = "") -> LandSurveyState:
    context = sess.context_data or {}
    if "validation_enabled" not in context:
        context["validation_enabled"] = True
    lang = language or context.get("language", "en")
    prompt = engine.get_current_prompt(context) if sess.status == "in_progress" else None
    answered = len(context.get("answers", {})) + sum(
        1 for c in context.get("crops", [])
        for key in ("cycles_per_year", "months_to_harvest", "yield_kg_per_harvest")
        if c.get(key) is not None
    ) + len(context.get("crops", []))
    total = len(engine.linear_questions) + (len(context.get("crops", [])) * 4)
    return LandSurveyState(
        session_id=sess.id,
        status=sess.status,
        current_question=await _prompt_payload(prompt, lang),
        requires_confirmation=bool(context.get("pending_confirmation")),
        progress_answered=answered,
        progress_total=total,
        context=context,
    )


def _push_history(context: dict[str, Any], max_depth: int = 20) -> None:
    """Snapshot context (excluding history itself) for undo. Keeps last max_depth entries."""
    import json
    snap = {k: v for k, v in context.items() if k != "_history"}
    history = context.setdefault("_history", [])
    history.append(json.loads(json.dumps(snap)))
    if len(history) > max_depth:
        history.pop(0)


def _maybe_attach_market_prices(context: dict[str, Any], force_refresh: bool = False) -> None:
    # Default to False so sessions that completed before this key was written still get prices.
    if context.get("collecting_crops", False):
        return
    if not context.get("crops"):
        return
    answers = context.get("answers", {})
    state = answers.get("farm_state")
    district = answers.get("farm_district")
    market_name = answers.get("market_name")
    crops = context.get("crops", [])
    sources = context.setdefault("market_price_source", {})
    warnings = context.setdefault("warnings", [])

    for crop in crops:
        crop_name = str(crop.get("name", "")).strip()
        if not crop_name:
            continue

        raw_meta = sources.get(crop_name)
        meta = raw_meta if isinstance(raw_meta, dict) else {"source": raw_meta} if isinstance(raw_meta, str) else {}
        manual_override = bool(crop.get("manual_price_override")) or meta.get("mode") == "manual"

        if manual_override:
            continue

        current_price = crop.get("price_per_kg")
        if current_price is not None and not force_refresh:
            continue

        p = market_price_service.fetch_price_per_kg(
            crop_name=crop_name,
            state=state,
            district=district,
            market_name=market_name,
            force_refresh=force_refresh,
        )
        if p:
            crop["price_per_kg"] = p.price_per_kg
            is_fallback = "benchmark" in p.source
            sources[crop_name] = {
                "source": p.source,
                "price_per_kg": p.price_per_kg,
                "fetched_at": p.fetched_at_iso,
                "filters": p.applied_filters or {},
                "record_count": p.record_count,
                "confidence": p.confidence,
                "cache_hit": p.cache_hit,
                "mode": "fallback" if is_fallback else "auto",
            }
            if is_fallback and not market_price_service.has_api_key:
                warn = (
                    f"Using benchmark price ₹{p.price_per_kg}/kg for {crop_name} "
                    f"(set DATA_GOV_IN_API_KEY in .env for live mandi prices). "
                    "You can override this manually."
                )
                if warn not in warnings:
                    warnings.append(warn)
            continue

        if current_price is None:
            warn = f"No price data found for '{crop_name}'. Please enter the price manually."
            if warn not in warnings:
                warnings.append(warn)


@router.post("/start", response_model=LandSurveyState)
async def start_land_survey(
    body: LandStartRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = body.language or "en"
    init_ctx = engine.init_context(validation_enabled=body.enable_validation_question)
    init_ctx["language"] = lang
    sess = Session(
        user_id=current_user.id,
        farm_id=body.farm_id,
        status="in_progress",
        current_step=0,
        total_steps=0,
        context_data=init_ctx,
    )
    db.add(sess)
    await db.flush()
    return await _state_response(sess, lang)


@router.get("/{session_id}", response_model=LandSurveyState)
async def get_land_survey_session(
    session_id: str,
    language: str = Query(default=""),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")
    return await _state_response(sess, language)


@router.post("/answer", response_model=LandSurveyState)
async def submit_land_survey_answer(
    body: LandAnswerRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_session_or_404(body.session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")
    if sess.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session is not active.")

    context = deepcopy(sess.context_data or engine.init_context())
    lang = body.language or context.get("language", "en")
    if "validation_enabled" not in context:
        context["validation_enabled"] = True
    if body.enable_validation_question is not None:
        context["validation_enabled"] = bool(body.enable_validation_question)
    validation_enabled = bool(context.get("validation_enabled", True))
    current_prompt = engine.get_current_prompt(context)
    if not current_prompt:
        sess.status = "completed"
        sess.completed_at = datetime.now(timezone.utc)
        try:
            await link_session_to_farm(sess, context, str(current_user.id), db)
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "Farm linking failed for land survey; skipping.", exc_info=True
            )
        sess.context_data = context
        await db.flush()
        return await _state_response(sess)

    # Confirmation phase: user must answer yes/no when validation is enabled.
    if current_prompt.id == "confirm_current":
        pending = context.get("pending_confirmation")
        if not pending:
            raise HTTPException(status_code=400, detail="No pending answer to confirm.")

        original_prompt = Prompt(
            id=pending["question_id"],
            text=pending.get("question_text", ""),
            kind=pending.get("question_kind", "text"),
            options=pending.get("question_options") or [],
            example=pending.get("question_example"),
        )

        if validation_enabled:
            # Primary path: explicit yes/no.
            # Smart fallback: user may repeat value (e.g. "200" or "200 200") or provide corrected value.
            try:
                confirmed = engine.parse_prompt_answer(current_prompt, body.answer_text)
            except ValueError:
                try:
                    corrected_value = engine.parse_prompt_answer(original_prompt, body.answer_text)
                except ValueError:
                    raise HTTPException(status_code=422, detail="Please answer yes/no, or repeat/correct the value.")

                if corrected_value == pending.get("value"):
                    confirmed = True
                else:
                    context["pending_confirmation"] = {
                        **pending,
                        "value": corrected_value,
                        "display": corrected_value,
                    }
                    sess.context_data = context
                    await db.flush()
                    return await _state_response(sess)

            if confirmed is False:
                context["pending_confirmation"] = None
                # re-ask original question
                sess.context_data = context
                await db.flush()
                return await _state_response(sess)

        # Snapshot context before mutation so back can restore it
        _push_history(context)
        context = engine.apply_confirmed_answer(context, original_prompt, pending["value"])
        context["pending_confirmation"] = None

        # Persist only confirmed structured answers.
        db.add(SessionAnswer(
            session_id=sess.id,
            question_id=original_prompt.id,
            question_text=original_prompt.text,
            answer_text=str(pending.get("display", "")),
            answer_data={"parsed": pending["value"]},
            input_method=body.input_method,
            confidence_score=body.confidence_score,
        ))

        _maybe_attach_market_prices(context)
        sess.context_data = context
        next_prompt = engine.get_current_prompt(context)
        if not next_prompt:
            sess.status = "completed"
            sess.completed_at = datetime.now(timezone.utc)
            try:
                await link_session_to_farm(sess, context, str(current_user.id), db)
            except Exception:
                import logging
                logging.getLogger(__name__).warning(
                    "Farm linking failed for land survey; skipping.", exc_info=True
                )
        await db.flush()
        return await _state_response(sess)

    # Normal answer: extract core value from conversational sentence, then parse.
    if body.question_id != current_prompt.id:
        raise HTTPException(status_code=400, detail=f"Expected answer for {current_prompt.id}, got {body.question_id}")

    answer_text = await extract_answer(body.answer_text, current_prompt.kind, lang)
    try:
        parsed = engine.parse_prompt_answer(current_prompt, answer_text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    skip_confirmation_for_prompt = current_prompt.id == "add_another_crop"

    if validation_enabled and not skip_confirmation_for_prompt:
        # No history push here — the answer isn't confirmed yet
        context["pending_confirmation"] = {
            "question_id": current_prompt.id,
            "question_text": current_prompt.text,
            "question_kind": current_prompt.kind,
            "question_options": current_prompt.options or [],
            "question_example": current_prompt.example,
            "value": parsed,
            "display": parsed,
        }
    else:
        # Snapshot before mutation
        _push_history(context)
        context = engine.apply_confirmed_answer(context, current_prompt, parsed)
        context["pending_confirmation"] = None

        db.add(SessionAnswer(
            session_id=sess.id,
            question_id=current_prompt.id,
            question_text=current_prompt.text,
            answer_text=body.answer_text,      # store original spoken text for audit
            answer_data={"parsed": parsed},
            input_method=body.input_method,
            confidence_score=body.confidence_score,
        ))

        _maybe_attach_market_prices(context)
        next_prompt = engine.get_current_prompt(context)
        if not next_prompt:
            sess.status = "completed"
            sess.completed_at = datetime.now(timezone.utc)
            try:
                await link_session_to_farm(sess, context, str(current_user.id), db)
            except Exception:
                import logging
                logging.getLogger(__name__).warning(
                    "Farm linking failed for land survey; skipping.", exc_info=True
                )

    sess.context_data = context
    await db.flush()
    return await _state_response(sess)


@router.post("/{session_id}/back", response_model=LandSurveyState)
async def go_back_land_survey(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Undo the last confirmed answer and return to the previous question."""
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")

    context = deepcopy(sess.context_data or engine.init_context())
    history: list = context.get("_history", [])

    # If there's a pending confirmation (not yet confirmed), just clear it
    if context.get("pending_confirmation"):
        context["pending_confirmation"] = None
        sess.context_data = context
        sess.status = "in_progress"
        sess.completed_at = None
        await db.flush()
        return await _state_response(sess)

    if not history:
        raise HTTPException(status_code=400, detail="No previous question to go back to.")

    # Restore last snapshot
    prev = history.pop()
    prev["_history"] = history
    sess.context_data = prev
    sess.status = "in_progress"
    sess.completed_at = None
    await db.flush()
    return await _state_response(sess)


@router.get("/{session_id}/dashboard")
async def land_survey_dashboard(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")

    context = deepcopy(sess.context_data or {})
    _maybe_attach_market_prices(context, force_refresh=True)
    sess.context_data = context
    await db.flush()
    calc = compute_land_financials(context)
    return {
        "session_id": sess.id,
        "status": sess.status,
        "market_price_source": context.get("market_price_source", {}),
        **calc,
    }


@router.get("/{session_id}/export")
async def land_survey_export(
    session_id: str,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")

    context = deepcopy(sess.context_data or {})
    _maybe_attach_market_prices(context, force_refresh=True)
    sess.context_data = context
    await db.flush()
    calc = compute_land_financials(context)
    payload = export_sheet_payload(context, calc)

    if format == "csv":
        return PlainTextResponse(export_csv_text(payload), media_type="text/csv")
    return payload


@router.post("/{session_id}/sync-sheet")
async def land_survey_sync_sheet(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")

    context = deepcopy(sess.context_data or {})
    _maybe_attach_market_prices(context, force_refresh=True)
    sess.context_data = context
    await db.flush()
    calc = compute_land_financials(context)
    payload = export_sheet_payload(context, calc)

    try:
        writer = land_sheet_sync()
        result = writer.write_dashboard(payload)
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sheet sync failed: {exc}")


@router.post("/{session_id}/refresh-market-prices")
async def refresh_market_prices(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")

    context = deepcopy(sess.context_data or {})
    _maybe_attach_market_prices(context, force_refresh=True)
    sess.context_data = context
    await db.flush()

    return {
        "ok": True,
        "session_id": sess.id,
        "market_price_source": context.get("market_price_source", {}),
        "crops": [
            {
                "name": c.get("name"),
                "price_per_kg": c.get("price_per_kg"),
            }
            for c in context.get("crops", [])
        ],
    }


@router.get("/{session_id}/looker-url")
async def land_survey_looker_url(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a Looker Studio dashboard URL pre-filtered to this session.

    If LOOKER_STUDIO_REPORT_ID is not configured, returns setup instructions
    so users know how to connect their Supabase PostgreSQL to Looker Studio.
    """
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")

    return get_dashboard_url(session_id)


@router.post("/{session_id}/override-crop-price")
async def override_crop_price(
    session_id: str,
    body: CropPriceOverrideRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_session_or_404(session_id, current_user.id, db)
    if not _is_land_module(sess):
        raise HTTPException(status_code=400, detail="Not a land-farm survey session.")

    crop_name = str(body.crop_name or "").strip().lower()
    if not crop_name:
        raise HTTPException(status_code=422, detail="crop_name is required")

    context = deepcopy(sess.context_data or {})
    crops = context.get("crops", [])
    target = None
    for crop in crops:
        if str(crop.get("name", "")).strip().lower() == crop_name:
            target = crop
            break

    if target is None:
        raise HTTPException(status_code=404, detail=f"Crop '{body.crop_name}' not found in session")

    sources = context.setdefault("market_price_source", {})
    canonical_name = str(target.get("name", body.crop_name))

    if body.use_market_price:
        target["manual_price_override"] = False
        target["price_per_kg"] = None
        _maybe_attach_market_prices(context, force_refresh=True)
    else:
        if body.price_per_kg is None:
            raise HTTPException(status_code=422, detail="price_per_kg is required unless use_market_price=true")
        if body.price_per_kg < 0:
            raise HTTPException(status_code=422, detail="price_per_kg must be >= 0")

        target["price_per_kg"] = float(body.price_per_kg)
        target["manual_price_override"] = True
        sources[canonical_name] = {
            "source": "manual override",
            "price_per_kg": target["price_per_kg"],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "filters": {},
            "record_count": 0,
            "confidence": None,
            "cache_hit": False,
            "mode": "manual",
        }

    sess.context_data = context
    await db.flush()

    return {
        "ok": True,
        "session_id": sess.id,
        "market_price_source": context.get("market_price_source", {}),
        "crops": [
            {
                "name": c.get("name"),
                "price_per_kg": c.get("price_per_kg"),
                "manual_price_override": bool(c.get("manual_price_override")),
            }
            for c in context.get("crops", [])
        ],
    }
