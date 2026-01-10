#!/usr/bin/env python3
"""
Simple Test Start Script for PROPMETRIK Python Valuation Engine
Bypasses database connections for testing the API integration
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Simple FastAPI app for testing
app = FastAPI(
    title="PROPMETRIK Test Valuation Engine",
    description="Test version of Ghana's property valuation service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "PROPMETRIK Test Python Valuation Engine",
        "version": "1.0.0",
        "environment": "test",
        "database": "mocked",
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "PROPMETRIK Test Python Valuation Engine",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }

@app.post("/api/v1/valuations")
async def create_valuation(request: dict):
    """Mock valuation endpoint for testing integration"""
    property_data = request.get('property', {})
    
    # Mock valuation results
    estimated_value = 850000  # Mock value for Ghana property
    confidence_score = 0.85
    
    return {
        "success": True,
        "data": {
            "estimated_value": estimated_value,
            "confidence_score": confidence_score,
            "value_range": {
                "low": int(estimated_value * 0.9),
                "high": int(estimated_value * 1.1)
            },
            "methods_used": [
                "sales_comparison",
                "cost_approach",
                "income_approach"
            ],
            "primary_method": "sales_comparison",
            "engine_version": "1.0.0-test",
            "valuation_date": "2024-01-15",
            "property": property_data,
            "market_conditions": {
                "region": property_data.get('region', 'greater_accra'),
                "market_trend": "stable",
                "supply_demand_ratio": 0.85
            }
        },
        "meta": {
            "duration_ms": 1250,
            "comparables_analyzed": 12,
            "data_completeness": 0.88
        }
    }

if __name__ == "__main__":
    print("🏗️  PROPMETRIK Python Valuation Engine - TEST MODE")
    print("==================================================")
    print("⚠️  This is a simplified test version for API integration testing")
    print("")
    print("🚀 Starting test server...")
    print("   Environment: test")
    print("   Port: 8001")
    print("   Database: mocked")
    print("")
    print("📍 Service will be available at:")
    print("   API: http://localhost:8001")
    print("   Health Check: http://localhost:8001/health")
    print("   API Docs: http://localhost:8001/docs")
    print("📂 New Location: backend/src/services/valuation-engine/python/")
    print("")
    print("🔄 To stop the service, press Ctrl+C")
    print("==================================================")
    
    uvicorn.run(
        "simple_start:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        log_level="info",
    )