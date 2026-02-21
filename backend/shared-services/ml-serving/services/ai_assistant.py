"""
PROPMETRIK Market Intelligence AI Assistant

Provides natural language market intelligence via a conversational interface.
Users can ask questions about property markets, get investment recommendations,
request trend analysis, and receive automated market reports.

Capabilities:
1. Natural Language Query → Structured Data Retrieval
2. Market Report Generation (automated summaries)
3. Investment Recommendations (risk-adjusted scoring)
4. Comparative Market Analysis (NL interface)
5. Regulatory & Compliance Guidance

Query Types Supported:
- Market: "What's the average price in East Legon?"
- Trend: "How have Cantonments prices changed this year?"
- Investment: "Best neighborhoods for rental yield?"
- Comparison: "Compare Trasacco vs. East Legon for investment"
- Forecast: "What will prices in Airport Residential look like in 2025?"

Consumers:
- Frontend chat widget (real-time)
- Scheduled report generation (batch)
- CRM embedded insights (contextual)
"""

import logging
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .config import llm_config, ml_config
from .database import async_db

logger = logging.getLogger(__name__)


# =====================================================
# TYPES
# =====================================================

class AssistantQueryRequest(BaseModel):
    """Input for AI Assistant query."""
    query: str
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None  # Additional context
    response_format: str = "text"  # text | markdown | json


class MarketDataPoint(BaseModel):
    """A retrieved market data point."""
    metric: str
    value: Any
    period: Optional[str] = None
    location: Optional[str] = None
    source: Optional[str] = None


class InvestmentScore(BaseModel):
    """Investment recommendation score."""
    location: str
    overall_score: float = Field(ge=0, le=100)
    capital_growth_score: float = Field(ge=0, le=100)
    rental_yield_score: float = Field(ge=0, le=100)
    liquidity_score: float = Field(ge=0, le=100)
    risk_score: float = Field(ge=0, le=100)
    rationale: str


class AssistantQueryResponse(BaseModel):
    """AI Assistant response."""
    query_id: str
    query: str
    intent: str
    response: str
    data_points: List[MarketDataPoint] = []
    investment_scores: List[InvestmentScore] = []
    confidence: float
    sources: List[str] = []
    follow_up_suggestions: List[str] = []
    session_id: Optional[str] = None


class ReportRequest(BaseModel):
    """Request for automated report generation."""
    report_type: str  # market_summary | investment_outlook | area_analysis
    location: Optional[str] = None
    period: str = "quarterly"
    include_forecast: bool = True
    include_comparables: bool = True


class ReportResponse(BaseModel):
    """Generated report."""
    report_id: str
    report_type: str
    title: str
    generated_at: str
    sections: List[Dict[str, Any]]
    data_tables: List[Dict[str, Any]] = []
    charts_data: List[Dict[str, Any]] = []


# =====================================================
# INTENT CLASSIFICATION
# =====================================================

INTENT_PATTERNS = {
    "market_price": {
        "patterns": [
            r"(?:what(?:'s| is)? the )?(?:average|median|mean|typical)\s+(?:price|value|cost)",
            r"how much (?:does|do|is|are)\s+(?:properties?|houses?|apartments?)\s+(?:cost|worth|going for)",
            r"price (?:of|for|in)\s+",
            r"(?:price|value)\s+(?:range|estimate)",
        ],
        "description": "Price and value queries",
    },
    "trend_analysis": {
        "patterns": [
            r"how (?:have|has|did)\s+.+\s+(?:changed|trended|evolved|moved|performed)",
            r"(?:price|market|rental)\s+(?:trend|movement|direction|trajectory)",
            r"(?:appreciation|depreciation|growth|decline)\s+.+\s+(?:rate|trend)",
            r"(?:year.over.year|yoy|quarterly|monthly)\s+(?:change|growth)",
        ],
        "description": "Trend and historical analysis queries",
    },
    "investment_recommendation": {
        "patterns": [
            r"(?:best|top|recommended|good)\s+(?:areas?|neighborhoods?|locations?)\s+(?:for|to)\s+(?:invest|buy|rent)",
            r"(?:investment|rental)\s+(?:opportunity|potential|return|yield)",
            r"where\s+should\s+(?:I|we)\s+(?:invest|buy|look)",
            r"(?:ROI|return on investment|cap rate|rental yield)",
        ],
        "description": "Investment recommendation queries",
    },
    "comparison": {
        "patterns": [
            r"compare\s+",
            r"(?:difference|comparison)\s+between\s+",
            r"(.+)\s+vs\.?\s+(.+)",
            r"(?:which|what)\s+is\s+better\s+",
        ],
        "description": "Area or property comparison queries",
    },
    "forecast": {
        "patterns": [
            r"(?:what will|predict|forecast|project|expect)\s+.+\s+(?:look like|be|reach)",
            r"(?:price|market)\s+(?:forecast|prediction|projection|outlook)",
            r"(?:next|coming)\s+(?:year|quarter|months?)\s+(?:outlook|forecast)",
            r"(?:future|expected)\s+(?:price|value|trend)",
        ],
        "description": "Forward-looking forecast queries",
    },
    "general_info": {
        "patterns": [
            r"(?:tell me|what|how|where|when|who|which)",
        ],
        "description": "General market information queries",
    },
}


# =====================================================
# LOCATION EXTRACTION
# =====================================================

KNOWN_LOCATIONS = {
    # Greater Accra neighborhoods
    "east legon": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "cantonments": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "airport residential": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "labone": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "osu": {"region": "Greater Accra", "district": "Osu Klottey"},
    "roman ridge": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "trasacco": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "north ridge": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "spintex": {"region": "Greater Accra", "district": "Ledzokuku-Krowor"},
    "tema": {"region": "Greater Accra", "district": "Tema Metropolitan"},
    "teshie": {"region": "Greater Accra", "district": "Ledzokuku-Krowor"},
    "nungua": {"region": "Greater Accra", "district": "Ledzokuku-Krowor"},
    "adenta": {"region": "Greater Accra", "district": "Adentan Municipal"},
    "madina": {"region": "Greater Accra", "district": "La-Nkwantanang Madina"},
    "kasoa": {"region": "Central", "district": "Gomoa East"},
    "dome": {"region": "Greater Accra", "district": "Ga East Municipal"},
    "achimota": {"region": "Greater Accra", "district": "Ga East Municipal"},
    "dzorwulu": {"region": "Greater Accra", "district": "Ayawaso West Municipal"},
    "ridge": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    # Major cities
    "accra": {"region": "Greater Accra", "district": "Accra Metropolitan"},
    "kumasi": {"region": "Ashanti", "district": "Kumasi Metropolitan"},
    "takoradi": {"region": "Western", "district": "Sekondi-Takoradi"},
    "tamale": {"region": "Northern", "district": "Tamale Metropolitan"},
    "cape coast": {"region": "Central", "district": "Cape Coast Metropolitan"},
    "ho": {"region": "Volta", "district": "Ho Municipal"},
    "sunyani": {"region": "Bono", "district": "Sunyani Municipal"},
}


# =====================================================
# SERVICE
# =====================================================

class AIAssistantService:
    """
    AI-powered market intelligence assistant.
    
    Combines intent classification, database queries, and LLM synthesis
    to answer natural language market questions.
    """

    def __init__(self):
        self.session_history: Dict[str, List[Dict]] = {}

    async def query(self, request: AssistantQueryRequest) -> AssistantQueryResponse:
        """
        Process a natural language query.

        Args:
            request: AssistantQueryRequest with user query and context.

        Returns:
            AssistantQueryResponse with answer, data points, and follow-ups.
        """
        query_id = str(uuid.uuid4())
        session_id = request.session_id or str(uuid.uuid4())

        # Classify intent
        intent = self._classify_intent(request.query)

        # Extract locations
        locations = self._extract_locations(request.query)

        # Route to handler based on intent
        handler_map = {
            "market_price": self._handle_price_query,
            "trend_analysis": self._handle_trend_query,
            "investment_recommendation": self._handle_investment_query,
            "comparison": self._handle_comparison_query,
            "forecast": self._handle_forecast_query,
            "general_info": self._handle_general_query,
        }

        handler = handler_map.get(intent, self._handle_general_query)

        try:
            response_text, data_points, investment_scores, confidence = await handler(
                request.query, locations, request.context
            )
        except Exception as e:
            logger.error(f"Query handler failed: {e}")
            response_text = "I apologize, but I was unable to process your query at this time. Please try rephrasing your question."
            data_points = []
            investment_scores = []
            confidence = 0.1

        # Generate follow-up suggestions
        follow_ups = self._generate_follow_ups(intent, locations)

        # Build response
        sources = ["PROPMETRIK Property Database"]
        if data_points:
            sources.append("Market Analytics Engine")

        response = AssistantQueryResponse(
            query_id=query_id,
            query=request.query,
            intent=intent,
            response=response_text,
            data_points=data_points,
            investment_scores=investment_scores,
            confidence=confidence,
            sources=sources,
            follow_up_suggestions=follow_ups,
            session_id=session_id,
        )

        # Store in session history
        if session_id not in self.session_history:
            self.session_history[session_id] = []
        self.session_history[session_id].append({
            "query": request.query,
            "intent": intent,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Persist query
        await self._persist_query(response, request)

        return response

    async def generate_report(self, request: ReportRequest) -> ReportResponse:
        """
        Generate an automated market report.

        Args:
            request: ReportRequest specifying type, location, and period.

        Returns:
            ReportResponse with structured report sections.
        """
        report_id = str(uuid.uuid4())

        if request.report_type == "market_summary":
            sections = await self._generate_market_summary(request)
        elif request.report_type == "investment_outlook":
            sections = await self._generate_investment_outlook(request)
        elif request.report_type == "area_analysis":
            sections = await self._generate_area_analysis(request)
        else:
            sections = [{"title": "Error", "content": f"Unknown report type: {request.report_type}"}]

        title = self._generate_report_title(request)

        return ReportResponse(
            report_id=report_id,
            report_type=request.report_type,
            title=title,
            generated_at=datetime.utcnow().isoformat(),
            sections=sections,
        )

    # -------------------------------------------------
    # INTENT CLASSIFICATION
    # -------------------------------------------------

    def _classify_intent(self, query: str) -> str:
        """Classify query intent using pattern matching."""
        query_lower = query.lower().strip()
        scores: Dict[str, float] = {}

        for intent, config in INTENT_PATTERNS.items():
            score = 0
            for pattern in config["patterns"]:
                if re.search(pattern, query_lower, re.IGNORECASE):
                    score += 1
            scores[intent] = score

        # Return best match, default to general_info
        best = max(scores, key=scores.get) if scores else "general_info"
        if scores.get(best, 0) == 0:
            return "general_info"
        return best

    # -------------------------------------------------
    # LOCATION EXTRACTION
    # -------------------------------------------------

    def _extract_locations(self, query: str) -> List[Dict[str, Any]]:
        """Extract location references from query."""
        query_lower = query.lower()
        found = []

        # Sort by length (longest first) to match "airport residential" before "airport"
        sorted_locations = sorted(KNOWN_LOCATIONS.keys(), key=len, reverse=True)

        for loc_name in sorted_locations:
            if loc_name in query_lower:
                found.append({
                    "name": loc_name,
                    **KNOWN_LOCATIONS[loc_name],
                })
                # Remove matched text to prevent sub-matches
                query_lower = query_lower.replace(loc_name, " ")

        return found

    # -------------------------------------------------
    # QUERY HANDLERS
    # -------------------------------------------------

    async def _handle_price_query(
        self, query: str, locations: List[Dict], context: Optional[Dict]
    ) -> tuple:
        """Handle price-related queries."""
        data_points = []

        if locations:
            for loc in locations:
                price_data = await self._fetch_price_data(loc["name"])
                if price_data:
                    data_points.extend(price_data)

            if data_points:
                text = self._format_price_response(locations, data_points)
                return text, data_points, [], 0.85

        # If no data found, try LLM
        if llm_config.anthropic_api_key:
            try:
                text = await self._llm_answer(query, data_points)
                return text, data_points, [], 0.6
            except Exception:
                pass

        loc_names = ", ".join(l["name"].title() for l in locations) if locations else "the specified area"
        return (
            f"I don't have sufficient current pricing data for {loc_names}. "
            f"Price data is updated as new transactions are recorded in the system.",
            data_points, [], 0.3,
        )

    async def _handle_trend_query(
        self, query: str, locations: List[Dict], context: Optional[Dict]
    ) -> tuple:
        """Handle trend analysis queries."""
        data_points = []

        if locations:
            for loc in locations:
                trend_data = await self._fetch_trend_data(loc["name"])
                if trend_data:
                    data_points.extend(trend_data)

        if data_points:
            text = self._format_trend_response(locations, data_points)
            return text, data_points, [], 0.8

        if llm_config.anthropic_api_key:
            try:
                text = await self._llm_answer(query, data_points)
                return text, data_points, [], 0.55
            except Exception:
                pass

        return (
            "Trend data is being collected. As more transactions are recorded, "
            "I'll be able to provide detailed trend analysis for specific areas.",
            data_points, [], 0.3,
        )

    async def _handle_investment_query(
        self, query: str, locations: List[Dict], context: Optional[Dict]
    ) -> tuple:
        """Handle investment recommendation queries."""
        investment_scores = []

        # Score each location or top neighborhoods
        target_locations = locations if locations else [
            {"name": "east legon"}, {"name": "cantonments"},
            {"name": "airport residential"}, {"name": "spintex"},
            {"name": "tema"},
        ]

        for loc in target_locations:
            score = await self._calculate_investment_score(loc["name"])
            if score:
                investment_scores.append(score)

        # Sort by overall score
        investment_scores.sort(key=lambda x: x.overall_score, reverse=True)

        data_points = []
        if investment_scores:
            text = self._format_investment_response(investment_scores)
            return text, data_points, investment_scores, 0.75

        return (
            "I need more market data to provide investment recommendations. "
            "As transaction data accumulates, investment scoring will improve.",
            [], [], 0.3,
        )

    async def _handle_comparison_query(
        self, query: str, locations: List[Dict], context: Optional[Dict]
    ) -> tuple:
        """Handle area comparison queries."""
        if len(locations) < 2:
            return (
                "Please specify at least two areas to compare. "
                "For example: 'Compare East Legon vs Cantonments for investment'",
                [], [], 0.2,
            )

        data_points = []
        comparison_data = {}

        for loc in locations[:4]:  # Max 4 comparisons
            price_data = await self._fetch_price_data(loc["name"])
            trend_data = await self._fetch_trend_data(loc["name"])
            comparison_data[loc["name"]] = {
                "prices": price_data,
                "trends": trend_data,
            }
            if price_data:
                data_points.extend(price_data)
            if trend_data:
                data_points.extend(trend_data)

        if any(d["prices"] or d["trends"] for d in comparison_data.values()):
            text = self._format_comparison_response(comparison_data)
            return text, data_points, [], 0.8

        return (
            f"I don't have enough data to compare {' and '.join(l['name'].title() for l in locations)} at this time.",
            [], [], 0.3,
        )

    async def _handle_forecast_query(
        self, query: str, locations: List[Dict], context: Optional[Dict]
    ) -> tuple:
        """Handle forecast queries."""
        data_points = []

        if locations:
            for loc in locations:
                forecast = await self._fetch_forecast_data(loc["name"])
                if forecast:
                    data_points.extend(forecast)

        if data_points:
            text = self._format_forecast_response(locations, data_points)
            return text, data_points, [], 0.7

        if llm_config.anthropic_api_key:
            try:
                text = await self._llm_answer(query, data_points)
                return text, data_points, [], 0.5
            except Exception:
                pass

        return (
            "Price forecasting is available once sufficient historical data is collected. "
            "The ML model requires at least 12 months of transaction data per area.",
            [], [], 0.3,
        )

    async def _handle_general_query(
        self, query: str, locations: List[Dict], context: Optional[Dict]
    ) -> tuple:
        """Handle general queries via LLM."""
        data_points = []

        if llm_config.anthropic_api_key:
            try:
                text = await self._llm_answer(query, data_points)
                return text, data_points, [], 0.65
            except Exception as e:
                logger.warning(f"LLM general query failed: {e}")

        return (
            "I can help with property market queries including prices, trends, "
            "investment analysis, and area comparisons. Try asking about a specific "
            "neighborhood or market metric.",
            [], [], 0.2,
        )

    # -------------------------------------------------
    # DATA FETCHING
    # -------------------------------------------------

    async def _fetch_price_data(self, location: str) -> List[MarketDataPoint]:
        """Fetch price data for a location from the database."""
        data_points = []
        try:
            rows = await async_db.fetch(
                """
                SELECT 
                    AVG(sale_price) as avg_price,
                    MIN(sale_price) as min_price,
                    MAX(sale_price) as max_price,
                    COUNT(*) as count,
                    AVG(sale_price / NULLIF(gfa, 0)) as avg_price_per_sqm
                FROM properties
                WHERE LOWER(neighborhood) = $1 
                    AND sale_price > 0
                    AND created_at >= NOW() - INTERVAL '12 months'
                """,
                location.lower(),
            )

            if rows and rows[0]["count"] > 0:
                row = rows[0]
                data_points.append(MarketDataPoint(
                    metric="average_price",
                    value=round(float(row["avg_price"]), 2),
                    location=location.title(),
                    period="Last 12 months",
                    source="PROPMETRIK Transaction Database",
                ))
                data_points.append(MarketDataPoint(
                    metric="price_range",
                    value={"min": round(float(row["min_price"]), 2), "max": round(float(row["max_price"]), 2)},
                    location=location.title(),
                    period="Last 12 months",
                ))
                if row["avg_price_per_sqm"]:
                    data_points.append(MarketDataPoint(
                        metric="avg_price_per_sqm",
                        value=round(float(row["avg_price_per_sqm"]), 2),
                        location=location.title(),
                        period="Last 12 months",
                    ))
                data_points.append(MarketDataPoint(
                    metric="transaction_count",
                    value=int(row["count"]),
                    location=location.title(),
                    period="Last 12 months",
                ))

        except Exception as e:
            logger.warning(f"Failed to fetch price data for {location}: {e}")

        return data_points

    async def _fetch_trend_data(self, location: str) -> List[MarketDataPoint]:
        """Fetch trend data for a location."""
        data_points = []
        try:
            rows = await async_db.fetch(
                """
                SELECT 
                    DATE_TRUNC('quarter', created_at) as quarter,
                    AVG(sale_price) as avg_price,
                    COUNT(*) as count
                FROM properties
                WHERE LOWER(neighborhood) = $1 
                    AND sale_price > 0
                    AND created_at >= NOW() - INTERVAL '24 months'
                GROUP BY DATE_TRUNC('quarter', created_at)
                ORDER BY quarter
                """,
                location.lower(),
            )

            if rows and len(rows) >= 2:
                # Calculate trend
                first_avg = float(rows[0]["avg_price"])
                last_avg = float(rows[-1]["avg_price"])
                change_pct = ((last_avg - first_avg) / first_avg * 100) if first_avg > 0 else 0

                data_points.append(MarketDataPoint(
                    metric="price_trend",
                    value={
                        "change_percent": round(change_pct, 1),
                        "direction": "up" if change_pct > 0 else "down",
                        "quarters": len(rows),
                    },
                    location=location.title(),
                    period="Last 24 months",
                ))

        except Exception as e:
            logger.warning(f"Failed to fetch trend data for {location}: {e}")

        return data_points

    async def _fetch_forecast_data(self, location: str) -> List[MarketDataPoint]:
        """Fetch ML forecast data for a location."""
        data_points = []
        try:
            rows = await async_db.fetch(
                """
                SELECT forecast_period, forecasted_price, confidence_interval, scenario
                FROM ml_trend_analysis
                WHERE LOWER(location) = $1 
                    AND analysis_type = 'price_forecast'
                    AND created_at >= NOW() - INTERVAL '7 days'
                ORDER BY forecast_period
                LIMIT 10
                """,
                location.lower(),
            )

            for row in rows:
                data_points.append(MarketDataPoint(
                    metric="price_forecast",
                    value={
                        "forecasted_price": row["forecasted_price"],
                        "confidence_interval": row["confidence_interval"],
                        "scenario": row["scenario"],
                    },
                    location=location.title(),
                    period=str(row["forecast_period"]),
                    source="PROPMETRIK ML Forecast Model",
                ))

        except Exception as e:
            logger.warning(f"Failed to fetch forecast for {location}: {e}")

        return data_points

    # -------------------------------------------------
    # INVESTMENT SCORING
    # -------------------------------------------------

    async def _calculate_investment_score(self, location: str) -> Optional[InvestmentScore]:
        """Calculate investment score for a location."""
        try:
            # Fetch required data
            price_data = await self._fetch_price_data(location)
            trend_data = await self._fetch_trend_data(location)

            if not price_data:
                # Return estimation based on known tiers
                tier_scores = {
                    "east legon": 82, "cantonments": 85, "airport residential": 88,
                    "labone": 78, "roman ridge": 80, "trasacco": 75,
                    "spintex": 72, "tema": 68, "adenta": 65, "kasoa": 55,
                }
                score = tier_scores.get(location.lower(), 60)
                return InvestmentScore(
                    location=location.title(),
                    overall_score=score,
                    capital_growth_score=score + 5,
                    rental_yield_score=score - 5,
                    liquidity_score=score,
                    risk_score=100 - score,
                    rationale=f"Estimated score based on {location.title()}'s market tier classification.",
                )

            # Calculate component scores
            avg_price = next((d.value for d in price_data if d.metric == "average_price"), 0)
            tx_count = next((d.value for d in price_data if d.metric == "transaction_count"), 0)

            # Liquidity score based on transaction volume
            liquidity = min(100, tx_count * 10)

            # Capital growth from trends
            capital_growth = 50  # default
            for td in trend_data:
                if td.metric == "price_trend" and isinstance(td.value, dict):
                    change = td.value.get("change_percent", 0)
                    capital_growth = min(100, max(0, 50 + change * 2))

            # Rental yield estimate (simplified)
            rental_yield = 65  # Base
            if avg_price > 0:
                if avg_price < 500_000:
                    rental_yield = 75  # Higher yield for lower-priced areas
                elif avg_price > 2_000_000:
                    rental_yield = 55  # Lower yield for premium

            overall = (capital_growth * 0.3 + rental_yield * 0.25 +
                       liquidity * 0.25 + (100 - 30) * 0.2)

            return InvestmentScore(
                location=location.title(),
                overall_score=round(overall),
                capital_growth_score=round(capital_growth),
                rental_yield_score=round(rental_yield),
                liquidity_score=round(liquidity),
                risk_score=round(max(0, 100 - overall)),
                rationale=f"Based on {tx_count} transactions, {capital_growth:.0f}% capital growth score, "
                          f"and estimated rental yield of {rental_yield:.0f}%.",
            )

        except Exception as e:
            logger.warning(f"Failed to calculate investment score for {location}: {e}")
            return None

    # -------------------------------------------------
    # RESPONSE FORMATTING
    # -------------------------------------------------

    def _format_price_response(
        self, locations: List[Dict], data_points: List[MarketDataPoint]
    ) -> str:
        """Format price data into readable response."""
        parts = []
        for loc in locations:
            loc_name = loc["name"].title()
            loc_points = [dp for dp in data_points if dp.location == loc_name]

            avg = next((dp.value for dp in loc_points if dp.metric == "average_price"), None)
            price_range = next((dp.value for dp in loc_points if dp.metric == "price_range"), None)
            per_sqm = next((dp.value for dp in loc_points if dp.metric == "avg_price_per_sqm"), None)
            count = next((dp.value for dp in loc_points if dp.metric == "transaction_count"), None)

            if avg:
                part = f"**{loc_name}**: Average property price is GHS {avg:,.0f}"
                if price_range:
                    part += f" (range: GHS {price_range['min']:,.0f} - GHS {price_range['max']:,.0f})"
                if per_sqm:
                    part += f". Average price per sqm: GHS {per_sqm:,.0f}"
                if count:
                    part += f". Based on {count} transactions in the last 12 months."
                parts.append(part)

        return "\n\n".join(parts)

    def _format_trend_response(
        self, locations: List[Dict], data_points: List[MarketDataPoint]
    ) -> str:
        """Format trend data into readable response."""
        parts = []
        for loc in locations:
            loc_name = loc["name"].title()
            trend = next(
                (dp.value for dp in data_points
                 if dp.location == loc_name and dp.metric == "price_trend"),
                None
            )
            if trend and isinstance(trend, dict):
                direction = "increased" if trend["direction"] == "up" else "decreased"
                parts.append(
                    f"**{loc_name}**: Property prices have {direction} by "
                    f"{abs(trend['change_percent']):.1f}% over the last "
                    f"{trend['quarters']} quarters."
                )

        return "\n\n".join(parts) or "No significant trends detected for the specified period."

    def _format_investment_response(self, scores: List[InvestmentScore]) -> str:
        """Format investment scores into readable response."""
        parts = ["Here are the investment scores for the requested areas:\n"]
        for i, score in enumerate(scores, 1):
            parts.append(
                f"**{i}. {score.location}** — Overall: {score.overall_score}/100\n"
                f"   Capital Growth: {score.capital_growth_score} | "
                f"Rental Yield: {score.rental_yield_score} | "
                f"Liquidity: {score.liquidity_score} | "
                f"Risk: {score.risk_score}\n"
                f"   _{score.rationale}_"
            )
        return "\n\n".join(parts)

    def _format_comparison_response(self, comparison_data: Dict) -> str:
        """Format comparison data."""
        parts = ["**Area Comparison**\n"]
        for loc_name, data in comparison_data.items():
            part = f"**{loc_name.title()}**:"
            if data["prices"]:
                avg = next((dp.value for dp in data["prices"] if dp.metric == "average_price"), None)
                if avg:
                    part += f" Avg Price: GHS {avg:,.0f}"
            if data["trends"]:
                trend = next(
                    (dp.value for dp in data["trends"] if dp.metric == "price_trend"), None
                )
                if trend and isinstance(trend, dict):
                    part += f" | {trend['change_percent']:+.1f}% change"
            parts.append(part)

        return "\n".join(parts)

    def _format_forecast_response(
        self, locations: List[Dict], data_points: List[MarketDataPoint]
    ) -> str:
        """Format forecast data."""
        parts = []
        for loc in locations:
            loc_name = loc["name"].title()
            forecasts = [dp for dp in data_points if dp.location == loc_name and dp.metric == "price_forecast"]
            if forecasts:
                part = f"**{loc_name} Price Forecast:**\n"
                for f in forecasts:
                    val = f.value if isinstance(f.value, dict) else {}
                    part += f"  - {f.period}: GHS {val.get('forecasted_price', 'N/A'):,.0f}"
                    if val.get("scenario"):
                        part += f" ({val['scenario']} scenario)"
                    part += "\n"
                parts.append(part)

        return "\n".join(parts) or "No forecast data available for the specified areas."

    # -------------------------------------------------
    #  FOLLOW-UP SUGGESTIONS
    # -------------------------------------------------

    def _generate_follow_ups(
        self, intent: str, locations: List[Dict]
    ) -> List[str]:
        """Generate follow-up question suggestions."""
        suggestions = []
        loc_names = [l["name"].title() for l in locations]

        if intent == "market_price" and loc_names:
            suggestions.append(f"How have prices in {loc_names[0]} changed over time?")
            suggestions.append(f"Is {loc_names[0]} a good area for investment?")
        elif intent == "trend_analysis" and loc_names:
            suggestions.append(f"What is the price forecast for {loc_names[0]}?")
            suggestions.append(f"Compare {loc_names[0]} with similar neighborhoods")
        elif intent == "investment_recommendation":
            suggestions.append("What areas have the highest rental yield?")
            suggestions.append("Compare the top 3 investment areas")
        elif intent == "comparison":
            suggestions.append("Which area has better capital growth potential?")
        else:
            suggestions.append("What are the best areas for property investment?")
            suggestions.append("Show me the latest market trends")

        return suggestions[:3]

    # -------------------------------------------------
    # REPORT GENERATION
    # -------------------------------------------------

    async def _generate_market_summary(self, request: ReportRequest) -> List[Dict]:
        """Generate market summary report sections."""
        sections = []

        # Executive Summary
        sections.append({
            "title": "Executive Summary",
            "content": await self._generate_section_content(
                "market_summary_executive", request.location
            ),
        })

        # Price Overview
        price_data = []
        target_locations = [request.location] if request.location else [
            "east legon", "cantonments", "spintex", "tema"
        ]
        for loc in target_locations:
            data = await self._fetch_price_data(loc)
            if data:
                price_data.extend(data)

        sections.append({
            "title": "Price Overview",
            "content": self._format_price_table(price_data),
            "data_points": [dp.model_dump() for dp in price_data],
        })

        # Market Trends
        sections.append({
            "title": "Market Trends",
            "content": "Market trend analysis based on transaction data.",
        })

        return sections

    async def _generate_investment_outlook(self, request: ReportRequest) -> List[Dict]:
        """Generate investment outlook report."""
        sections = []

        sections.append({
            "title": "Investment Climate Overview",
            "content": "Ghana's property market continues to present opportunities for strategic investors.",
        })

        # Score top areas
        top_areas = ["east legon", "cantonments", "airport residential", "spintex", "tema"]
        scores = []
        for area in top_areas:
            score = await self._calculate_investment_score(area)
            if score:
                scores.append(score)

        scores.sort(key=lambda x: x.overall_score, reverse=True)

        sections.append({
            "title": "Top Investment Areas",
            "content": self._format_investment_response(scores),
            "scores": [s.model_dump() for s in scores],
        })

        return sections

    async def _generate_area_analysis(self, request: ReportRequest) -> List[Dict]:
        """Generate area-specific analysis report."""
        if not request.location:
            return [{"title": "Error", "content": "Location required for area analysis report"}]

        sections = []
        location = request.location

        sections.append({
            "title": f"Area Profile: {location.title()}",
            "content": f"Comprehensive market analysis for {location.title()}.",
        })

        # Price data
        price_data = await self._fetch_price_data(location)
        if price_data:
            sections.append({
                "title": "Price Analysis",
                "content": self._format_price_response(
                    [{"name": location}], price_data
                ),
            })

        # Investment score
        score = await self._calculate_investment_score(location)
        if score:
            sections.append({
                "title": "Investment Assessment",
                "content": self._format_investment_response([score]),
            })

        return sections

    def _generate_report_title(self, request: ReportRequest) -> str:
        """Generate report title."""
        titles = {
            "market_summary": "Ghana Property Market Summary",
            "investment_outlook": "Property Investment Outlook",
            "area_analysis": f"{request.location.title() if request.location else 'Area'} Market Analysis",
        }
        period_label = request.period.title()
        return f"{titles.get(request.report_type, 'Market Report')} — {period_label} {datetime.utcnow().year}"

    async def _generate_section_content(
        self, section_type: str, location: Optional[str]
    ) -> str:
        """Generate section content (with LLM if available)."""
        if llm_config.anthropic_api_key:
            try:
                import httpx
                import json

                prompt = (
                    f"Write a brief {section_type.replace('_', ' ')} "
                    f"{'for ' + location if location else 'for Ghana property market'}. "
                    f"2-3 sentences, professional tone."
                )

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={
                            "x-api-key": llm_config.anthropic_api_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json={
                            "model": llm_config.default_model,
                            "max_tokens": 256,
                            "temperature": 0.3,
                            "messages": [{"role": "user", "content": prompt}],
                        },
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data["content"][0]["text"]
            except Exception as e:
                logger.warning(f"LLM section generation failed: {e}")

        return (
            "The Ghana property market shows continued activity with varied performance "
            "across different segments and locations."
        )

    def _format_price_table(self, data_points: List[MarketDataPoint]) -> str:
        """Format price data as a markdown table."""
        if not data_points:
            return "No price data available."

        # Group by location
        locations = {}
        for dp in data_points:
            loc = dp.location or "Unknown"
            if loc not in locations:
                locations[loc] = {}
            locations[loc][dp.metric] = dp.value

        lines = ["| Location | Avg Price (GHS) | Transactions |",
                  "|----------|---------------:|-------------:|"]
        for loc, metrics in locations.items():
            avg = metrics.get("average_price", "N/A")
            count = metrics.get("transaction_count", "N/A")
            avg_str = f"{avg:,.0f}" if isinstance(avg, (int, float)) else avg
            lines.append(f"| {loc} | {avg_str} | {count} |")

        return "\n".join(lines)

    # -------------------------------------------------
    # LLM INTEGRATION
    # -------------------------------------------------

    async def _llm_answer(self, query: str, data_points: List[MarketDataPoint]) -> str:
        """Use LLM to generate a comprehensive answer."""
        import httpx
        import json

        context_parts = [
            "You are PROPMETRIK's market intelligence assistant for Ghana's property market.",
            "Provide accurate, data-driven answers. If you're unsure, say so.",
        ]

        if data_points:
            context_parts.append("Available data points:")
            for dp in data_points:
                context_parts.append(f"  - {dp.metric}: {dp.value} ({dp.location}, {dp.period})")

        system_prompt = "\n".join(context_parts)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": llm_config.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": llm_config.default_model,
                    "max_tokens": 1024,
                    "temperature": 0.3,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": query}],
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]

    # -------------------------------------------------
    # PERSISTENCE
    # -------------------------------------------------

    async def _persist_query(
        self, response: AssistantQueryResponse, request: AssistantQueryRequest
    ) -> None:
        """Persist assistant query for analytics and improvement."""
        try:
            import json
            await async_db.execute(
                """
                INSERT INTO ml_assistant_queries (
                    query_id, session_id, user_id, query, intent,
                    response, confidence, data_points, sources
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                response.query_id,
                response.session_id,
                request.user_id,
                response.query,
                response.intent,
                response.response,
                response.confidence,
                json.dumps([dp.model_dump() for dp in response.data_points]),
                response.sources,
            )
        except Exception as e:
            logger.warning(f"Failed to persist assistant query: {e}")


# Singleton
ai_assistant_service = AIAssistantService()
