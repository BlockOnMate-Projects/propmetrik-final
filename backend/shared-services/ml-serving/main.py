"""
PROPMETRIK ML Model Serving API

FastAPI-based model serving infrastructure for property valuation ML models.
Supports multiple model types including ensemble models (Random Forest, XGBoost, Neural Networks).

Features:
- Model versioning and A/B testing
- Real-time predictions with batching
- Model performance monitoring
- Feature preprocessing pipeline
- Confidence intervals for predictions
"""

import os
import logging
from typing import Dict, List, Optional, Union
from datetime import datetime
import json
import pickle
import numpy as np
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend/ directory (two levels up from ml-serving/)
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(_env_path)

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import redis
import joblib
import sys

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def register_training_pipeline_classes() -> None:
    """
    Expose training classes for joblib unpickling.

    Models trained via `python training/train_pipeline.py` pickle class names
    as `__main__.FeatureEngineer` etc.  When uvicorn loads the app, __main__
    is the uvicorn entry point — those classes are missing.  Injecting them
    into sys.modules['__main__'] makes joblib's unpickler find them.
    """
    import sys
    try:
        import training.train_pipeline as training_pipeline
    except Exception as error:
        logger.warning("Training pipeline import unavailable during startup", exc_info=error)
        return

    main_module = sys.modules.get("__main__")
    for name in dir(training_pipeline):
        obj = getattr(training_pipeline, name)
        if isinstance(obj, type):
            globals()[name] = obj                      # main.py namespace
            if main_module is not None:
                setattr(main_module, name, obj)        # __main__ namespace (joblib target)

# =====================================================
# CONFIGURATION
# =====================================================

class Config:
    """Application configuration."""
    MODEL_STORAGE_PATH = os.getenv("MODEL_STORAGE_PATH", "./models")
    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
    PREDICTION_CACHE_TTL = int(os.getenv("PREDICTION_CACHE_TTL", "3600"))  # 1 hour
    MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "100"))
    DEFAULT_MODEL_VERSION = os.getenv("DEFAULT_MODEL_VERSION", "latest")

    # Auto-retraining scheduler
    AUTO_RETRAIN_ENABLED = os.getenv("AUTO_RETRAIN_ENABLED", "true").lower() == "true"
    # How many hours between scheduled retrains (default: weekly)
    RETRAIN_INTERVAL_HOURS = int(os.getenv("RETRAIN_INTERVAL_HOURS", "168"))
    # How often the scheduler wakes up to check conditions (default: every 24 h)
    RETRAIN_CHECK_INTERVAL_HOURS = int(os.getenv("RETRAIN_CHECK_INTERVAL_HOURS", "24"))
    # Trigger an early retrain when this many new qualifying properties exist since last train
    RETRAIN_NEW_PROPERTY_THRESHOLD = int(os.getenv("RETRAIN_NEW_PROPERTY_THRESHOLD", "200"))

config = Config()

# =====================================================
# DATA MODELS
# =====================================================

class PropertyFeatures(BaseModel):
    """Input features for property valuation prediction."""
    # Location features
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    region: str
    district: Optional[str] = None
    neighborhood: Optional[str] = None
    
    # Property characteristics
    property_type: str = Field(..., description="residential, commercial, land, industrial")
    built_area_sqm: float = Field(..., ge=0)
    total_area_sqm: Optional[float] = Field(None, ge=0)
    land_area_sqm: Optional[float] = Field(None, ge=0)
    plot_area_sqm: Optional[float] = Field(None, ge=0)  # alias for total_area_sqm
    bedrooms: int = Field(0, ge=0)
    bathrooms: int = Field(0, ge=0)
    floors: int = Field(1, ge=1)
    year_built: Optional[int] = None
    
    # Condition and quality
    condition_score: float = Field(5.0, ge=1, le=10)
    quality_score: float = Field(5.0, ge=1, le=10)
    
    # Amenities — has_pool/has_ac/has_garden/has_fitted_kitchen match training feature schema
    has_pool: bool = False
    has_ac: bool = False
    has_garden: bool = False
    has_fitted_kitchen: bool = False
    # Additional amenities (not in ML model but kept for other uses)
    has_parking: bool = False
    has_security: bool = False
    has_generator: bool = False
    has_borehole: bool = False
    
    # Floor plan data (from Floor Plan Builder)
    building_efficiency: Optional[float] = Field(None, ge=0, le=1)
    layout_quality_score: Optional[float] = Field(None, ge=0, le=100)
    
    # Economic factors
    inflation_rate: Optional[float] = None
    exchange_rate_usd: Optional[float] = None


class PredictionRequest(BaseModel):
    """Request for property value prediction."""
    properties: List[PropertyFeatures] = Field(..., min_length=1, max_length=100)
    model_version: Optional[str] = None
    include_confidence: bool = True
    include_feature_importance: bool = False


class PredictionResult(BaseModel):
    """Single prediction result."""
    predicted_value_ghs: float
    predicted_value_usd: float
    price_band: Optional[str] = None
    confidence_low: Optional[float] = None
    confidence_high: Optional[float] = None
    confidence_score: Optional[float] = None
    feature_importance: Optional[Dict[str, float]] = None


class DataQualityDisclosure(BaseModel):
    """Transparency disclosure attached to every /predict response."""
    training_samples: int
    model_r2: float
    last_trained: str          # ISO date string
    coverage: str              # e.g. "Ghana — all property types"
    caveat: str                # Human-readable warning for consumers


class PredictionResponse(BaseModel):
    """Response containing predictions."""
    predictions: List[PredictionResult]
    model_version: str
    model_type: str
    prediction_time_ms: float
    batch_size: int
    timestamp: datetime
    data_quality: DataQualityDisclosure


class ModelInfo(BaseModel):
    """Information about a loaded model."""
    name: str
    version: str
    model_type: str
    trained_at: datetime
    metrics: Dict[str, float]
    feature_names: List[str]
    is_active: bool


class ModelMetrics(BaseModel):
    """Model performance metrics."""
    mae: float  # Mean Absolute Error
    rmse: float  # Root Mean Square Error
    mape: float  # Mean Absolute Percentage Error
    r2: float  # R-squared
    samples_used: int
    last_updated: datetime

# =====================================================
# MODEL REGISTRY
# =====================================================

class ModelRegistry:
    """
    Manages loading, caching, and versioning of ML models.
    Supports hot-swapping and A/B testing.
    """
    
    def __init__(self, storage_path: str, redis_client: Optional[redis.Redis] = None):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.redis = redis_client
        self.models: Dict[str, Dict] = {}
        self.active_version = config.DEFAULT_MODEL_VERSION
        
    def load_model(self, version: str = "latest") -> Dict:
        """Load a model from storage."""
        if version in self.models:
            return self.models[version]

        register_training_pipeline_classes()
        
        # Find model path
        if version == "latest":
            model_dirs = sorted(
                [d for d in self.storage_path.iterdir() if d.is_dir()],
                key=lambda x: x.stat().st_mtime,
                reverse=True
            )
            if not model_dirs:
                raise FileNotFoundError("No models found in storage")
            model_path = model_dirs[0]
            version = model_path.name
        else:
            model_path = self.storage_path / version
            if not model_path.exists():
                raise FileNotFoundError(f"Model version {version} not found")
        
        # Load model components
        try:
            model_data = {
                "version": version,
                "preprocessor": joblib.load(model_path / "preprocessor.joblib"),
                "metadata": json.loads((model_path / "metadata.json").read_text()),
            }
            
            # Try to load the full ensemble object
            model_joblib = model_path / "model.joblib"
            if model_joblib.exists():
                try:
                    model_data["model"] = joblib.load(model_joblib)
                except Exception:
                    logger.warning(f"Could not load model.joblib (pickle class mismatch), using ensemble components")
                    model_data["model"] = None
            
            # Load ensemble components if present
            ensemble_path = model_path / "ensemble"
            if ensemble_path.exists():
                model_data["ensemble"] = {
                    "random_forest": joblib.load(ensemble_path / "random_forest.joblib"),
                    "gradient_boosting": joblib.load(ensemble_path / "gradient_boosting.joblib"),
                    "neural_network": joblib.load(ensemble_path / "neural_network.joblib"),
                    "weights": json.loads((ensemble_path / "weights.json").read_text()),
                }
            
            self.models[version] = model_data
            logger.info(f"Loaded model version: {version}")
            return model_data
            
        except Exception as e:
            logger.error(f"Failed to load model {version}: {e}")
            raise
    
    def get_model(self, version: Optional[str] = None) -> Dict:
        """Get a loaded model, loading if necessary."""
        version = version or self.active_version
        if version not in self.models:
            return self.load_model(version)
        return self.models[version]
    
    def set_active_version(self, version: str):
        """Set the active model version for predictions."""
        self.load_model(version)  # Ensure it can be loaded
        self.active_version = version
        logger.info(f"Set active model version to: {version}")
    
    def list_versions(self) -> List[str]:
        """List all available model versions."""
        return [d.name for d in self.storage_path.iterdir() if d.is_dir()]
    
    def get_model_info(self, version: str) -> ModelInfo:
        """Get information about a model version."""
        model_data = self.get_model(version)
        metadata = model_data["metadata"]
        
        return ModelInfo(
            name=metadata.get("name", "AVM"),
            version=version,
            model_type=metadata.get("model_type", "ensemble"),
            trained_at=datetime.fromisoformat(metadata.get("trained_at", datetime.now().isoformat())),
            metrics=metadata.get("metrics", {}),
            feature_names=metadata.get("feature_names", []),
            is_active=(version == self.active_version)
        )

    def get_per_type_model(self, version: str, property_type_group: str) -> Optional[Dict]:
        """
        Load a per-type specific model from the per_type/ sub-directory
        saved by SegmentedTrainingPipeline.

        Returns None (silently) if no per-type model exists for this combo.
        """
        cache_key = f"{version}__pertype__{property_type_group}"
        if cache_key in self.models:
            return self.models[cache_key]

        register_training_pipeline_classes()

        per_type_path = self.storage_path / version / "per_type" / property_type_group
        if not per_type_path.exists():
            return None

        try:
            model_data: Dict = {
                "version": cache_key,
                "preprocessor": joblib.load(per_type_path / "preprocessor.joblib"),
                "metadata": json.loads((per_type_path / "metadata.json").read_text()),
            }

            model_joblib = per_type_path / "model.joblib"
            if model_joblib.exists():
                try:
                    model_data["model"] = joblib.load(model_joblib)
                except Exception:
                    model_data["model"] = None

            ensemble_path = per_type_path / "ensemble"
            if ensemble_path.exists():
                model_data["ensemble"] = {
                    "random_forest": joblib.load(ensemble_path / "random_forest.joblib"),
                    "gradient_boosting": joblib.load(ensemble_path / "gradient_boosting.joblib"),
                    "neural_network": joblib.load(ensemble_path / "neural_network.joblib"),
                    "weights": json.loads((ensemble_path / "weights.json").read_text()),
                }

            self.models[cache_key] = model_data
            logger.info(f"Loaded per-type model: {version}/{property_type_group}")
            return model_data

        except Exception as e:
            logger.warning(f"Per-type model {version}/{property_type_group} not available: {e}")
            return None

# =====================================================
# PREDICTION SERVICE
# =====================================================

# Mirrors PROPERTY_TYPE_GROUPS from train_pipeline.py so PredictionService
# can route requests to the right per-type model without importing training code.
_PROPERTY_TYPE_GROUPS: Dict[str, List[str]] = {
    "residential_house": [
        "residential_house", "detached_house", "semi_detached",
        "townhouse", "bungalow", "terraced_house",
    ],
    "apartment_flat": [
        "apartment_flat", "apartment", "flat", "studio", "condo",
        "penthouse", "maisonette",
    ],
    "land": [
        "land", "plot", "serviced_plot", "bare_land",
        "agricultural_land", "mixed_use_land",
    ],
    "commercial": [
        "commercial_shop", "office_space", "warehouse",
        "commercial", "retail", "showroom", "industrial",
    ],
}


def _resolve_property_type_group(property_type: str) -> Optional[str]:
    """Map a raw property_type string to the canonical per-type model group."""
    pt = property_type.lower().replace(" ", "_").replace("-", "_")
    for group, aliases in _PROPERTY_TYPE_GROUPS.items():
        if any(alias in pt or pt in alias for alias in aliases):
            return group
    return None


class PredictionService:
    """
    Handles property value predictions using loaded models.
    Supports ensemble predictions with confidence intervals.
    """
    
    def __init__(self, model_registry: ModelRegistry, redis_client: Optional[redis.Redis] = None):
        self.registry = model_registry
        self.redis = redis_client
        
    def _preprocess_features(self, properties: List[PropertyFeatures], preprocessor) -> np.ndarray:
        """Convert property features to model input format."""
        feature_dicts = []
        
        for prop in properties:
            total_area = prop.total_area_sqm or prop.plot_area_sqm or prop.built_area_sqm
            land_area = prop.land_area_sqm or total_area
            # Feature schema must match training pipeline exactly:
            # NUMERIC: latitude, longitude, built_area_sqm, land_area_sqm, total_area_sqm,
            #          bedrooms, bathrooms, floors, year_built, data_quality_score
            # BINARY:  has_pool, has_ac, has_garden, has_fitted_kitchen
            # CATEGORICAL: region, property_type
            features = {
                "latitude": prop.latitude,
                "longitude": prop.longitude,
                "region": prop.region,
                "property_type": prop.property_type,
                "built_area_sqm": prop.built_area_sqm,
                "total_area_sqm": total_area,
                "land_area_sqm": land_area,
                "bedrooms": prop.bedrooms,
                "bathrooms": prop.bathrooms,
                "floors": prop.floors,
                "year_built": prop.year_built or 2000,
                "data_quality_score": 50,  # neutral default
                "has_pool": int(prop.has_pool),
                "has_ac": int(prop.has_ac),
                "has_garden": int(prop.has_garden),
                "has_fitted_kitchen": int(prop.has_fitted_kitchen),
            }
            feature_dicts.append(features)
        
        # Convert to DataFrame for preprocessing
        import pandas as pd
        df = pd.DataFrame(feature_dicts)
        
        # Apply preprocessing
        return preprocessor.transform(df)
    
    def _get_cache_key(self, features: PropertyFeatures) -> str:
        """Generate cache key for a property."""
        key_data = f"{features.latitude}:{features.longitude}:{features.property_type}:{features.built_area_sqm}"
        import hashlib
        return f"pred:{hashlib.md5(key_data.encode()).hexdigest()}"
    
    def _check_cache(self, properties: List[PropertyFeatures]) -> Dict[int, PredictionResult]:
        """Check cache for existing predictions."""
        if not self.redis:
            return {}
        
        cached = {}
        for i, prop in enumerate(properties):
            key = self._get_cache_key(prop)
            cached_value = self.redis.get(key)
            if cached_value:
                result = PredictionResult(**json.loads(cached_value))
                if result.price_band is None:
                    result.price_band = self._get_price_band(result.predicted_value_ghs)
                cached[i] = result
        
        return cached
    
    def _cache_predictions(self, properties: List[PropertyFeatures], predictions: List[PredictionResult]):
        """Cache predictions for future use."""
        if not self.redis:
            return
        
        for prop, pred in zip(properties, predictions):
            key = self._get_cache_key(prop)
            self.redis.setex(key, config.PREDICTION_CACHE_TTL, pred.model_dump_json())
    
    def predict(
        self,
        request: PredictionRequest,
        background_tasks: Optional[BackgroundTasks] = None
    ) -> PredictionResponse:
        """
        Make predictions for a batch of properties.
        Uses ensemble averaging with confidence intervals.
        """
        import time
        start_time = time.time()
        
        # Get model — prefer a per-type model if all properties share the same type
        model_data = None
        if request.properties:
            first_type = request.properties[0].property_type
            all_same_type = all(
                p.property_type == first_type for p in request.properties
            )
            if all_same_type:
                group = _resolve_property_type_group(first_type)
                if group:
                    version_key = request.model_version or self.registry.active_version
                    per_type = self.registry.get_per_type_model(version_key, group)
                    if per_type:
                        model_data = per_type
                        logger.info(f"Routing batch to per-type model: {group}")

        if model_data is None:
            model_data = self.registry.get_model(request.model_version)
        model = model_data["model"]
        preprocessor = model_data["preprocessor"]
        metadata = model_data["metadata"]
        
        # Check cache
        cached_predictions = self._check_cache(request.properties)
        
        # Filter properties that need prediction
        props_to_predict = [
            (i, p) for i, p in enumerate(request.properties)
            if i not in cached_predictions
        ]
        
        predictions: Dict[int, PredictionResult] = dict(cached_predictions)
        
        if props_to_predict:
            # Preprocess features
            indices, props = zip(*props_to_predict)
            X = self._preprocess_features(list(props), preprocessor)
            
            # Make predictions
            if "ensemble" in model_data:
                # Ensemble prediction
                ensemble = model_data["ensemble"]
                weights = ensemble["weights"]
                
                pred_rf = ensemble["random_forest"].predict(X)
                pred_gb = ensemble["gradient_boosting"].predict(X)
                pred_nn = ensemble["neural_network"].predict(X).flatten()
                
                # Weighted average
                final_predictions = (
                    weights.get("random_forest", 0.4) * pred_rf +
                    weights.get("gradient_boosting", 0.35) * pred_gb +
                    weights.get("neural_network", 0.25) * pred_nn
                )
                
                # Calculate confidence intervals using prediction variance
                prediction_std = np.std([pred_rf, pred_gb, pred_nn], axis=0)
                confidence_low = final_predictions - 1.96 * prediction_std
                confidence_high = final_predictions + 1.96 * prediction_std
                
            else:
                # Single model prediction
                final_predictions = model.predict(X)
                confidence_low = final_predictions * 0.85  # Default 15% uncertainty
                confidence_high = final_predictions * 1.15
                prediction_std = final_predictions * 0.15
            
            # Get current exchange rate
            exchange_rate = request.properties[0].exchange_rate_usd or 15.0
            
            # Create prediction results
            for idx, (i, prop) in enumerate(props_to_predict):
                pred_ghs = float(final_predictions[idx])
                
                result = PredictionResult(
                    predicted_value_ghs=round(pred_ghs, 2),
                    predicted_value_usd=round(pred_ghs / exchange_rate, 2),
                    price_band=self._get_price_band(pred_ghs),
                    confidence_low=round(float(confidence_low[idx]), 2) if request.include_confidence else None,
                    confidence_high=round(float(confidence_high[idx]), 2) if request.include_confidence else None,
                    confidence_score=round(1 - (float(prediction_std[idx]) / pred_ghs), 4) if request.include_confidence else None,
                )
                
                predictions[i] = result
        
        # Sort predictions back to original order
        ordered_predictions = [predictions[i] for i in range(len(request.properties))]
        
        # Cache new predictions
        if background_tasks and props_to_predict:
            background_tasks.add_task(
                self._cache_predictions,
                [p for _, p in props_to_predict],
                [predictions[i] for i, _ in props_to_predict]
            )

        # Persist every live prediction to ml_predictions for monitoring
        if background_tasks and ordered_predictions:
            background_tasks.add_task(
                self._persist_predictions,
                request.properties,
                ordered_predictions,
                model_data["version"],
            )
        
        prediction_time_ms = (time.time() - start_time) * 1000
        
        return PredictionResponse(
            predictions=ordered_predictions,
            model_version=model_data["version"],
            model_type=metadata.get("model_type", "ensemble"),
            prediction_time_ms=round(prediction_time_ms, 2),
            batch_size=len(request.properties),
            timestamp=datetime.now(),
            data_quality=self._build_data_quality_disclosure(metadata),
        )

    def _build_data_quality_disclosure(self, metadata: dict) -> DataQualityDisclosure:
        """Build the data-quality transparency block from model metadata."""
        metrics = metadata.get("metrics", {})
        samples = int(metrics.get("samples_used", metadata.get("training_samples", 0)))
        r2 = float(metrics.get("r2", 0.0))
        trained_at = metadata.get("trained_at", "")[:10]  # YYYY-MM-DD

        # Grade the quality so callers can act on it
        if samples >= 5000 and r2 >= 0.70:
            caveat = (
                f"AVM estimate based on {samples:,} transactions. "
                f"R\u00b2={r2:.2f} — suitable for indicative pricing."
            )
        elif samples >= 1000 and r2 >= 0.40:
            caveat = (
                f"AVM estimate based on {samples:,} transactions (R\u00b2={r2:.2f}). "
                "Treat as a directional guide; commission a professional valuation for "
                "mortgage or legal purposes."
            )
        else:
            caveat = (
                f"EXPERIMENTAL — model trained on only {samples:,} samples "
                f"(R\u00b2={r2:.2f}). Predictions carry high uncertainty and must not "
                "be used for financial decisions without independent verification."
            )

        return DataQualityDisclosure(
            training_samples=samples,
            model_r2=round(r2, 4),
            last_trained=trained_at,
            coverage="Ghana — all property types",
            caveat=caveat,
        )

    def _get_price_band(self, value_ghs: float) -> str:
        if value_ghs < 100_000:   return "under_100k"
        if value_ghs < 300_000:   return "100k_300k"
        if value_ghs < 600_000:   return "300k_600k"
        if value_ghs < 1_000_000: return "600k_1m"
        if value_ghs < 3_000_000: return "1m_3m"
        return "over_3m"

    def _persist_predictions(
        self,
        properties: List,
        predictions: List[PredictionResult],
        model_version: str,
    ) -> None:
        """Write each prediction to ml_predictions (fire-and-forget background task)."""
        import asyncio
        import uuid as _uuid

        async def _do_insert() -> None:
            try:
                from .services.database import async_db as _db
            except ImportError:
                try:
                    from services.database import async_db as _db
                except ImportError:
                    return

            if not getattr(_db, "_pool", None):
                return

            rows = []
            for prop, pred in zip(properties, predictions):
                rows.append((
                    str(_uuid.uuid4()),
                    getattr(prop, "property_id", None),
                    model_version,
                    getattr(prop, "property_type", None),
                    getattr(prop, "region", None),
                    self._get_price_band(pred.predicted_value_ghs),
                    float(pred.predicted_value_ghs),
                    float(pred.confidence_score) if pred.confidence_score is not None else None,
                    json.dumps({
                        "bedrooms": getattr(prop, "bedrooms", None),
                        "bathrooms": getattr(prop, "bathrooms", None),
                        "built_area_sqm": getattr(prop, "built_area_sqm", None),
                        "total_area_sqm": getattr(prop, "total_area_sqm", None),
                        "latitude": getattr(prop, "latitude", None),
                        "longitude": getattr(prop, "longitude", None),
                    }),
                ))

            try:
                await _db.executemany(
                    """INSERT INTO ml_predictions
                       (prediction_id, property_id, model_version, property_type, region,
                        price_band, predicted_value, confidence, features)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
                       ON CONFLICT DO NOTHING""",
                    rows,
                )
                logger.debug(f"Persisted {len(rows)} prediction(s) to ml_predictions")
            except Exception as exc:
                logger.warning(f"Failed to persist predictions to ml_predictions: {exc}")

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(_do_insert())
            else:
                loop.run_until_complete(_do_insert())
        except Exception as exc:
            logger.warning(f"_persist_predictions scheduling error: {exc}")

# =====================================================
# FASTAPI APPLICATION
# =====================================================

app = FastAPI(
    title="PROPMETRIK ML Model Serving API",
    description="Property valuation model serving with ensemble predictions and ML analytics",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# REGISTER ML ANALYTICS ROUTERS
# =====================================================

try:
    from .routes import all_ml_routers
    for router in all_ml_routers:
        app.include_router(router)
    logger.info(f"Registered {len(all_ml_routers)} ML analytics routers")
except ImportError:
    # Fallback for running main.py directly
    try:
        from routes import all_ml_routers
        for router in all_ml_routers:
            app.include_router(router)
        logger.info(f"Registered {len(all_ml_routers)} ML analytics routers")
    except ImportError as e:
        logger.warning(f"ML analytics routes not available: {e}")

# Initialize services
redis_client = None
try:
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        redis_client = redis.from_url(redis_url, decode_responses=True)
    else:
        redis_client = redis.Redis(
            host=config.REDIS_HOST,
            port=config.REDIS_PORT,
            decode_responses=True
        )
    redis_client.ping()
    logger.info("Connected to Redis")
except Exception as e:
    logger.warning(f"Redis not available, caching disabled: {e}")
    redis_client = None

model_registry = ModelRegistry(config.MODEL_STORAGE_PATH, redis_client)
prediction_service = PredictionService(model_registry, redis_client)

# =====================================================
# AUTO-RETRAINING SCHEDULER
# =====================================================

import asyncio
import subprocess
import uuid as _uuid_mod

class AutoRetrainScheduler:
    """
    Background asyncio task that triggers model retraining automatically based
    on two conditions (whichever comes first):

    1. **Time** — every RETRAIN_INTERVAL_HOURS hours since the last trained
       model was created.
    2. **Data growth** — the number of qualifying properties in the DB has
       grown by at least RETRAIN_NEW_PROPERTY_THRESHOLD since the samples
       count recorded in the active model's metadata.

    The scheduler wakes every RETRAIN_CHECK_INTERVAL_HOURS to re-evaluate.
    The first wake-up happens after a short delay (10 min) so it can catch an
    overdue condition without waiting a full cycle.
    """

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._running_pid: Optional[int] = None
        self._db = None   # injected at startup

    def start(self, db) -> None:
        """Start the background scheduler task."""
        if not config.AUTO_RETRAIN_ENABLED:
            logger.info("Auto-retraining scheduler disabled (AUTO_RETRAIN_ENABLED=false)")
            return
        self._db = db
        self._task = asyncio.get_event_loop().create_task(self._loop())
        logger.info(
            f"Auto-retraining scheduler started — interval {config.RETRAIN_INTERVAL_HOURS}h, "
            f"data-growth threshold {config.RETRAIN_NEW_PROPERTY_THRESHOLD} properties, "
            f"check every {config.RETRAIN_CHECK_INTERVAL_HOURS}h"
        )

    def stop(self) -> None:
        """Cancel the background task on shutdown."""
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Auto-retraining scheduler stopped")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _latest_model_metadata(self) -> Optional[dict]:
        """Read metadata.json for the active (latest) model version."""
        try:
            storage = Path(config.MODEL_STORAGE_PATH)
            # Resolve "latest" symlink or pick newest timestamped dir
            candidate = storage / "latest"
            if candidate.is_symlink() or candidate.is_dir():
                meta_path = candidate / "metadata.json"
            else:
                dirs = sorted(
                    [d for d in storage.iterdir() if d.is_dir()],
                    key=lambda d: d.name,
                    reverse=True,
                )
                if not dirs:
                    return None
                meta_path = dirs[0] / "metadata.json"
            if not meta_path.exists():
                return None
            with meta_path.open() as f:
                return json.load(f)
        except Exception as exc:
            logger.warning(f"Could not read model metadata for scheduler: {exc}")
            return None

    async def _current_property_count(self) -> Optional[int]:
        """Query the DB for current qualifying property count."""
        if self._db is None:
            return None
        try:
            val = await self._db.fetchval(
                "SELECT COUNT(*) FROM properties "
                "WHERE price IS NOT NULL AND price > 0 AND latitude IS NOT NULL"
            )
            return int(val) if val is not None else None
        except Exception as exc:
            logger.warning(f"Auto-retrain: DB count query failed: {exc}")
            return None

    def _should_retrain(
        self, metadata: Optional[dict], current_count: Optional[int]
    ) -> tuple[bool, str]:
        """Return (should_retrain, reason)."""
        if metadata is None:
            return True, "no model metadata found — first-time training"

        # --- Time trigger ---
        try:
            trained_at = datetime.fromisoformat(metadata["trained_at"])
            age_hours = (datetime.utcnow() - trained_at).total_seconds() / 3600
            if age_hours >= config.RETRAIN_INTERVAL_HOURS:
                return True, (
                    f"model is {age_hours:.1f}h old "
                    f"(threshold {config.RETRAIN_INTERVAL_HOURS}h)"
                )
        except Exception:
            pass

        # --- Data-growth trigger ---
        if current_count is not None:
            samples_at_train = metadata.get("metrics", {}).get("samples_used", 0)
            new_properties = current_count - samples_at_train
            if new_properties >= config.RETRAIN_NEW_PROPERTY_THRESHOLD:
                return True, (
                    f"{new_properties} new qualifying properties since last train "
                    f"(threshold {config.RETRAIN_NEW_PROPERTY_THRESHOLD})"
                )

        return False, "conditions not met"

    async def _fire_retrain(self, reason: str) -> None:
        """Launch training/train_pipeline as a background subprocess."""
        # Don't start a second job while one is still running
        if self._running_pid is not None:
            try:
                import os as _os
                _os.kill(self._running_pid, 0)   # 0 = check existence, no signal
                logger.info(
                    f"Auto-retrain skipped (pid {self._running_pid} still running)"
                )
                return
            except OSError:
                self._running_pid = None   # process finished, clear stale pid

        python = Path(__file__).parent / ".venv" / "bin" / "python"
        if not python.exists():
            python = Path(__file__).parent / ".venv" / "bin" / "python3"
        python_str = str(python) if python.exists() else "python3"

        job_id = _uuid_mod.uuid4().hex[:12]
        log_file = f"/tmp/retrain-auto-{job_id}.log"

        logger.info(f"Auto-retrain triggered — reason: {reason} — log: {log_file}")

        try:
            proc = await asyncio.create_subprocess_exec(
                python_str, "-m", "training.train_pipeline", "--no-tune",
                cwd=str(Path(__file__).parent),
                stdout=open(log_file, "w"),
                stderr=subprocess.STDOUT,
            )
            self._running_pid = proc.pid
            logger.info(f"Auto-retrain subprocess started (pid {proc.pid})")
        except Exception as exc:
            logger.error(f"Auto-retrain failed to start: {exc}")

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        """Wake every RETRAIN_CHECK_INTERVAL_HOURS; first wake after 10 min."""
        initial_delay = 600   # 10 minutes — catches overdue condition quickly
        check_interval = config.RETRAIN_CHECK_INTERVAL_HOURS * 3600

        await asyncio.sleep(initial_delay)

        while True:
            try:
                metadata = self._latest_model_metadata()
                current_count = await self._current_property_count()
                should, reason = self._should_retrain(metadata, current_count)

                logger.info(
                    f"Auto-retrain check: properties={current_count}, "
                    f"should_retrain={should}, reason={reason}"
                )

                if should:
                    await self._fire_retrain(reason)

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error(f"Auto-retrain scheduler error: {exc}")

            await asyncio.sleep(check_interval)


auto_retrain_scheduler = AutoRetrainScheduler()

# =====================================================
# API ENDPOINTS
# =====================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    redis_ok = False
    try:
        if redis_client is not None:
            redis_ok = redis_client.ping()
    except Exception:
        redis_ok = False

    return {
        "status": "healthy",
        "redis_connected": redis_ok,
        "active_model": model_registry.active_version,
        "timestamp": datetime.now().isoformat()
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest, background_tasks: BackgroundTasks):
    """
    Make property value predictions.
    
    Accepts a batch of properties and returns predicted values in GHS and USD
    with confidence intervals.
    """
    if len(request.properties) > config.MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds maximum of {config.MAX_BATCH_SIZE}"
        )
    
    try:
        return prediction_service.predict(request, background_tasks)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail="Prediction failed")


@app.get("/models", response_model=List[ModelInfo])
async def list_models():
    """List all available model versions."""
    versions = model_registry.list_versions()
    return [model_registry.get_model_info(v) for v in versions]


@app.get("/models/{version}", response_model=ModelInfo)
async def get_model(version: str):
    """Get information about a specific model version."""
    try:
        return model_registry.get_model_info(version)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Model version {version} not found")


@app.post("/models/{version}/activate")
async def activate_model(version: str):
    """Set a model version as the active version for predictions."""
    try:
        model_registry.set_active_version(version)
        return {"status": "success", "active_version": version}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Model version {version} not found")


@app.get("/models/{version}/metrics", response_model=ModelMetrics)
async def get_model_metrics(version: str):
    """Get performance metrics for a model version."""
    try:
        model_data = model_registry.get_model(version)
        metrics = model_data["metadata"].get("metrics", {})
        return ModelMetrics(
            mae=metrics.get("mae", 0),
            rmse=metrics.get("rmse", 0),
            mape=metrics.get("mape", 0),
            r2=metrics.get("r2", 0),
            samples_used=metrics.get("samples_used", 0),
            last_updated=datetime.fromisoformat(
                model_data["metadata"].get("trained_at", datetime.now().isoformat())
            )
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Model version {version} not found")


# =====================================================
# STARTUP AND SHUTDOWN
# =====================================================

@app.on_event("startup")
async def startup():
    """Initialize the application on startup."""
    logger.info("Starting PROPMETRIK ML Model Serving API")
    
    # Initialize ML analytics database pool
    try:
        from .services.database import async_db
    except ImportError:
        try:
            from services.database import async_db
        except ImportError:
            async_db = None
    
    if async_db:
        try:
            import asyncio
            await asyncio.wait_for(async_db.initialize(), timeout=5.0)
            logger.info("ML analytics database pool initialized")
        except asyncio.TimeoutError:
            logger.warning("ML analytics database connection timed out — continuing without DB pool")
        except Exception as e:
            logger.warning(f"ML analytics database not available: {e}")
    
    # Try to load the latest model
    try:
        model_registry.load_model("latest")
        logger.info("Loaded latest model on startup")
    except FileNotFoundError:
        logger.warning("No models found on startup, predictions will fail until a model is loaded")
    except Exception as e:
        logger.warning(f"Model warm-up skipped during startup: {e}")

    # Wire ModelRegistry into monitoring service so it can read real model artifacts
    try:
        from .services.model_monitoring import model_monitoring_service as _mms
    except ImportError:
        try:
            from services.model_monitoring import model_monitoring_service as _mms
        except ImportError:
            _mms = None
    if _mms is not None:
        _mms.set_model_registry(model_registry)
        logger.info("ModelRegistry wired into monitoring service")

    # Start automatic retraining scheduler
    _db_for_scheduler = None
    try:
        from .services.database import async_db as _adb
        _db_for_scheduler = _adb
    except ImportError:
        try:
            from services.database import async_db as _adb
            _db_for_scheduler = _adb
        except ImportError:
            pass
    auto_retrain_scheduler.start(_db_for_scheduler)


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown."""
    logger.info("Shutting down PROPMETRIK ML Model Serving API")
    
    # Close ML analytics database pool
    try:
        from .services.database import async_db
    except ImportError:
        try:
            from services.database import async_db
        except ImportError:
            async_db = None
    
    if async_db:
        try:
            await async_db.close()
            logger.info("ML analytics database pool closed")
        except Exception:
            pass
    
    auto_retrain_scheduler.stop()

    if redis_client:
        redis_client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
