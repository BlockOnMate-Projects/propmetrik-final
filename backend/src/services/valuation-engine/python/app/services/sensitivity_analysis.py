"""
Sensitivity Analysis Service
Python implementation for PROPMETRIK valuation engine

Handles sensitivity analysis, tornado charts, and Monte Carlo simulations
for all valuation methods with Ghana-specific parameters.
"""

import logging
from datetime import datetime, date
from typing import List, Optional, Dict, Any, Tuple, Union, Callable
from decimal import Decimal
import uuid
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel, Field
import numpy as np
import pandas as pd
from scipy import stats
import matplotlib.pyplot as plt
import seaborn as sns

from ..schemas import (
    GhanaRegion,
    PropertyType,
    ValuationMethod,
    ValuationPurpose
)

# Setup logging
logger = logging.getLogger(__name__)


# ============================================================================
# ENUMS AND TYPES
# ============================================================================

class AnalysisType(str, Enum):
    """Types of sensitivity analysis"""
    single_variable = "single_variable"
    two_variable = "two_variable"
    tornado = "tornado"
    monte_carlo = "monte_carlo"

class DistributionType(str, Enum):
    """Statistical distribution types"""
    normal = "normal"
    uniform = "uniform"
    triangular = "triangular"
    lognormal = "lognormal"
    beta = "beta"


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class SingleVariableConfig(BaseModel):
    """Configuration for single variable sensitivity analysis"""
    variable: str = Field(..., description="Variable name")
    base_value: float = Field(..., description="Base value")
    range_min: float = Field(..., description="Minimum value")
    range_max: float = Field(..., description="Maximum value")
    step_size: float = Field(..., description="Step size")

class TwoVariableConfig(BaseModel):
    """Configuration for two-variable data table analysis"""
    variable_x: Dict[str, Any] = Field(..., description="X-axis variable")
    variable_y: Dict[str, Any] = Field(..., description="Y-axis variable")

class MonteCarloVariable(BaseModel):
    """Monte Carlo simulation variable configuration"""
    name: str = Field(..., description="Variable name")
    distribution: DistributionType = Field(..., description="Distribution type")
    mean: Optional[float] = Field(None, description="Distribution mean")
    std: Optional[float] = Field(None, description="Standard deviation")
    min: Optional[float] = Field(None, description="Minimum value")
    max: Optional[float] = Field(None, description="Maximum value")
    mode: Optional[float] = Field(None, description="Mode value (for triangular)")

class MonteCarloConfig(BaseModel):
    """Configuration for Monte Carlo simulation"""
    iterations: int = Field(10000, description="Number of iterations")
    variables: List[MonteCarloVariable] = Field(..., description="Variables to simulate")
    seed: Optional[int] = Field(None, description="Random seed")

class TornadoVariable(BaseModel):
    """Tornado chart variable configuration"""
    name: str = Field(..., description="Variable name")
    base_value: float = Field(..., description="Base value")
    low_value: float = Field(..., description="Low scenario value")
    high_value: float = Field(..., description="High scenario value")

class TornadoConfig(BaseModel):
    """Configuration for tornado chart analysis"""
    variables: List[TornadoVariable] = Field(..., description="Variables to analyze")

class SingleVariableResult(BaseModel):
    """Results from single variable sensitivity analysis"""
    data_points: List[Dict[str, float]] = Field(..., description="Data points")
    elasticity: float = Field(..., description="Elasticity coefficient")
    breakeven_value: Optional[float] = Field(None, description="Breakeven value")
    correlation: float = Field(..., description="Correlation coefficient")

class TwoVariableResult(BaseModel):
    """Results from two-variable data table analysis"""
    matrix: List[List[float]] = Field(..., description="Results matrix")
    x_values: List[float] = Field(..., description="X-axis values")
    y_values: List[float] = Field(..., description="Y-axis values")
    min_value: float = Field(..., description="Minimum value")
    max_value: float = Field(..., description="Maximum value")

class TornadoBar(BaseModel):
    """Single bar in tornado chart"""
    variable: str = Field(..., description="Variable name")
    low_result: float = Field(..., description="Low scenario result")
    high_result: float = Field(..., description="High scenario result")
    impact: float = Field(..., description="Impact magnitude")
    impact_percentage: float = Field(..., description="Impact as percentage of base")

class TornadoResult(BaseModel):
    """Results from tornado chart analysis"""
    base_case_value: float = Field(..., description="Base case value")
    bars: List[TornadoBar] = Field(..., description="Tornado bars sorted by impact")
    total_variance: float = Field(..., description="Total variance explained")

class MonteCarloResult(BaseModel):
    """Results from Monte Carlo simulation"""
    mean: float = Field(..., description="Mean value")
    median: float = Field(..., description="Median value")
    std: float = Field(..., description="Standard deviation")
    percentiles: Dict[str, float] = Field(..., description="Percentile values")
    probability_below: List[Dict[str, float]] = Field(..., description="Probability below thresholds")
    confidence_intervals: Dict[str, Tuple[float, float]] = Field(..., description="Confidence intervals")
    var_5pct: float = Field(..., description="5% Value at Risk")
    var_1pct: float = Field(..., description="1% Value at Risk")

class SensitivityAnalysis(BaseModel):
    """Sensitivity analysis record"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    valuation_id: str = Field(..., description="Parent valuation ID")
    analysis_type: AnalysisType = Field(..., description="Type of analysis")
    valuation_method: ValuationMethod = Field(..., description="Valuation method analyzed")
    analysis_name: str = Field(..., description="Analysis name")
    description: Optional[str] = Field(None, description="Analysis description")
    
    # Configuration
    config: Union[SingleVariableConfig, TwoVariableConfig, MonteCarloConfig, TornadoConfig] = Field(..., description="Analysis configuration")
    
    # Results
    results: Union[SingleVariableResult, TwoVariableResult, MonteCarloResult, TornadoResult] = Field(..., description="Analysis results")
    
    # Summary metrics
    base_case_value: float = Field(..., description="Base case valuation")
    best_case_value: float = Field(..., description="Best case scenario")
    worst_case_value: float = Field(..., description="Worst case scenario")
    var_5pct: Optional[float] = Field(None, description="5% Value at Risk")
    
    # Metadata
    created_by: Optional[str] = Field(None, description="Created by user")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# ============================================================================
# SENSITIVITY ANALYSIS SERVICE
# ============================================================================

class SensitivityAnalysisService:
    """
    Service for conducting sensitivity analysis on Ghana property valuations.
    
    Features:
    - Single and two-variable sensitivity analysis
    - Tornado chart analysis for multiple variables
    - Monte Carlo simulation with various distributions
    - Value-at-Risk calculations
    - Ghana market-specific scenarios
    """
    
    def __init__(self):
        """Initialize the service"""
        self.ghana_market_scenarios = {
            "base": {"growth_rate": 0.08, "inflation": 0.12, "interest_rate": 0.20},
            "optimistic": {"growth_rate": 0.12, "inflation": 0.08, "interest_rate": 0.16},
            "pessimistic": {"growth_rate": 0.04, "inflation": 0.18, "interest_rate": 0.25}
        }
    
    # --------------------------------------------------------------------------
    # SINGLE VARIABLE ANALYSIS
    # --------------------------------------------------------------------------
    
    async def run_single_variable_analysis(
        self,
        valuation_id: str,
        method: ValuationMethod,
        config: SingleVariableConfig,
        calculator_func: Optional[Callable] = None
    ) -> SingleVariableResult:
        """Run single variable sensitivity analysis"""
        
        logger.info(f"Running single variable analysis for {config.variable}")
        
        # Generate values within range
        num_steps = int((config.range_max - config.range_min) / config.step_size) + 1
        variable_values = np.linspace(config.range_min, config.range_max, num_steps)
        
        data_points = []
        results = []
        
        # Calculate results for each variable value
        for value in variable_values:
            if calculator_func:
                result = calculator_func({config.variable: value})
            else:
                result = await self._mock_calculate_valuation(method, {config.variable: value})
            
            data_points.append({
                "variable_value": float(value),
                "result_value": float(result)
            })
            results.append(result)
        
        # Calculate elasticity
        elasticity = self._calculate_elasticity(variable_values, results, config.base_value)
        
        # Calculate correlation
        correlation = np.corrcoef(variable_values, results)[0, 1]
        
        # Find breakeven if applicable
        breakeven_value = self._find_breakeven(data_points) if any(r <= 0 for r in results) else None
        
        result = SingleVariableResult(
            data_points=data_points,
            elasticity=elasticity,
            breakeven_value=breakeven_value,
            correlation=correlation
        )
        
        logger.info(f"Single variable analysis completed: elasticity={elasticity:.3f}")
        return result
    
    # --------------------------------------------------------------------------
    # TWO VARIABLE ANALYSIS
    # --------------------------------------------------------------------------
    
    async def run_two_variable_analysis(
        self,
        valuation_id: str,
        method: ValuationMethod,
        config: TwoVariableConfig,
        calculator_func: Optional[Callable] = None
    ) -> TwoVariableResult:
        """Run two-variable data table analysis"""
        
        logger.info("Running two variable analysis")
        
        x_values = config.variable_x["values"]
        y_values = config.variable_y["values"]
        x_name = config.variable_x["name"]
        y_name = config.variable_y["name"]
        
        matrix = []
        all_results = []
        
        # Calculate results for each combination
        for y_val in y_values:
            row = []
            for x_val in x_values:
                if calculator_func:
                    result = calculator_func({x_name: x_val, y_name: y_val})
                else:
                    result = await self._mock_calculate_valuation(method, {x_name: x_val, y_name: y_val})
                
                row.append(float(result))
                all_results.append(result)
            matrix.append(row)
        
        result = TwoVariableResult(
            matrix=matrix,
            x_values=x_values,
            y_values=y_values,
            min_value=float(min(all_results)),
            max_value=float(max(all_results))
        )
        
        logger.info(f"Two variable analysis completed: range {result.min_value:.0f} - {result.max_value:.0f}")
        return result
    
    # --------------------------------------------------------------------------
    # TORNADO ANALYSIS
    # --------------------------------------------------------------------------
    
    async def run_tornado_analysis(
        self,
        valuation_id: str,
        method: ValuationMethod,
        config: TornadoConfig,
        calculator_func: Optional[Callable] = None
    ) -> TornadoResult:
        """Run tornado chart analysis"""
        
        logger.info(f"Running tornado analysis for {len(config.variables)} variables")
        
        # Calculate base case
        base_inputs = {var.name: var.base_value for var in config.variables}
        if calculator_func:
            base_case = calculator_func(base_inputs)
        else:
            base_case = await self._mock_calculate_valuation(method, base_inputs)
        
        bars = []
        
        # Calculate impact for each variable
        for var in config.variables:
            # Low scenario
            low_inputs = base_inputs.copy()
            low_inputs[var.name] = var.low_value
            if calculator_func:
                low_result = calculator_func(low_inputs)
            else:
                low_result = await self._mock_calculate_valuation(method, low_inputs)
            
            # High scenario
            high_inputs = base_inputs.copy()
            high_inputs[var.name] = var.high_value
            if calculator_func:
                high_result = calculator_func(high_inputs)
            else:
                high_result = await self._mock_calculate_valuation(method, high_inputs)
            
            # Calculate impact
            impact = abs(high_result - low_result)
            impact_percentage = (impact / base_case) * 100 if base_case != 0 else 0
            
            bars.append(TornadoBar(
                variable=var.name,
                low_result=float(low_result),
                high_result=float(high_result),
                impact=float(impact),
                impact_percentage=float(impact_percentage)
            ))
        
        # Sort by impact (highest first)
        bars.sort(key=lambda x: x.impact, reverse=True)
        
        # Calculate total variance explained
        total_variance = sum(bar.impact for bar in bars)
        
        result = TornadoResult(
            base_case_value=float(base_case),
            bars=bars,
            total_variance=float(total_variance)
        )
        
        logger.info(f"Tornado analysis completed: {len(bars)} variables ranked")
        return result
    
    # --------------------------------------------------------------------------
    # MONTE CARLO SIMULATION
    # --------------------------------------------------------------------------
    
    async def run_monte_carlo_analysis(
        self,
        valuation_id: str,
        method: ValuationMethod,
        config: MonteCarloConfig,
        calculator_func: Optional[Callable] = None
    ) -> MonteCarloResult:
        """Run Monte Carlo simulation"""
        
        logger.info(f"Running Monte Carlo simulation: {config.iterations} iterations")
        
        # Set random seed if provided
        if config.seed:
            np.random.seed(config.seed)
        
        results = []
        
        # Run iterations
        for i in range(config.iterations):
            # Generate random values for each variable
            inputs = {}
            for var in config.variables:
                value = self._generate_random_value(var)
                inputs[var.name] = value
            
            # Calculate valuation
            if calculator_func:
                result = calculator_func(inputs)
            else:
                result = await self._mock_calculate_valuation(method, inputs)
            
            results.append(result)
        
        # Calculate statistics
        results_array = np.array(results)
        
        # Percentiles
        percentiles = {
            "1": float(np.percentile(results_array, 1)),
            "5": float(np.percentile(results_array, 5)),
            "10": float(np.percentile(results_array, 10)),
            "25": float(np.percentile(results_array, 25)),
            "50": float(np.percentile(results_array, 50)),
            "75": float(np.percentile(results_array, 75)),
            "90": float(np.percentile(results_array, 90)),
            "95": float(np.percentile(results_array, 95)),
            "99": float(np.percentile(results_array, 99))
        }
        
        # Probability below certain thresholds
        mean_val = float(np.mean(results_array))
        thresholds = [mean_val * 0.8, mean_val * 0.9, mean_val, mean_val * 1.1, mean_val * 1.2]
        probability_below = []
        for threshold in thresholds:
            prob = float(np.sum(results_array <= threshold) / len(results_array))
            probability_below.append({"threshold": threshold, "probability": prob})
        
        # Confidence intervals
        confidence_intervals = {
            "90": (percentiles["5"], percentiles["95"]),
            "95": (percentiles["2.5"], percentiles["97.5"]),
            "99": (percentiles["0.5"], percentiles["99.5"])
        }
        
        result = MonteCarloResult(
            mean=mean_val,
            median=percentiles["50"],
            std=float(np.std(results_array)),
            percentiles=percentiles,
            probability_below=probability_below,
            confidence_intervals=confidence_intervals,
            var_5pct=percentiles["5"],
            var_1pct=percentiles["1"]
        )
        
        logger.info(f"Monte Carlo completed: mean={result.mean:.0f}, std={result.std:.0f}")
        return result
    
    # --------------------------------------------------------------------------
    # GHANA-SPECIFIC ANALYSIS
    # --------------------------------------------------------------------------
    
    async def analyze_ghana_market_scenarios(
        self,
        valuation_id: str,
        method: ValuationMethod,
        property_type: PropertyType,
        region: GhanaRegion
    ) -> TornadoResult:
        """Analyze Ghana-specific market scenarios"""
        
        logger.info(f"Analyzing Ghana market scenarios for {region} {property_type}")
        
        # Create Ghana-specific tornado config
        config = TornadoConfig(
            variables=[
                TornadoVariable(
                    name="market_growth_rate",
                    base_value=0.08,
                    low_value=0.04,
                    high_value=0.12
                ),
                TornadoVariable(
                    name="construction_cost_inflation",
                    base_value=0.12,
                    low_value=0.08,
                    high_value=0.18
                ),
                TornadoVariable(
                    name="interest_rate",
                    base_value=0.20,
                    low_value=0.16,
                    high_value=0.25
                ),
                TornadoVariable(
                    name="currency_stability",
                    base_value=1.0,
                    low_value=0.85,
                    high_value=1.1
                )
            ]
        )
        
        return await self.run_tornado_analysis(valuation_id, method, config)
    
    # --------------------------------------------------------------------------
    # HELPER METHODS
    # --------------------------------------------------------------------------
    
    def _generate_random_value(self, var: MonteCarloVariable) -> float:
        """Generate random value based on distribution"""
        
        if var.distribution == DistributionType.normal:
            return np.random.normal(var.mean or 0, var.std or 1)
        elif var.distribution == DistributionType.uniform:
            return np.random.uniform(var.min or 0, var.max or 1)
        elif var.distribution == DistributionType.triangular:
            return np.random.triangular(var.min or 0, var.mode or 0.5, var.max or 1)
        elif var.distribution == DistributionType.lognormal:
            return np.random.lognormal(var.mean or 0, var.std or 1)
        else:
            # Default to normal
            return np.random.normal(var.mean or 0, var.std or 1)
    
    def _calculate_elasticity(self, x_values: np.ndarray, y_values: List[float], base_x: float) -> float:
        """Calculate elasticity coefficient"""
        
        if len(x_values) < 2 or len(y_values) < 2:
            return 0.0
        
        # Find base case index
        base_idx = np.argmin(np.abs(x_values - base_x))
        if base_idx == 0 or base_idx == len(x_values) - 1:
            base_idx = len(x_values) // 2
        
        # Calculate percentage changes
        delta_x = (x_values[base_idx + 1] - x_values[base_idx - 1]) / x_values[base_idx]
        delta_y = (y_values[base_idx + 1] - y_values[base_idx - 1]) / y_values[base_idx]
        
        return delta_y / delta_x if delta_x != 0 else 0.0
    
    def _find_breakeven(self, data_points: List[Dict[str, float]]) -> Optional[float]:
        """Find breakeven point where result crosses zero"""
        
        for i in range(len(data_points) - 1):
            curr = data_points[i]["result_value"]
            next_val = data_points[i + 1]["result_value"]
            
            if curr * next_val < 0:  # Sign change indicates crossing zero
                # Linear interpolation to find exact breakeven
                curr_x = data_points[i]["variable_value"]
                next_x = data_points[i + 1]["variable_value"]
                
                ratio = abs(curr) / (abs(curr) + abs(next_val))
                return curr_x + ratio * (next_x - curr_x)
        
        return None
    
    async def _mock_calculate_valuation(
        self,
        method: ValuationMethod,
        inputs: Dict[str, float]
    ) -> float:
        """Mock valuation calculation for testing"""
        
        # Base valuation
        base_value = 800000  # GHS 800k base
        
        # Apply input modifications
        multiplier = 1.0
        for key, value in inputs.items():
            if key == "cap_rate":
                multiplier *= (0.10 / max(value, 0.01))  # Inverse relationship
            elif key == "gross_income":
                multiplier *= (value / 100000)  # Direct relationship
            elif key == "market_growth_rate":
                multiplier *= (1 + value)
            elif key == "construction_cost":
                multiplier *= (value / 2500)  # Cost per sqm relationship
            else:
                multiplier *= (1 + value * 0.1)  # Generic 10% impact
        
        return base_value * multiplier


# ============================================================================
# SERVICE INSTANCE
# ============================================================================

sensitivity_analysis_service = SensitivityAnalysisService()