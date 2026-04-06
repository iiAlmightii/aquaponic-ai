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
from routers import auth, session, analysis, report, farm, iot, audio, finance_sheets, land_survey

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
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle for the application."""
    logger.info("🚀 AquaponicAI starting up…")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_redis()
    asyncio.create_task(_preload_whisper_in_background())
    logger.info("✅ Database tables created | Redis connected")
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


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors(), "message": "Validation failed"},
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


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "version": app.version}
