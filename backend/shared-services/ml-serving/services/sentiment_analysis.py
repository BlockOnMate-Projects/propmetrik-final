"""
PROPMETRIK Sentiment Analysis Service

Analyzes sentiment from news articles, social media, market reports,
and stakeholder communications to gauge market sentiment and confidence.

Data Sources:
- Ghana real estate news portals (GhanaWeb, MyJoyOnline, Graphic Online)
- Social media (Twitter/X, LinkedIn, Facebook real estate groups)
- Published market reports and analyses
- Bank of Ghana statements and policy reports
- Developer announcements and press releases

ML Models:
- Transformer-based sentiment classification (DistilBERT / RoBERTa)
- Aspect-based sentiment analysis (housing prices, mortgage rates, supply, demand)
- Market confidence index aggregation

Consumers:
- Market Intelligence Analytics (Section 4)
- Construction & Labour Analytics (Section 1.7)
- Advanced Risk Analytics (Section 9)
"""

import logging
import uuid
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum

import numpy as np
from pydantic import BaseModel, Field

from .database import async_db
from .config import llm_config

logger = logging.getLogger(__name__)


# =====================================================
# TYPES
# =====================================================

class SentimentSource(str, Enum):
    NEWS = "news"
    SOCIAL_MEDIA = "social_media"
    REPORT = "report"
    POLICY = "policy"


class SentimentLevel(str, Enum):
    VERY_NEGATIVE = "very_negative"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    POSITIVE = "positive"
    VERY_POSITIVE = "very_positive"


class SentimentAnalysisRequest(BaseModel):
    """Input for sentiment analysis."""
    source: SentimentSource
    text: Optional[str] = None
    url: Optional[str] = None
    document_id: Optional[str] = None
    region_filter: Optional[str] = None
    property_type_filter: Optional[str] = None


class AspectSentiment(BaseModel):
    """Sentiment for a specific aspect (e.g., housing prices)."""
    aspect: str
    sentiment: float = Field(..., ge=-1.0, le=1.0)
    mentions: int
    key_phrases: List[str]


class ExtractedEntities(BaseModel):
    """Entities extracted from text."""
    locations: List[str] = []
    developers: List[str] = []
    property_types: List[str] = []
    projects: List[str] = []


class MarketIndicators(BaseModel):
    """Market signal indicators extracted from text."""
    bullish_signals: List[str] = []
    bearish_signals: List[str] = []
    neutral_statements: List[str] = []


class SentimentResult(BaseModel):
    """Sentiment analysis result."""
    overall: SentimentLevel
    score: float = Field(..., ge=-1.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)


class SentimentAnalysisResponse(BaseModel):
    """Full sentiment analysis response."""
    request_id: str
    analyzed_at: str
    sentiment: SentimentResult
    aspects: List[AspectSentiment]
    entities: ExtractedEntities
    market_indicators: MarketIndicators
    time_series: Optional[List[Dict[str, Any]]] = None


class MarketConfidenceIndex(BaseModel):
    """Aggregated market confidence index."""
    date: str
    index_value: float = Field(..., ge=0.0, le=100.0)
    change_1d: Optional[float] = None
    change_7d: Optional[float] = None
    change_30d: Optional[float] = None
    sentiment_distribution: Dict[str, float]
    sample_size: int
    region: Optional[str] = None


# =====================================================
# ASPECT DEFINITIONS
# =====================================================

REAL_ESTATE_ASPECTS = {
    "housing_prices": [
        "price", "cost", "expensive", "affordable", "value", "appreciation",
        "depreciation", "surge", "drop", "increase", "decrease", "overvalued",
        "undervalued", "premium", "discount", "market value"
    ],
    "mortgage_rates": [
        "mortgage", "interest rate", "loan", "lending", "borrowing",
        "bank rate", "policy rate", "financing", "credit"
    ],
    "supply_demand": [
        "demand", "supply", "shortage", "surplus", "oversupply",
        "undersupply", "inventory", "listing", "units", "availability"
    ],
    "construction": [
        "construction", "building", "development", "project",
        "material", "cement", "steel", "labour", "contractor"
    ],
    "investment_climate": [
        "investment", "investor", "returns", "yield", "roi",
        "opportunity", "risk", "growth", "market outlook", "forecast"
    ],
    "rental_market": [
        "rent", "rental", "tenant", "lease", "occupancy",
        "vacancy", "landlord", "letting"
    ],
    "government_policy": [
        "regulation", "policy", "tax", "government", "law",
        "permit", "zoning", "compliance", "reform", "legislation"
    ],
}

# Bullish/bearish keyword patterns
BULLISH_PATTERNS = [
    r"price\s+(surge|increase|rise|growth|appreciation|boom)", 
    r"strong\s+(demand|market|growth|performance)",
    r"(record|new)\s+high", r"buyer.s?\s+market",
    r"positive\s+(outlook|trend|momentum)",
    r"investment\s+(opportunity|inflow|attraction)",
    r"rental\s+yield\s+(increase|growth|strong)",
]

BEARISH_PATTERNS = [
    r"price\s+(drop|decline|fall|crash|correction)",
    r"(weak|slow|sluggish)\s+(demand|market|growth)",
    r"(bubble|overheated|overvalued)\s+market",
    r"(foreclosure|default|delinquency)\s+(increase|rise)",
    r"(interest|mortgage)\s+rate\s+(increase|hike|rise)",
    r"(oversupply|excess|surplus)\s+of\s+(housing|units|inventory)",
    r"affordability\s+(crisis|concern|issue)",
]


# =====================================================
# SERVICE
# =====================================================

class SentimentAnalysisService:
    """
    Core sentiment analysis service.
    
    Uses a hybrid approach:
    1. Rule-based aspect detection and keyword matching
    2. LLM-powered deep sentiment understanding (via Anthropic/OpenAI)
    3. Statistical aggregation for market confidence index
    """

    def __init__(self):
        self._aspect_keywords = REAL_ESTATE_ASPECTS
        self._bullish_patterns = [re.compile(p, re.IGNORECASE) for p in BULLISH_PATTERNS]
        self._bearish_patterns = [re.compile(p, re.IGNORECASE) for p in BEARISH_PATTERNS]

    async def analyze(self, request: SentimentAnalysisRequest) -> SentimentAnalysisResponse:
        """
        Perform sentiment analysis on text content.

        Args:
            request: SentimentAnalysisRequest with source, text/url, and filters.

        Returns:
            SentimentAnalysisResponse with sentiment scores, aspects, entities,
            and market indicators.

        Raises:
            ValueError: If neither text nor url is provided.
        """
        request_id = str(uuid.uuid4())
        
        # Resolve text content
        text = await self._resolve_text(request)
        if not text or len(text.strip()) < 10:
            raise ValueError("Insufficient text content for analysis")

        # Run analysis steps concurrently where possible
        sentiment = self._compute_overall_sentiment(text)
        aspects = self._extract_aspects(text)
        entities = self._extract_entities(text, request.region_filter)
        market_indicators = self._extract_market_indicators(text)

        # Enhance with LLM if available and text is substantial
        if len(text) > 200 and llm_config.anthropic_api_key:
            try:
                llm_result = await self._llm_enhance_analysis(text, request.source)
                sentiment, aspects = self._merge_llm_results(
                    sentiment, aspects, llm_result
                )
            except Exception as e:
                logger.warning(f"LLM enhancement failed, using rule-based results: {e}")

        response = SentimentAnalysisResponse(
            request_id=request_id,
            analyzed_at=datetime.utcnow().isoformat(),
            sentiment=sentiment,
            aspects=aspects,
            entities=entities,
            market_indicators=market_indicators,
        )

        # Persist result
        await self._persist_result(response, request)

        return response

    async def get_history(
        self,
        region: Optional[str] = None,
        period_days: int = 30,
        source: Optional[SentimentSource] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve historical sentiment analysis results.

        Args:
            region: Optional region filter.
            period_days: Number of days to look back.
            source: Optional source type filter.

        Returns:
            List of historical sentiment data points.
        """
        conditions = ["analyzed_at >= $1"]
        params: list = [datetime.utcnow() - timedelta(days=period_days)]
        idx = 2

        if region:
            conditions.append(f"region = ${idx}")
            params.append(region)
            idx += 1

        if source:
            conditions.append(f"source_type = ${idx}")
            params.append(source.value)
            idx += 1

        where_clause = " AND ".join(conditions)

        rows = await async_db.fetch(
            f"""
            SELECT 
                analyzed_at::date as date,
                AVG(sentiment_score) as avg_sentiment,
                COUNT(*) as sample_size,
                sentiment_overall as dominant_sentiment
            FROM ml_sentiment_analysis
            WHERE {where_clause}
            GROUP BY analyzed_at::date, sentiment_overall
            ORDER BY date DESC
            """,
            *params,
        )

        return [dict(r) for r in rows]

    async def get_market_confidence_index(
        self, region: Optional[str] = None
    ) -> MarketConfidenceIndex:
        """
        Compute the aggregated market confidence index.
        
        The index is a 0-100 score derived from weighted sentiment scores
        across all sources, with recent data weighted more heavily.
        
        Args:
            region: Optional region filter.
            
        Returns:
            MarketConfidenceIndex with current score and trends.
        """
        region_clause = "AND region = $1" if region else ""
        params = [region] if region else []

        # Fetch recent sentiment data (last 30 days)
        rows = await async_db.fetch(
            f"""
            SELECT 
                analyzed_at::date as date,
                sentiment_score,
                confidence,
                source_type
            FROM ml_sentiment_analysis
            WHERE analyzed_at >= NOW() - INTERVAL '30 days'
            {region_clause}
            ORDER BY analyzed_at DESC
            """,
            *params,
        )

        if not rows:
            return MarketConfidenceIndex(
                date=datetime.utcnow().strftime("%Y-%m-%d"),
                index_value=50.0,
                sentiment_distribution={
                    "very_negative": 0, "negative": 0, "neutral": 1.0,
                    "positive": 0, "very_positive": 0,
                },
                sample_size=0,
                region=region,
            )

        # Compute time-weighted index
        scores = []
        weights = []
        distribution = {
            "very_negative": 0, "negative": 0, "neutral": 0,
            "positive": 0, "very_positive": 0,
        }

        now = datetime.utcnow()
        for row in rows:
            days_ago = (now.date() - row["date"]).days
            # Exponential decay: recent data matters more
            weight = np.exp(-0.05 * days_ago) * float(row["confidence"])
            scores.append(float(row["sentiment_score"]))
            weights.append(weight)

            # Classify for distribution
            score = float(row["sentiment_score"])
            if score <= -0.6:
                distribution["very_negative"] += 1
            elif score <= -0.2:
                distribution["negative"] += 1
            elif score <= 0.2:
                distribution["neutral"] += 1
            elif score <= 0.6:
                distribution["positive"] += 1
            else:
                distribution["very_positive"] += 1

        # Normalize distribution
        total = sum(distribution.values())
        if total > 0:
            distribution = {k: round(v / total, 3) for k, v in distribution.items()}

        # Weighted average sentiment, mapped to 0-100 scale
        weights_arr = np.array(weights)
        scores_arr = np.array(scores)
        weighted_avg = float(np.average(scores_arr, weights=weights_arr))
        index_value = round((weighted_avg + 1) * 50, 1)  # Map [-1, 1] → [0, 100]

        return MarketConfidenceIndex(
            date=datetime.utcnow().strftime("%Y-%m-%d"),
            index_value=index_value,
            sentiment_distribution=distribution,
            sample_size=len(rows),
            region=region,
        )

    # -------------------------------------------------
    # PRIVATE METHODS
    # -------------------------------------------------

    async def _resolve_text(self, request: SentimentAnalysisRequest) -> str:
        """Resolve text content from request parameters."""
        if request.text:
            return request.text

        if request.url:
            return await self._fetch_url_content(request.url)

        if request.document_id:
            row = await async_db.fetchrow(
                "SELECT source_text FROM ml_sentiment_analysis WHERE request_id = $1",
                request.document_id,
            )
            if row:
                return row["source_text"]

        raise ValueError("No text source provided (text, url, or document_id required)")

    async def _fetch_url_content(self, url: str) -> str:
        """Fetch and extract text content from a URL."""
        import httpx

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()

        # Basic HTML text extraction
        html = response.text
        # Remove script and style tags
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', ' ', html)
        # Collapse whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        return text[:10000]  # Cap at 10k chars

    def _compute_overall_sentiment(self, text: str) -> SentimentResult:
        """
        Compute overall sentiment using keyword/pattern scoring.
        This is the fast rule-based approach; LLM enhances it when available.
        """
        text_lower = text.lower()
        words = text_lower.split()
        total_words = len(words)

        if total_words == 0:
            return SentimentResult(overall=SentimentLevel.NEUTRAL, score=0.0, confidence=0.3)

        # Positive/negative scoring
        positive_score = 0.0
        negative_score = 0.0

        # Keyword scoring
        positive_keywords = {
            "growth", "opportunity", "strong", "increase", "surge", "boom",
            "appreciation", "demand", "positive", "improve", "recovery",
            "robust", "bullish", "attractive", "promising", "thriving",
        }
        negative_keywords = {
            "decline", "drop", "fall", "crash", "crisis", "concern",
            "bubble", "risk", "downturn", "weak", "slow", "delinquency",
            "foreclosure", "oversupply", "bearish", "uncertain", "volatile",
        }

        for word in words:
            if word in positive_keywords:
                positive_score += 1.0
            elif word in negative_keywords:
                negative_score += 1.0

        # Pattern scoring
        for pattern in self._bullish_patterns:
            matches = pattern.findall(text_lower)
            positive_score += len(matches) * 2.0

        for pattern in self._bearish_patterns:
            matches = pattern.findall(text_lower)
            negative_score += len(matches) * 2.0

        # Calculate final score
        total_signals = positive_score + negative_score
        if total_signals == 0:
            score = 0.0
            confidence = 0.3
        else:
            score = (positive_score - negative_score) / total_signals
            confidence = min(0.9, 0.3 + (total_signals / total_words) * 5)

        # Clamp
        score = max(-1.0, min(1.0, score))
        confidence = max(0.1, min(1.0, confidence))

        # Map score to level
        if score <= -0.6:
            level = SentimentLevel.VERY_NEGATIVE
        elif score <= -0.2:
            level = SentimentLevel.NEGATIVE
        elif score <= 0.2:
            level = SentimentLevel.NEUTRAL
        elif score <= 0.6:
            level = SentimentLevel.POSITIVE
        else:
            level = SentimentLevel.VERY_POSITIVE

        return SentimentResult(overall=level, score=round(score, 3), confidence=round(confidence, 3))

    def _extract_aspects(self, text: str) -> List[AspectSentiment]:
        """Extract aspect-level sentiment from text."""
        text_lower = text.lower()
        aspects = []

        for aspect_name, keywords in self._aspect_keywords.items():
            mentions = 0
            sentiment_sum = 0.0
            matched_phrases = []

            for keyword in keywords:
                # Find all occurrences
                pattern = re.compile(rf'\b{re.escape(keyword)}\b', re.IGNORECASE)
                matches = pattern.findall(text)
                if matches:
                    mentions += len(matches)

                    # Extract surrounding context for each match
                    for match in pattern.finditer(text):
                        start = max(0, match.start() - 100)
                        end = min(len(text), match.end() + 100)
                        context = text[start:end].strip()
                        matched_phrases.append(context[:80])

                        # Score context sentiment
                        context_lower = context.lower()
                        context_score = 0.0
                        pos_count = sum(1 for w in ["increase", "strong", "growth", "positive", "surge", "high"]
                                        if w in context_lower)
                        neg_count = sum(1 for w in ["decrease", "weak", "decline", "negative", "drop", "low", "concern"]
                                        if w in context_lower)
                        if pos_count + neg_count > 0:
                            context_score = (pos_count - neg_count) / (pos_count + neg_count)
                        sentiment_sum += context_score

            if mentions > 0:
                avg_sentiment = round(sentiment_sum / mentions, 3)
                aspects.append(AspectSentiment(
                    aspect=aspect_name,
                    sentiment=max(-1.0, min(1.0, avg_sentiment)),
                    mentions=mentions,
                    key_phrases=list(set(matched_phrases[:5])),
                ))

        # Sort by mentions descending
        aspects.sort(key=lambda a: a.mentions, reverse=True)
        return aspects

    def _extract_entities(
        self, text: str, region_filter: Optional[str] = None
    ) -> ExtractedEntities:
        """Extract entities using pattern matching (NER service provides deeper extraction)."""
        # Ghana-specific location patterns
        ghana_regions = [
            "Greater Accra", "Ashanti", "Eastern", "Western", "Central",
            "Northern", "Volta", "Upper East", "Upper West", "Bono",
            "Bono East", "Ahafo", "Savannah", "North East", "Oti",
            "Western North",
        ]
        ghana_cities = [
            "Accra", "Kumasi", "Tamale", "Takoradi", "Cape Coast",
            "Tema", "Koforidua", "Sunyani", "Ho", "Bolgatanga",
            "Wa", "Techiman",
        ]
        ghana_neighborhoods = [
            "Cantonments", "East Legon", "Airport Residential", "Labone",
            "Osu", "Ridge", "Roman Ridge", "Dzorwulu", "Abelemkpe",
            "Trasacco", "Spintex", "Teshie", "Madina", "Dansoman",
            "Achimota", "Ashaley Botwe", "Adenta", "Dome", "Kwabenya",
            "Haatso", "Amasaman", "Kasoa",
        ]

        locations = []
        for loc_list in [ghana_regions, ghana_cities, ghana_neighborhoods]:
            for loc in loc_list:
                if re.search(rf'\b{re.escape(loc)}\b', text, re.IGNORECASE):
                    locations.append(loc)

        # Developer / organization patterns
        developer_patterns = [
            r'(?:developed|built|constructed)\s+by\s+([A-Z][A-Za-z\s&]+(?:Ltd|Limited|Properties|Group|Estates|Developers|Construction))',
            r'([A-Z][A-Za-z\s&]+(?:Properties|Estates|Developers|Realty|Homes|Construction|Group))\b',
        ]
        developers = []
        for pattern in developer_patterns:
            matches = re.findall(pattern, text)
            developers.extend([m.strip() for m in matches if len(m.strip()) > 3])

        # Property type detection
        property_types = []
        type_keywords = {
            "apartment": ["apartment", "flat", "studio"],
            "house": ["house", "bungalow", "villa", "mansion", "townhouse"],
            "commercial": ["office", "shop", "retail", "commercial", "warehouse"],
            "land": ["land", "plot", "acre", "hectare"],
        }
        for ptype, keywords in type_keywords.items():
            for kw in keywords:
                if re.search(rf'\b{re.escape(kw)}\b', text, re.IGNORECASE):
                    if ptype not in property_types:
                        property_types.append(ptype)
                    break

        return ExtractedEntities(
            locations=list(set(locations)),
            developers=list(set(developers))[:10],
            property_types=property_types,
            projects=[],
        )

    def _extract_market_indicators(self, text: str) -> MarketIndicators:
        """Extract bullish/bearish market signals from text."""
        bullish = []
        bearish = []

        for pattern in self._bullish_patterns:
            matches = pattern.findall(text)
            for m in matches:
                match_text = m if isinstance(m, str) else " ".join(m)
                bullish.append(match_text[:100])

        for pattern in self._bearish_patterns:
            matches = pattern.findall(text)
            for m in matches:
                match_text = m if isinstance(m, str) else " ".join(m)
                bearish.append(match_text[:100])

        return MarketIndicators(
            bullish_signals=list(set(bullish))[:10],
            bearish_signals=list(set(bearish))[:10],
            neutral_statements=[],
        )

    async def _llm_enhance_analysis(
        self, text: str, source: SentimentSource
    ) -> Dict[str, Any]:
        """
        Use LLM to enhance sentiment analysis with deeper understanding.
        Falls back gracefully if LLM is unavailable.
        """
        import httpx

        prompt = f"""Analyze the following {source.value} text about Ghana's real estate market.
Return a JSON object with:
1. "overall_sentiment": score from -1 (very negative) to +1 (very positive)
2. "confidence": 0-1 how confident you are
3. "aspects": array of {{"aspect": str, "sentiment": float, "key_phrases": [str]}}
   Focus on: housing_prices, mortgage_rates, supply_demand, construction, investment_climate, rental_market
4. "bullish_signals": array of strings (positive market indicators found)
5. "bearish_signals": array of strings (negative market indicators found)

TEXT:
{text[:4000]}

Return ONLY valid JSON, no explanations."""

        if llm_config.default_provider == "anthropic" and llm_config.anthropic_api_key:
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
                        "temperature": 0.1,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                response.raise_for_status()
                data = response.json()
                content = data["content"][0]["text"]

                import json
                # Extract JSON from response
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())

        return {}

    def _merge_llm_results(
        self,
        rule_sentiment: SentimentResult,
        rule_aspects: List[AspectSentiment],
        llm_result: Dict[str, Any],
    ) -> Tuple[SentimentResult, List[AspectSentiment]]:
        """Merge rule-based and LLM results, giving LLM higher weight."""
        if not llm_result:
            return rule_sentiment, rule_aspects

        # Blend overall sentiment (70% LLM, 30% rule-based)
        llm_score = llm_result.get("overall_sentiment", rule_sentiment.score)
        llm_confidence = llm_result.get("confidence", rule_sentiment.confidence)

        blended_score = 0.7 * llm_score + 0.3 * rule_sentiment.score
        blended_confidence = max(llm_confidence, rule_sentiment.confidence)

        # Map to level
        if blended_score <= -0.6:
            level = SentimentLevel.VERY_NEGATIVE
        elif blended_score <= -0.2:
            level = SentimentLevel.NEGATIVE
        elif blended_score <= 0.2:
            level = SentimentLevel.NEUTRAL
        elif blended_score <= 0.6:
            level = SentimentLevel.POSITIVE
        else:
            level = SentimentLevel.VERY_POSITIVE

        merged_sentiment = SentimentResult(
            overall=level,
            score=round(blended_score, 3),
            confidence=round(blended_confidence, 3),
        )

        # Merge aspects
        llm_aspects = llm_result.get("aspects", [])
        aspect_map = {a.aspect: a for a in rule_aspects}

        for la in llm_aspects:
            name = la.get("aspect", "")
            if name in aspect_map:
                # Blend
                existing = aspect_map[name]
                blended = AspectSentiment(
                    aspect=name,
                    sentiment=round(0.6 * la.get("sentiment", 0) + 0.4 * existing.sentiment, 3),
                    mentions=existing.mentions,
                    key_phrases=list(set(existing.key_phrases + la.get("key_phrases", [])))[:5],
                )
                aspect_map[name] = blended
            elif la.get("sentiment") is not None:
                aspect_map[name] = AspectSentiment(
                    aspect=name,
                    sentiment=round(la["sentiment"], 3),
                    mentions=1,
                    key_phrases=la.get("key_phrases", [])[:5],
                )

        merged_aspects = sorted(aspect_map.values(), key=lambda a: a.mentions, reverse=True)
        return merged_sentiment, merged_aspects

    async def _persist_result(
        self,
        response: SentimentAnalysisResponse,
        request: SentimentAnalysisRequest,
    ) -> None:
        """Persist analysis result to database."""
        try:
            import json
            await async_db.execute(
                """
                INSERT INTO ml_sentiment_analysis (
                    request_id, source_type, source_url, source_text, region,
                    sentiment_overall, sentiment_score, confidence,
                    aspects, entities, market_indicators, analyzed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (request_id) DO NOTHING
                """,
                response.request_id,
                request.source.value,
                request.url,
                request.text[:5000] if request.text else None,
                request.region_filter,
                response.sentiment.overall.value,
                response.sentiment.score,
                response.sentiment.confidence,
                json.dumps([a.model_dump() for a in response.aspects]),
                json.dumps(response.entities.model_dump()),
                json.dumps(response.market_indicators.model_dump()),
                datetime.utcnow(),
            )
        except Exception as e:
            logger.warning(f"Failed to persist sentiment result: {e}")


# Singleton
sentiment_analysis_service = SentimentAnalysisService()
