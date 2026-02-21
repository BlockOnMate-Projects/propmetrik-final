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
    from services.sentiment_analysis import sentiment_analysis_service, SentimentRequest

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
            source_type=source_type, days=days, limit=limit
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
        result = await sentiment_analysis_service.get_market_confidence_index(days=days)
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
        results = await ner_service.batch_extract(reqs)
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
        result = await trend_analysis_service.analyze_trends(
            text=request.get("text", ""),
            source_type=request.get("source_type"),
        )
        return result
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
        result = await trend_analysis_service.get_trending_topics(days=days, limit=limit)
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
        return result.model_dump()
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
        return {"features": [r.model_dump() for r in results], "count": len(results)}
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
        return result.model_dump()
    except Exception as e:
        logger.error(f"Ensemble analytics fetch failed: {e}")
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
]
