"""
ML Model Serving Client
Python client for interacting with ML Model Serving API.
Provides property value predictions using ensemble ML models.
"""

import asyncio
import httpx
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field
import os
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# TYPES
# ============================================================================

class PropertyFeatures(BaseModel):
    """Property features for ML prediction"""
    # Location
    latitude: float = Field(..., description="Property latitude")
    longitude: float = Field(..., description="Property longitude")
    region: str = Field(..., description="Ghana region")
    district: str = Field(..., description="District/city")
    neighborhood: Optional[str] = Field(None, description="Neighborhood/estate")
    
    # Property characteristics
    property_type: str = Field(..., description="Property type")
    built_area_sqm: float = Field(..., ge=0, description="Built area in sqm")
    plot_area_sqm: Optional[float] = Field(None, ge=0, description="Plot area in sqm")
    bedrooms: int = Field(..., ge=0, description="Number of bedrooms")
    bathrooms: int = Field(..., ge=0, description="Number of bathrooms")
    floors: int = Field(..., ge=1, description="Number of floors")
    year_built: Optional[int] = Field(None, description="Year built")
    
    # Condition and quality
    condition_score: float = Field(..., ge=0, le=10, description="Condition score (0-10)")
    quality_score: float = Field(..., ge=0, le=10, description="Quality score (0-10)")
    
    # Amenities (boolean flags)
    has_parking: bool = Field(False, description="Has parking/garage")
    has_security: bool = Field(False, description="Has security features")
    has_pool: bool = Field(False, description="Has swimming pool")
    has_generator: bool = Field(False, description="Has generator")
    has_borehole: bool = Field(False, description="Has borehole/well")
    
    # Floor plan data
    building_efficiency: Optional[float] = Field(None, ge=0, le=1, description="Building efficiency ratio")
    layout_quality_score: Optional[float] = Field(None, ge=0, le=10, description="Layout quality score")
    
    # Economic factors
    inflation_rate: Optional[float] = Field(None, description="Current inflation rate")
    exchange_rate_usd: Optional[float] = Field(None, description="USD exchange rate")


class PredictionRequest(BaseModel):
    """ML prediction request"""
    properties: List[PropertyFeatures] = Field(..., description="Properties to predict")
    model_version: Optional[str] = Field(None, description="Specific model version to use")
    include_confidence: bool = Field(True, description="Include confidence intervals")
    include_feature_importance: bool = Field(False, description="Include feature importance")


class PredictionResult(BaseModel):
    """Individual prediction result"""
    predicted_value_ghs: float = Field(..., description="Predicted value in GHS")
    predicted_value_usd: float = Field(..., description="Predicted value in USD")
    confidence_low: Optional[float] = Field(None, description="Confidence interval low")
    confidence_high: Optional[float] = Field(None, description="Confidence interval high")
    confidence_score: Optional[float] = Field(None, ge=0, le=1, description="Prediction confidence score")
    feature_importance: Optional[Dict[str, float]] = Field(None, description="Feature importance weights")


class PredictionResponse(BaseModel):
    """ML prediction response"""
    predictions: List[PredictionResult] = Field(..., description="Prediction results")
    model_version: str = Field(..., description="Model version used")
    model_type: str = Field(..., description="Model type/algorithm")
    prediction_time_ms: float = Field(..., description="Prediction time in milliseconds")
    batch_size: int = Field(..., description="Number of properties predicted")
    timestamp: datetime = Field(..., description="Prediction timestamp")


class ModelMetrics(BaseModel):
    """Model performance metrics"""
    mae: float = Field(..., description="Mean Absolute Error")
    rmse: float = Field(..., description="Root Mean Square Error")
    mape: float = Field(..., description="Mean Absolute Percentage Error")
    r2: float = Field(..., description="R-squared score")
    samples_used: int = Field(..., description="Number of samples used for evaluation")
    last_updated: datetime = Field(..., description="Last metrics update")


class ModelInfo(BaseModel):
    """ML model information"""
    name: str = Field(..., description="Model name")
    version: str = Field(..., description="Model version")
    model_type: str = Field(..., description="Model algorithm type")
    trained_at: datetime = Field(..., description="Training timestamp")
    metrics: ModelMetrics = Field(..., description="Model performance metrics")
    feature_names: List[str] = Field(..., description="Feature names used by model")
    is_active: bool = Field(..., description="Is currently active model")


class HealthStatus(BaseModel):
    """Service health status"""
    status: str = Field(..., description="Service status")
    redis_connected: bool = Field(..., description="Redis connection status")
    active_model: str = Field(..., description="Currently active model")
    timestamp: datetime = Field(..., description="Health check timestamp")


# ============================================================================
# ML SERVING CLIENT
# ============================================================================

class MLServingClient:
    """
    Python client for ML Model Serving API
    
    Provides async methods for property value prediction using ML models.
    Supports batch predictions, model management, and health monitoring.
    """
    
    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize ML Serving Client
        
        Args:
            base_url: ML serving API base URL, defaults to env var or localhost
        """
        self.base_url = base_url or os.getenv("ML_SERVING_URL", "http://localhost:8000")
        self.timeout = httpx.Timeout(30.0)
        
        # HTTP client will be initialized per request (async context)
        logger.info(f"MLServingClient initialized with base_url: {self.base_url}")
    
    async def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make HTTP request to ML serving API"""
        url = f"{self.base_url}{endpoint}"
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    json=json_data,
                    params=params,
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                return response.json()
                
            except httpx.HTTPStatusError as e:
                error_detail = e.response.json().get("detail", str(e)) if e.response else str(e)
                logger.error(f"ML Serving API Error: {error_detail}")
                raise Exception(f"ML API Error: {error_detail}")
                
            except httpx.RequestError as e:
                logger.error(f"ML Serving Request Error: {e}")
                raise Exception(f"ML API Request Error: {e}")
    
    async def health_check(self) -> HealthStatus:
        """
        Check ML serving service health
        
        Returns:
            HealthStatus with service status and active model info
        """
        response_data = await self._make_request("GET", "/health")
        return HealthStatus(**response_data)
    
    async def predict(self, request: PredictionRequest) -> PredictionResponse:
        """
        Get property value predictions for multiple properties
        
        Args:
            request: Prediction request with property features
            
        Returns:
            PredictionResponse with results for all properties
        """
        request_data = request.model_dump()
        response_data = await self._make_request("POST", "/predict", json_data=request_data)
        return PredictionResponse(**response_data)
    
    async def predict_single(
        self,
        property_features: PropertyFeatures,
        model_version: Optional[str] = None,
        include_confidence: bool = True,
        include_feature_importance: bool = False
    ) -> PredictionResult:
        """
        Get prediction for a single property
        
        Args:
            property_features: Property features for prediction
            model_version: Specific model version to use
            include_confidence: Include confidence intervals
            include_feature_importance: Include feature importance weights
            
        Returns:
            PredictionResult for the single property
        """
        request = PredictionRequest(
            properties=[property_features],
            model_version=model_version,
            include_confidence=include_confidence,
            include_feature_importance=include_feature_importance
        )
        
        response = await self.predict(request)
        return response.predictions[0]
    
    async def list_models(self) -> List[ModelInfo]:
        """
        List all available model versions
        
        Returns:
            List of ModelInfo objects
        """
        response_data = await self._make_request("GET", "/models")
        return [ModelInfo(**model_data) for model_data in response_data]
    
    async def get_model(self, version: str) -> ModelInfo:
        """
        Get information about a specific model version
        
        Args:
            version: Model version identifier
            
        Returns:
            ModelInfo for the specified version
        """
        response_data = await self._make_request("GET", f"/models/{version}")
        return ModelInfo(**response_data)
    
    async def activate_model(self, version: str) -> Dict[str, str]:
        """
        Activate a specific model version
        
        Args:
            version: Model version to activate
            
        Returns:
            Status response with active version info
        """
        return await self._make_request("POST", f"/models/{version}/activate")
    
    async def get_model_metrics(self, version: str) -> ModelMetrics:
        """
        Get performance metrics for a specific model version
        
        Args:
            version: Model version identifier
            
        Returns:
            ModelMetrics with performance statistics
        """
        response_data = await self._make_request("GET", f"/models/{version}/metrics")
        return ModelMetrics(**response_data)
    
    # ========================================================================
    # CONVERSION UTILITIES
    # ========================================================================
    
    @staticmethod
    def property_to_features(property_data: Dict[str, Any]) -> PropertyFeatures:
        """
        Convert property from valuation format to ML prediction format
        
        Args:
            property_data: Property data in valuation system format
            
        Returns:
            PropertyFeatures ready for ML prediction
        """
        amenities = property_data.get('amenities', [])
        amenities_str = [str(a).lower() for a in amenities] if amenities else []
        
        return PropertyFeatures(
            latitude=property_data['latitude'],
            longitude=property_data['longitude'],
            region=property_data['region'],
            district=property_data.get('address_district', 'Unknown'),
            neighborhood=property_data.get('neighborhood'),
            property_type=property_data['property_type'],
            built_area_sqm=property_data.get('built_area_sqm', 100.0),
            plot_area_sqm=property_data.get('plot_area_sqm') or property_data.get('built_area_sqm'),
            bedrooms=property_data.get('bedrooms', 0),
            bathrooms=property_data.get('bathrooms', 0),
            floors=property_data.get('floors', 1),
            year_built=property_data.get('year_built'),
            condition_score=MLServingClient._condition_to_score(property_data.get('condition')),
            quality_score=property_data.get('data_quality_score', 5.0),
            has_parking=any('parking' in a or 'garage' in a for a in amenities_str),
            has_security=any('security' in a or 'guard' in a for a in amenities_str),
            has_pool=any('pool' in a or 'swimming' in a for a in amenities_str),
            has_generator=any('generator' in a or 'backup power' in a for a in amenities_str),
            has_borehole=any('borehole' in a or 'well' in a for a in amenities_str),
            building_efficiency=property_data.get('building_efficiency'),
            layout_quality_score=property_data.get('layout_quality_score'),
            inflation_rate=property_data.get('inflation_rate'),
            exchange_rate_usd=property_data.get('exchange_rate_usd')
        )
    
    @staticmethod
    def _condition_to_score(condition: Optional[str]) -> float:
        """
        Convert condition string to numeric score
        
        Args:
            condition: Condition description
            
        Returns:
            Numeric condition score (0-10)
        """
        condition_scores = {
            'new': 10.0,
            'excellent': 9.0,
            'very_good': 8.0,
            'good': 7.0,
            'fair': 5.0,
            'poor': 3.0,
            'renovation_needed': 2.0,
            'very_poor': 1.0
        }
        
        if not condition:
            return 5.0
            
        condition_lower = condition.lower().replace(' ', '_')
        return condition_scores.get(condition_lower, 5.0)


# ============================================================================
# SINGLETON INSTANCE & SYNC WRAPPER
# ============================================================================

# Global client instance
_ml_client = MLServingClient()

def get_ml_client() -> MLServingClient:
    """Get the global ML serving client instance"""
    return _ml_client

# Sync wrapper functions for compatibility
def predict_property_value(property_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous wrapper for property value prediction
    
    Args:
        property_data: Property data dictionary
        
    Returns:
        Prediction result dictionary
    """
    async def _predict():
        client = get_ml_client()
        features = MLServingClient.property_to_features(property_data)
        result = await client.predict_single(features)
        return result.model_dump()
    
    # Run async function in event loop
    try:
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(_predict())
    except RuntimeError:
        # Create new event loop if none exists
        return asyncio.run(_predict())

def check_ml_service_health() -> Dict[str, Any]:
    """
    Synchronous wrapper for ML service health check
    
    Returns:
        Health status dictionary
    """
    async def _health_check():
        client = get_ml_client()
        status = await client.health_check()
        return status.model_dump()
    
    try:
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(_health_check())
    except RuntimeError:
        return asyncio.run(_health_check())


# ============================================================================
# EXPORT
# ============================================================================

__all__ = [
    'MLServingClient',
    'PropertyFeatures',
    'PredictionRequest', 
    'PredictionResult',
    'PredictionResponse',
    'ModelInfo',
    'ModelMetrics',
    'HealthStatus',
    'get_ml_client',
    'predict_property_value',
    'check_ml_service_health'
]