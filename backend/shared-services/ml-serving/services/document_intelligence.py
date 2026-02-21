"""
PROPMETRIK Document Intelligence Engine

Extracts actionable data from PDFs, scanned documents, property listings,
and unstructured reports.

Document Types Supported:
1. Property Listings - Extract price, location, specs, amenities
2. Construction Bids - Extract materials, quantities, unit prices
3. Legal Documents - Extract parties, property descriptions, terms
4. Market Reports - Extract statistics, tables, key findings

Processing Pipeline:
1. Document Classification → Identify document type
2. Text Extraction (OCR if needed)
3. Layout Analysis → Identify sections, tables, headers
4. Entity Extraction → Apply NER
5. Table Extraction → Parse tabular data
6. Validation → Check for required fields
7. Summarization → Generate key insights

Consumers:
- Data Hub ingestion pipeline (automated data entry)
- Valuation Engine (comparable extraction)
- CRM (listing import)
- Compliance (legal document validation)
"""

import logging
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .database import async_db
from .config import llm_config
from .named_entity_recognition import ner_service, NERRequest

logger = logging.getLogger(__name__)


# =====================================================
# TYPES
# =====================================================

class DocumentTypeEnum(str):
    LISTING = "listing"
    BID = "bid"
    LEGAL = "legal"
    REPORT = "report"
    PERMIT = "permit"


class DocumentIntelligenceRequest(BaseModel):
    """Input for document processing."""
    document_url: Optional[str] = None
    document_base64: Optional[str] = None
    document_text: Optional[str] = None  # Pre-extracted text
    document_type: str = "listing"
    ocr_required: bool = False
    extract_tables: bool = True
    extract_images: bool = False


class DocumentClassification(BaseModel):
    """Document type classification result."""
    document_type: str
    confidence: float
    sub_type: Optional[str] = None


class PropertyListingExtraction(BaseModel):
    """Extracted property listing data."""
    address: Optional[str] = None
    price: Optional[float] = None
    currency: str = "GHS"
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    gfa_sqm: Optional[float] = None
    plot_area_sqm: Optional[float] = None
    property_type: Optional[str] = None
    purpose: Optional[str] = None  # sale / rent
    amenities: List[str] = []
    developer: Optional[str] = None
    condition: Optional[str] = None
    year_built: Optional[int] = None
    description: Optional[str] = None


class ConstructionBidExtraction(BaseModel):
    """Extracted construction bid data."""
    project_name: Optional[str] = None
    contractor: Optional[str] = None
    total_cost: Optional[float] = None
    currency: str = "GHS"
    materials: List[Dict[str, Any]] = []
    labor_costs: Optional[float] = None
    timeline_months: Optional[int] = None
    payment_terms: Optional[str] = None


class LegalDocumentExtraction(BaseModel):
    """Extracted legal document data."""
    document_type: Optional[str] = None  # sale agreement, lease, transfer
    parties: List[Dict[str, str]] = []
    property_description: Optional[str] = None
    transaction_price: Optional[float] = None
    currency: str = "GHS"
    terms: List[str] = []
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None


class MarketReportExtraction(BaseModel):
    """Extracted market report data."""
    title: Optional[str] = None
    publisher: Optional[str] = None
    period: Optional[str] = None
    key_metrics: Dict[str, Any] = {}
    findings: List[str] = []
    forecasts: List[str] = []
    data_tables: List[Dict[str, Any]] = []


class ValidationResult(BaseModel):
    """Document validation result."""
    completeness_score: float
    missing_fields: List[str]
    anomalies: List[str]


class DocumentIntelligenceResponse(BaseModel):
    """Full document intelligence response."""
    document_id: str
    processed_at: str
    pages: int = 1
    classification: DocumentClassification
    extracted_data: Dict[str, Any]
    tables: List[Dict[str, Any]] = []
    entities: Dict[str, Any] = {}
    summary: str
    key_findings: List[str]
    validation: ValidationResult


# =====================================================
# CLASSIFICATION PATTERNS
# =====================================================

DOCUMENT_TYPE_PATTERNS = {
    "listing": {
        "keywords": ["for sale", "for rent", "listing", "bedroom", "bathroom",
                      "sqm", "square meter", "property", "price", "asking"],
        "sub_types": {
            "residential_sale": ["for sale", "bedroom", "bathroom", "villa", "apartment"],
            "residential_rent": ["for rent", "monthly rent", "lease", "tenant"],
            "commercial_sale": ["office space", "commercial", "retail", "warehouse", "for sale"],
            "commercial_rent": ["office", "commercial", "rent", "lease"],
            "land_sale": ["land", "plot", "acre", "hectare", "for sale"],
        },
    },
    "bid": {
        "keywords": ["bid", "tender", "quotation", "bill of quantities",
                      "works", "contract sum", "unit rate", "provisional"],
        "sub_types": {
            "construction_bid": ["construction", "building", "structure"],
            "renovation_bid": ["renovation", "refurbishment", "rehabilitation"],
            "infrastructure_bid": ["road", "drainage", "infrastructure"],
        },
    },
    "legal": {
        "keywords": ["agreement", "contract", "deed", "indenture",
                      "witnesseth", "whereas", "party", "covenant"],
        "sub_types": {
            "sale_agreement": ["sale", "purchase", "conveyance", "transfer"],
            "lease_agreement": ["lease", "tenancy", "rent", "landlord", "tenant"],
            "mortgage_deed": ["mortgage", "lien", "security", "collateral"],
        },
    },
    "report": {
        "keywords": ["report", "analysis", "market overview", "executive summary",
                      "findings", "methodology", "conclusion"],
        "sub_types": {
            "market_report": ["market", "trends", "forecast", "outlook"],
            "valuation_report": ["valuation", "appraisal", "assessed value"],
            "economic_report": ["economic", "GDP", "inflation", "monetary policy"],
        },
    },
    "permit": {
        "keywords": ["permit", "approval", "planning permission", "building permit",
                      "occupancy certificate", "zoning"],
        "sub_types": {
            "building_permit": ["building permit", "construction permit"],
            "occupancy_permit": ["occupancy", "certificate of occupancy"],
        },
    },
}


# =====================================================
# SERVICE
# =====================================================

class DocumentIntelligenceService:
    """
    Document intelligence engine for processing real estate documents.
    
    Combines pattern-based extraction with NER and LLM capabilities
    for comprehensive document understanding.
    """

    async def process(
        self, request: DocumentIntelligenceRequest
    ) -> DocumentIntelligenceResponse:
        """
        Process a document and extract structured data.

        Args:
            request: DocumentIntelligenceRequest with document content and options.

        Returns:
            DocumentIntelligenceResponse with classification, extracted data,
            entities, and validation results.
        """
        document_id = str(uuid.uuid4())

        # Extract text from document
        text = await self._extract_text(request)
        if not text or len(text.strip()) < 20:
            raise ValueError("Could not extract sufficient text from document")

        # Classify document
        classification = self._classify_document(text, request.document_type)

        # Extract entities via NER
        ner_result = await ner_service.extract(
            NERRequest(text=text, document_type=classification.document_type)
        )

        # Extract structured data based on type
        extracted_data = await self._extract_structured_data(
            text, classification.document_type, classification.sub_type
        )

        # Extract tables if requested
        tables = []
        if request.extract_tables:
            tables = self._extract_tables(text)

        # Generate summary
        summary, key_findings = await self._generate_summary(
            text, classification, extracted_data
        )

        # Validate document
        validation = self._validate_extraction(
            extracted_data, classification.document_type
        )

        response = DocumentIntelligenceResponse(
            document_id=document_id,
            processed_at=datetime.utcnow().isoformat(),
            classification=classification,
            extracted_data=extracted_data,
            tables=tables,
            entities=ner_result.entities,
            summary=summary,
            key_findings=key_findings,
            validation=validation,
        )

        # Persist
        await self._persist_result(response, request)

        return response

    async def batch_process(
        self, requests: List[DocumentIntelligenceRequest]
    ) -> List[DocumentIntelligenceResponse]:
        """Process multiple documents."""
        results = []
        for req in requests:
            try:
                result = await self.process(req)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to process document: {e}")
                # Add error placeholder
                results.append(DocumentIntelligenceResponse(
                    document_id=str(uuid.uuid4()),
                    processed_at=datetime.utcnow().isoformat(),
                    classification=DocumentClassification(
                        document_type="unknown", confidence=0.0
                    ),
                    extracted_data={"error": str(e)},
                    summary=f"Processing failed: {e}",
                    key_findings=[],
                    validation=ValidationResult(
                        completeness_score=0.0, missing_fields=[], anomalies=[str(e)]
                    ),
                ))
        return results

    # -------------------------------------------------
    # TEXT EXTRACTION
    # -------------------------------------------------

    async def _extract_text(self, request: DocumentIntelligenceRequest) -> str:
        """Extract text from various document sources."""
        if request.document_text:
            return request.document_text

        if request.document_base64:
            return self._extract_from_base64(request.document_base64, request.ocr_required)

        if request.document_url:
            return await self._extract_from_url(request.document_url)

        raise ValueError("No document source provided")

    def _extract_from_base64(self, data: str, ocr_required: bool) -> str:
        """Extract text from base64-encoded document."""
        import base64
        import io

        try:
            decoded = base64.b64decode(data)

            # Try PDF extraction
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(stream=decoded, filetype="pdf")
                text = ""
                for page in doc:
                    text += page.get_text()
                doc.close()
                if text.strip():
                    return text
            except ImportError:
                logger.warning("PyMuPDF not available, trying alternative extraction")
            except Exception:
                pass

            # Fallback to basic text decode
            return decoded.decode("utf-8", errors="ignore")

        except Exception as e:
            logger.error(f"Failed to extract text from base64: {e}")
            raise ValueError(f"Document text extraction failed: {e}")

    async def _extract_from_url(self, url: str) -> str:
        """Fetch and extract text from a URL."""
        import httpx

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()

        content_type = response.headers.get("content-type", "")

        if "pdf" in content_type:
            try:
                import fitz
                doc = fitz.open(stream=response.content, filetype="pdf")
                text = ""
                for page in doc:
                    text += page.get_text()
                doc.close()
                return text
            except ImportError:
                raise ValueError("PDF processing requires PyMuPDF (pip install pymupdf)")

        # HTML extraction
        html = response.text
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:20000]

    # -------------------------------------------------
    # CLASSIFICATION
    # -------------------------------------------------

    def _classify_document(self, text: str, hint: Optional[str] = None) -> DocumentClassification:
        """Classify document type based on content analysis."""
        text_lower = text.lower()
        scores: Dict[str, float] = {}

        for doc_type, config in DOCUMENT_TYPE_PATTERNS.items():
            keyword_matches = sum(
                1 for kw in config["keywords"]
                if kw.lower() in text_lower
            )
            scores[doc_type] = keyword_matches / len(config["keywords"])

        # Use hint as strong bias
        if hint and hint in scores:
            scores[hint] += 0.5

        best_type = max(scores, key=scores.get) if scores else "listing"
        confidence = min(0.99, scores.get(best_type, 0.0))

        # Determine sub-type
        sub_type = None
        if best_type in DOCUMENT_TYPE_PATTERNS:
            sub_types = DOCUMENT_TYPE_PATTERNS[best_type].get("sub_types", {})
            sub_scores = {}
            for st_name, st_keywords in sub_types.items():
                st_matches = sum(1 for kw in st_keywords if kw.lower() in text_lower)
                sub_scores[st_name] = st_matches

            if sub_scores:
                sub_type = max(sub_scores, key=sub_scores.get)

        return DocumentClassification(
            document_type=best_type,
            confidence=round(confidence, 2),
            sub_type=sub_type,
        )

    # -------------------------------------------------
    # STRUCTURED DATA EXTRACTION
    # -------------------------------------------------

    async def _extract_structured_data(
        self, text: str, doc_type: str, sub_type: Optional[str]
    ) -> Dict[str, Any]:
        """Extract structured data based on document type."""
        if doc_type == "listing":
            listing = self._extract_listing_data(text)
            return {"property": listing.model_dump()}

        elif doc_type == "bid":
            bid = self._extract_bid_data(text)
            return {"bid": bid.model_dump()}

        elif doc_type == "legal":
            legal = self._extract_legal_data(text)
            return {"legal": legal.model_dump()}

        elif doc_type == "report":
            report = await self._extract_report_data(text)
            return {"report": report.model_dump()}

        else:
            # Generic extraction
            return {"raw_text_length": len(text)}

    def _extract_listing_data(self, text: str) -> PropertyListingExtraction:
        """Extract property listing information."""
        text_lower = text.lower()

        # Price extraction
        price = None
        currency = "GHS"
        price_patterns = [
            r'(?:GH[S¢Ȼ]|GHS)\s*([\d,]+(?:\.\d{1,2})?)',
            r'([\d,]+(?:\.\d{1,2})?)\s*GH[S¢Ȼ]',
            r'(?:US\$|\$)\s*([\d,]+(?:\.\d{1,2})?)',
        ]
        for pattern in price_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    price = float(match.group(1).replace(",", ""))
                    if "$" in pattern:
                        currency = "USD"
                    # Check for million
                    million_check = text[match.end():match.end()+20].lower()
                    if "million" in million_check or "m" in million_check.split()[0:1]:
                        price *= 1_000_000
                except ValueError:
                    pass
                break

        # Bedrooms
        bedrooms = None
        bed_match = re.search(r'(\d+)\s*[-]?\s*(?:bed(?:room)?s?|br)\b', text, re.IGNORECASE)
        if bed_match:
            bedrooms = int(bed_match.group(1))

        # Bathrooms
        bathrooms = None
        bath_match = re.search(r'(\d+)\s*[-]?\s*(?:bath(?:room)?s?)\b', text, re.IGNORECASE)
        if bath_match:
            bathrooms = int(bath_match.group(1))

        # Area extraction
        gfa = None
        area_match = re.search(r'([\d,]+(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m|square\s*met(?:er|re)s?)', text, re.IGNORECASE)
        if area_match:
            gfa = float(area_match.group(1).replace(",", ""))

        plot_area = None
        plot_match = re.search(r'(?:plot|land)\s*(?:area|size)?\s*[:\s]?\s*([\d,]+(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m|acres?)', text, re.IGNORECASE)
        if plot_match:
            plot_area = float(plot_match.group(1).replace(",", ""))
            if "acre" in text[plot_match.start():plot_match.end()+10].lower():
                plot_area *= 4046.86  # Convert acres to sqm

        # Property type detection
        property_type = None
        type_map = {
            "apartment": ["apartment", "flat"],
            "villa": ["villa"],
            "house": ["house", "bungalow", "townhouse", "semi-detached", "detached"],
            "commercial": ["office", "shop", "retail", "warehouse"],
            "land": ["land", "plot"],
        }
        for ptype, keywords in type_map.items():
            if any(kw in text_lower for kw in keywords):
                property_type = ptype
                break

        # Purpose (sale vs rent)
        purpose = None
        if any(w in text_lower for w in ["for sale", "selling", "buy"]):
            purpose = "sale"
        elif any(w in text_lower for w in ["for rent", "to let", "rental", "monthly rent"]):
            purpose = "rent"

        # Amenities
        amenities = []
        amenity_keywords = {
            "pool": ["pool", "swimming"],
            "garden": ["garden"],
            "security": ["security", "gated"],
            "parking": ["parking", "garage", "carport"],
            "generator": ["generator", "standby power"],
            "borehole": ["borehole", "water supply"],
            "air_conditioning": ["air conditioning", "a/c", "ac"],
            "balcony": ["balcony", "terrace"],
            "gym": ["gym", "fitness"],
        }
        for amenity, keywords in amenity_keywords.items():
            if any(kw in text_lower for kw in keywords):
                amenities.append(amenity)

        # Year built
        year_built = None
        year_match = re.search(r'(?:built|constructed|completed)\s+(?:in\s+)?(\d{4})', text, re.IGNORECASE)
        if year_match:
            year_built = int(year_match.group(1))

        return PropertyListingExtraction(
            price=price,
            currency=currency,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            gfa_sqm=gfa,
            plot_area_sqm=plot_area,
            property_type=property_type,
            purpose=purpose,
            amenities=amenities,
            year_built=year_built,
            description=text[:500],
        )

    def _extract_bid_data(self, text: str) -> ConstructionBidExtraction:
        """Extract construction bid information."""
        text_lower = text.lower()

        # Project name
        project_name = None
        proj_match = re.search(
            r'(?:project|contract)[\s:]+([A-Z][A-Za-z\s]+(?:Estate|Phase|Block|Building))',
            text
        )
        if proj_match:
            project_name = proj_match.group(1).strip()

        # Contractor
        contractor = None
        contr_match = re.search(
            r'(?:contractor|bidder|company)[\s:]+([A-Z][A-Za-z\s&]+(?:Ltd|Limited|Construction|Group))',
            text
        )
        if contr_match:
            contractor = contr_match.group(1).strip()

        # Total cost
        total_cost = None
        cost_match = re.search(
            r'(?:total|contract\s+sum|bid\s+amount)[\s:]*(?:GH[S¢Ȼ]|GHS)?\s*([\d,]+(?:\.\d{1,2})?)',
            text, re.IGNORECASE
        )
        if cost_match:
            try:
                total_cost = float(cost_match.group(1).replace(",", ""))
            except ValueError:
                pass

        # Materials (common construction items)
        materials = []
        material_patterns = [
            r'(cement|steel|rebar|blocks|timber|roofing|tiles|paint|sand|gravel)\s+.*?(?:GH[S¢Ȼ]|GHS)\s*([\d,]+(?:\.\d{1,2})?)',
        ]
        for pattern in material_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                materials.append({
                    "item": match.group(1).strip(),
                    "cost": float(match.group(2).replace(",", "")),
                })

        # Timeline
        timeline = None
        time_match = re.search(r'(\d+)\s*(?:months?|weeks?)', text, re.IGNORECASE)
        if time_match:
            timeline = int(time_match.group(1))
            if "week" in text[time_match.start():time_match.end()+10].lower():
                timeline = max(1, timeline // 4)

        return ConstructionBidExtraction(
            project_name=project_name,
            contractor=contractor,
            total_cost=total_cost,
            materials=materials,
            timeline_months=timeline,
        )

    def _extract_legal_data(self, text: str) -> LegalDocumentExtraction:
        """Extract legal document information."""
        text_lower = text.lower()

        # Document type
        doc_type = None
        if any(w in text_lower for w in ["sale agreement", "purchase agreement", "conveyance"]):
            doc_type = "sale_agreement"
        elif any(w in text_lower for w in ["lease agreement", "tenancy agreement"]):
            doc_type = "lease_agreement"
        elif any(w in text_lower for w in ["mortgage deed", "security agreement"]):
            doc_type = "mortgage_deed"

        # Parties
        parties = []
        party_patterns = [
            r'(?:\"the\s+(?:seller|vendor|lessor|mortgagor)\"\s*[:\s]+)([A-Z][A-Za-z\s]+?)(?:\s*of\b|\s*\()',
            r'(?:\"the\s+(?:buyer|purchaser|lessee|mortgagee)\"\s*[:\s]+)([A-Z][A-Za-z\s]+?)(?:\s*of\b|\s*\()',
        ]
        roles = ["seller", "buyer"]
        for i, pattern in enumerate(party_patterns):
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                parties.append({
                    "role": roles[i] if i < len(roles) else "party",
                    "name": match.group(1).strip(),
                })

        # Transaction price
        price = None
        price_match = re.search(
            r'(?:consideration|purchase\s+price|agreed\s+price)[\s:]*(?:of\s+)?(?:GH[S¢Ȼ]|GHS)?\s*([\d,]+(?:\.\d{1,2})?)',
            text, re.IGNORECASE
        )
        if price_match:
            try:
                price = float(price_match.group(1).replace(",", ""))
            except ValueError:
                pass

        # Terms
        terms = []
        term_patterns = [
            r'(?:subject\s+to|provided\s+that|on\s+condition\s+that)\s+(.+?)(?:\.|;)',
        ]
        for pattern in term_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                terms.append(match.group(1).strip()[:200])

        return LegalDocumentExtraction(
            document_type=doc_type,
            parties=parties,
            transaction_price=price,
            terms=terms[:10],
        )

    async def _extract_report_data(self, text: str) -> MarketReportExtraction:
        """Extract market report information."""
        # Title (usually first significant line)
        lines = text.strip().split("\n")
        title = None
        for line in lines[:10]:
            line = line.strip()
            if len(line) > 10 and len(line) < 200 and not line.startswith(("http", "www")):
                title = line
                break

        # Key metrics (numbers with labels)
        key_metrics = {}
        metric_patterns = [
            r'(?:average|median|mean)\s+(?:price|value|rent)[\s:]+(?:GH[S¢Ȼ]|GHS)?\s*([\d,]+)',
            r'(?:growth|increase|decline)[\s:]+(\d+(?:\.\d+)?)\s*%',
            r'(?:yield|return)[\s:]+(\d+(?:\.\d+)?)\s*%',
            r'(?:vacancy|occupancy)\s+rate[\s:]+(\d+(?:\.\d+)?)\s*%',
        ]
        labels = ["average_price", "growth_rate", "yield", "vacancy_rate"]
        for i, pattern in enumerate(metric_patterns):
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    key_metrics[labels[i]] = float(match.group(1).replace(",", ""))
                except ValueError:
                    pass

        # Key findings (bullet points or numbered items)
        findings = []
        for match in re.finditer(r'(?:^|\n)\s*[•\-\*\d+\.]\s*(.+)', text):
            finding = match.group(1).strip()
            if len(finding) > 20 and len(finding) < 500:
                findings.append(finding)

        return MarketReportExtraction(
            title=title,
            key_metrics=key_metrics,
            findings=findings[:20],
        )

    # -------------------------------------------------
    # TABLE EXTRACTION
    # -------------------------------------------------

    def _extract_tables(self, text: str) -> List[Dict[str, Any]]:
        """Extract tabular data from text."""
        tables = []

        # Look for structured tabular patterns
        # Simple format: rows separated by tabs or multiple spaces
        lines = text.split("\n")
        current_table: List[List[str]] = []

        for line in lines:
            # Check if line looks tabular (has multiple separated columns)
            parts = re.split(r'\t|  +|\|', line.strip())
            parts = [p.strip() for p in parts if p.strip()]

            if len(parts) >= 2:
                current_table.append(parts)
            elif current_table and len(current_table) >= 2:
                # End of table
                table_data = self._parse_table(current_table)
                if table_data:
                    tables.append({
                        "page": 1,
                        "table_data": table_data,
                        "confidence": 0.7,
                    })
                current_table = []

        # Handle last table
        if len(current_table) >= 2:
            table_data = self._parse_table(current_table)
            if table_data:
                tables.append({
                    "page": 1,
                    "table_data": table_data,
                    "confidence": 0.7,
                })

        return tables

    def _parse_table(self, rows: List[List[str]]) -> List[Dict[str, Any]]:
        """Parse a detected table into structured data."""
        if len(rows) < 2:
            return []

        # First row as headers
        headers = rows[0]
        data = []

        for row in rows[1:]:
            if len(row) >= len(headers):
                entry = {}
                for i, header in enumerate(headers):
                    entry[header] = row[i] if i < len(row) else ""
                data.append(entry)

        return data

    # -------------------------------------------------
    # SUMMARIZATION
    # -------------------------------------------------

    async def _generate_summary(
        self,
        text: str,
        classification: DocumentClassification,
        extracted_data: Dict[str, Any],
    ) -> tuple:
        """Generate document summary and key findings."""
        # Try LLM-powered summary
        if llm_config.anthropic_api_key and len(text) > 200:
            try:
                return await self._llm_summarize(text, classification)
            except Exception as e:
                logger.warning(f"LLM summarization failed: {e}")

        # Rule-based summary fallback
        summary_parts = [f"Document classified as {classification.document_type}"]

        if classification.sub_type:
            summary_parts.append(f"(sub-type: {classification.sub_type})")

        # Add key extracted fields
        if "property" in extracted_data:
            prop = extracted_data["property"]
            if prop.get("price"):
                summary_parts.append(f"Price: {prop.get('currency', 'GHS')} {prop['price']:,.0f}")
            if prop.get("bedrooms"):
                summary_parts.append(f"{prop['bedrooms']}-bedroom")
            if prop.get("property_type"):
                summary_parts.append(prop["property_type"])

        summary = ". ".join(summary_parts) + "."

        # Key findings from content
        key_findings = []
        if "property" in extracted_data:
            prop = extracted_data["property"]
            if prop.get("amenities"):
                key_findings.append(f"Amenities: {', '.join(prop['amenities'])}")
        if "bid" in extracted_data:
            bid = extracted_data["bid"]
            if bid.get("total_cost"):
                key_findings.append(f"Total bid amount: GHS {bid['total_cost']:,.0f}")

        return summary, key_findings

    async def _llm_summarize(
        self, text: str, classification: DocumentClassification
    ) -> tuple:
        """Use LLM to generate document summary."""
        import httpx
        import json

        prompt = f"""Summarize this Ghana real estate {classification.document_type} document.
Return JSON with: "summary" (2-3 sentences) and "key_findings" (array of 3-5 strings).

TEXT: {text[:5000]}

Return ONLY valid JSON."""

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
                    "max_tokens": 512,
                    "temperature": 0.2,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data["content"][0]["text"]

            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return result.get("summary", ""), result.get("key_findings", [])

        return "", []

    # -------------------------------------------------
    # VALIDATION
    # -------------------------------------------------

    def _validate_extraction(
        self, extracted_data: Dict[str, Any], doc_type: str
    ) -> ValidationResult:
        """Validate extraction completeness and identify anomalies."""
        required_fields = {
            "listing": ["price", "property_type", "bedrooms"],
            "bid": ["total_cost", "contractor"],
            "legal": ["document_type", "parties", "transaction_price"],
            "report": ["title", "key_metrics"],
            "permit": [],
        }

        fields_to_check = required_fields.get(doc_type, [])
        missing = []
        anomalies = []

        # Check first nested object
        inner_data = {}
        for key in extracted_data:
            if isinstance(extracted_data[key], dict):
                inner_data = extracted_data[key]
                break

        for field in fields_to_check:
            value = inner_data.get(field)
            if value is None or value == "" or value == [] or value == {}:
                missing.append(field)

        # Anomaly checks
        if doc_type == "listing":
            price = inner_data.get("price")
            if price and price < 1000:
                anomalies.append(f"Suspiciously low price: {price}")
            if price and price > 100_000_000:
                anomalies.append(f"Unusually high price: {price}")

            bedrooms = inner_data.get("bedrooms")
            if bedrooms and bedrooms > 20:
                anomalies.append(f"Unusually high bedroom count: {bedrooms}")

        elif doc_type == "bid":
            cost = inner_data.get("total_cost")
            materials = inner_data.get("materials", [])
            if cost and materials:
                material_total = sum(m.get("cost", 0) for m in materials)
                if material_total > 0 and material_total > cost:
                    anomalies.append("Material costs exceed total bid amount")

        completeness = 1.0 - (len(missing) / max(len(fields_to_check), 1))

        return ValidationResult(
            completeness_score=round(completeness, 2),
            missing_fields=missing,
            anomalies=anomalies,
        )

    async def _persist_result(
        self,
        response: DocumentIntelligenceResponse,
        request: DocumentIntelligenceRequest,
    ) -> None:
        """Persist processed document to database."""
        try:
            import json
            await async_db.execute(
                """
                INSERT INTO ml_processed_documents (
                    document_id, document_url, document_type, pages,
                    classification, extracted_data, tables, entities,
                    summary, key_findings, validation
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (document_id) DO NOTHING
                """,
                response.document_id,
                request.document_url,
                response.classification.document_type,
                response.pages,
                json.dumps(response.classification.model_dump()),
                json.dumps(response.extracted_data),
                json.dumps(response.tables),
                json.dumps(response.entities),
                response.summary,
                response.key_findings,
                json.dumps(response.validation.model_dump()),
            )
        except Exception as e:
            logger.warning(f"Failed to persist document result: {e}")


# Singleton
document_intelligence_service = DocumentIntelligenceService()
