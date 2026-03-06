-- =====================================================
-- Migration 155: ML Analytics Schema (Section 8.7.8)
--
-- Centralized ML/NLP services database tables.
-- Supports: Sentiment Analysis, NER, Trend Extraction,
--           Document Intelligence, AI Assistant, Model Monitoring
--
-- Dependencies: 014_valuation_engine.sql (properties table)
-- =====================================================

BEGIN;

-- =====================================================
-- 1. ML Sentiment Analysis
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_sentiment_analysis (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          UUID NOT NULL UNIQUE,
    source_type         VARCHAR(50) NOT NULL,       -- news | social_media | report | policy
    source_url          TEXT,
    source_text         TEXT,
    region              VARCHAR(100),
    sentiment_overall   VARCHAR(30) NOT NULL,        -- very_negative | negative | neutral | positive | very_positive
    sentiment_score     NUMERIC(6,4) NOT NULL,       -- -1.0 to +1.0
    confidence          NUMERIC(4,3) NOT NULL,       -- 0.0 to 1.0
    aspects             JSONB DEFAULT '[]'::jsonb,   -- [{aspect, sentiment, mentions, key_phrases}]
    entities            JSONB DEFAULT '{}'::jsonb,   -- {locations, developers, property_types, projects}
    market_indicators   JSONB DEFAULT '{}'::jsonb,   -- {bullish_signals, bearish_signals, neutral_statements}
    analyzed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_sentiment_analyzed_at ON ml_sentiment_analysis (analyzed_at DESC);
CREATE INDEX idx_ml_sentiment_source_type ON ml_sentiment_analysis (source_type);
CREATE INDEX idx_ml_sentiment_region ON ml_sentiment_analysis (region);
CREATE INDEX idx_ml_sentiment_score ON ml_sentiment_analysis (sentiment_score);

-- =====================================================
-- 2. ML Extracted Entities (NER Results)
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_extracted_entities (
    id                  BIGSERIAL PRIMARY KEY,
    source_id           UUID,                       -- Links to sentiment_analysis or document
    source_type         VARCHAR(50) NOT NULL,        -- news | listing | report | legal | bid
    entity_type         VARCHAR(50) NOT NULL,        -- locations | organizations | financial | temporal | projects
    entity_text         VARCHAR(500) NOT NULL,
    entity_subtype      VARCHAR(100),                -- e.g., city, bank, developer, price, cost
    confidence          NUMERIC(4,3) NOT NULL DEFAULT 0.5,
    normalized_value    TEXT,                        -- Standardized form (e.g., "East Legon, Accra, Greater Accra")
    metadata            JSONB DEFAULT '{}'::jsonb,   -- Full entity object
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_entities_source ON ml_extracted_entities (source_id);
CREATE INDEX idx_ml_entities_type ON ml_extracted_entities (entity_type);
CREATE INDEX idx_ml_entities_text ON ml_extracted_entities (entity_text);
CREATE INDEX idx_ml_entities_created ON ml_extracted_entities (created_at DESC);

-- =====================================================
-- 3. ML Trend Analysis
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_trend_analysis (
    id                  BIGSERIAL PRIMARY KEY,
    analysis_id         UUID NOT NULL UNIQUE,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    region              VARCHAR(100),
    trending_topics     JSONB DEFAULT '[]'::jsonb,   -- [{topic, keywords, mention_count, change_pct, sentiment}]
    emerging_trends     JSONB DEFAULT '[]'::jsonb,   -- [{trend, first_detected, growth_rate}]
    declining_trends    JSONB DEFAULT '[]'::jsonb,   -- [{trend, peak_date, decline_rate}]
    keyword_trends      JSONB DEFAULT '[]'::jsonb,   -- [{keyword, time_series, forecast}]
    anomalies           JSONB DEFAULT '[]'::jsonb,   -- [{date, keyword, expected, actual, severity}]
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_trend_period ON ml_trend_analysis (period_start, period_end);
CREATE INDEX idx_ml_trend_region ON ml_trend_analysis (region);
CREATE INDEX idx_ml_trend_created ON ml_trend_analysis (created_at DESC);

-- =====================================================
-- 4. ML Processed Documents (Document Intelligence)
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_processed_documents (
    id                  BIGSERIAL PRIMARY KEY,
    document_id         UUID NOT NULL UNIQUE,
    document_url        TEXT,
    document_type       VARCHAR(50) NOT NULL,        -- listing | bid | legal | report | permit
    pages               INTEGER DEFAULT 1,
    classification      JSONB NOT NULL,              -- {document_type, confidence, sub_type}
    extracted_data      JSONB NOT NULL,              -- Type-specific structured extraction
    tables              JSONB DEFAULT '[]'::jsonb,   -- Extracted tabular data
    entities            JSONB DEFAULT '{}'::jsonb,   -- Cross-referenced NER entities
    summary             TEXT,
    key_findings        TEXT[] DEFAULT '{}',
    validation          JSONB DEFAULT '{}'::jsonb,   -- {completeness_score, missing_fields, anomalies}
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_documents_type ON ml_processed_documents (document_type);
CREATE INDEX idx_ml_documents_created ON ml_processed_documents (created_at DESC);

-- =====================================================
-- 5. ML Predictions (AVM prediction log)
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_predictions (
    id                  BIGSERIAL PRIMARY KEY,
    prediction_id       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    property_id         UUID,                       -- FK to properties table if known
    model_version       VARCHAR(50) NOT NULL,
    property_type       VARCHAR(50),
    region              VARCHAR(100),
    price_band          VARCHAR(50),                 -- low | medium | high | premium
    predicted_value     NUMERIC(15,2) NOT NULL,
    actual_value        NUMERIC(15,2),               -- Populated via feedback loop
    confidence          NUMERIC(4,3),
    features            JSONB,                       -- Input features snapshot
    explanation         JSONB,                       -- Feature contributions
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    feedback_at         TIMESTAMPTZ                  -- When actual value was provided
);

CREATE INDEX idx_ml_predictions_model ON ml_predictions (model_version);
CREATE INDEX idx_ml_predictions_property ON ml_predictions (property_id);
CREATE INDEX idx_ml_predictions_created ON ml_predictions (created_at DESC);
CREATE INDEX idx_ml_predictions_region ON ml_predictions (region);
CREATE INDEX idx_ml_predictions_type ON ml_predictions (property_type);
CREATE INDEX idx_ml_predictions_feedback ON ml_predictions (actual_value) WHERE actual_value IS NOT NULL;

-- =====================================================
-- 6. ML Model Metadata
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_model_metadata (
    id                      BIGSERIAL PRIMARY KEY,
    model_version           VARCHAR(50) NOT NULL,
    model_type              VARCHAR(50) NOT NULL DEFAULT 'ensemble',
    is_active               BOOLEAN NOT NULL DEFAULT FALSE,
    trained_at              TIMESTAMPTZ,
    training_samples        INTEGER,
    feature_importances     JSONB,                  -- {feature_name: importance_score}
    ensemble_weights        JSONB,                  -- {random_forest: 0.35, xgboost: 0.40, neural_network: 0.25}
    individual_metrics      JSONB,                  -- {model_name: {mae, rmse, mape, r2}}
    performance_metrics     JSONB,                  -- {mae, rmse, mape, r2, within_10_pct}
    training_config         JSONB,                  -- Hyperparameters & pipeline config
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ml_model_version ON ml_model_metadata (model_version);
CREATE INDEX idx_ml_model_active ON ml_model_metadata (is_active) WHERE is_active = TRUE;

-- =====================================================
-- 7. ML Assistant Queries
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_assistant_queries (
    id                  BIGSERIAL PRIMARY KEY,
    query_id            UUID NOT NULL UNIQUE,
    session_id          UUID,
    user_id             UUID,
    query               TEXT NOT NULL,
    intent              VARCHAR(50),                 -- market_price | trend_analysis | investment | comparison | forecast
    response            TEXT,
    confidence          NUMERIC(4,3),
    data_points         JSONB DEFAULT '[]'::jsonb,
    sources             TEXT[] DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_assistant_session ON ml_assistant_queries (session_id);
CREATE INDEX idx_ml_assistant_user ON ml_assistant_queries (user_id);
CREATE INDEX idx_ml_assistant_intent ON ml_assistant_queries (intent);
CREATE INDEX idx_ml_assistant_created ON ml_assistant_queries (created_at DESC);

-- =====================================================
-- 8. ML Market Confidence Index (Materialized)
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_market_confidence_index (
    id                  BIGSERIAL PRIMARY KEY,
    date                DATE NOT NULL,
    region              VARCHAR(100),
    index_value         NUMERIC(5,2) NOT NULL,       -- 0.00 - 100.00
    change_1d           NUMERIC(6,3),
    change_7d           NUMERIC(6,3),
    change_30d          NUMERIC(6,3),
    sentiment_distribution JSONB,                    -- {very_negative: 0.05, negative: 0.15, ...}
    sample_size         INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ml_mci_date_region ON ml_market_confidence_index (date, COALESCE(region, '__national__'));
CREATE INDEX idx_ml_mci_date ON ml_market_confidence_index (date DESC);

-- =====================================================
-- 9. ML Price Forecasts
-- =====================================================

CREATE TABLE IF NOT EXISTS ml_price_forecasts (
    id                  BIGSERIAL PRIMARY KEY,
    region              VARCHAR(100) NOT NULL,
    property_type       VARCHAR(50),
    forecast_date       DATE NOT NULL,
    horizon_months      INTEGER NOT NULL,
    short_term          JSONB NOT NULL,              -- {expected_change_pct, direction_probability, ...}
    long_term           JSONB NOT NULL,              -- {scenarios: {optimistic, base, pessimistic}, ...}
    drivers             JSONB DEFAULT '[]'::jsonb,   -- [{factor, direction, impact_magnitude, detail}]
    model_version       VARCHAR(50),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_forecast_region ON ml_price_forecasts (region);
CREATE INDEX idx_ml_forecast_date ON ml_price_forecasts (forecast_date DESC);

COMMIT;
