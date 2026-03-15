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
    """Expose training classes for joblib unpickling without hard-failing app startup."""
    try:
        import training.train_pipeline as training_pipeline
    except Exception as error:
        logger.warning("Training pipeline import unavailable during startup", exc_info=error)
        return

    for name in dir(training_pipeline):
        obj = getattr(training_pipeline, name)
        if isinstance(obj, type):
            globals()[name] = obj

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
    district: str
    neighborhood: Optional[str] = None
    
    # Property characteristics
    property_type: str = Field(..., description="residential, commercial, land, industrial")
    built_area_sqm: float = Field(..., ge=0)
    plot_area_sqm: Optional[float] = Field(None, ge=0)
    bedrooms: int = Field(0, ge=0)
    bathrooms: int = Field(0, ge=0)
    floors: int = Field(1, ge=1)
    year_built: Optional[int] = None
    
    # Condition and quality
    condition_score: float = Field(5.0, ge=1, le=10)
    quality_score: float = Field(5.0, ge=1, le=10)
    
    # Amenities
    has_parking: bool = False
    has_security: bool = False
    has_pool: bool = False
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
    confidence_low: Optional[float] = None
    confidence_high: Optional[float] = None
    confidence_score: Optional[float] = None
    feature_importance: Optional[Dict[str, float]] = None


class PredictionResponse(BaseModel):
    """Response containing predictions."""
    predictions: List[PredictionResult]
    model_version: str
    model_type: str
    prediction_time_ms: float
    batch_size: int
    timestamp: datetime


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

# =====================================================
# PREDICTION SERVICE
# =====================================================

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
            features = {
                "latitude": prop.latitude,
                "longitude": prop.longitude,
                "region": prop.region,
                "district": prop.district,
                "property_type": prop.property_type,
                "built_area_sqm": prop.built_area_sqm,
                "plot_area_sqm": prop.plot_area_sqm or prop.built_area_sqm,
                "bedrooms": prop.bedrooms,
                "bathrooms": prop.bathrooms,
                "floors": prop.floors,
                "year_built": prop.year_built or 2000,
                "condition_score": prop.condition_score,
                "quality_score": prop.quality_score,
                "has_parking": int(prop.has_parking),
                "has_security": int(prop.has_security),
                "has_pool": int(prop.has_pool),
                "has_generator": int(prop.has_generator),
                "has_borehole": int(prop.has_borehole),
                "building_efficiency": prop.building_efficiency or 0.85,
                "layout_quality_score": prop.layout_quality_score or 75,
                "inflation_rate": prop.inflation_rate or 20.0,
                "exchange_rate_usd": prop.exchange_rate_usd or 15.0,
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
                cached[i] = PredictionResult(**json.loads(cached_value))
        
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
        
        # Get model
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
        
        prediction_time_ms = (time.time() - start_time) * 1000
        
        return PredictionResponse(
            predictions=ordered_predictions,
            model_version=model_data["version"],
            model_type=metadata.get("model_type", "ensemble"),
            prediction_time_ms=round(prediction_time_ms, 2),
            batch_size=len(request.properties),
            timestamp=datetime.now()
        )

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
            await async_db.initialize()
            logger.info("ML analytics database pool initialized")
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
    
    if redis_client:
        redis_client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
