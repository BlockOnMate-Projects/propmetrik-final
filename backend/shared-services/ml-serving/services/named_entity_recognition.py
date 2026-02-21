"""
PROPMETRIK Named Entity Recognition (NER) Service

Extracts structured information from unstructured text including
locations, developers, projects, prices, and stakeholders.

Entity Types:
- Locations: Regions, cities, neighborhoods, landmarks
- Organizations: Developers, construction firms, banks, government agencies
- Projects: Property developments, infrastructure projects
- Financial: Prices, costs, investment amounts, valuations
- Temporal: Dates, project timelines, market periods
- Technical: Property specifications, building materials, floor areas

Training Data Sources:
- Ghana property listings (PROPMETRIK database)
- Construction permits and approvals
- Bank of Ghana reports
- News articles on real estate
- Legal documents (sale agreements, leases)

Consumers:
- Sentiment Analysis Service (entity extraction)
- Document Intelligence Engine
- Data Hub ingestion pipeline
- Market Intelligence Analytics
"""

import logging
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .database import async_db
from .config import llm_config

logger = logging.getLogger(__name__)


# =====================================================
# TYPES
# =====================================================

class DocumentType(str):
    NEWS = "news"
    LISTING = "listing"
    REPORT = "report"
    LEGAL = "legal"
    BID = "bid"


class NERRequest(BaseModel):
    """Input for Named Entity Recognition."""
    text: str
    document_type: Optional[str] = None
    extract_relationships: bool = False


class LocationEntity(BaseModel):
    """Extracted location entity."""
    text: str
    type: str  # region, city, neighborhood, landmark
    confidence: float = Field(..., ge=0.0, le=1.0)
    standardized_name: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None


class OrganizationEntity(BaseModel):
    """Extracted organization entity."""
    text: str
    type: str  # developer, contractor, bank, government, other
    confidence: float = Field(..., ge=0.0, le=1.0)
    org_id: Optional[str] = None


class ProjectEntity(BaseModel):
    """Extracted project entity."""
    name: str
    type: Optional[str] = None  # PropertyType
    location: Optional[str] = None
    status: Optional[str] = None  # proposed, under_construction, completed
    units: Optional[int] = None


class FinancialEntity(BaseModel):
    """Extracted financial entity."""
    text: str
    type: str  # price, cost, investment, valuation
    amount: Optional[float] = None
    currency: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)


class TemporalEntity(BaseModel):
    """Extracted temporal entity."""
    text: str
    type: str  # date, duration, deadline
    normalized_date: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)


class Relationship(BaseModel):
    """Extracted entity relationship."""
    subject: str
    predicate: str  # developed_by, located_in, valued_at
    object: str
    confidence: float = Field(..., ge=0.0, le=1.0)


class NERResponse(BaseModel):
    """Full NER response."""
    request_id: str
    entities: Dict[str, Any]
    relationships: Optional[List[Relationship]] = None
    structured_summary: Dict[str, str]


# =====================================================
# ENTITY DICTIONARIES (Ghana-Specific)
# =====================================================

GHANA_REGIONS = {
    "Greater Accra": {"type": "region", "code": "greater_accra"},
    "Ashanti": {"type": "region", "code": "ashanti"},
    "Eastern": {"type": "region", "code": "eastern"},
    "Western": {"type": "region", "code": "western"},
    "Central": {"type": "region", "code": "central"},
    "Volta": {"type": "region", "code": "volta"},
    "Northern": {"type": "region", "code": "northern"},
    "Upper East": {"type": "region", "code": "upper_east"},
    "Upper West": {"type": "region", "code": "upper_west"},
    "Bono": {"type": "region", "code": "bono"},
    "Bono East": {"type": "region", "code": "bono_east"},
    "Ahafo": {"type": "region", "code": "ahafo"},
    "Savannah": {"type": "region", "code": "savannah"},
    "North East": {"type": "region", "code": "north_east"},
    "Oti": {"type": "region", "code": "oti"},
    "Western North": {"type": "region", "code": "western_north"},
}

GHANA_CITIES = {
    "Accra": {"type": "city", "region": "greater_accra", "lat": 5.6037, "lng": -0.1870},
    "Kumasi": {"type": "city", "region": "ashanti", "lat": 6.6885, "lng": -1.6244},
    "Tamale": {"type": "city", "region": "northern", "lat": 9.4008, "lng": -0.8393},
    "Takoradi": {"type": "city", "region": "western", "lat": 4.8986, "lng": -1.7600},
    "Sekondi": {"type": "city", "region": "western", "lat": 4.9343, "lng": -1.7141},
    "Cape Coast": {"type": "city", "region": "central", "lat": 5.1036, "lng": -1.2466},
    "Tema": {"type": "city", "region": "greater_accra", "lat": 5.6698, "lng": -0.0166},
    "Koforidua": {"type": "city", "region": "eastern", "lat": 6.0942, "lng": -0.2588},
    "Sunyani": {"type": "city", "region": "bono", "lat": 7.3390, "lng": -2.3288},
    "Ho": {"type": "city", "region": "volta", "lat": 6.6118, "lng": 0.4703},
    "Bolgatanga": {"type": "city", "region": "upper_east", "lat": 10.7855, "lng": -0.8514},
    "Wa": {"type": "city", "region": "upper_west", "lat": 10.0601, "lng": -2.5099},
    "Techiman": {"type": "city", "region": "bono_east", "lat": 7.5874, "lng": -1.9390},
}

GHANA_NEIGHBORHOODS = {
    # Greater Accra premium areas
    "Cantonments": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "East Legon": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "Airport Residential": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "Labone": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "Osu": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "Ridge": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "Roman Ridge": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "Dzorwulu": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    "Abelemkpe": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Trasacco": {"type": "neighborhood", "city": "Accra", "tier": "premium"},
    # Spintex corridor
    "Spintex": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Baatsonaa": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    # Tema areas
    "Tema Community 25": {"type": "neighborhood", "city": "Tema", "tier": "mid"},
    "Ningo-Prampram": {"type": "neighborhood", "city": "Tema", "tier": "emerging"},
    # Accra periphery
    "Madina": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Adenta": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Dome": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Kwabenya": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Haatso": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Amasaman": {"type": "neighborhood", "city": "Accra", "tier": "emerging"},
    "Kasoa": {"type": "neighborhood", "city": "Accra", "tier": "emerging"},
    "Dansoman": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Achimota": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Ashaley Botwe": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
    "Teshie": {"type": "neighborhood", "city": "Accra", "tier": "mid"},
}

GHANA_BANKS = [
    "GCB Bank", "Ecobank Ghana", "Stanbic Bank", "Standard Chartered",
    "Absa Bank Ghana", "Fidelity Bank", "CalBank", "Republic Bank",
    "Societe Generale", "Zenith Bank Ghana", "Access Bank Ghana",
    "National Investment Bank", "Bank of Ghana", "First National Bank",
    "Agricultural Development Bank", "Prudential Bank",
]

# Financial patterns
PRICE_PATTERNS = [
    # GHS amounts
    r'(?:GH[S¢Ȼ]|GHS)\s*[\$]?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:million|M|m)?',
    r'([\d,]+(?:\.\d{1,2})?)\s*(?:GH[S¢Ȼ]|GHS)',
    # USD amounts
    r'(?:US\$|\$)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:million|M|m)?',
    # Generic with currency context
    r'(?:priced|valued|listed|costs?|worth)\s+(?:at\s+)?(?:GH[S¢Ȼ]|GHS|\$|US\$)\s*([\d,]+(?:\.\d{1,2})?)',
]

DATE_PATTERNS = [
    # Q1 2026 format
    r'Q([1-4])\s+(\d{4})',
    # Month Year
    r'(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})',
    # YYYY-MM-DD
    r'(\d{4})-(\d{2})-(\d{2})',
    # Year only in context
    r'(?:by|in|before|after|until|during)\s+(\d{4})',
]


# =====================================================
# SERVICE
# =====================================================

class NERService:
    """
    Named Entity Recognition service for Ghana real estate domain.
    
    Uses a layered approach:
    1. Dictionary/pattern matching for known entities (fast, high precision)
    2. Regex patterns for financial/temporal entities
    3. LLM for complex entity extraction and relationships (when available)
    """

    def __init__(self):
        self._location_lookup = {}
        self._build_location_lookup()

    def _build_location_lookup(self) -> None:
        """Pre-build a normalized lookup for location matching."""
        for name, data in {**GHANA_REGIONS, **GHANA_CITIES, **GHANA_NEIGHBORHOODS}.items():
            self._location_lookup[name.lower()] = {"name": name, **data}

    async def extract(self, request: NERRequest) -> NERResponse:
        """
        Extract named entities from text.

        Args:
            request: NERRequest containing text and options.

        Returns:
            NERResponse with categorized entities and optional relationships.
        """
        request_id = str(uuid.uuid4())
        text = request.text

        # Extract each entity type
        locations = self._extract_locations(text)
        organizations = self._extract_organizations(text)
        projects = self._extract_projects(text)
        financial = self._extract_financial(text)
        temporal = self._extract_temporal(text)

        entities = {
            "locations": [loc.model_dump() for loc in locations],
            "organizations": [org.model_dump() for org in organizations],
            "projects": [proj.model_dump() for proj in projects],
            "financial": [fin.model_dump() for fin in financial],
            "temporal": [tmp.model_dump() for tmp in temporal],
        }

        # Extract relationships if requested
        relationships = None
        if request.extract_relationships:
            relationships = self._extract_relationships(
                text, locations, organizations, financial, projects
            )
            # Enhance with LLM if available
            if llm_config.anthropic_api_key and len(text) > 100:
                try:
                    llm_rels = await self._llm_extract_relationships(text)
                    if llm_rels:
                        existing_keys = {(r.subject, r.predicate, r.object) for r in relationships}
                        for lr in llm_rels:
                            key = (lr.subject, lr.predicate, lr.object)
                            if key not in existing_keys:
                                relationships.append(lr)
                except Exception as e:
                    logger.warning(f"LLM relationship extraction failed: {e}")

        # Generate summary
        summary = self._generate_summary(locations, organizations, financial, projects)

        response = NERResponse(
            request_id=request_id,
            entities=entities,
            relationships=relationships,
            structured_summary=summary,
        )

        # Persist extracted entities
        await self._persist_entities(response, request)

        return response

    async def batch_extract(self, texts: List[str], document_type: Optional[str] = None) -> List[NERResponse]:
        """
        Batch entity extraction for multiple texts.

        Args:
            texts: List of texts to process.
            document_type: Optional document type for all texts.

        Returns:
            List of NERResponse objects.
        """
        results = []
        for text in texts:
            request = NERRequest(text=text, document_type=document_type)
            result = await self.extract(request)
            results.append(result)
        return results

    # -------------------------------------------------
    # ENTITY EXTRACTION METHODS
    # -------------------------------------------------

    def _extract_locations(self, text: str) -> List[LocationEntity]:
        """Extract location entities from text."""
        locations = []
        seen = set()

        # Match against known locations
        for canonical_lower, data in self._location_lookup.items():
            name = data["name"]
            pattern = re.compile(rf'\b{re.escape(name)}\b', re.IGNORECASE)
            if pattern.search(text) and name not in seen:
                seen.add(name)
                loc_type = data.get("type", "region")
                
                # Build standardized name
                standardized = name
                if loc_type == "neighborhood":
                    city = data.get("city", "")
                    standardized = f"{name}, {city}" if city else name
                elif loc_type == "city":
                    region = data.get("region", "")
                    for rname, rdata in GHANA_REGIONS.items():
                        if rdata.get("code") == region:
                            standardized = f"{name}, {rname}"
                            break

                coords = None
                if "lat" in data and "lng" in data:
                    coords = {"lat": data["lat"], "lng": data["lng"]}

                locations.append(LocationEntity(
                    text=name,
                    type=loc_type,
                    confidence=0.95,
                    standardized_name=standardized,
                    coordinates=coords,
                ))

        return locations

    def _extract_organizations(self, text: str) -> List[OrganizationEntity]:
        """Extract organization entities from text."""
        organizations = []
        seen = set()

        # Known banks
        for bank in GHANA_BANKS:
            if re.search(rf'\b{re.escape(bank)}\b', text, re.IGNORECASE) and bank not in seen:
                seen.add(bank)
                organizations.append(OrganizationEntity(
                    text=bank, type="bank", confidence=0.95,
                ))

        # Government agencies
        gov_agencies = [
            "Bank of Ghana", "Ghana Statistical Service", "Lands Commission",
            "Ministry of Housing", "Ministry of Finance", "NADMO",
            "Ghana Investment Promotion Centre", "Ghana Revenue Authority",
        ]
        for agency in gov_agencies:
            if re.search(rf'\b{re.escape(agency)}\b', text, re.IGNORECASE) and agency not in seen:
                seen.add(agency)
                organizations.append(OrganizationEntity(
                    text=agency, type="government", confidence=0.95,
                ))

        # Developers/contractors via pattern matching
        dev_patterns = [
            r'\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Properties|Estates|Developers|Realty|Homes|Construction|Group|Ltd|Limited))\b',
        ]
        for pattern in dev_patterns:
            for match in re.finditer(pattern, text):
                name = match.group(1).strip()
                if name not in seen and len(name) > 5:
                    seen.add(name)
                    org_type = "developer"
                    if any(w in name.lower() for w in ["construction", "build"]):
                        org_type = "contractor"
                    organizations.append(OrganizationEntity(
                        text=name, type=org_type, confidence=0.75,
                    ))

        return organizations

    def _extract_projects(self, text: str) -> List[ProjectEntity]:
        """Extract project entities from text."""
        projects = []

        # Project name patterns
        project_patterns = [
            r'(?:the\s+)?([A-Z][A-Za-z\s]+(?:Estate|Villas|Towers|Heights|Gardens|Residences|Court|Park|Place|Square|Phase\s+\d+))\b',
        ]

        for pattern in project_patterns:
            for match in re.finditer(pattern, text):
                name = match.group(1).strip()
                if len(name) > 5:
                    # Determine type from context
                    context_start = max(0, match.start() - 150)
                    context_end = min(len(text), match.end() + 150)
                    context = text[context_start:context_end].lower()

                    ptype = None
                    if any(w in context for w in ["apartment", "flat", "residential"]):
                        ptype = "residential"
                    elif any(w in context for w in ["office", "commercial", "retail"]):
                        ptype = "commercial"
                    elif any(w in context for w in ["mixed", "mixed-use"]):
                        ptype = "mixed_use"

                    status = None
                    if any(w in context for w in ["proposed", "planning", "planned"]):
                        status = "proposed"
                    elif any(w in context for w in ["under construction", "building", "ongoing"]):
                        status = "under_construction"
                    elif any(w in context for w in ["completed", "finished", "ready"]):
                        status = "completed"

                    # Extract units count
                    units = None
                    units_match = re.search(r'(\d+)\s*(?:units?|apartments?|flats?)', context)
                    if units_match:
                        units = int(units_match.group(1))

                    projects.append(ProjectEntity(
                        name=name, type=ptype, status=status, units=units,
                    ))

        return projects

    def _extract_financial(self, text: str) -> List[FinancialEntity]:
        """Extract financial entities (prices, costs, etc.) from text."""
        financial = []

        for pattern_str in PRICE_PATTERNS:
            for match in re.finditer(pattern_str, text, re.IGNORECASE):
                raw_amount = match.group(1) if match.groups() else match.group(0)
                full_match = match.group(0)

                # Parse amount
                try:
                    amount_str = raw_amount.replace(",", "")
                    amount = float(amount_str)

                    # Check for million multiplier
                    if re.search(r'million|M\b', full_match, re.IGNORECASE):
                        amount *= 1_000_000

                    # Determine currency
                    currency = "GHS"
                    if re.search(r'US\$|\$(?!.*GH)', full_match):
                        currency = "USD"

                    # Determine financial type from context
                    context_start = max(0, match.start() - 80)
                    context = text[context_start:match.end()].lower()

                    fin_type = "price"
                    if any(w in context for w in ["cost", "spend", "budget"]):
                        fin_type = "cost"
                    elif any(w in context for w in ["invest", "funding", "capital"]):
                        fin_type = "investment"
                    elif any(w in context for w in ["valued", "valuation", "worth", "assessed"]):
                        fin_type = "valuation"

                    financial.append(FinancialEntity(
                        text=full_match.strip(),
                        type=fin_type,
                        amount=amount,
                        currency=currency,
                        confidence=0.85,
                    ))

                except ValueError:
                    continue

        return financial

    def _extract_temporal(self, text: str) -> List[TemporalEntity]:
        """Extract temporal entities from text."""
        temporal = []

        # Quarter format: Q1 2026
        for match in re.finditer(r'Q([1-4])\s+(\d{4})', text):
            quarter = int(match.group(1))
            year = int(match.group(2))
            month = (quarter - 1) * 3 + 3  # End of quarter
            temporal.append(TemporalEntity(
                text=match.group(0),
                type="deadline",
                normalized_date=f"{year}-{month:02d}-30",
                confidence=0.9,
            ))

        # Month Year format
        months_map = {
            "january": 1, "february": 2, "march": 3, "april": 4,
            "may": 5, "june": 6, "july": 7, "august": 8,
            "september": 9, "october": 10, "november": 11, "december": 12,
        }
        for match in re.finditer(
            r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})',
            text, re.IGNORECASE,
        ):
            month = months_map[match.group(1).lower()]
            year = int(match.group(2))
            temporal.append(TemporalEntity(
                text=match.group(0),
                type="date",
                normalized_date=f"{year}-{month:02d}-01",
                confidence=0.9,
            ))

        # Duration patterns
        for match in re.finditer(r'(\d+)\s*(years?|months?|weeks?|days?)', text, re.IGNORECASE):
            temporal.append(TemporalEntity(
                text=match.group(0),
                type="duration",
                confidence=0.8,
            ))

        return temporal

    def _extract_relationships(
        self,
        text: str,
        locations: List[LocationEntity],
        organizations: List[OrganizationEntity],
        financial: List[FinancialEntity],
        projects: List[ProjectEntity],
    ) -> List[Relationship]:
        """Extract relationships between entities using proximity and patterns."""
        relationships = []

        # Developer → Project (developed_by)
        for project in projects:
            for org in organizations:
                if org.type in ("developer", "contractor"):
                    # Check proximity
                    proj_pos = text.find(project.name)
                    org_pos = text.find(org.text)
                    if proj_pos >= 0 and org_pos >= 0 and abs(proj_pos - org_pos) < 200:
                        relationships.append(Relationship(
                            subject=project.name,
                            predicate="developed_by",
                            object=org.text,
                            confidence=0.7,
                        ))

        # Project → Location (located_in)
        for project in projects:
            for loc in locations:
                proj_pos = text.find(project.name)
                loc_pos = text.find(loc.text)
                if proj_pos >= 0 and loc_pos >= 0 and abs(proj_pos - loc_pos) < 200:
                    relationships.append(Relationship(
                        subject=project.name,
                        predicate="located_in",
                        object=loc.text,
                        confidence=0.7,
                    ))

        # Price → Entity (valued_at)
        for fin in financial:
            fin_pos = text.find(fin.text)
            if fin_pos < 0:
                continue

            # Find nearest project or property type mention
            closest_entity = None
            closest_distance = 300

            for project in projects:
                proj_pos = text.find(project.name)
                if proj_pos >= 0:
                    dist = abs(fin_pos - proj_pos)
                    if dist < closest_distance:
                        closest_distance = dist
                        closest_entity = project.name

            if closest_entity:
                relationships.append(Relationship(
                    subject=closest_entity,
                    predicate="valued_at",
                    object=fin.text,
                    confidence=0.6,
                ))

        return relationships

    async def _llm_extract_relationships(self, text: str) -> List[Relationship]:
        """Use LLM for complex relationship extraction."""
        import httpx
        import json

        prompt = f"""Extract entity relationships from this Ghana real estate text.
Return a JSON array of objects with: "subject", "predicate", "object", "confidence"
Predicates should be: developed_by, located_in, valued_at, financed_by, managed_by, sold_to

TEXT: {text[:3000]}

Return ONLY valid JSON array."""

        if llm_config.anthropic_api_key:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": llm_config.anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": llm_config.default_model,
                        "max_tokens": 512,
                        "temperature": 0.1,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                response.raise_for_status()
                data = response.json()
                content = data["content"][0]["text"]

                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    rels_data = json.loads(json_match.group())
                    return [Relationship(**r) for r in rels_data if all(
                        k in r for k in ["subject", "predicate", "object", "confidence"]
                    )]

        return []

    def _generate_summary(
        self,
        locations: List[LocationEntity],
        organizations: List[OrganizationEntity],
        financial: List[FinancialEntity],
        projects: List[ProjectEntity],
    ) -> Dict[str, str]:
        """Generate structured natural language summary of extracted entities."""
        location_summary = ""
        if locations:
            loc_names = [loc.text for loc in locations]
            location_summary = f"Locations mentioned: {', '.join(loc_names)}."

        financial_summary = ""
        if financial:
            amounts = [f"{f.currency} {f.amount:,.0f}" for f in financial if f.amount]
            financial_summary = f"Financial values identified: {', '.join(amounts)}."

        project_summary = ""
        if projects:
            proj_names = [p.name for p in projects]
            project_summary = f"Projects referenced: {', '.join(proj_names)}."

        return {
            "location_summary": location_summary,
            "financial_summary": financial_summary,
            "project_summary": project_summary,
        }

    async def _persist_entities(self, response: NERResponse, request: NERRequest) -> None:
        """Persist extracted entities to database."""
        try:
            import json
            
            for entity_type, entities in response.entities.items():
                for entity in entities:
                    entity_text = entity.get("text") or entity.get("name", "")
                    if not entity_text:
                        continue
                    await async_db.execute(
                        """
                        INSERT INTO ml_extracted_entities (
                            source_id, source_type, entity_type, entity_text,
                            entity_subtype, confidence, normalized_value, metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        """,
                        uuid.UUID(response.request_id) if response.request_id else None,
                        request.document_type or "unknown",
                        entity_type,
                        entity_text[:500],
                        entity.get("type"),
                        entity.get("confidence", 0.5),
                        entity.get("standardized_name"),
                        json.dumps(entity),
                    )
        except Exception as e:
            logger.warning(f"Failed to persist entities: {e}")


# Singleton
ner_service = NERService()
