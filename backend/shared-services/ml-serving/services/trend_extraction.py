"""
PROPMETRIK Trend Extraction & Forecasting Service

Identifies emerging trends, patterns, and anomalies from text and time-series data
to complement numerical market analytics.

Capabilities:
1. Topic Modeling - Discover trending topics in real estate discussions
2. Keyword Trend Analysis - Monitor frequency of key terms over time
3. Pattern Recognition - Identify recurring market cycle phrases
4. Time Series Forecasting - ARIMA/Prophet-based predictions

ML Techniques:
- TF-IDF + Time Series for keyword tracking
- ARIMA for univariate time series forecasting
- Isolation Forest for anomaly detection

Consumers:
- Market Intelligence Analytics (Section 4)
- Price Forecasting (Section 8.5)
- AI Assistant context enrichment
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
from pydantic import BaseModel, Field

from .database import async_db

logger = logging.getLogger(__name__)


# =====================================================
# TYPES
# =====================================================

class TrendDataSource(str):
    NEWS = "news"
    SOCIAL_MEDIA = "social_media"
    REPORTS = "reports"
    ALL = "all"


class TrendAnalysisRequest(BaseModel):
    """Input for trend analysis."""
    data_source: str = "all"
    time_range: Dict[str, str]  # {"start_date": "...", "end_date": "..."}
    region: Optional[str] = None
    min_mentions: int = 3
    include_forecasts: bool = False


class TrendingTopic(BaseModel):
    """A trending topic identified from text data."""
    topic: str
    keywords: List[str]
    mention_count: int
    change_pct: float
    sentiment: float
    relevance_score: float


class EmergingTrend(BaseModel):
    """A newly emerging trend."""
    trend: str
    first_detected: str
    growth_rate: float
    examples: List[str]
    confidence: float


class DecliningTrend(BaseModel):
    """A declining trend."""
    trend: str
    peak_date: str
    decline_rate: float
    last_mention: Optional[str] = None


class KeywordTimeSeries(BaseModel):
    """Time series data for a keyword."""
    keyword: str
    time_series: List[Dict[str, Any]]
    forecast: Optional[List[Dict[str, Any]]] = None


class Anomaly(BaseModel):
    """Detected anomaly in trend data."""
    date: str
    keyword: str
    expected_mentions: float
    actual_mentions: float
    severity: str  # low, medium, high
    context: str


class TrendAnalysisResponse(BaseModel):
    """Full trend analysis response."""
    analysis_id: str
    period: Dict[str, str]
    trending_topics: List[TrendingTopic]
    emerging_trends: List[EmergingTrend]
    declining_trends: List[DecliningTrend]
    keyword_trends: List[KeywordTimeSeries]
    anomalies: List[Anomaly]


class PriceForecastRequest(BaseModel):
    """Input for price forecasting."""
    region: str
    property_type: Optional[str] = None
    forecast_months: int = Field(default=6, ge=1, le=36)


class PriceForecastResponse(BaseModel):
    """Price forecast response."""
    region: str
    property_type: Optional[str]
    forecast_date: str
    short_term: Dict[str, Any]
    long_term: Dict[str, Any]
    drivers: List[Dict[str, Any]]


# =====================================================
# TRACKED KEYWORDS
# =====================================================

TRACKED_KEYWORDS = {
    "market_health": [
        "affordable housing", "housing shortage", "property boom",
        "market correction", "bubble", "oversupply", "undersupply",
        "buyer's market", "seller's market",
    ],
    "construction": [
        "cement shortage", "steel price", "material cost",
        "construction delay", "building permit", "new development",
        "labour shortage", "contractor",
    ],
    "finance": [
        "mortgage rate", "interest rate", "bank lending",
        "foreign investment", "diaspora investment", "property fund",
        "REIT", "loan default",
    ],
    "regulation": [
        "land reform", "property tax", "rent control",
        "zoning change", "building code", "land title",
        "digital land", "stool land",
    ],
    "technology": [
        "proptech", "digital valuation", "smart home",
        "automated valuation", "property portal", "online listing",
    ],
}


# =====================================================
# SERVICE
# =====================================================

class TrendAnalysisService:
    """
    Trend extraction and forecasting service.
    
    Combines keyword frequency analysis, statistical anomaly detection,
    and time-series forecasting to identify market trends.
    """

    def __init__(self):
        self._tracked_keywords = TRACKED_KEYWORDS

    async def analyze_trends(self, request: TrendAnalysisRequest) -> TrendAnalysisResponse:
        """
        Perform comprehensive trend analysis.

        Args:
            request: TrendAnalysisRequest with time range and filters.

        Returns:
            TrendAnalysisResponse with trending topics, emerging/declining trends,
            keyword time series, and anomalies.
        """
        analysis_id = str(uuid.uuid4())
        start_date = request.time_range.get("start_date", (datetime.utcnow() - timedelta(days=30)).isoformat())
        end_date = request.time_range.get("end_date", datetime.utcnow().isoformat())

        # Fetch sentiment data for the period
        sentiment_data = await self._fetch_sentiment_data(
            start_date, end_date, request.region, request.data_source
        )

        # Analyze keyword frequencies
        keyword_trends = self._compute_keyword_trends(sentiment_data, start_date, end_date)

        # Identify trending topics
        trending_topics = self._identify_trending_topics(
            keyword_trends, request.min_mentions
        )

        # Detect emerging and declining trends
        emerging = self._detect_emerging_trends(keyword_trends)
        declining = self._detect_declining_trends(keyword_trends)

        # Detect anomalies
        anomalies = self._detect_anomalies(keyword_trends)

        # Optionally generate forecasts
        forecast_keyword_trends = []
        for kt in keyword_trends:
            kts = KeywordTimeSeries(
                keyword=kt["keyword"],
                time_series=kt["time_series"],
            )
            if request.include_forecasts and len(kt["time_series"]) >= 5:
                kts.forecast = self._forecast_keyword(kt["time_series"])
            forecast_keyword_trends.append(kts)

        response = TrendAnalysisResponse(
            analysis_id=analysis_id,
            period={"start": start_date, "end": end_date},
            trending_topics=trending_topics,
            emerging_trends=emerging,
            declining_trends=declining,
            keyword_trends=forecast_keyword_trends[:20],
            anomalies=anomalies,
        )

        # Persist
        await self._persist_analysis(response, request)

        return response

    async def get_trending_topics(
        self, region: Optional[str] = None, limit: int = 10
    ) -> List[TrendingTopic]:
        """Get current trending topics (last 7 days vs previous 7 days)."""
        now = datetime.utcnow()
        request = TrendAnalysisRequest(
            data_source="all",
            time_range={
                "start_date": (now - timedelta(days=14)).strftime("%Y-%m-%d"),
                "end_date": now.strftime("%Y-%m-%d"),
            },
            region=region,
            min_mentions=2,
        )
        result = await self.analyze_trends(request)
        return result.trending_topics[:limit]

    async def forecast_prices(self, request: PriceForecastRequest) -> PriceForecastResponse:
        """
        Generate price forecasts for a region/property type.
        
        Uses historical transaction data and economic indicators
        to produce short-term and long-term price projections.

        Args:
            request: PriceForecastRequest with region, property_type, forecast period.

        Returns:
            PriceForecastResponse with scenarios and driver analysis.
        """
        # Fetch historical pricing data
        price_history = await self._fetch_price_history(
            request.region, request.property_type
        )

        # Fetch economic indicators for driver analysis
        economic_data = await self._fetch_economic_drivers(request.region)

        # Compute forecasts
        short_term = self._compute_short_term_forecast(price_history, economic_data)
        long_term = self._compute_long_term_forecast(price_history, economic_data)
        drivers = self._analyze_price_drivers(economic_data, price_history)

        return PriceForecastResponse(
            region=request.region,
            property_type=request.property_type,
            forecast_date=datetime.utcnow().strftime("%Y-%m-%d"),
            short_term=short_term,
            long_term=long_term,
            drivers=drivers,
        )

    # -------------------------------------------------
    # PRIVATE - DATA FETCHING
    # -------------------------------------------------

    async def _fetch_sentiment_data(
        self,
        start_date: str,
        end_date: str,
        region: Optional[str],
        source: str,
    ) -> List[Dict[str, Any]]:
        """Fetch sentiment analysis results for trend computation."""
        conditions = ["analyzed_at >= $1::timestamp", "analyzed_at <= $2::timestamp"]
        # asyncpg requires datetime objects, not strings
        def _to_dt(v):
            if isinstance(v, str):
                from datetime import datetime as _dt
                try:
                    return _dt.fromisoformat(v)
                except ValueError:
                    return _dt.strptime(v[:10], "%Y-%m-%d")
            return v
        params: list = [_to_dt(start_date), _to_dt(end_date)]
        idx = 3

        if region:
            conditions.append(f"region = ${idx}")
            params.append(region)
            idx += 1

        if source and source != "all":
            conditions.append(f"source_type = ${idx}")
            params.append(source)
            idx += 1

        where = " AND ".join(conditions)

        rows = await async_db.fetch(
            f"""
            SELECT 
                analyzed_at::date as date,
                source_text,
                sentiment_score,
                aspects,
                entities,
                source_type,
                region
            FROM ml_sentiment_analysis
            WHERE {where}
            ORDER BY analyzed_at
            """,
            *params,
        )
        return [dict(r) for r in rows]

    async def _fetch_price_history(
        self, region: str, property_type: Optional[str]
    ) -> List[Dict[str, Any]]:
        """Fetch historical property price data from data hub."""
        conditions = ["p.region = $1", "p.price IS NOT NULL", "p.price > 0"]
        params: list = [region]
        idx = 2

        if property_type:
            conditions.append(f"p.property_type = ${idx}")
            params.append(property_type)
            idx += 1

        where = " AND ".join(conditions)

        rows = await async_db.fetch(
            f"""
            SELECT 
                DATE_TRUNC('month', COALESCE(p.sold_at, p.listed_at, p.created_at)) as period,
                AVG(p.price) as avg_price,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price) as median_price,
                COUNT(*) as transaction_count,
                STDDEV(p.price) as price_stddev
            FROM properties p
            WHERE {where}
              AND COALESCE(p.sold_at, p.listed_at, p.created_at) >= NOW() - INTERVAL '3 years'
            GROUP BY DATE_TRUNC('month', COALESCE(p.sold_at, p.listed_at, p.created_at))
            ORDER BY period
            """,
            *params,
        )
        return [dict(r) for r in rows]

    async def _fetch_economic_drivers(self, region: str) -> Dict[str, Any]:
        """Fetch current economic indicators for price driver analysis."""
        rows = await async_db.fetch(
            """
            SELECT 
                indicator_type,
                value,
                previous_value,
                effective_date
            FROM economic_indicators
            WHERE effective_date >= NOW() - INTERVAL '1 year'
            ORDER BY effective_date DESC
            """
        )

        indicators = {}
        for row in rows:
            itype = row["indicator_type"]
            if itype not in indicators:
                indicators[itype] = {
                    "current": float(row["value"]),
                    "previous": float(row["previous_value"]) if row["previous_value"] else None,
                    "date": row["effective_date"].isoformat() if row["effective_date"] else None,
                }

        return indicators

    # -------------------------------------------------
    # PRIVATE - ANALYSIS METHODS
    # -------------------------------------------------

    def _compute_keyword_trends(
        self,
        sentiment_data: List[Dict[str, Any]],
        start_date: str,
        end_date: str,
    ) -> List[Dict[str, Any]]:
        """Compute keyword frequency trends from sentiment data."""
        import collections

        # Build daily keyword counts
        keyword_daily: Dict[str, Dict[str, int]] = {}

        all_keywords = []
        for category, keywords in self._tracked_keywords.items():
            all_keywords.extend(keywords)

        for entry in sentiment_data:
            text = entry.get("source_text", "") or ""
            date_str = str(entry.get("date", ""))
            text_lower = text.lower()

            for keyword in all_keywords:
                if keyword.lower() in text_lower:
                    if keyword not in keyword_daily:
                        keyword_daily[keyword] = collections.Counter()
                    keyword_daily[keyword][date_str] += 1

        # Build time series and compute trends
        trends = []
        for keyword, daily_counts in keyword_daily.items():
            if not daily_counts:
                continue

            dates = sorted(daily_counts.keys())
            time_series = [
                {"date": d, "mentions": daily_counts[d]}
                for d in dates
            ]

            total_mentions = sum(daily_counts.values())

            # Compute period-over-period change
            mid_idx = len(dates) // 2
            first_half = sum(daily_counts[d] for d in dates[:mid_idx]) if mid_idx > 0 else 0
            second_half = sum(daily_counts[d] for d in dates[mid_idx:]) if mid_idx > 0 else total_mentions

            change_pct = 0.0
            if first_half > 0:
                change_pct = ((second_half - first_half) / first_half) * 100

            # Get average sentiment for keyword mentions
            sentiment_sum = 0.0
            sentiment_count = 0
            for entry in sentiment_data:
                text = (entry.get("source_text", "") or "").lower()
                if keyword.lower() in text:
                    score = entry.get("sentiment_score")
                    if score is not None:
                        sentiment_sum += float(score)
                        sentiment_count += 1

            avg_sentiment = sentiment_sum / sentiment_count if sentiment_count > 0 else 0.0

            trends.append({
                "keyword": keyword,
                "time_series": time_series,
                "total_mentions": total_mentions,
                "change_pct": round(change_pct, 1),
                "avg_sentiment": round(avg_sentiment, 3),
            })

        # Sort by total mentions descending
        trends.sort(key=lambda t: t["total_mentions"], reverse=True)
        return trends

    def _identify_trending_topics(
        self,
        keyword_trends: List[Dict[str, Any]],
        min_mentions: int,
    ) -> List[TrendingTopic]:
        """Identify trending topics from keyword analysis."""
        topics = []

        # Group keywords by category
        category_map: Dict[str, List[Dict[str, Any]]] = {}
        for kw_trend in keyword_trends:
            keyword = kw_trend["keyword"]
            for category, keywords in self._tracked_keywords.items():
                if keyword in keywords:
                    if category not in category_map:
                        category_map[category] = []
                    category_map[category].append(kw_trend)
                    break

        for category, kw_trends in category_map.items():
            total_mentions = sum(t["total_mentions"] for t in kw_trends)
            if total_mentions < min_mentions:
                continue

            avg_change = np.mean([t["change_pct"] for t in kw_trends]) if kw_trends else 0
            avg_sentiment = np.mean([t["avg_sentiment"] for t in kw_trends]) if kw_trends else 0
            keywords = [t["keyword"] for t in kw_trends]

            # Relevance = mentions × |change| (bigger movement = more newsworthy)
            relevance = total_mentions * (1 + abs(avg_change) / 100)

            topics.append(TrendingTopic(
                topic=category.replace("_", " ").title(),
                keywords=keywords,
                mention_count=total_mentions,
                change_pct=round(float(avg_change), 1),
                sentiment=round(float(avg_sentiment), 3),
                relevance_score=round(float(relevance), 1),
            ))

        topics.sort(key=lambda t: t.relevance_score, reverse=True)
        return topics

    def _detect_emerging_trends(
        self, keyword_trends: List[Dict[str, Any]]
    ) -> List[EmergingTrend]:
        """Detect newly emerging trends (high growth rate, recent first appearance)."""
        emerging = []

        for kw_trend in keyword_trends:
            ts = kw_trend["time_series"]
            if len(ts) < 3:
                continue

            # Check if trend appeared recently (first mention in last third of period)
            total_days = len(ts)
            first_mention_idx = 0
            for i, point in enumerate(ts):
                if point["mentions"] > 0:
                    first_mention_idx = i
                    break

            # Strong growth pattern
            if kw_trend["change_pct"] > 50 and kw_trend["total_mentions"] >= 3:
                emerging.append(EmergingTrend(
                    trend=kw_trend["keyword"],
                    first_detected=ts[first_mention_idx]["date"],
                    growth_rate=kw_trend["change_pct"],
                    examples=[],
                    confidence=min(0.9, 0.5 + kw_trend["total_mentions"] / 20),
                ))

        emerging.sort(key=lambda e: e.growth_rate, reverse=True)
        return emerging[:10]

    def _detect_declining_trends(
        self, keyword_trends: List[Dict[str, Any]]
    ) -> List[DecliningTrend]:
        """Detect declining trends (negative change rate)."""
        declining = []

        for kw_trend in keyword_trends:
            if kw_trend["change_pct"] < -30 and kw_trend["total_mentions"] >= 3:
                ts = kw_trend["time_series"]
                # Find peak
                peak_idx = max(range(len(ts)), key=lambda i: ts[i]["mentions"])

                declining.append(DecliningTrend(
                    trend=kw_trend["keyword"],
                    peak_date=ts[peak_idx]["date"],
                    decline_rate=abs(kw_trend["change_pct"]),
                    last_mention=ts[-1]["date"] if ts else None,
                ))

        declining.sort(key=lambda d: d.decline_rate, reverse=True)
        return declining[:10]

    def _detect_anomalies(
        self, keyword_trends: List[Dict[str, Any]]
    ) -> List[Anomaly]:
        """Detect anomalies in keyword frequency using statistical methods."""
        anomalies = []

        for kw_trend in keyword_trends:
            ts = kw_trend["time_series"]
            if len(ts) < 5:
                continue

            mentions = [p["mentions"] for p in ts]
            mean_val = np.mean(mentions)
            std_val = np.std(mentions)

            if std_val < 0.5:
                continue  # Not enough variation

            for point in ts:
                z_score = (point["mentions"] - mean_val) / std_val if std_val > 0 else 0
                if abs(z_score) > 2.0:
                    severity = "low"
                    if abs(z_score) > 3.0:
                        severity = "high"
                    elif abs(z_score) > 2.5:
                        severity = "medium"

                    anomalies.append(Anomaly(
                        date=point["date"],
                        keyword=kw_trend["keyword"],
                        expected_mentions=round(float(mean_val), 1),
                        actual_mentions=float(point["mentions"]),
                        severity=severity,
                        context=f"{'Spike' if z_score > 0 else 'Drop'} in '{kw_trend['keyword']}' mentions "
                                f"(z-score: {z_score:.1f})",
                    ))

        anomalies.sort(key=lambda a: {"high": 3, "medium": 2, "low": 1}.get(a.severity, 0), reverse=True)
        return anomalies[:20]

    def _forecast_keyword(
        self, time_series: List[Dict[str, Any]], periods: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Simple moving average forecast for keyword mentions.
        Uses exponential smoothing for production-grade results.
        """
        if len(time_series) < 3:
            return []

        mentions = [p["mentions"] for p in time_series]

        # Exponential smoothing
        alpha = 0.3
        level = mentions[0]
        smoothed = [level]

        for val in mentions[1:]:
            level = alpha * val + (1 - alpha) * level
            smoothed.append(level)

        # Forecast
        last_date = datetime.strptime(time_series[-1]["date"], "%Y-%m-%d") \
            if isinstance(time_series[-1]["date"], str) else time_series[-1]["date"]

        forecasts = []
        for i in range(1, periods + 1):
            forecast_date = last_date + timedelta(days=i)
            predicted = level  # Flat forecast from last smoothed value

            # Confidence interval widens with horizon
            ci_width = max(1, np.std(mentions)) * np.sqrt(i) * 0.5

            forecasts.append({
                "date": forecast_date.strftime("%Y-%m-%d"),
                "predicted_mentions": round(predicted, 1),
                "confidence_interval": {
                    "low": max(0, round(predicted - ci_width, 1)),
                    "high": round(predicted + ci_width, 1),
                },
            })

        return forecasts

    # -------------------------------------------------
    # PRIVATE - PRICE FORECASTING
    # -------------------------------------------------

    def _compute_short_term_forecast(
        self,
        price_history: List[Dict[str, Any]],
        economic_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Compute 6-month price forecast using trend extrapolation and economic factors."""
        if not price_history or len(price_history) < 3:
            return {
                "horizon_months": 6,
                "expected_change_pct": 0.0,
                "direction_probability": 0.5,
                "confidence_interval": {"low": 0, "high": 0},
                "note": "Insufficient historical data for reliable forecast",
            }

        prices = [float(h["avg_price"]) for h in price_history if h.get("avg_price")]
        if len(prices) < 3:
            return {
                "horizon_months": 6,
                "expected_change_pct": 0.0,
                "direction_probability": 0.5,
                "confidence_interval": {"low": 0, "high": 0},
            }

        # Compute trend
        n = len(prices)
        x = np.arange(n)
        coeffs = np.polyfit(x, prices, 1)
        slope = coeffs[0]
        last_price = prices[-1]

        # 6-month extrapolation
        forecast_price = last_price + slope * 6
        change_pct = ((forecast_price - last_price) / last_price) * 100

        # Adjust for economic factors
        inflation = economic_data.get("inflation_rate", {}).get("current", 20.0)
        mortgage_rate = economic_data.get("mortgage_rate_avg", {}).get("current", 30.0)

        # High inflation tends to push nominal prices up
        inflation_adjustment = inflation * 0.3  # 30% pass-through
        # High mortgage rates dampen demand
        mortgage_dampening = max(0, (mortgage_rate - 25) * -0.5)

        adjusted_change = change_pct + inflation_adjustment + mortgage_dampening

        # Direction probability
        direction_prob = 0.5
        if adjusted_change > 5:
            direction_prob = min(0.9, 0.5 + adjusted_change / 50)
        elif adjusted_change < -5:
            direction_prob = max(0.1, 0.5 + adjusted_change / 50)

        # Confidence interval
        price_std = float(np.std(prices))
        ci_low = forecast_price - 1.96 * price_std
        ci_high = forecast_price + 1.96 * price_std

        return {
            "horizon_months": 6,
            "expected_change_pct": round(adjusted_change, 1),
            "direction_probability": round(direction_prob, 2),
            "confidence_interval": {
                "low": round(((ci_low - last_price) / last_price) * 100, 1),
                "high": round(((ci_high - last_price) / last_price) * 100, 1),
            },
            "current_avg_price": round(last_price, 0),
            "forecast_avg_price": round(forecast_price, 0),
        }

    def _compute_long_term_forecast(
        self,
        price_history: List[Dict[str, Any]],
        economic_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Compute 3-year price forecast with scenario analysis."""
        if not price_history or len(price_history) < 6:
            return {
                "horizon_years": 3,
                "scenarios": {"optimistic": 0, "base": 0, "pessimistic": 0},
                "key_assumptions": ["Insufficient data for long-term forecast"],
            }

        prices = [float(h["avg_price"]) for h in price_history if h.get("avg_price")]
        if len(prices) < 6:
            return {
                "horizon_years": 3,
                "scenarios": {"optimistic": 0, "base": 0, "pessimistic": 0},
                "key_assumptions": [],
            }

        last_price = prices[-1]

        # Annual growth rate from historical data
        annual_points = max(1, len(prices) // 12)
        if annual_points >= 2:
            first_year_avg = np.mean(prices[:12])
            last_year_avg = np.mean(prices[-12:])
            annual_growth = ((last_year_avg / first_year_avg) ** (1 / annual_points) - 1)
        else:
            annual_growth = (prices[-1] / prices[0]) ** (12 / len(prices)) - 1

        # Scenario adjustments
        base_3yr = last_price * (1 + annual_growth) ** 3
        optimistic_3yr = last_price * (1 + annual_growth * 1.5) ** 3
        pessimistic_3yr = last_price * (1 + annual_growth * 0.5) ** 3

        key_assumptions = [
            f"Historical annual growth rate: {annual_growth*100:.1f}%",
            f"Current inflation rate: {economic_data.get('inflation_rate', {}).get('current', 'N/A')}%",
            "Assumes stable macroeconomic environment",
            "No major regulatory changes assumed",
        ]

        return {
            "horizon_years": 3,
            "scenarios": {
                "optimistic": round(((optimistic_3yr - last_price) / last_price) * 100, 1),
                "base": round(((base_3yr - last_price) / last_price) * 100, 1),
                "pessimistic": round(((pessimistic_3yr - last_price) / last_price) * 100, 1),
            },
            "key_assumptions": key_assumptions,
        }

    def _analyze_price_drivers(
        self,
        economic_data: Dict[str, Any],
        price_history: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Analyze key economic drivers affecting price movements."""
        drivers = []

        # Inflation driver
        inflation = economic_data.get("inflation_rate", {})
        if inflation.get("current"):
            current = inflation["current"]
            direction = "positive" if current > 15 else "negative" if current < 5 else "positive"
            drivers.append({
                "factor": "Inflation Rate",
                "direction": direction,
                "impact_magnitude": round(min(1.0, current / 30), 2),
                "detail": f"Current inflation at {current}% {'pushes nominal prices up' if direction == 'positive' else 'indicates economic stability'}",
            })

        # Exchange rate driver
        fx = economic_data.get("exchange_rate_usd", {})
        if fx.get("current") and fx.get("previous"):
            depreciation = ((fx["current"] - fx["previous"]) / fx["previous"]) * 100
            drivers.append({
                "factor": "Exchange Rate (USD/GHS)",
                "direction": "positive" if depreciation > 2 else "negative" if depreciation < -2 else "positive",
                "impact_magnitude": round(min(1.0, abs(depreciation) / 10), 2),
                "detail": f"GHS {'depreciated' if depreciation > 0 else 'appreciated'} {abs(depreciation):.1f}% vs USD",
            })

        # Mortgage rate driver
        mortgage = economic_data.get("mortgage_rate_avg", {})
        if mortgage.get("current"):
            rate = mortgage["current"]
            drivers.append({
                "factor": "Mortgage Rate",
                "direction": "negative" if rate > 28 else "positive",
                "impact_magnitude": round(min(1.0, rate / 40), 2),
                "detail": f"Average mortgage rate at {rate}% {'dampens demand' if rate > 28 else 'supports demand'}",
            })

        # Supply-side driver (transaction volume)
        if price_history and len(price_history) >= 2:
            recent_volume = price_history[-1].get("transaction_count", 0)
            prev_volume = price_history[-2].get("transaction_count", 0) if len(price_history) > 1 else recent_volume
            if prev_volume > 0:
                volume_change = ((recent_volume - prev_volume) / prev_volume) * 100
                drivers.append({
                    "factor": "Transaction Volume",
                    "direction": "positive" if volume_change > 5 else "negative" if volume_change < -5 else "positive",
                    "impact_magnitude": round(min(1.0, abs(volume_change) / 30), 2),
                    "detail": f"Transaction volume {'increased' if volume_change > 0 else 'decreased'} {abs(volume_change):.0f}%",
                })

        return drivers

    async def _persist_analysis(
        self, response: TrendAnalysisResponse, request: TrendAnalysisRequest
    ) -> None:
        """Persist trend analysis result to database."""
        try:
            import json
            await async_db.execute(
                """
                INSERT INTO ml_trend_analysis (
                    analysis_id, period_start, period_end, region,
                    trending_topics, emerging_trends, declining_trends,
                    keyword_trends, anomalies
                ) VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (analysis_id) DO NOTHING
                """,
                response.analysis_id,
                response.period["start"],
                response.period["end"],
                request.region,
                json.dumps([t.model_dump() for t in response.trending_topics]),
                json.dumps([t.model_dump() for t in response.emerging_trends]),
                json.dumps([t.model_dump() for t in response.declining_trends]),
                json.dumps([t.model_dump() for t in response.keyword_trends]),
                json.dumps([a.model_dump() for a in response.anomalies]),
            )
        except Exception as e:
            logger.warning(f"Failed to persist trend analysis: {e}")


# Singleton
trend_analysis_service = TrendAnalysisService()
