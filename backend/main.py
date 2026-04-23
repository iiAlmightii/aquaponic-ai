"""
AquaponicAI - Main Application Entry Point
==========================================
FastAPI application with full middleware stack, routing, and lifecycle management.
"""

import logging
import time
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from core.config import settings
from core.database import engine, Base
from core.redis_client import init_redis, close_redis
from routers import auth, session, analysis, report, farm, iot, audio, finance_sheets, land_survey, crop, ai_advisor

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("aquaponic_ai")

# ── Rate Limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


async def _preload_whisper_in_background() -> None:
    """Warm the whisper model cache without blocking API startup readiness."""
    try:
        ok = await asyncio.to_thread(audio.preload_whisper_model)
        if ok:
            logger.info("✅ faster-whisper model preloaded (background)")
        else:
            logger.warning("⚠️ faster-whisper preload skipped/failed; first transcription may be slower")
    except Exception:
        logger.exception("Background faster-whisper preload failed")


# ── Lifespan ──────────────────────────────────────────────────────────────────
async def _init_db() -> None:
    """
    Initialise the database on startup.

    - Supabase: schema is applied manually via infra/schema.sql — we only do a
      lightweight connectivity check here (no create_all) to avoid triggering
      the pgbouncer-prepared-statement conflict or a startup timeout.
    - Local postgres: run create_all so tables are created automatically.
    """
    using_supabase = "supabase.com" in settings.DATABASE_URL
    # Supabase: fewer retries — if the project is paused more retries won't help.
    # Local postgres: more retries to handle slow container cold-starts.
    max_attempts = 3 if using_supabase else 5

    for attempt in range(1, max_attempts + 1):
        try:
            async with engine.begin() as conn:
                if using_supabase:
                    from sqlalchemy import text as _text
                    await conn.execute(_text("SELECT 1"))
                    logger.info("✅ Supabase connection verified (schema pre-applied)")
                else:
                    await conn.run_sync(Base.metadata.create_all)
                    logger.info("✅ Local DB tables created/verified")
            return
        except Exception as exc:
            if attempt < max_attempts:
                wait = 2 ** attempt          # 2, 4, 8, 16 s
                logger.warning(
                    "⚠️  DB init attempt %d/%d failed (%s) — retrying in %ds…",
                    attempt, max_attempts, exc, wait,
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    "❌ DB unreachable after %d attempts (%s: %s). "
                    "Backend will start but DB-dependent routes will fail. "
                    "If using Supabase free tier, resume the project at supabase.com.",
                    max_attempts, type(exc).__name__, exc,
                )
                # Do NOT re-raise — allow the backend to start so /health
                # can report db=error rather than the container crash-looping.


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle for the application."""
    logger.info("🚀 AquaponicAI starting up…")
    await _init_db()
    await init_redis()
    asyncio.create_task(_preload_whisper_in_background())
    logger.info("✅ Startup complete | Redis connected")
    yield
    await close_redis()
    logger.info("🛑 AquaponicAI shut down cleanly.")


# ── Application ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="AquaponicAI Platform",
    description="AI-driven farm production management and financial planning for aquaponics.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.state.limiter = limiter

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    """Log request duration for every API call."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time"] = f"{duration_ms:.2f}ms"
    logger.info(
        "%-7s %-40s → %d  (%.0fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# ── Exception Handlers ────────────────────────────────────────────────────────
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def db_connection_error_handler(request: Request, exc: Exception):
    """
    Catch asyncpg / SQLAlchemy connection errors (DNS failure, TCP timeout,
    Supabase paused) and return a clean 503 with a human-readable message
    instead of an internal 500 traceback.
    """
    import socket
    exc_type = type(exc).__name__
    exc_str = str(exc)

    is_db_error = (
        isinstance(exc, (socket.gaierror, OSError, TimeoutError))
        or "asyncpg" in exc_type.lower()
        or "asyncpg" in exc_str.lower()
        or "Name or service not known" in exc_str
        or "Connection refused" in exc_str
        or "could not connect" in exc_str.lower()
        or exc_type in ("InterfaceError", "OperationalError", "DBAPIError")
    )

    if is_db_error:
        logger.error("DB connection error on %s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "detail": (
                    "Database is currently unreachable. "
                    "If you are using Supabase free tier, the project may be paused — "
                    "resume it at supabase.com and retry."
                )
            },
        )
    # Re-raise everything else so FastAPI's default handlers take over.
    raise exc


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # exc.errors() may contain non-JSON-serializable objects (e.g. ValueError in ctx);
    # convert each error to a plain dict with string values.
    def _sanitize(err: dict) -> dict:
        out = {k: v for k, v in err.items() if k != "ctx"}
        if "ctx" in err:
            out["ctx"] = {ck: str(cv) for ck, cv in err["ctx"].items()}
        return out

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": [_sanitize(e) for e in exc.errors()], "message": "Validation failed"},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"message": "Internal server error. Please try again later."},
    )


# ── Routers ───────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth.router,     prefix=f"{API_PREFIX}/auth",     tags=["Authentication"])
app.include_router(session.router,  prefix=f"{API_PREFIX}/session",  tags=["Session & Questionnaire"])
app.include_router(analysis.router, prefix=f"{API_PREFIX}/analysis", tags=["AI Analysis"])
app.include_router(report.router,   prefix=f"{API_PREFIX}/report",   tags=["Reports"])
app.include_router(farm.router,     prefix=f"{API_PREFIX}/farm",     tags=["Farm Management"])
app.include_router(iot.router,      prefix=f"{API_PREFIX}/iot",      tags=["IoT Integration"])
app.include_router(audio.router,    prefix=f"{API_PREFIX}/audio",    tags=["Audio Transcription"])
app.include_router(finance_sheets.router, prefix=f"{API_PREFIX}/finance/sheets", tags=["Google Sheets Sync"])
app.include_router(land_survey.router, prefix=f"{API_PREFIX}/land-survey", tags=["Land Farm Voice Survey"])
app.include_router(crop.router,        prefix=f"{API_PREFIX}/crop",        tags=["Crop Intelligence"])
app.include_router(ai_advisor.router,  prefix=f"{API_PREFIX}/ai",          tags=["AI Advisor"])

if settings.EVAL_MODE:
    from routers import eval as eval_router
    app.include_router(eval_router.router, prefix=f"{API_PREFIX}/eval", tags=["Evaluation"])


@app.get("/health", tags=["Health"])
async def health_check():
    from sqlalchemy import text
    from core.database import AsyncSessionLocal
    db_ok = False
    db_error = None
    try:
        async def _ping():
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
        await asyncio.wait_for(_ping(), timeout=3.0)
        db_ok = True
    except asyncio.TimeoutError:
        db_error = "connection timeout"
    except Exception as exc:
        db_error = str(exc) or type(exc).__name__
    return {
        "status": "healthy" if db_ok else "degraded",
        "version": app.version,
        "db": "connected" if db_ok else "error",
        **({"db_error": db_error} if db_error else {}),
    }
