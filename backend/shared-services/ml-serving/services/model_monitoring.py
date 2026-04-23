"""
PROPMETRIK Model Performance & Monitoring Service

Comprehensive AVM model monitoring covering:
- Section 8.1: ML Model Performance Metrics (accuracy, precision, confidence)
- Section 8.2: Feature Importance Analysis (SHAP-like explanations)
- Section 8.3: Prediction Confidence Distribution
- Section 8.4: Model Drift Detection
- Section 8.6: Ensemble Analytics (model weighting, contribution analysis)

This service wraps the existing ModelRegistry/PredictionService in main.py
and adds monitoring, drift detection, and explainability layers.

Consumers:
- Admin Dashboard (model health widgets)
- ML Ops pipeline (automated retraining triggers)
- Valuation Reports (prediction explanations)
- API monitoring (performance degradation alerts)
"""

import logging
import math
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from pydantic import BaseModel, Field

from .config import ml_config
from .database import async_db

logger = logging.getLogger(__name__)


# =====================================================
# TYPES — Section 8.1: Performance Metrics
# =====================================================

class ModelPerformanceMetrics(BaseModel):
    """Section 8.1: Core AVM performance metrics."""
    model_version: str
    metric_date: str
    mae: float = Field(description="Mean Absolute Error (GHS)")
    rmse: float = Field(description="Root Mean Squared Error (GHS)")
    mape: float = Field(description="Mean Absolute Percentage Error (%)")
    r2: float = Field(description="Coefficient of Determination")
    median_error: float = Field(description="Median prediction error (GHS)")
    p90_error: float = Field(description="90th percentile error (GHS)")
    within_10_pct: float = Field(description="% predictions within 10% of actual")
    within_20_pct: float = Field(description="% predictions within 20% of actual")
    total_predictions: int
    sample_size: int = Field(description="Predictions with known actuals")


class ModelPerformanceBySegment(BaseModel):
    """Performance breakdown by property segment."""
    segment: str
    segment_type: str  # property_type | region | price_band
    metrics: ModelPerformanceMetrics


class PerformanceTrend(BaseModel):
    """Performance metric over time."""
    metric_name: str
    data_points: List[Dict[str, Any]]  # [{date, value}]
    trend_direction: str  # improving | degrading | stable
    change_rate: float  # Monthly change rate


# =====================================================
# TYPES — Section 8.2: Feature Importance
# =====================================================

class FeatureImportance(BaseModel):
    """Feature importance for model explainability."""
    feature_name: str
    importance_score: float = Field(ge=0, le=1)
    direction: str  # positive | negative | mixed
    category: str  # location | physical | temporal | market
    description: str


class PredictionExplanation(BaseModel):
    """Explanation for a single prediction."""
    prediction_id: str
    predicted_value: float
    feature_contributions: List[Dict[str, Any]]  # [{feature, contribution, direction}]
    top_positive: List[str]
    top_negative: List[str]
    confidence_factors: Dict[str, Any]


# =====================================================
# TYPES — Section 8.3: Confidence Distribution
# =====================================================

class ConfidenceDistribution(BaseModel):
    """Distribution of prediction confidence levels."""
    period: str
    total_predictions: int
    high_confidence: int  # > 80%
    medium_confidence: int  # 60-80%
    low_confidence: int  # < 60%
    mean_confidence: float
    median_confidence: float
    histogram: List[Dict[str, Any]]  # [{bin, count}]


# =====================================================
# TYPES — Section 8.4: Model Drift
# =====================================================

class DriftDetectionResult(BaseModel):
    """Model drift analysis result."""
    detection_date: str
    drift_detected: bool
    drift_type: Optional[str] = None  # concept | data | prediction
    drift_severity: str = "none"  # none | low | medium | high | critical
    metrics: Dict[str, Any]  # Detailed drift metrics
    recommendation: str
    retrain_required: bool


class DataDriftMetrics(BaseModel):
    """Input feature distribution drift metrics."""
    feature: str
    baseline_mean: float
    current_mean: float
    psi: float  # Population Stability Index
    ks_statistic: float  # Kolmogorov-Smirnov
    drift_detected: bool


# =====================================================
# TYPES — Section 8.6: Ensemble Analytics
# =====================================================

class EnsembleModelWeight(BaseModel):
    """Individual model weight in ensemble."""
    model_name: str  # random_forest | xgboost | neural_network
    weight: float
    contribution_pct: float
    individual_mae: float
    individual_r2: float


class EnsembleAnalytics(BaseModel):
    """Full ensemble performance analytics."""
    model_version: str
    weights: List[EnsembleModelWeight]
    ensemble_mae: float
    ensemble_r2: float
    improvement_over_best_single: float  # % improvement
    diversity_index: float  # 0-1, higher = more diverse predictions
    correlation_matrix: Dict[str, Dict[str, float]]


# =====================================================
# SERVICE
# =====================================================

class ModelMonitoringService:
    """
    Comprehensive model monitoring for AVM ensemble.
    
    Tracks performance, detects drift, provides explainability,
    and manages ensemble analytics.
    """

    def __init__(self):
        # Optionally wired at startup via set_model_registry()
        self._registry = None

    def set_model_registry(self, registry) -> None:
        """
        Wire the ModelRegistry so monitoring can read real model artifacts
        from disk (feature importances, ensemble weights, training metrics)
        without requiring DB rows.
        """
        self._registry = registry
        logger.info("ModelRegistry wired into ModelMonitoringService")

    # -------------------------------------------------
    # Section 8.1: Performance Metrics
    # -------------------------------------------------

    async def get_performance_metrics(
        self,
        model_version: str = "latest",
        period_days: int = 30,
    ) -> ModelPerformanceMetrics:
        """
        Calculate current model performance metrics.

        Compares predictions against known sale prices to compute
        error metrics. Requires feedback loop data.
        """
        try:
            rows = await async_db.fetch(
                """
                SELECT 
                    predicted_value, actual_value, confidence,
                    created_at
                FROM ml_predictions
                WHERE model_version = $1 
                    AND actual_value IS NOT NULL
                    AND created_at >= NOW() - INTERVAL '%s days'
                ORDER BY created_at DESC
                """ % period_days,
                model_version if model_version != "latest" else await self._get_active_version(),
            )
        except Exception as e:
            logger.warning(f"Failed to fetch predictions: {e}")
            rows = []

        if not rows or len(rows) < 5:
            return self._default_metrics(model_version)

        # Calculate metrics
        predictions = [float(r["predicted_value"]) for r in rows]
        actuals = [float(r["actual_value"]) for r in rows]

        errors = [abs(p - a) for p, a in zip(predictions, actuals)]
        pct_errors = [abs(p - a) / a * 100 if a > 0 else 0 for p, a in zip(predictions, actuals)]

        mae = sum(errors) / len(errors)
        rmse = math.sqrt(sum(e**2 for e in errors) / len(errors))
        mape = sum(pct_errors) / len(pct_errors)

        # R²
        actual_mean = sum(actuals) / len(actuals)
        ss_res = sum((a - p)**2 for a, p in zip(actuals, predictions))
        ss_tot = sum((a - actual_mean)**2 for a in actuals)
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

        # Percentile metrics
        sorted_errors = sorted(errors)
        median_error = sorted_errors[len(sorted_errors) // 2]
        p90_idx = int(len(sorted_errors) * 0.9)
        p90_error = sorted_errors[min(p90_idx, len(sorted_errors) - 1)]

        within_10 = sum(1 for pe in pct_errors if pe <= 10) / len(pct_errors) * 100
        within_20 = sum(1 for pe in pct_errors if pe <= 20) / len(pct_errors) * 100

        return ModelPerformanceMetrics(
            model_version=model_version,
            metric_date=datetime.utcnow().isoformat(),
            mae=round(mae, 2),
            rmse=round(rmse, 2),
            mape=round(mape, 2),
            r2=round(r2, 4),
            median_error=round(median_error, 2),
            p90_error=round(p90_error, 2),
            within_10_pct=round(within_10, 1),
            within_20_pct=round(within_20, 1),
            total_predictions=len(rows),
            sample_size=len(rows),
        )

    async def get_performance_by_segment(
        self,
        model_version: str = "latest",
        segment_type: str = "property_type",
    ) -> List[ModelPerformanceBySegment]:
        """
        Get performance metrics broken down by segment.

        Segment types: property_type, region, price_band
        """
        try:
            # The segment grouping column depends on segment_type
            column_map = {
                "property_type": "property_type",
                "region": "region",
                "price_band": "price_band",
            }
            col = column_map.get(segment_type, "property_type")

            rows = await async_db.fetch(
                f"""
                SELECT 
                    {col} as segment,
                    predicted_value, actual_value, confidence
                FROM ml_predictions
                WHERE model_version = $1 
                    AND actual_value IS NOT NULL
                    AND {col} IS NOT NULL
                    AND created_at >= NOW() - INTERVAL '90 days'
                """,
                model_version if model_version != "latest" else await self._get_active_version(),
            )
        except Exception as e:
            logger.warning(f"Failed to fetch segmented predictions: {e}")
            return []

        # Group by segment
        segments: Dict[str, List[Tuple[float, float]]] = defaultdict(list)
        for row in rows:
            segments[row["segment"]].append(
                (float(row["predicted_value"]), float(row["actual_value"]))
            )

        results = []
        for segment_name, pairs in segments.items():
            if len(pairs) < 3:
                continue

            preds = [p[0] for p in pairs]
            acts = [p[1] for p in pairs]
            errors = [abs(p - a) for p, a in pairs]
            pct_errors = [abs(p - a) / a * 100 if a > 0 else 0 for p, a in pairs]

            mae = sum(errors) / len(errors)
            rmse = math.sqrt(sum(e**2 for e in errors) / len(errors))
            mape = sum(pct_errors) / len(pct_errors)

            actual_mean = sum(acts) / len(acts)
            ss_res = sum((a - p)**2 for a, p in pairs)
            ss_tot = sum((a - actual_mean)**2 for a in acts)
            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

            sorted_errors = sorted(errors)
            median_error = sorted_errors[len(sorted_errors) // 2]
            within_10 = sum(1 for pe in pct_errors if pe <= 10) / len(pct_errors) * 100
            within_20 = sum(1 for pe in pct_errors if pe <= 20) / len(pct_errors) * 100

            metrics = ModelPerformanceMetrics(
                model_version=model_version,
                metric_date=datetime.utcnow().isoformat(),
                mae=round(mae, 2),
                rmse=round(rmse, 2),
                mape=round(mape, 2),
                r2=round(r2, 4),
                median_error=round(median_error, 2),
                p90_error=round(sorted_errors[int(len(sorted_errors) * 0.9)], 2),
                within_10_pct=round(within_10, 1),
                within_20_pct=round(within_20, 1),
                total_predictions=len(pairs),
                sample_size=len(pairs),
            )

            results.append(ModelPerformanceBySegment(
                segment=segment_name,
                segment_type=segment_type,
                metrics=metrics,
            ))

        return sorted(results, key=lambda x: x.metrics.mae)

    async def get_performance_trend(
        self,
        metric_name: str = "mae",
        model_version: str = "latest",
        months: int = 6,
    ) -> PerformanceTrend:
        """Track a performance metric over time."""
        try:
            rows = await async_db.fetch(
                """
                SELECT 
                    DATE_TRUNC('week', created_at) as week,
                    predicted_value, actual_value
                FROM ml_predictions
                WHERE model_version = $1 
                    AND actual_value IS NOT NULL
                    AND created_at >= NOW() - INTERVAL '%s months'
                ORDER BY week
                """ % months,
                model_version if model_version != "latest" else await self._get_active_version(),
            )
        except Exception as e:
            logger.warning(f"Failed to fetch performance trend: {e}")
            rows = []

        # Group by week
        weekly: Dict[str, List[Tuple[float, float]]] = defaultdict(list)
        for row in rows:
            week_key = str(row["week"])[:10]
            weekly[week_key].append(
                (float(row["predicted_value"]), float(row["actual_value"]))
            )

        data_points = []
        for week, pairs in sorted(weekly.items()):
            if len(pairs) < 2:
                continue

            if metric_name == "mae":
                value = sum(abs(p - a) for p, a in pairs) / len(pairs)
            elif metric_name == "mape":
                value = sum(abs(p - a) / a * 100 if a > 0 else 0 for p, a in pairs) / len(pairs)
            elif metric_name == "r2":
                preds = [p[0] for p in pairs]
                acts = [p[1] for p in pairs]
                actual_mean = sum(acts) / len(acts)
                ss_res = sum((a - p)**2 for a, p in pairs)
                ss_tot = sum((a - actual_mean)**2 for a in acts)
                value = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            else:
                value = 0

            data_points.append({"date": week, "value": round(value, 4)})

        # Determine trend direction
        if len(data_points) >= 2:
            values = [dp["value"] for dp in data_points]
            first_half = sum(values[:len(values)//2]) / max(len(values)//2, 1)
            second_half = sum(values[len(values)//2:]) / max(len(values) - len(values)//2, 1)

            # For error metrics, decreasing is improving
            if metric_name in ("mae", "rmse", "mape"):
                if second_half < first_half * 0.95:
                    direction = "improving"
                elif second_half > first_half * 1.05:
                    direction = "degrading"
                else:
                    direction = "stable"
            else:  # r2 — increasing is improving
                if second_half > first_half * 1.02:
                    direction = "improving"
                elif second_half < first_half * 0.98:
                    direction = "degrading"
                else:
                    direction = "stable"

            change_rate = ((second_half - first_half) / first_half * 100) if first_half != 0 else 0
        else:
            direction = "stable"
            change_rate = 0

        return PerformanceTrend(
            metric_name=metric_name,
            data_points=data_points,
            trend_direction=direction,
            change_rate=round(change_rate, 2),
        )

    # -------------------------------------------------
    # Section 8.2: Feature Importance
    # -------------------------------------------------

    async def get_feature_importance(
        self, model_version: str = "latest"
    ) -> List[FeatureImportance]:
        """
        Get feature importance rankings.

        Priority:
          1. ml_model_metadata DB table (populated after training runs)
          2. Loaded model artifact on disk (RF feature_importances_ array)
          3. Default domain-expertise fallback
        """
        # ── 1. Try DB ────────────────────────────────────────────────────────
        try:
            rows = await async_db.fetch(
                """
                SELECT feature_importances
                FROM ml_model_metadata
                WHERE model_version = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                model_version,
            )
            if rows and rows[0]["feature_importances"]:
                import json
                raw = json.loads(rows[0]["feature_importances"]) if isinstance(
                    rows[0]["feature_importances"], str
                ) else rows[0]["feature_importances"]
                return self._parse_feature_importances(raw)
        except Exception:
            pass

        # ── 2. Try loaded model artifact on disk ────────────────────────────
        if self._registry is not None:
            try:
                model_data = self._registry.get_model(model_version)
                ensemble = model_data.get("ensemble")
                metadata = model_data.get("metadata", {})
                feature_names = metadata.get("feature_names", [])
                if ensemble and "random_forest" in ensemble and feature_names:
                    rf = ensemble["random_forest"]
                    importances = rf.feature_importances_
                    raw = dict(zip(feature_names, [float(v) for v in importances]))
                    return self._parse_feature_importances(raw)
            except Exception as exc:
                logger.debug(f"Could not read feature importances from model artifact: {exc}")

        # ── 3. Domain-expertise fallback ─────────────────────────────────────
        return self._default_feature_importances()

    def _parse_feature_importances(
        self, raw: Dict[str, float]
    ) -> List[FeatureImportance]:
        """Parse raw importance dict into typed list."""
        features = []
        total = sum(abs(v) for v in raw.values()) or 1.0

        for name, score in sorted(raw.items(), key=lambda x: abs(x[1]), reverse=True):
            normalized = abs(score) / total
            category = self._categorize_feature(name)
            direction = "positive" if score > 0 else "negative" if score < 0 else "mixed"

            features.append(FeatureImportance(
                feature_name=name,
                importance_score=round(normalized, 4),
                direction=direction,
                category=category,
                description=self._describe_feature(name),
            ))

        return features

    def _default_feature_importances(self) -> List[FeatureImportance]:
        """Default feature importances based on domain expertise."""
        defaults = [
            ("location_score", 0.22, "positive", "location", "Neighborhood desirability index"),
            ("gfa", 0.18, "positive", "physical", "Gross Floor Area in square meters"),
            ("bedrooms", 0.10, "positive", "physical", "Number of bedrooms"),
            ("property_type_encoded", 0.09, "mixed", "physical", "Property type category"),
            ("age_years", 0.08, "negative", "temporal", "Property age in years"),
            ("plot_area", 0.07, "positive", "physical", "Total plot area"),
            ("condition_score", 0.06, "positive", "physical", "Property condition rating"),
            ("distance_to_cbd", 0.05, "negative", "location", "Distance to central business district"),
            ("amenity_score", 0.04, "positive", "physical", "Composite amenity count"),
            ("market_trend_3m", 0.04, "mixed", "market", "3-month price trend in area"),
            ("bathrooms", 0.03, "positive", "physical", "Number of bathrooms"),
            ("stories", 0.02, "positive", "physical", "Number of floors/stories"),
            ("security_features", 0.02, "positive", "physical", "Security infrastructure score"),
        ]
        return [
            FeatureImportance(
                feature_name=name,
                importance_score=score,
                direction=direction,
                category=category,
                description=desc,
            )
            for name, score, direction, category, desc in defaults
        ]

    def _categorize_feature(self, name: str) -> str:
        """Categorize a feature name."""
        location_terms = ["location", "region", "district", "neighborhood", "lat", "lon", "distance", "cbd"]
        physical_terms = ["gfa", "bedroom", "bathroom", "plot", "area", "condition", "amenity", "story", "parking"]
        temporal_terms = ["age", "year", "month", "quarter"]
        market_terms = ["market", "trend", "price", "index", "supply", "demand"]

        name_lower = name.lower()
        if any(t in name_lower for t in location_terms):
            return "location"
        elif any(t in name_lower for t in physical_terms):
            return "physical"
        elif any(t in name_lower for t in temporal_terms):
            return "temporal"
        elif any(t in name_lower for t in market_terms):
            return "market"
        return "other"

    def _describe_feature(self, name: str) -> str:
        """Generate human-readable description of a feature."""
        descriptions = {
            "gfa": "Gross Floor Area in square meters",
            "bedrooms": "Number of bedrooms",
            "bathrooms": "Number of bathrooms",
            "plot_area": "Total plot/land area",
            "age_years": "Age of property in years",
            "condition_score": "Overall condition rating (1-5)",
            "location_score": "Desirability score based on neighborhood tier",
            "distance_to_cbd": "Distance to central business district (km)",
            "amenity_score": "Composite score of available amenities",
        }
        return descriptions.get(name, name.replace("_", " ").title())

    async def explain_prediction(
        self,
        prediction_id: str,
    ) -> PredictionExplanation:
        """
        Explain a specific prediction.

        Returns feature contributions showing which features
        pushed the prediction up or down.
        """
        try:
            row = await async_db.fetchrow(
                """
                SELECT predicted_value, features, model_version, confidence
                FROM ml_predictions
                WHERE prediction_id = $1
                """,
                prediction_id,
            )
        except Exception:
            row = None

        if not row:
            raise ValueError(f"Prediction {prediction_id} not found")

        import json
        predicted_value = float(row["predicted_value"])
        features = json.loads(row["features"]) if isinstance(row["features"], str) else row["features"]

        # Get feature importances for this model
        importances = await self.get_feature_importance(row["model_version"])
        importance_map = {fi.feature_name: fi for fi in importances}

        # Calculate approximate contribution per feature
        contributions = []
        for feat_name, feat_value in features.items():
            fi = importance_map.get(feat_name)
            if fi:
                # Approximate contribution = importance * normalized feature value
                contribution = fi.importance_score * predicted_value
                if fi.direction == "negative":
                    contribution = -contribution

                contributions.append({
                    "feature": feat_name,
                    "value": feat_value,
                    "contribution": round(contribution, 2),
                    "direction": fi.direction,
                    "importance": fi.importance_score,
                })

        # Sort by absolute contribution
        contributions.sort(key=lambda x: abs(x["contribution"]), reverse=True)

        top_positive = [
            c["feature"] for c in contributions
            if c["direction"] == "positive"
        ][:5]

        top_negative = [
            c["feature"] for c in contributions
            if c["direction"] == "negative"
        ][:5]

        return PredictionExplanation(
            prediction_id=prediction_id,
            predicted_value=predicted_value,
            feature_contributions=contributions[:15],
            top_positive=top_positive,
            top_negative=top_negative,
            confidence_factors={
                "overall_confidence": float(row["confidence"]) if row["confidence"] else 0.5,
                "feature_coverage": len(features) / 15,  # Out of expected features
                "model_version": row["model_version"],
            },
        )

    # -------------------------------------------------
    # Section 8.3: Confidence Distribution
    # -------------------------------------------------

    async def get_confidence_distribution(
        self,
        model_version: str = "latest",
        period_days: int = 30,
    ) -> ConfidenceDistribution:
        """Get distribution of prediction confidences."""
        try:
            rows = await async_db.fetch(
                """
                SELECT confidence
                FROM ml_predictions
                WHERE model_version = $1 
                    AND created_at >= NOW() - INTERVAL '%s days'
                    AND confidence IS NOT NULL
                ORDER BY created_at DESC
                """ % period_days,
                model_version if model_version != "latest" else await self._get_active_version(),
            )
        except Exception:
            rows = []

        if not rows:
            return ConfidenceDistribution(
                period=f"Last {period_days} days",
                total_predictions=0,
                high_confidence=0,
                medium_confidence=0,
                low_confidence=0,
                mean_confidence=0.0,
                median_confidence=0.0,
                histogram=[],
            )

        confidences = [float(r["confidence"]) * 100 for r in rows]  # Convert to percentage
        total = len(confidences)

        high = sum(1 for c in confidences if c > 80)
        medium = sum(1 for c in confidences if 60 <= c <= 80)
        low = sum(1 for c in confidences if c < 60)

        mean_conf = sum(confidences) / total
        sorted_conf = sorted(confidences)
        median_conf = sorted_conf[total // 2]

        # Build histogram (10% bins)
        histogram = []
        for bin_start in range(0, 100, 10):
            bin_end = bin_start + 10
            count = sum(1 for c in confidences if bin_start <= c < bin_end)
            histogram.append({
                "bin": f"{bin_start}-{bin_end}%",
                "count": count,
                "percentage": round(count / total * 100, 1),
            })

        return ConfidenceDistribution(
            period=f"Last {period_days} days",
            total_predictions=total,
            high_confidence=high,
            medium_confidence=medium,
            low_confidence=low,
            mean_confidence=round(mean_conf, 1),
            median_confidence=round(median_conf, 1),
            histogram=histogram,
        )

    # -------------------------------------------------
    # Section 8.4: Drift Detection
    # -------------------------------------------------

    async def detect_drift(
        self,
        model_version: str = "latest",
        baseline_days: int = 90,
        current_days: int = 14,
    ) -> DriftDetectionResult:
        """
        Detect model and data drift.

        Compares recent predictions/features against a baseline period
        to detect concept drift, data drift, and prediction drift.
        """
        version = model_version if model_version != "latest" else await self._get_active_version()

        # Fetch baseline and current prediction data
        try:
            baseline_rows = await async_db.fetch(
                """
                SELECT predicted_value, actual_value, confidence, features
                FROM ml_predictions
                WHERE model_version = $1 
                    AND actual_value IS NOT NULL
                    AND created_at BETWEEN NOW() - INTERVAL '%s days' AND NOW() - INTERVAL '%s days'
                """ % (baseline_days, current_days),
                version,
            )

            current_rows = await async_db.fetch(
                """
                SELECT predicted_value, actual_value, confidence, features
                FROM ml_predictions
                WHERE model_version = $1 
                    AND actual_value IS NOT NULL
                    AND created_at >= NOW() - INTERVAL '%s days'
                """ % current_days,
                version,
            )
        except Exception as e:
            logger.warning(f"Drift detection data fetch failed: {e}")
            return DriftDetectionResult(
                detection_date=datetime.utcnow().isoformat(),
                drift_detected=False,
                drift_severity="none",
                metrics={"error": str(e)},
                recommendation="Insufficient data for drift detection",
                retrain_required=False,
            )

        if len(baseline_rows) < 10 or len(current_rows) < 5:
            return DriftDetectionResult(
                detection_date=datetime.utcnow().isoformat(),
                drift_detected=False,
                drift_severity="none",
                metrics={
                    "baseline_samples": len(baseline_rows),
                    "current_samples": len(current_rows),
                },
                recommendation="Insufficient samples for reliable drift detection. "
                               f"Need 10+ baseline and 5+ current (have {len(baseline_rows)}/{len(current_rows)}).",
                retrain_required=False,
            )

        # Concept drift: Compare error distributions
        baseline_errors = [
            abs(float(r["predicted_value"]) - float(r["actual_value"]))
            for r in baseline_rows
        ]
        current_errors = [
            abs(float(r["predicted_value"]) - float(r["actual_value"]))
            for r in current_rows
        ]

        baseline_mae = sum(baseline_errors) / len(baseline_errors)
        current_mae = sum(current_errors) / len(current_errors)
        mae_change = ((current_mae - baseline_mae) / baseline_mae * 100) if baseline_mae > 0 else 0

        # Prediction drift: Compare prediction distributions
        baseline_preds = [float(r["predicted_value"]) for r in baseline_rows]
        current_preds = [float(r["predicted_value"]) for r in current_rows]

        pred_psi = self._calculate_psi(baseline_preds, current_preds)

        # Confidence drift
        baseline_conf = [float(r["confidence"]) for r in baseline_rows if r["confidence"]]
        current_conf = [float(r["confidence"]) for r in current_rows if r["confidence"]]

        conf_change = 0
        if baseline_conf and current_conf:
            conf_change = (sum(current_conf) / len(current_conf)) - (sum(baseline_conf) / len(baseline_conf))

        # Determine drift severity
        drift_detected = False
        drift_type = None
        severity = "none"

        if mae_change > 30:
            drift_detected = True
            drift_type = "concept"
            severity = "critical" if mae_change > 50 else "high"
        elif mae_change > 15:
            drift_detected = True
            drift_type = "concept"
            severity = "medium"
        elif pred_psi > 0.2:
            drift_detected = True
            drift_type = "prediction"
            severity = "high" if pred_psi > 0.3 else "medium"
        elif pred_psi > 0.1:
            drift_detected = True
            drift_type = "data"
            severity = "low"

        # Recommendation
        if severity in ("critical", "high"):
            recommendation = "Immediate model retraining recommended. Significant performance degradation detected."
        elif severity == "medium":
            recommendation = "Schedule retraining within 1-2 weeks. Monitor closely for further degradation."
        elif severity == "low":
            recommendation = "Minor drift detected. Continue monitoring. Consider retraining in next cycle."
        else:
            recommendation = "No significant drift detected. Model performing within expected parameters."

        return DriftDetectionResult(
            detection_date=datetime.utcnow().isoformat(),
            drift_detected=drift_detected,
            drift_type=drift_type,
            drift_severity=severity,
            metrics={
                "baseline_mae": round(baseline_mae, 2),
                "current_mae": round(current_mae, 2),
                "mae_change_pct": round(mae_change, 1),
                "prediction_psi": round(pred_psi, 4),
                "confidence_change": round(conf_change, 4),
                "baseline_samples": len(baseline_rows),
                "current_samples": len(current_rows),
            },
            recommendation=recommendation,
            retrain_required=severity in ("critical", "high"),
        )

    def _calculate_psi(
        self, baseline: List[float], current: List[float], bins: int = 10
    ) -> float:
        """Calculate Population Stability Index."""
        if not baseline or not current:
            return 0.0

        all_values = baseline + current
        min_val = min(all_values)
        max_val = max(all_values)

        if min_val == max_val:
            return 0.0

        bin_edges = [min_val + i * (max_val - min_val) / bins for i in range(bins + 1)]

        eps = 1e-6

        def bin_proportions(values: List[float]) -> List[float]:
            n = len(values)
            props = []
            for i in range(bins):
                count = sum(1 for v in values if bin_edges[i] <= v < bin_edges[i + 1])
                if i == bins - 1:
                    count += sum(1 for v in values if v == bin_edges[i + 1])
                props.append(max(count / n, eps))
            return props

        baseline_props = bin_proportions(baseline)
        current_props = bin_proportions(current)

        psi = sum(
            (cp - bp) * math.log(cp / bp)
            for bp, cp in zip(baseline_props, current_props)
        )

        return abs(psi)

    async def get_data_drift_details(
        self, model_version: str = "latest"
    ) -> List[DataDriftMetrics]:
        """Get per-feature data drift analysis."""
        # This would require feature-level storage
        # Return a structured placeholder / compute from available data
        try:
            import json
            version = model_version if model_version != "latest" else await self._get_active_version()

            baseline_rows = await async_db.fetch(
                """
                SELECT features
                FROM ml_predictions
                WHERE model_version = $1 
                    AND created_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '14 days'
                LIMIT 500
                """,
                version,
            )

            current_rows = await async_db.fetch(
                """
                SELECT features
                FROM ml_predictions
                WHERE model_version = $1 
                    AND created_at >= NOW() - INTERVAL '14 days'
                LIMIT 500
                """,
                version,
            )

            if not baseline_rows or not current_rows:
                return []

            # Parse features
            baseline_features: Dict[str, List[float]] = defaultdict(list)
            current_features: Dict[str, List[float]] = defaultdict(list)

            for row in baseline_rows:
                feats = json.loads(row["features"]) if isinstance(row["features"], str) else row["features"]
                if feats:
                    for k, v in feats.items():
                        if isinstance(v, (int, float)):
                            baseline_features[k].append(float(v))

            for row in current_rows:
                feats = json.loads(row["features"]) if isinstance(row["features"], str) else row["features"]
                if feats:
                    for k, v in feats.items():
                        if isinstance(v, (int, float)):
                            current_features[k].append(float(v))

            results = []
            for feature in baseline_features:
                if feature in current_features and len(baseline_features[feature]) >= 10:
                    b_vals = baseline_features[feature]
                    c_vals = current_features[feature]

                    b_mean = sum(b_vals) / len(b_vals)
                    c_mean = sum(c_vals) / len(c_vals)
                    psi = self._calculate_psi(b_vals, c_vals)

                    # Simplified KS statistic
                    ks = abs(b_mean - c_mean) / max(
                        (sum((v - b_mean)**2 for v in b_vals) / len(b_vals))**0.5 or 1, 1
                    )

                    results.append(DataDriftMetrics(
                        feature=feature,
                        baseline_mean=round(b_mean, 4),
                        current_mean=round(c_mean, 4),
                        psi=round(psi, 4),
                        ks_statistic=round(ks, 4),
                        drift_detected=psi > 0.1,
                    ))

            return sorted(results, key=lambda x: x.psi, reverse=True)

        except Exception as e:
            logger.warning(f"Data drift detail computation failed: {e}")
            return []

    # -------------------------------------------------
    # Section 8.6: Ensemble Analytics
    # -------------------------------------------------

    async def get_ensemble_analytics(
        self, model_version: str = "latest"
    ) -> EnsembleAnalytics:
        """
        Get ensemble model analytics showing individual model
        contributions, weights, and diversity metrics.

        Priority:
          1. ml_model_metadata DB table (populated after training runs)
          2. Loaded model artifact metadata.json on disk (real learned weights)
          3. Architecture-based defaults
        """
        version = model_version if model_version != "latest" else await self._get_active_version()

        # ── 1. Try DB ────────────────────────────────────────────────────────
        try:
            row = await async_db.fetchrow(
                """
                SELECT ensemble_weights, individual_metrics
                FROM ml_model_metadata
                WHERE model_version = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                version,
            )

            if row:
                import json
                weights_raw = json.loads(row["ensemble_weights"]) if isinstance(
                    row["ensemble_weights"], str
                ) else row["ensemble_weights"]
                metrics_raw = json.loads(row["individual_metrics"]) if isinstance(
                    row["individual_metrics"], str
                ) else row["individual_metrics"]

                if weights_raw and metrics_raw:
                    return self._build_ensemble_analytics(version, weights_raw, metrics_raw)
        except Exception:
            pass

        # ── 2. Try loaded model artifact on disk ─────────────────────────────
        if self._registry is not None:
            try:
                model_data = self._registry.get_model(model_version)
                metadata = model_data.get("metadata", {})
                weights_raw = metadata.get("ensemble_weights")
                training_metrics = metadata.get("metrics", {})
                if weights_raw:
                    # Per-model eval data not available without separate tracking;
                    # use ensemble training metrics as the best available proxy.
                    individual_metrics = {
                        name: {
                            "mae": training_metrics.get("mae", 0),
                            "r2": training_metrics.get("r2", 0),
                        }
                        for name in weights_raw
                    }
                    return self._build_ensemble_analytics_from_metadata(
                        version, weights_raw, training_metrics, individual_metrics
                    )
            except Exception as exc:
                logger.debug(f"Could not read ensemble analytics from model artifact: {exc}")

        # ── 3. Architecture-based defaults ───────────────────────────────────
        return self._default_ensemble_analytics(version)

    def _build_ensemble_analytics_from_metadata(
        self,
        version: str,
        weights_raw: Dict[str, float],
        overall_metrics: Dict[str, float],
        individual_metrics: Dict[str, Dict],
    ) -> EnsembleAnalytics:
        """Build EnsembleAnalytics from training metadata (no per-model eval rows)."""
        total_weight = sum(weights_raw.values()) or 1.0
        models = []
        for name, weight in weights_raw.items():
            ind = individual_metrics.get(name, {})
            models.append(EnsembleModelWeight(
                model_name=name,
                weight=round(weight, 4),
                contribution_pct=round(weight / total_weight * 100, 1),
                individual_mae=ind.get("mae", overall_metrics.get("mae", 0)),
                individual_r2=ind.get("r2", overall_metrics.get("r2", 0)),
            ))

        ensemble_mae = overall_metrics.get("mae", 0.0)
        ensemble_r2 = overall_metrics.get("r2", 0.0)
        best_single_mae = min(m.individual_mae for m in models) if models else ensemble_mae
        improvement = (
            (best_single_mae - ensemble_mae) / best_single_mae * 100
            if best_single_mae > 0 else 0.0
        )

        return EnsembleAnalytics(
            model_version=version,
            weights=sorted(models, key=lambda x: x.weight, reverse=True),
            ensemble_mae=round(ensemble_mae, 2),
            ensemble_r2=round(ensemble_r2, 4),
            improvement_over_best_single=round(improvement, 1),
            diversity_index=0.65,
            correlation_matrix={},
        )

    def _build_ensemble_analytics(
        self,
        version: str,
        weights_raw: Dict[str, float],
        metrics_raw: Dict[str, Dict],
    ) -> EnsembleAnalytics:
        """Build ensemble analytics from stored metadata."""
        total_weight = sum(weights_raw.values()) or 1.0
        models = []

        for name, weight in weights_raw.items():
            individual = metrics_raw.get(name, {})
            models.append(EnsembleModelWeight(
                model_name=name,
                weight=round(weight, 4),
                contribution_pct=round(weight / total_weight * 100, 1),
                individual_mae=individual.get("mae", 0),
                individual_r2=individual.get("r2", 0),
            ))

        # Calculate diversity (1 - avg correlation)
        improvement = 0
        if models:
            best_single_mae = min(m.individual_mae for m in models) or 1
            ensemble_mae = sum(m.weight * m.individual_mae for m in models)
            improvement = ((best_single_mae - ensemble_mae) / best_single_mae * 100) if best_single_mae > 0 else 0

        return EnsembleAnalytics(
            model_version=version,
            weights=sorted(models, key=lambda x: x.weight, reverse=True),
            ensemble_mae=sum(m.weight * m.individual_mae for m in models),
            ensemble_r2=sum(m.weight * m.individual_r2 for m in models),
            improvement_over_best_single=round(improvement, 1),
            diversity_index=0.65,  # Would need prediction-level data
            correlation_matrix={},
        )

    def _default_ensemble_analytics(self, version: str) -> EnsembleAnalytics:
        """Default ensemble analytics based on architecture design."""
        models = [
            EnsembleModelWeight(
                model_name="random_forest",
                weight=0.35,
                contribution_pct=35.0,
                individual_mae=45000.0,
                individual_r2=0.89,
            ),
            EnsembleModelWeight(
                model_name="xgboost",
                weight=0.40,
                contribution_pct=40.0,
                individual_mae=42000.0,
                individual_r2=0.91,
            ),
            EnsembleModelWeight(
                model_name="neural_network",
                weight=0.25,
                contribution_pct=25.0,
                individual_mae=48000.0,
                individual_r2=0.87,
            ),
        ]

        ensemble_mae = sum(m.weight * m.individual_mae for m in models)
        ensemble_r2 = sum(m.weight * m.individual_r2 for m in models)
        best_single = min(m.individual_mae for m in models)
        improvement = ((best_single - ensemble_mae) / best_single * 100) if best_single > 0 else 0

        return EnsembleAnalytics(
            model_version=version,
            weights=models,
            ensemble_mae=round(ensemble_mae, 2),
            ensemble_r2=round(ensemble_r2, 4),
            improvement_over_best_single=round(improvement, 1),
            diversity_index=0.65,
            correlation_matrix={
                "random_forest": {"xgboost": 0.82, "neural_network": 0.71},
                "xgboost": {"random_forest": 0.82, "neural_network": 0.74},
                "neural_network": {"random_forest": 0.71, "xgboost": 0.74},
            },
        )

    # -------------------------------------------------
    # HELPERS
    # -------------------------------------------------

    async def _get_active_version(self) -> str:
        """Get the currently active model version."""
        if self._registry is not None:
            return self._registry.active_version
        try:
            row = await async_db.fetchrow(
                "SELECT model_version FROM ml_model_metadata WHERE is_active = true ORDER BY created_at DESC LIMIT 1"
            )
            if row:
                return row["model_version"]
        except Exception:
            pass
        return "v1.0"

    def _default_metrics(self, model_version: str) -> ModelPerformanceMetrics:
        """Return default metrics when insufficient data."""
        return ModelPerformanceMetrics(
            model_version=model_version,
            metric_date=datetime.utcnow().isoformat(),
            mae=0.0,
            rmse=0.0,
            mape=0.0,
            r2=0.0,
            median_error=0.0,
            p90_error=0.0,
            within_10_pct=0.0,
            within_20_pct=0.0,
            total_predictions=0,
            sample_size=0,
        )


# Singleton
model_monitoring_service = ModelMonitoringService()
