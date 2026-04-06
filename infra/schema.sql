-- =============================================================================
-- AquaponicAI — PostgreSQL Database Schema
-- =============================================================================
-- Run: psql -U postgres -d aquaponic_db -f schema.sql
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fuzzy text search

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role      AS ENUM ('admin', 'farmer', 'viewer');
CREATE TYPE batch_status   AS ENUM ('active', 'harvested', 'lost');
CREATE TYPE crop_status    AS ENUM ('growing', 'harvested', 'failed');
CREATE TYPE session_status AS ENUM ('in_progress', 'completed', 'abandoned');
CREATE TYPE input_method   AS ENUM ('voice', 'text', 'select');
CREATE TYPE reading_source AS ENUM ('manual', 'iot');
CREATE TYPE report_type    AS ENUM ('summary', 'full', 'financial');

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(512) NOT NULL,
    role            user_role DEFAULT 'farmer',
    is_active       BOOLEAN DEFAULT TRUE,
    is_verified     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- =============================================================================
-- FARMS
-- =============================================================================

CREATE TABLE farms (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    location    VARCHAR(512),
    latitude    FLOAT,
    longitude   FLOAT,
    area_sqm    FLOAT,
    system_type VARCHAR(100) DEFAULT 'aquaponics',
    description TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_farms_owner ON farms(owner_id);

-- =============================================================================
-- FISH BATCHES
-- =============================================================================

CREATE TABLE fish_batches (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id                 UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    species                 VARCHAR(100) NOT NULL,
    quantity                INTEGER NOT NULL,
    avg_weight_kg           FLOAT DEFAULT 0.0,
    tank_volume_liters      FLOAT NOT NULL,
    stocking_density_kg_m3  FLOAT,
    feed_type               VARCHAR(100),
    feed_kg_per_day         FLOAT,
    start_date              TIMESTAMPTZ DEFAULT NOW(),
    expected_harvest_date   TIMESTAMPTZ,
    status                  batch_status DEFAULT 'active',
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fish_batches_farm ON fish_batches(farm_id);
CREATE INDEX idx_fish_batches_status ON fish_batches(status);

-- =============================================================================
-- CROP RECORDS
-- =============================================================================

CREATE TABLE crop_records (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    crop_name             VARCHAR(100) NOT NULL,
    variety               VARCHAR(100),
    growing_area_sqm      FLOAT,
    planting_date         TIMESTAMPTZ,
    expected_harvest_date TIMESTAMPTZ,
    actual_yield_kg       FLOAT,
    expected_yield_kg     FLOAT,
    grow_system           VARCHAR(50) DEFAULT 'nft',
    status                crop_status DEFAULT 'growing',
    notes                 TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crop_records_farm ON crop_records(farm_id);

-- =============================================================================
-- WATER READINGS
-- =============================================================================

CREATE TABLE water_readings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id             UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    device_id           VARCHAR(100),
    timestamp           TIMESTAMPTZ DEFAULT NOW(),
    ph                  FLOAT,
    dissolved_oxygen_mg_l FLOAT,
    temperature_c       FLOAT,
    ammonia_mg_l        FLOAT,
    nitrite_mg_l        FLOAT,
    nitrate_mg_l        FLOAT,
    turbidity_ntu       FLOAT,
    tds_ppm             FLOAT,
    source              reading_source DEFAULT 'manual'
);

CREATE INDEX idx_water_readings_farm_ts ON water_readings(farm_id, timestamp DESC);

-- =============================================================================
-- SESSIONS (Questionnaire)
-- =============================================================================

CREATE TABLE sessions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_id      UUID REFERENCES farms(id) ON DELETE SET NULL,
    status       session_status DEFAULT 'in_progress',
    current_step INTEGER DEFAULT 0,
    total_steps  INTEGER DEFAULT 0,
    context_data JSONB DEFAULT '{"answered": [], "answers": {}}',
    ai_analysis  JSONB DEFAULT '{}',
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- =============================================================================
-- SESSION ANSWERS
-- =============================================================================

CREATE TABLE session_answers (
    id               SERIAL PRIMARY KEY,
    session_id       UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id      VARCHAR(100) NOT NULL,
    question_text    TEXT,
    answer_text      TEXT,
    answer_data      JSONB,
    input_method     input_method DEFAULT 'text',
    confidence_score FLOAT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_answers_session ON session_answers(session_id);

-- =============================================================================
-- FINANCIAL PLANS
-- =============================================================================

CREATE TABLE financial_plans (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id                 UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    session_id              UUID REFERENCES sessions(id) ON DELETE SET NULL,
    plan_name               VARCHAR(255),
    horizon_months          INTEGER DEFAULT 12,
    -- Capital
    infrastructure_cost     FLOAT DEFAULT 0,
    equipment_cost          FLOAT DEFAULT 0,
    initial_stock_cost      FLOAT DEFAULT 0,
    -- Monthly Operating
    monthly_feed_cost       FLOAT DEFAULT 0,
    monthly_labor_cost      FLOAT DEFAULT 0,
    monthly_utilities_cost  FLOAT DEFAULT 0,
    monthly_maintenance_cost FLOAT DEFAULT 0,
    monthly_other_cost      FLOAT DEFAULT 0,
    -- Monthly Revenue
    monthly_fish_revenue    FLOAT DEFAULT 0,
    monthly_crop_revenue    FLOAT DEFAULT 0,
    monthly_other_revenue   FLOAT DEFAULT 0,
    -- Computed Metrics
    total_capex             FLOAT,
    total_opex_annual       FLOAT,
    total_revenue_annual    FLOAT,
    gross_profit_annual     FLOAT,
    net_profit_annual       FLOAT,
    roi_percent             FLOAT,
    payback_period_months   FLOAT,
    break_even_month        INTEGER,
    -- JSON blobs
    scenarios               JSONB DEFAULT '{}',
    ai_recommendations      JSONB DEFAULT '[]',
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_financial_plans_farm ON financial_plans(farm_id);

-- =============================================================================
-- REPORTS
-- =============================================================================

CREATE TABLE reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    report_type     report_type DEFAULT 'full',
    file_path       VARCHAR(512),
    file_size_bytes INTEGER,
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    download_count  INTEGER DEFAULT 0,
    expires_at      TIMESTAMPTZ
);

-- =============================================================================
-- IOT DEVICES
-- =============================================================================

CREATE TABLE iot_devices (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    device_uid  VARCHAR(100) NOT NULL,
    device_type VARCHAR(50),
    label       VARCHAR(100),
    is_active   BOOLEAN DEFAULT TRUE,
    last_seen   TIMESTAMPTZ,
    config      JSONB DEFAULT '{}',
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (farm_id, device_uid)
);

-- =============================================================================
-- MARKET PRICES (Cache)
-- =============================================================================

CREATE TABLE market_prices (
    id          SERIAL PRIMARY KEY,
    commodity   VARCHAR(100) NOT NULL,
    unit        VARCHAR(20) DEFAULT 'kg',
    price_inr   FLOAT NOT NULL,
    region      VARCHAR(100),
    source      VARCHAR(100),
    fetched_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_market_prices_commodity ON market_prices(commodity, fetched_at DESC);

-- =============================================================================
-- TRIGGERS — auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_farms_updated_at    BEFORE UPDATE ON farms    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_plans_updated_at    BEFORE UPDATE ON financial_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
