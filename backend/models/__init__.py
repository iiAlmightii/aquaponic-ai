"""
models/__init__.py — SQLAlchemy ORM models for AquaponicAI.

Tables:
  users, farms, fish_batches, crop_records, water_readings,
  sessions, session_answers, financial_plans, reports, iot_devices, market_prices
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey,
    Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


# ── Helpers ───────────────────────────────────────────────────────────────────

def now_utc():
    return datetime.now(timezone.utc)


def gen_uuid():
    return str(uuid.uuid4())


# ── User ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(512), nullable=False)
    role = Column(Enum("admin", "farmer", "viewer", name="user_role"), default="farmer")
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    farms = relationship("Farm", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")


# ── Farm ──────────────────────────────────────────────────────────────────────

class Farm(Base):
    __tablename__ = "farms"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    location = Column(String(512))
    latitude = Column(Float)
    longitude = Column(Float)
    area_sqm = Column(Float)                           # total area in square metres
    system_type = Column(String(100), default="aquaponics")   # aquaponics | hydroponics | hybrid
    description = Column(Text)
    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    owner = relationship("User", back_populates="farms")
    fish_batches = relationship("FishBatch", back_populates="farm", cascade="all, delete-orphan")
    crop_records = relationship("CropRecord", back_populates="farm", cascade="all, delete-orphan")
    water_readings = relationship("WaterReading", back_populates="farm", cascade="all, delete-orphan")
    iot_devices = relationship("IoTDevice", back_populates="farm", cascade="all, delete-orphan")
    financial_plans = relationship("FinancialPlan", back_populates="farm", cascade="all, delete-orphan")


# ── Fish Batch ────────────────────────────────────────────────────────────────

class FishBatch(Base):
    __tablename__ = "fish_batches"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    farm_id = Column(UUID(as_uuid=False), ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    species = Column(String(100), nullable=False)          # tilapia | catfish | trout | carp | etc.
    quantity = Column(Integer, nullable=False)
    avg_weight_kg = Column(Float, default=0.0)
    tank_volume_liters = Column(Float, nullable=False)
    stocking_density_kg_m3 = Column(Float)
    feed_type = Column(String(100))
    feed_kg_per_day = Column(Float)
    start_date = Column(DateTime(timezone=True), default=now_utc)
    expected_harvest_date = Column(DateTime(timezone=True))
    status = Column(Enum("active", "harvested", "lost", name="batch_status"), default="active")
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    farm = relationship("Farm", back_populates="fish_batches")


# ── Crop Record ───────────────────────────────────────────────────────────────

class CropRecord(Base):
    __tablename__ = "crop_records"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    farm_id = Column(UUID(as_uuid=False), ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    crop_name = Column(String(100), nullable=False)
    variety = Column(String(100))
    growing_area_sqm = Column(Float)
    planting_date = Column(DateTime(timezone=True))
    expected_harvest_date = Column(DateTime(timezone=True))
    actual_yield_kg = Column(Float)
    expected_yield_kg = Column(Float)
    grow_system = Column(String(50), default="nft")    # nft | dwc | media_bed | raft
    status = Column(Enum("growing", "harvested", "failed", name="crop_status"), default="growing")
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    farm = relationship("Farm", back_populates="crop_records")


# ── Water Reading (IoT / Manual) ──────────────────────────────────────────────

class WaterReading(Base):
    __tablename__ = "water_readings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    farm_id = Column(UUID(as_uuid=False), ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(String(100))
    timestamp = Column(DateTime(timezone=True), default=now_utc, index=True)
    ph = Column(Float)
    dissolved_oxygen_mg_l = Column(Float)
    temperature_c = Column(Float)
    ammonia_mg_l = Column(Float)
    nitrite_mg_l = Column(Float)
    nitrate_mg_l = Column(Float)
    turbidity_ntu = Column(Float)
    tds_ppm = Column(Float)
    source = Column(Enum("manual", "iot", name="reading_source"), default="manual")

    farm = relationship("Farm", back_populates="water_readings")


# ── Questionnaire Session ─────────────────────────────────────────────────────

class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    farm_id = Column(UUID(as_uuid=False), ForeignKey("farms.id", ondelete="SET NULL"), nullable=True)
    status = Column(
        Enum("in_progress", "completed", "abandoned", name="session_status"),
        default="in_progress"
    )
    current_step = Column(Integer, default=0)
    total_steps = Column(Integer, default=0)
    context_data = Column(JSON, default=dict)           # accumulated answers for context
    ai_analysis = Column(JSON, default=dict)            # cached AI output
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    user = relationship("User", back_populates="sessions")
    answers = relationship("SessionAnswer", back_populates="session", cascade="all, delete-orphan")
    report = relationship("Report", back_populates="session", uselist=False)


class SessionAnswer(Base):
    __tablename__ = "session_answers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(UUID(as_uuid=False), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(100), nullable=False)
    question_text = Column(Text)
    answer_text = Column(Text)
    answer_data = Column(JSON)                          # parsed structured data
    input_method = Column(Enum("voice", "text", "select", name="input_method"), default="text")
    confidence_score = Column(Float)                   # STT confidence if voice
    created_at = Column(DateTime(timezone=True), default=now_utc)

    session = relationship("Session", back_populates="answers")


# ── Financial Plan ────────────────────────────────────────────────────────────

class FinancialPlan(Base):
    __tablename__ = "financial_plans"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    farm_id = Column(UUID(as_uuid=False), ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(UUID(as_uuid=False), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    plan_name = Column(String(255))
    horizon_months = Column(Integer, default=12)

    # ── Capital Costs ─────────────────────────────────────────────────────────
    infrastructure_cost = Column(Float, default=0.0)
    equipment_cost = Column(Float, default=0.0)
    initial_stock_cost = Column(Float, default=0.0)

    # ── Operating Costs (monthly) ─────────────────────────────────────────────
    monthly_feed_cost = Column(Float, default=0.0)
    monthly_labor_cost = Column(Float, default=0.0)
    monthly_utilities_cost = Column(Float, default=0.0)
    monthly_maintenance_cost = Column(Float, default=0.0)
    monthly_other_cost = Column(Float, default=0.0)

    # ── Revenue Projections ───────────────────────────────────────────────────
    monthly_fish_revenue = Column(Float, default=0.0)
    monthly_crop_revenue = Column(Float, default=0.0)
    monthly_other_revenue = Column(Float, default=0.0)

    # ── AI-Computed Metrics ───────────────────────────────────────────────────
    total_capex = Column(Float)
    total_opex_annual = Column(Float)
    total_revenue_annual = Column(Float)
    gross_profit_annual = Column(Float)
    net_profit_annual = Column(Float)
    roi_percent = Column(Float)
    payback_period_months = Column(Float)
    break_even_month = Column(Integer)

    scenarios = Column(JSON, default=dict)     # optimistic | base | pessimistic
    ai_recommendations = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    farm = relationship("Farm", back_populates="financial_plans")


# ── Report ────────────────────────────────────────────────────────────────────

class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    report_type = Column(Enum("summary", "full", "financial", name="report_type"), default="full")
    file_path = Column(String(512))
    file_size_bytes = Column(Integer)
    generated_at = Column(DateTime(timezone=True), default=now_utc)
    download_count = Column(Integer, default=0)
    expires_at = Column(DateTime(timezone=True))

    session = relationship("Session", back_populates="report")


# ── IoT Device ────────────────────────────────────────────────────────────────

class IoTDevice(Base):
    __tablename__ = "iot_devices"
    __table_args__ = (UniqueConstraint("farm_id", "device_uid"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    farm_id = Column(UUID(as_uuid=False), ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    device_uid = Column(String(100), nullable=False)
    device_type = Column(String(50))    # water_sensor | camera | pump_controller
    label = Column(String(100))
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime(timezone=True))
    config = Column(JSON, default=dict)
    registered_at = Column(DateTime(timezone=True), default=now_utc)

    farm = relationship("Farm", back_populates="iot_devices")


# ── Market Price Cache ────────────────────────────────────────────────────────

class MarketPrice(Base):
    __tablename__ = "market_prices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    commodity = Column(String(100), nullable=False, index=True)
    unit = Column(String(20), default="kg")
    price_inr = Column(Float, nullable=False)
    region = Column(String(100))
    source = Column(String(100))
    fetched_at = Column(DateTime(timezone=True), default=now_utc, index=True)
