"""
PROPMETRIK ML Analytics API Router

Section 8.7.7 — API endpoint specifications for all ML analytics services.
This module defines FastAPI routers that are mounted into the main application.

Endpoint Groups:
- /api/v1/ml/sentiment    → Sentiment analysis endpoints
- /api/v1/ml/ner          → Named entity recognition endpoints
- /api/v1/ml/trends       → Trend extraction & price forecasting
- /api/v1/ml/documents    → Document intelligence engine
- /api/v1/ml/assistant    → AI assistant & report generation
- /api/v1/ml/monitoring   → Model performance & drift monitoring
- /api/v1/ml/ensemble     → Ensemble analytics
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# =====================================================
# ROUTERS
# =====================================================

sentiment_router = APIRouter(prefix="/api/v1/ml/sentiment", tags=["Sentiment Analysis"])
ner_router = APIRouter(prefix="/api/v1/ml/ner", tags=["Named Entity Recognition"])
trends_router = APIRouter(prefix="/api/v1/ml/trends", tags=["Trends & Forecasting"])
documents_router = APIRouter(prefix="/api/v1/ml/documents", tags=["Document Intelligence"])
assistant_router = APIRouter(prefix="/api/v1/ml/assistant", tags=["AI Assistant"])
monitoring_router = APIRouter(prefix="/api/v1/ml/monitoring", tags=["Model Monitoring"])
ensemble_router = APIRouter(prefix="/api/v1/ml/ensemble", tags=["Ensemble Analytics"])
training_router = APIRouter(prefix="/api/v1/ml/training", tags=["Model Training"])

# Minimum prediction rows for statistically reliable drift / ensemble analysis
_DRIFT_MIN_PREDICTIONS = 1_000


async def _get_data_sufficiency_warning() -> Optional[str]:
    """
    Return a warning string when ml_predictions history is too thin for
    reliable drift or ensemble analysis, otherwise return None.
    """
    try:
        from database import async_db
        row = await async_db.fetchrow("SELECT COUNT(*) AS n FROM ml_predictions")
        n = int(row["n"]) if row else 0
        if n < _DRIFT_MIN_PREDICTIONS:
            return (
                f"Insufficient prediction history ({n} rows, {_DRIFT_MIN_PREDICTIONS} required) "
                "for statistically reliable drift/ensemble analysis. Results are indicative only."
            )
    except Exception:
        pass
    return None


# =====================================================
# SENTIMENT ENDPOINTS
# =====================================================

@sentiment_router.post("/analyze")
async def analyze_sentiment(request: dict):
    """
    Analyze sentiment of text content for market indicators.
    
    Request body:
        text: str — Text to analyze
        source_type: str — news | social_media | report | policy
        source_url: str (optional) — Original source URL
    """
    from services.sentiment_analysis import sentiment_analysis_service, SentimentAnalysisRequest as SentimentRequest

    try:
        req = SentimentRequest(**request)
        result = await sentiment_analysis_service.analyze(req)
        return result.model_dump()
    except Exception as e:
        logger.error(f"Sentiment analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sentiment analysis failed: {str(e)}")


@sentiment_router.get("/history")
async def get_sentiment_history(
    source_type: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=500),
):
    """Get historical sentiment analysis results."""
    from services.sentiment_analysis import sentiment_analysis_service

    try:
        results = await sentiment_analysis_service.get_history(
            source=source_type, period_days=days
        )
        return {"results": results, "count": len(results)}
    except Exception as e:
        logger.error(f"Sentiment history fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@sentiment_router.get("/market-confidence")
async def get_market_confidence(
    days: int = Query(30, ge=1, le=365),
):
    """
    Get Market Confidence Index — composite sentiment score (0-100).
    Aggregates recent sentiment analyses with exponential decay weighting.
    """
    from services.sentiment_analysis import sentiment_analysis_service

    try:
        result = await sentiment_analysis_service.get_market_confidence_index()
        return result
    except Exception as e:
        logger.error(f"Market confidence calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# NER ENDPOINTS
# =====================================================

@ner_router.post("/extract")
async def extract_entities(request: dict):
    """
    Extract named entities from text (locations, organizations,
    financial amounts, temporal references).
    
    Request body:
        text: str — Text to process
        document_type: str (optional) — Context hint for extraction
    """
    from services.named_entity_recognition import ner_service, NERRequest

    try:
        req = NERRequest(**request)
        result = await ner_service.extract(req)
        return result.model_dump()
    except Exception as e:
        logger.error(f"NER extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@ner_router.post("/batch")
async def batch_extract_entities(requests: List[dict]):
    """Batch entity extraction for multiple texts."""
    from services.named_entity_recognition import ner_service, NERRequest

    try:
        reqs = [NERRequest(**r) for r in requests]
        results = await ner_service.batch_extract([r.text for r in reqs], reqs[0].document_type if reqs else None)
        return {"results": [r.model_dump() for r in results], "count": len(results)}
    except Exception as e:
        logger.error(f"Batch NER extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# TRENDS & FORECASTING ENDPOINTS
# =====================================================

@trends_router.post("/analyze")
async def analyze_trends(request: dict):
    """
    Analyze text for market trends, keywords, and patterns.
    
    Request body:
        text: str — Text to analyze
        source_type: str (optional) — news | report | social_media
    """
    from services.trend_extraction import trend_analysis_service

    try:
        from services.trend_extraction import TrendAnalysisRequest
        now = datetime.utcnow()
        req = TrendAnalysisRequest(
            data_source=request.get("source_type") or "all",
            time_range={
                "start_date": (now - timedelta(days=30)).strftime("%Y-%m-%d"),
                "end_date": now.strftime("%Y-%m-%d"),
            },
        )
        result = await trend_analysis_service.analyze_trends(req)
        return result.model_dump()
    except Exception as e:
        logger.error(f"Trend analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@trends_router.get("/trending")
async def get_trending_topics(
    days: int = Query(14, ge=1, le=90),
    limit: int = Query(20, ge=1, le=100),
):
    """Get current trending topics and keywords."""
    from services.trend_extraction import trend_analysis_service

    try:
        result = await trend_analysis_service.get_trending_topics(limit=limit)
        return result
    except Exception as e:
        logger.error(f"Trending topics fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@trends_router.post("/forecast")
async def forecast_prices(request: dict):
    """
    Generate price forecasts for a location.
    
    Request body:
        location: str — Neighborhood or area name
        horizon_months: int — Forecast horizon (default: 12)
    """
    from services.trend_extraction import trend_analysis_service

    try:
        result = await trend_analysis_service.forecast_prices(
            location=request.get("location", ""),
            horizon_months=request.get("horizon_months", 12),
        )
        return result
    except Exception as e:
        logger.error(f"Price forecast failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# DOCUMENT INTELLIGENCE ENDPOINTS
# =====================================================

@documents_router.post("/process")
async def process_document(request: dict):
    """
    Process a document and extract structured data.
    
    Request body:
        document_url: str (optional) — URL to fetch document
        document_base64: str (optional) — Base64-encoded document
        document_text: str (optional) — Pre-extracted text
        document_type: str — listing | bid | legal | report | permit
        extract_tables: bool (optional, default: true)
    """
    from services.document_intelligence import (
        document_intelligence_service, DocumentIntelligenceRequest,
    )

    try:
        req = DocumentIntelligenceRequest(**request)
        result = await document_intelligence_service.process(req)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Document processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@documents_router.post("/batch")
async def batch_process_documents(requests: List[dict]):
    """Batch process multiple documents."""
    from services.document_intelligence import (
        document_intelligence_service, DocumentIntelligenceRequest,
    )

    try:
        reqs = [DocumentIntelligenceRequest(**r) for r in requests]
        results = await document_intelligence_service.batch_process(reqs)
        return {"results": [r.model_dump() for r in results], "count": len(results)}
    except Exception as e:
        logger.error(f"Batch document processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# AI ASSISTANT ENDPOINTS
# =====================================================

@assistant_router.post("/query")
async def assistant_query(request: dict):
    """
    Ask the AI assistant a market intelligence question.
    
    Request body:
        query: str — Natural language question
        session_id: str (optional) — Session for context continuity
        user_id: str (optional) — User identifier
        response_format: str (optional) — text | markdown | json
    """
    from services.ai_assistant import ai_assistant_service, AssistantQueryRequest

    try:
        req = AssistantQueryRequest(**request)
        result = await ai_assistant_service.query(req)
        return result.model_dump()
    except Exception as e:
        logger.error(f"Assistant query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@assistant_router.post("/report")
async def generate_report(request: dict):
    """
    Generate an automated market report.
    
    Request body:
        report_type: str — market_summary | investment_outlook | area_analysis
        location: str (optional) — Target location
        period: str (optional) — quarterly | monthly | annual
        include_forecast: bool (optional, default: true)
    """
    from services.ai_assistant import ai_assistant_service, ReportRequest

    try:
        req = ReportRequest(**request)
        result = await ai_assistant_service.generate_report(req)
        return result.model_dump()
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# MODEL MONITORING ENDPOINTS
# =====================================================

@monitoring_router.get("/performance")
async def get_model_performance(
    model_version: str = Query("latest"),
    period_days: int = Query(30, ge=1, le=365),
):
    """Get AVM model performance metrics (MAE, RMSE, MAPE, R²)."""
    from services.model_monitoring import model_monitoring_service

    try:
        result = await model_monitoring_service.get_performance_metrics(
            model_version=model_version, period_days=period_days
        )
        return result.model_dump()
    except Exception as e:
        logger.error(f"Performance metrics fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@monitoring_router.get("/performance/segments")
async def get_performance_by_segment(
    model_version: str = Query("latest"),
    segment_type: str = Query("property_type"),
):
    """Get performance broken down by segment (property_type, region, price_band)."""
    from services.model_monitoring import model_monitoring_service

    try:
        results = await model_monitoring_service.get_performance_by_segment(
            model_version=model_version, segment_type=segment_type
        )
        return {"segments": [r.model_dump() for r in results], "count": len(results)}
    except Exception as e:
        logger.error(f"Segmented performance fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@monitoring_router.get("/performance/trend")
async def get_performance_trend(
    metric_name: str = Query("mae"),
    model_version: str = Query("latest"),
    months: int = Query(6, ge=1, le=24),
):
    """Track a performance metric over time."""
    from services.model_monitoring import model_monitoring_service

    try:
        result = await model_monitoring_service.get_performance_trend(
            metric_name=metric_name, model_version=model_version, months=months
        )
        return result.model_dump()
    except Exception as e:
        logger.error(f"Performance trend fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@monitoring_router.get("/features/importance")
async def get_feature_importance(
    model_version: str = Query("latest"),
):
    """Get feature importance rankings for model explainability."""
    from services.model_monitoring import model_monitoring_service

    try:
        results = await model_monitoring_service.get_feature_importance(model_version)
        return {"features": [r.model_dump() for r in results], "count": len(results)}
    except Exception as e:
        logger.error(f"Feature importance fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@monitoring_router.get("/predictions/{prediction_id}/explain")
async def explain_prediction(prediction_id: str):
    """Get explanation for a specific prediction (feature contributions)."""
    from services.model_monitoring import model_monitoring_service

    try:
        result = await model_monitoring_service.explain_prediction(prediction_id)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Prediction explanation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@monitoring_router.get("/confidence")
async def get_confidence_distribution(
    model_version: str = Query("latest"),
    period_days: int = Query(30, ge=1, le=365),
):
    """Get distribution of prediction confidence levels."""
    from services.model_monitoring import model_monitoring_service

    try:
        result = await model_monitoring_service.get_confidence_distribution(
            model_version=model_version, period_days=period_days
        )
        return result.model_dump()
    except Exception as e:
        logger.error(f"Confidence distribution fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@monitoring_router.get("/drift")
async def detect_drift(
    model_version: str = Query("latest"),
    baseline_days: int = Query(90, ge=14, le=365),
    current_days: int = Query(14, ge=1, le=90),
):
    """Detect model drift (concept, data, prediction)."""
    from services.model_monitoring import model_monitoring_service

    try:
        result = await model_monitoring_service.detect_drift(
            model_version=model_version,
            baseline_days=baseline_days,
            current_days=current_days,
        )
        data = result.model_dump()
        warning = await _get_data_sufficiency_warning()
        if warning:
            data["data_sufficiency_warning"] = warning
        return data
    except Exception as e:
        logger.error(f"Drift detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@monitoring_router.get("/drift/features")
async def get_data_drift_details(
    model_version: str = Query("latest"),
):
    """Get per-feature data drift analysis."""
    from services.model_monitoring import model_monitoring_service

    try:
        results = await model_monitoring_service.get_data_drift_details(model_version)
        data = {"features": [r.model_dump() for r in results], "count": len(results)}
        warning = await _get_data_sufficiency_warning()
        if warning:
            data["data_sufficiency_warning"] = warning
        return data
    except Exception as e:
        logger.error(f"Data drift detail fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# ENSEMBLE ANALYTICS ENDPOINTS
# =====================================================

@ensemble_router.get("/analytics")
async def get_ensemble_analytics(
    model_version: str = Query("latest"),
):
    """
    Get ensemble model analytics — individual model weights,
    contributions, diversity index, and improvement metrics.
    """
    from services.model_monitoring import model_monitoring_service

    try:
        result = await model_monitoring_service.get_ensemble_analytics(model_version)
        data = result.model_dump()
        warning = await _get_data_sufficiency_warning()
        if warning:
            data["data_sufficiency_warning"] = warning
        return data
    except Exception as e:
        logger.error(f"Ensemble analytics fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# MODEL TRAINING ENDPOINTS
# =====================================================

@training_router.post("/retrain")
async def trigger_retrain(
    no_tune: bool = Query(False, description="Skip hyperparameter tuning (faster, for testing)"),
    all_types_only: bool = Query(
        False, description="Train a single combined model only (skip per-type segmentation)"
    ),
):
    """
    Trigger a full model retraining run.

    Runs `training/train_pipeline.py` as a background process.
    By default trains per-property-type segmented ensembles for better accuracy.
    Use `all_types_only=true` to train a single combined model instead.

    Returns a `job_id` — poll `GET /api/v1/ml/training/status/{job_id}` for progress.
    """
    import asyncio
    import uuid
    from pathlib import Path

    job_id = str(uuid.uuid4())

    # Prefer the venv Python so all deps are available
    python = Path(__file__).parent / ".venv" / "bin" / "python"
    if not python.exists():
        python = Path(__file__).parent / ".venv" / "bin" / "python3"
    python_str = str(python) if python.exists() else "python3"

    # Run as a module (-m) so classes pickle as training.train_pipeline.X
    # (not __main__.X), which survives uvicorn re-import without hacks.
    cmd = [python_str, "-m", "training.train_pipeline"]
    if no_tune:
        cmd.append("--no-tune")
    if all_types_only:
        cmd.append("--all-types-only")

    log_file = f"/tmp/retrain-{job_id}.log"

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=open(log_file, "w"),
            stderr=asyncio.subprocess.STDOUT,
        )
        return {
            "status": "started",
            "job_id": job_id,
            "pid": proc.pid,
            "log_file": log_file,
            "segmented": not all_types_only,
            "hyperparameter_tuning": not no_tune,
            "message": (
                "Segmented retraining started (one model per property type + all-types fallback). "
                "Estimated time: 5–30 minutes depending on data size. "
                f"Poll GET /api/v1/ml/training/status/{job_id} for progress."
            ),
        }
    except Exception as e:
        logger.error(f"Failed to start retraining: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start retraining: {e}")


@training_router.get("/status/{job_id}")
async def get_retrain_status(job_id: str):
    """
    Get the status of a retraining job by reading its log file.
    """
    from pathlib import Path

    # Validate job_id to prevent path traversal
    if not job_id.replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid job_id format")

    log_file = f"/tmp/retrain-{job_id}.log"
    path = Path(log_file)

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    try:
        content = path.read_text()
        lines = content.strip().split("\n") if content.strip() else []
        last_lines = lines[-25:] if len(lines) > 25 else lines

        is_complete = (
            "=== Segmented training complete" in content
            or "Training pipeline completed successfully" in content
        )
        has_error = "ERROR" in content and not is_complete

        # Extract per-type metrics from log if available
        type_results = []
        for line in lines:
            if "R²=" in line and "MAE=" in line:
                type_results.append(line.strip())

        return {
            "job_id": job_id,
            "status": "complete" if is_complete else ("error" if has_error else "running"),
            "log_lines": len(lines),
            "log_tail": last_lines,
            "type_results": type_results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# COLLECT ALL ROUTERS
# =====================================================

all_ml_routers = [
    sentiment_router,
    ner_router,
    trends_router,
    documents_router,
    assistant_router,
    monitoring_router,
    ensemble_router,
    training_router,
]
