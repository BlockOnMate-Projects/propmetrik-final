# Valuation Report API Specification

## RICS Red Book & GhIS Compliance

> This document specifies all API endpoints required to generate industry-standard valuation reports compliant with:
> - **RICS Red Book** (Royal Institution of Chartered Surveyors)
> - **GhIS** (Ghana Institution of Surveyors)
> - **IVS** (International Valuation Standards)

---

## Table of Contents

1. [Report Workflow](#report-workflow)
2. [Report Sections & Data Sources](#report-sections--data-sources)
3. [API Endpoints](#api-endpoints)
4. [Database Schema](#database-schema)
5. [Document Generation Workflow](#document-generation-workflow)
6. [Compliance Checklist](#compliance-checklist)
7. [Phased Implementation Plan](#phased-implementation-plan)

---

## Report Workflow

### User Journey: Reconciliation → Report → Approval

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VALUATION REPORT WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────────┐   │
│  │ Reconciliation│───▶│ Generate Report  │───▶│ MS Word Editor (Draft) │   │
│  │    Page       │    │ (Click "Report") │    │                         │   │
│  └──────────────┘    └──────────────────┘    └───────────┬─────────────┘   │
│                                                          │                   │
│                                                          ▼                   │
│                             ┌─────────────────────────────────────────────┐ │
│                             │           User Actions in Editor            │ │
│                             ├─────────────────────────────────────────────┤ │
│                             │ • Edit text sections                        │ │
│                             │ • Add/remove content                        │ │
│                             │ • Upload property photos                    │ │
│                             │ • Add floor plan images                     │ │
│                             │ • Insert site maps/location maps            │ │
│                             │ • Add valuer signature                      │ │
│                             │ • Modify tables/comparables                 │ │
│                             │ • Auto-save drafts                          │ │
│                             └───────────────┬─────────────────────────────┘ │
│                                             │                               │
│                                             ▼                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Click "Approve & Finalize"                      │   │
│  └───────────────────────────────────┬─────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     FINALIZED REPORT (Read-Only)                      │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ • Locked from editing                                                 │  │
│  │ • Version frozen with timestamp                                       │  │
│  │ • Digital signature applied                                           │  │
│  │ • Export to PDF available                                             │  │
│  │ • Audit trail recorded                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Report States

| State | Description | Editable | Actions Available |
|-------|-------------|----------|-------------------|
| `draft` | Initial generation, auto-save enabled | ✅ Yes | Edit, Save, Preview, Discard |
| `pending_review` | Submitted for review | ❌ No | Review, Approve, Reject |
| `approved` | Finalized by valuer | ❌ No | Download PDF, View, Share |
| `superseded` | Replaced by newer version | ❌ No | View only (archived) |

---

## Report Sections & Data Sources

### RICS Red Book / GhIS Required Report Structure

| # | Section | Data Source | API Endpoint(s) |
|---|---------|-------------|-----------------|
| 1 | **Cover Page** | Valuation + Property + Valuer | `GET /api/valuations/:id`, `GET /api/reports/:id/cover` |
| 2 | **Letter of Transmittal** | Valuation + Client + Valuer | `GET /api/reports/:id/transmittal` |
| 3 | **Table of Contents** | Auto-generated | N/A (client-side) |
| 4 | **Summary of Key Data** | Valuation + Property | `GET /api/valuations/:id/summary` |
| 5 | **Property Risk Assessment** | Property + Location Analysis | `GET /api/properties/:id/risk-assessment` |
| 6 | **General Introduction** | Valuation metadata | `GET /api/valuations/:id` |
| | 6.1 Request for Valuation | Client info | `GET /api/valuations/:id/engagement` |
| | 6.2 Purpose of Valuation | Valuation purpose | (included in valuation) |
| | 6.3 Date of Inspection | Inspection record | `GET /api/valuations/:id/inspection` |
| | 6.4 Date of Valuation | Valuation date | (included in valuation) |
| | 6.5 Encumbrances | Legal data | `GET /api/properties/:id/legal` |
| | 6.6 Use/Planning | Zoning data | `GET /api/properties/:id/planning` |
| | 6.7 Highest & Best Use | HBU Analysis | `GET /api/valuations/:id/hbu-analysis` |
| | 6.8 Measurement Standard | Measurement basis | (metadata) |
| 7 | **Legal Attributes** | Property legal data | `GET /api/properties/:id/legal` |
| | 7.1 Interest/Title | Tenure info | (included in property) |
| | 7.2 Statutory Permits | Permits/approvals | `GET /api/properties/:id/permits` |
| 8 | **Data Influencing Values** | Market + Location data | Multiple endpoints |
| | 8.1 City/Regional Data | Market intelligence | `GET /api/market/:region/overview` |
| | 8.2 Neighbourhood Data | Local market data | `GET /api/market/neighbourhood/:id` |
| | 8.3 Location Details | Property location | `GET /api/properties/:id/location` |
| | 8.4 Property Description | Property details | `GET /api/properties/:id` |
| | 8.5 Grounds & External Works | Property externals | `GET /api/properties/:id/externals` |
| | 8.6 Construction Details | Building specs | `GET /api/properties/:id/construction` |
| | 8.7 Fixtures & Fittings | Property fixtures | `GET /api/properties/:id/fixtures` |
| | 8.8 Services | Utilities/services | `GET /api/properties/:id/services` |
| | 8.9 Accommodation Schedule | Floor plans/rooms | `GET /api/valuations/:id/floor-plans` |
| | 8.10 Evidence of Values | Market evidence | `GET /api/valuations/:id/market-evidence` |
| 9 | **Valuation Process** | Valuation methods | Multiple endpoints |
| | 9.1 Basis of Valuation | Valuation basis | `GET /api/valuations/:id` |
| | 9.2 Market Value Definition | Standard text | (static content) |
| | 9.3 Valuation Methodology | Methods used | `GET /api/valuations/:id/methods` |
| | 9.4 Cost Approach | DRC calculation | `GET /api/valuations/:id/cost-approach` |
| | 9.5 Income Approach | Income method | `GET /api/valuations/:id/income-approach` |
| | 9.6 Sales Comparison | Comparables | `GET /api/valuations/:id/sales-comparison` |
| | 9.7 Reconciliation | Final value | `GET /api/valuations/:id/reconciliation` |
| 10 | **Certification** | Valuation opinion | `GET /api/reports/:id/certification` |
| 11 | **Limiting Conditions** | Disclaimers | `GET /api/reports/:id/disclaimers` |
| 12 | **Appendices** | Supporting docs | `GET /api/reports/:id/appendices` |
| | 12.1 Schedule of Accommodation | Floor plans | `GET /api/valuations/:id/floor-plans` |
| | 12.2 Floor Plans/Sketches | Floor plan images | `GET /api/valuations/:id/floor-plans/images` |
| | 12.3 Location Map | Map image | `GET /api/properties/:id/maps` |
| | 12.4 Property Photos | Photo gallery | `GET /api/reports/:id/photos` |
| | 12.5 Title Documents | Legal docs | `GET /api/properties/:id/documents` |
| | 12.6 Valuer Credentials | Valuer info | `GET /api/valuers/:id` |

---

## API Endpoints

### 1. Report Management Endpoints

#### `POST /api/reports`
Generate a new draft report from a finalized valuation.

**Request:**
```json
{
  "valuation_id": "uuid",
  "template": "ghis_standard | rics_residential | rics_commercial | bank_mortgage | insurance",
  "options": {
    "include_comparables": true,
    "include_market_analysis": true,
    "include_photos": true,
    "include_floor_plans": true,
    "include_maps": true,
    "language": "en",
    "currency": "GHS",
    "secondary_currency": "USD"
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "valuation_id": "uuid",
  "status": "draft",
  "template": "ghis_standard",
  "docx_url": "https://storage.propmetrik.com/reports/uuid/draft.docx",
  "created_at": "2026-01-14T10:00:00Z",
  "expires_at": "2026-01-21T10:00:00Z",
  "version": 1
}
```

---

#### `GET /api/reports/:id`
Get report metadata and content.

**Response:**
```json
{
  "id": "uuid",
  "valuation_id": "uuid",
  "status": "draft | pending_review | approved | superseded",
  "template": "ghis_standard",
  "version": 1,
  "docx_url": "https://storage.propmetrik.com/reports/uuid/v1.docx",
  "pdf_url": null,
  "created_at": "2026-01-14T10:00:00Z",
  "updated_at": "2026-01-14T12:30:00Z",
  "approved_at": null,
  "approved_by": null,
  "valuer": {
    "id": "uuid",
    "name": "Surv. Daniel Kafui Ametepey",
    "qualifications": "BSc., MGhIS",
    "license_number": "GhIS-12345",
    "signature_url": "https://storage.propmetrik.com/signatures/uuid.png"
  },
  "content": {
    "cover": { ... },
    "transmittal": { ... },
    "summary": { ... },
    "sections": [ ... ]
  }
}
```

---

#### `PUT /api/reports/:id`
Update draft report content.

**Request:**
```json
{
  "sections": {
    "transmittal": {
      "letter_body": "...",
      "client_name": "...",
      "client_address": "..."
    },
    "property_description": "...",
    "neighbourhood_analysis": "...",
    "custom_notes": "..."
  }
}
```

---

#### `POST /api/reports/:id/approve`
Finalize and lock the report.

**Request:**
```json
{
  "valuer_signature": "base64_signature_image",
  "valuer_pin": "1234",
  "certification_statement": "I certify that...",
  "approved_values": {
    "market_value": 6000000,
    "forced_sale_value": 4200000
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "status": "approved",
  "approved_at": "2026-01-14T15:00:00Z",
  "approved_by": "uuid",
  "pdf_url": "https://storage.propmetrik.com/reports/uuid/final.pdf",
  "digital_seal": {
    "hash": "sha256:...",
    "timestamp": "2026-01-14T15:00:00Z",
    "qr_code_url": "https://verify.propmetrik.com/reports/uuid"
  }
}
```

---

#### `GET /api/reports/:id/download`
Download report in various formats.

**Query Parameters:**
- `format`: `docx | pdf | html`
- `version`: specific version number (optional)

---

### 2. Report Content Endpoints

#### `GET /api/reports/:id/cover`
Get cover page data.

**Response:**
```json
{
  "title": "VALUATION REPORT",
  "subtitle": "ON PALM LANDS HOTEL",
  "property_location": "Palm Lands with Ghana Post Digital Address WS-022-6591",
  "requested_by": {
    "name": "Mr William Inkumsah",
    "address": "Post Office Box CT 441\nCantonments - Accra"
  },
  "prepared_for": {
    "name": "Mr Eric Kwame Agyeman",
    "address": "..."
  },
  "certified_by": {
    "name": "Surv. Daniel Kafui Ametepey",
    "qualifications": "BSc., MGhIS",
    "title": "Valuation & Estate Surveyor",
    "address": "P. O. Box MC 0265, Takoradi"
  },
  "date": "November, 2024",
  "company_logo_url": "https://..."
}
```

---

#### `GET /api/reports/:id/transmittal`
Get letter of transmittal data.

**Response:**
```json
{
  "recipient": {
    "name": "Mr. William Inkumsah",
    "address": "Post Office Box CT 441\nCantonments, Accra"
  },
  "date": "28th November, 2024",
  "subject": "RE: COMMERCIAL PROPERTY (PALM LANDS HOTEL) ON PLOT OF LAND SITUATE AT PALM LANDS WITH GHANA POST DIGITAL ADDRESS WS-022-6591",
  "body": "Pursuant to the REQUEST commissioning me to carry out valuation on the above-named property...",
  "valuation_methods_summary": "The Depreciated Cost Method and Market Approach to value have been considered...",
  "values": {
    "market_value": {
      "ghs": 6000000,
      "ghs_formatted": "SIX MILLION GHANA CEDIS [GH¢ 6,000,000.00]",
      "usd": 383390,
      "usd_formatted": "THREE HUNDRED AND EIGHTY-THREE THOUSAND THREE HUNDRED AND NINETY UNITED STATES DOLLARS [USD$ 383,390.00]"
    },
    "forced_sale_value": {
      "ghs": 4200000,
      "ghs_formatted": "FOUR MILLION TWO HUNDRED THOUSAND GHANA CEDIS [GH¢ 4,200,000.00]",
      "usd": 268370,
      "usd_formatted": "TWO HUNDRED AND SIXTY EIGHT THOUSAND THREE HUNDRED AND SEVENTY UNITED STATES DOLLARS [USD$ 268,370.00]"
    }
  },
  "exchange_rate": {
    "rate": 15.65,
    "source": "Stanbic Bank Ghana",
    "date": "28/11/2024"
  },
  "valuer_signature": {
    "name": "Surv. Daniel Kafui Ametepey, BSc., MGhIS",
    "title": "Valuation & Estate Surveyor"
  }
}
```

---

#### `GET /api/reports/:id/certification`
Get certification/valuation opinion.

**Response:**
```json
{
  "certification_text": "This is to certify that, I have inspected the subject property situated at Hexagon Avenue, Palm Lands...",
  "disclosure": "I again deem it fit to disclose that, I have no present or prospective interest in the subject hereditament.",
  "standards_compliance": "I further certify that the appraisal has been made in conformity with the professional standards of Ghana Institution of Surveyors of which the undersigned is a member in good standing.",
  "values_table": {
    "market_value": { "ghs": 6000000, "usd": 383390 },
    "forced_sale_value": { "ghs": 4200000, "usd": 268370 }
  },
  "valuation_date": "28th November, 2024",
  "exchange_rate": {
    "rate": 15.65,
    "source": "Stanbic Bank Ghana",
    "date": "28/11/2024"
  },
  "valuer": {
    "name": "SURV. DANIEL KAFUI AMETEPEY (BSc., MGhIS)",
    "title": "Valuation & Estate Surveyor",
    "license_number": "GhIS-12345",
    "signature_url": "..."
  }
}
```

---

#### `GET /api/reports/:id/disclaimers`
Get limiting conditions and disclaimers.

**Response:**
```json
{
  "title": "STATEMENT OF LIMITING CONDITIONS",
  "conditions": [
    "That this valuation is premised on a proposed fifty (50) year lease hold interest",
    "The property has been valued as though free from liens and encumbrances than those contained in the deeds of records",
    "No liability is to be assumed for matters legal in nature nor is any opinion of title rendered by this report",
    "The capital value of the subject property is assumed to be on all cash basis...",
    "The valuer by this report is not required to give testimony in court...",
    "The physical condition of the improvements and the soil characteristics were based on visual inspection only...",
    "Sketches are accurate only for purposes of approximation",
    "Possession of any copy of this report does not carry with it the right to publication..."
  ],
  "standards_references": [
    { "code": "RICS", "name": "RICS Valuation – Global Standards (Red Book)", "year": 2022 },
    { "code": "IVS", "name": "International Valuation Standards", "year": 2022 },
    { "code": "GhIS", "name": "Ghana Institution of Surveyors Valuation Standards", "year": 2020 }
  ]
}
```

---

### 3. Report Photos & Media Endpoints

#### `POST /api/reports/:id/photos`
Upload property photos for the report.

**Request (multipart/form-data):**
```
photos: File[] (max 20 files, max 10MB each)
captions: string[] (matching order)
categories: string[] ("exterior" | "interior" | "amenities" | "neighbourhood" | "damage")
```

**Response:**
```json
{
  "uploaded": [
    {
      "id": "uuid",
      "url": "https://storage.propmetrik.com/reports/uuid/photos/1.jpg",
      "thumbnail_url": "https://storage.propmetrik.com/reports/uuid/photos/1_thumb.jpg",
      "caption": "Front elevation of subject property",
      "category": "exterior",
      "order": 1
    }
  ]
}
```

---

#### `GET /api/reports/:id/photos`
Get all photos for the report.

---

#### `DELETE /api/reports/:id/photos/:photoId`
Remove a photo from the report.

---

#### `PUT /api/reports/:id/photos/reorder`
Reorder photos in the report.

**Request:**
```json
{
  "photo_order": ["uuid1", "uuid2", "uuid3"]
}
```

---

### 4. Property Detail Endpoints (Report Data Sources)

#### `GET /api/properties/:id/risk-assessment`
Get property risk assessment matrix.

**Response:**
```json
{
  "property_id": "uuid",
  "assessment_date": "2024-11-14",
  "items": [
    { "item": "Employment stability", "rating": "good" },
    { "item": "Convenience to Employment", "rating": "good" },
    { "item": "Convenience to Shopping", "rating": "average" },
    { "item": "Convenience to School", "rating": "average" },
    { "item": "Adequacy of Public Transportation", "rating": "good" },
    { "item": "Adequacy of Utilities", "rating": "good" },
    { "item": "Recreation Facilities", "rating": "average" },
    { "item": "Police & Fire Protection", "rating": "good" },
    { "item": "Accessibility", "rating": "good" }
  ],
  "overall_risk_level": "low"
}
```

---

#### `GET /api/properties/:id/legal`
Get legal and tenure information.

**Response:**
```json
{
  "property_id": "uuid",
  "tenure_type": "leasehold",
  "tenure_details": {
    "lease_term_years": 50,
    "lease_start_date": "2024-01-01",
    "remaining_years": 50,
    "ground_rent": 0,
    "lessor": "Lands Commission"
  },
  "title": {
    "registered": false,
    "registration_number": null,
    "land_title_status": "Pending registration",
    "encumbrances": [],
    "assumptions": "A perfect title with no encumbrance has been assumed"
  },
  "permits": {
    "building_permit": {
      "status": "not_verified",
      "permit_number": null,
      "notes": "Statutory building permits were not made available at the time of inspection"
    },
    "zoning_compliance": true,
    "notes": "The subject property conforms to the building pattern and zoning characteristics of the area"
  }
}
```

---

#### `GET /api/properties/:id/construction`
Get construction details.

**Response:**
```json
{
  "property_id": "uuid",
  "construction_type": "Reinforced columns and beams with sandcrete blockwork",
  "elements": {
    "floor": "Ceramic tiles in all areas including the sanitary and common areas",
    "wall": "Reinforced columns and beams infilled with sandcrete blockwork plastered, rendered and painted. Washroom tiles are done to window level",
    "doors": "Polished and painted wooden panel doors and glazed aluminum doors",
    "windows": "Combination of wooden frame casement windows, glazed sliding windows, jalousie windows and louvre blades in aluminium carriers with insect net material",
    "ceiling": "Combination of wooden T&G, plywood and plaster of paris",
    "roof": "Combination of asbestos roofing sheets and clay & concrete tiles as well as thatch roofs"
  },
  "fixtures": [
    "Water Closets (WCs)",
    "Wash hand basins",
    "Bath tubes",
    "Shower set",
    "T-Roll holders",
    "Towel hangers",
    "Air-conditioners"
  ],
  "services": {
    "water": "Public mains + borehole",
    "electricity": "ECG grid connection",
    "drainage": "Septic tank with PVC piping",
    "telecom": "Available"
  },
  "condition": {
    "overall": "fair",
    "structural_fitness": "Structurally fit (visual inspection only)",
    "defects": [
      "Hairline and large cracks in walls",
      "Deteriorating roofing sheets, facial board and roof eaves",
      "Paint peeling/fading",
      "Flooring wear",
      "Warp, crack and rot of window and door frames",
      "Dampness in walls especially the exterior walls",
      "Removal of some ceiling materials"
    ]
  }
}
```

---

#### `GET /api/properties/:id/externals`
Get grounds and external works.

**Response:**
```json
{
  "property_id": "uuid",
  "land_area": {
    "hectares": 2.21,
    "acres": 5.46,
    "sqm": 22100
  },
  "ground_finishes": [
    "Lawns",
    "Earth",
    "Pavement blocks",
    "Cement screed"
  ],
  "landscaping": [
    "Trimmed flower hedges at frontage",
    "Ornamental plants",
    "Crafted sculptures",
    "Royal palm trees"
  ],
  "boundary": {
    "type": "Sandcrete block wall and masonry wall",
    "height_m": 1.96,
    "access": "Vehicular opening"
  },
  "topography": "Generally flat, descends steeply at rear (50% undeveloped)",
  "infrastructure": {
    "water_storage": ["1x 10,000L tank", "3x 2,500L tanks"],
    "drainage": "Underground water reservoir, private soakaways, septic tank",
    "other": "Wooden framed shed with asphalt shingles"
  }
}
```

---

### 5. Market Data Endpoints

#### `GET /api/market/:region/overview`
Get regional market overview for city data section.

**Response:**
```json
{
  "region": "western",
  "region_name": "Western Region",
  "primary_city": "Sekondi-Takoradi",
  "description": "Twin city located about 227 km west of Accra...",
  "economic_drivers": [
    "Deep-sea harbour facility",
    "Mining industry",
    "Oil and gas sector",
    "Agriculture",
    "Tourism"
  ],
  "land_use_patterns": {
    "high_class_residential": ["Beach Road", "Windy Ridge", "Chapel Hill"],
    "second_class_residential": ["Palm Lands", "Sekondi Ridge"],
    "industrial_zones": ["Effia Cocoa Processing", "Harbour Business Area"]
  },
  "market_conditions": {
    "demand": "high",
    "supply": "limited",
    "market_type": "seller's market",
    "price_trend_12m": 8.5,
    "avg_days_on_market": 45
  },
  "development_outlook": "Positive growth anticipated due to oil industry expansion"
}
```

---

#### `GET /api/market/neighbourhood/:neighbourhoodId`
Get neighbourhood-specific data.

**Response:**
```json
{
  "neighbourhood": "Palm Lands",
  "district": "Sekondi-Takoradi Metropolitan Assembly",
  "region": "Western",
  "classification": "2nd class residential",
  "demographics": {
    "income_level": "low to middle",
    "primary_use": "residential"
  },
  "characteristics": {
    "building_types": "Single to multi-storey, modern architecture",
    "roads": "Well-defined, mostly tarred",
    "infrastructure": ["Electricity", "Water", "Internet", "Security"]
  },
  "landmarks": [
    "Divine Gate Guesthouse",
    "Albert Bosomtwi Sam Fishing Harbour",
    "Essikado Hospital",
    "Western Region Lands Commission"
  ],
  "nearby_towns": ["Ngyiresia", "Essikado", "Essipon", "Ketan", "Bakaekyir"]
}
```

---

### 6. Valuation Method Endpoints (Enhanced for Reports)

#### `GET /api/valuations/:id/market-evidence`
Get land value evidence for report.

**Response:**
```json
{
  "valuation_id": "uuid",
  "land_value_adopted": {
    "per_acre": 500000,
    "currency": "GHS",
    "tenure_type": "50-year Leasehold",
    "justification": [
      "Subject parcel is well drained",
      "Existing infrastructure (electricity, water, roads)",
      "Future prospects of the neighbourhood"
    ]
  },
  "comparables": [
    {
      "location": "Palm Lands",
      "size_acres": 1.2,
      "sale_price": 580000,
      "price_per_acre": 483333,
      "sale_date": "2024-08-15",
      "adjustments": [{ "type": "location", "percent": 3 }]
    }
  ],
  "market_transactions_analyzed": 8
}
```

---

### 7. Valuer Management Endpoints

#### `GET /api/valuers/:id`
Get valuer credentials for report.

**Response:**
```json
{
  "id": "uuid",
  "name": "Surv. Daniel Kafui Ametepey",
  "qualifications": "BSc., MGhIS",
  "title": "Valuation & Estate Surveyor",
  "license": {
    "number": "GhIS-12345",
    "issued_by": "Ghana Institution of Surveyors",
    "valid_until": "2025-12-31",
    "status": "active"
  },
  "professional_indemnity": {
    "provider": "Star Assurance Company Ltd",
    "policy_number": "PI-2024-00123",
    "coverage": 5000000,
    "valid_until": "2025-06-30"
  },
  "contact": {
    "address": "P. O. Box MC 0265, Takoradi",
    "email": "daniel.ametepey@example.com",
    "phone": "+233 XX XXX XXXX"
  },
  "signature_url": "https://storage.propmetrik.com/signatures/uuid.png"
}
```

---

#### `POST /api/valuers/:id/signature`
Upload valuer's digital signature.

---

### 8. Engagement & Client Endpoints

#### `GET /api/valuations/:id/engagement`
Get terms of engagement for report.

**Response:**
```json
{
  "valuation_id": "uuid",
  "request_type": "verbal | written | formal_instruction",
  "request_date": "2024-11-01",
  "client": {
    "name": "Mr William Inkumsah",
    "company": null,
    "address": "Post Office Box CT 441, Cantonments, Accra",
    "contact": "+233 XX XXX XXXX"
  },
  "intended_user": {
    "name": "Mr Eric Kwame Agyeman",
    "relationship": "Property Owner",
    "address": "Western Palm Lands Hotel, Ngyerasia, Sekondi"
  },
  "purpose": "To determine the Market Capital Value for sale/negotiation purposes",
  "basis_of_value": "Market Value",
  "valuation_date": "2024-11-28",
  "inspection_date": "2024-11-14",
  "fee": {
    "amount": null,
    "currency": "GHS",
    "status": "confidential"
  }
}
```

---

### 9. Inspection Endpoints

#### `GET /api/valuations/:id/inspection`
Get inspection details for report.

**Response:**
```json
{
  "valuation_id": "uuid",
  "inspection_date": "2024-11-14",
  "inspector": {
    "name": "Surv. Daniel Kafui Ametepey",
    "accompanied_by": null
  },
  "scope": "Full internal and external inspection",
  "access_notes": "Full access granted by property owner",
  "weather_conditions": "Clear",
  "measurement_standard": "RICS Property Measurement 2nd Edition",
  "areas_inspected": [
    "All chalets (4 units)",
    "Restaurant and kitchen",
    "Reception and sitting area",
    "Car park",
    "Outdoor event area",
    "Main house (3 bedrooms)"
  ],
  "limitations": [
    "Structural tests not conducted",
    "Soil tests not performed",
    "Services not tested"
  ]
}
```

---

## Database Schema

### New Tables Required

```sql
-- Report versions and drafts
CREATE TABLE valuation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id),
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  template VARCHAR(50) NOT NULL DEFAULT 'ghis_standard',
  
  -- Document storage
  docx_storage_key VARCHAR(255),
  pdf_storage_key VARCHAR(255),
  
  -- Content (JSON)
  content JSONB,
  custom_sections JSONB,
  
  -- Approval
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  valuer_signature_key VARCHAR(255),
  digital_seal_hash VARCHAR(64),
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  UNIQUE(valuation_id, version)
);

-- Report photos
CREATE TABLE report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES valuation_reports(id) ON DELETE CASCADE,
  storage_key VARCHAR(255) NOT NULL,
  thumbnail_key VARCHAR(255),
  caption TEXT,
  category VARCHAR(30), -- exterior, interior, amenities, neighbourhood, damage
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inspection records
CREATE TABLE valuation_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id),
  inspection_date DATE NOT NULL,
  inspector_id UUID REFERENCES users(id),
  scope TEXT,
  access_notes TEXT,
  weather_conditions VARCHAR(50),
  measurement_standard VARCHAR(100),
  areas_inspected TEXT[],
  limitations TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Engagement terms
CREATE TABLE valuation_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id),
  request_type VARCHAR(30) NOT NULL,
  request_date DATE,
  client_name VARCHAR(255),
  client_company VARCHAR(255),
  client_address TEXT,
  client_contact VARCHAR(100),
  intended_user_name VARCHAR(255),
  intended_user_relationship VARCHAR(100),
  intended_user_address TEXT,
  purpose TEXT NOT NULL,
  basis_of_value VARCHAR(50) NOT NULL DEFAULT 'market_value',
  special_assumptions TEXT[],
  departures TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Property legal details
CREATE TABLE property_legal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  tenure_type VARCHAR(50) NOT NULL,
  lease_term_years INT,
  lease_start_date DATE,
  ground_rent DECIMAL(15,2),
  lessor VARCHAR(255),
  land_title_registered BOOLEAN DEFAULT FALSE,
  registration_number VARCHAR(100),
  encumbrances JSONB DEFAULT '[]',
  permits JSONB DEFAULT '{}',
  assumptions TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Property construction details
CREATE TABLE property_construction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  construction_type VARCHAR(255),
  floor_finish TEXT,
  wall_finish TEXT,
  door_types TEXT,
  window_types TEXT,
  ceiling_types TEXT,
  roof_types TEXT,
  fixtures TEXT[],
  water_supply VARCHAR(100),
  electricity_supply VARCHAR(100),
  drainage_system VARCHAR(255),
  telecom_available BOOLEAN DEFAULT TRUE,
  condition_overall VARCHAR(20),
  structural_notes TEXT,
  defects TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Property risk assessments
CREATE TABLE property_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  assessment_date DATE NOT NULL,
  employment_stability VARCHAR(10),
  convenience_employment VARCHAR(10),
  convenience_shopping VARCHAR(10),
  convenience_school VARCHAR(10),
  public_transportation VARCHAR(10),
  utilities_adequacy VARCHAR(10),
  recreation_facilities VARCHAR(10),
  police_fire_protection VARCHAR(10),
  accessibility VARCHAR(10),
  overall_risk_level VARCHAR(10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valuer credentials
CREATE TABLE valuers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  qualifications TEXT,
  title VARCHAR(100),
  license_number VARCHAR(100),
  license_issuer VARCHAR(255),
  license_valid_until DATE,
  license_status VARCHAR(20) DEFAULT 'active',
  pi_provider VARCHAR(255),
  pi_policy_number VARCHAR(100),
  pi_coverage DECIMAL(15,2),
  pi_valid_until DATE,
  contact_address TEXT,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  signature_storage_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Report audit trail
CREATE TABLE report_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES valuation_reports(id),
  action VARCHAR(50) NOT NULL, -- created, edited, approved, downloaded, viewed
  user_id UUID REFERENCES users(id),
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Document Generation Workflow

### Technical Implementation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCUMENT GENERATION PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. USER CLICKS "GENERATE REPORT"                                       │
│     │                                                                    │
│     ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │ POST /api/reports                                            │       │
│  │ • Validate valuation is finalized                            │       │
│  │ • Create report record (status: generating)                  │       │
│  │ • Queue document generation job                              │       │
│  └──────────────────────────────────────────────────────────────┘       │
│     │                                                                    │
│     ▼                                                                    │
│  2. BACKGROUND JOB: GENERATE DOCX                                       │
│     │                                                                    │
│     ├── Collect data from all API endpoints                             │
│     ├── Load DOCX template (docxtemplater or officegen)                 │
│     ├── Populate template sections                                       │
│     ├── Insert floor plan images                                         │
│     ├── Insert maps (static or screenshot)                              │
│     ├── Upload to MinIO/S3                                              │
│     └── Update report record (status: draft, docx_url)                  │
│     │                                                                    │
│     ▼                                                                    │
│  3. RETURN DRAFT TO USER                                                │
│     │                                                                    │
│     ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │ FRONTEND: MS Word Editor Component                           │       │
│  │                                                               │       │
│  │ • Load DOCX using OnlyOffice / Collabora / WebODF            │       │
│  │ • Enable real-time editing                                    │       │
│  │ • Photo upload integration                                    │       │
│  │ • Auto-save every 30 seconds                                  │       │
│  │ • Track changes (optional)                                    │       │
│  └──────────────────────────────────────────────────────────────┘       │
│     │                                                                    │
│     ▼                                                                    │
│  4. USER CLICKS "APPROVE & FINALIZE"                                    │
│     │                                                                    │
│     ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │ POST /api/reports/:id/approve                                │       │
│  │ • Validate valuer credentials                                 │       │
│  │ • Add digital signature                                       │       │
│  │ • Convert DOCX to PDF (LibreOffice / Puppeteer)              │       │
│  │ • Generate digital seal (SHA-256 hash)                        │       │
│  │ • Add QR code for verification                                │       │
│  │ • Lock report (status: approved)                              │       │
│  │ • Log audit trail                                             │       │
│  └──────────────────────────────────────────────────────────────┘       │
│     │                                                                    │
│     ▼                                                                    │
│  5. FINALIZED REPORT                                                    │
│     • PDF available for download                                         │
│     • Verification URL with QR code                                      │
│     • Audit trail complete                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack for Document Generation

| Component | Technology Options |
|-----------|-------------------|
| DOCX Generation | `docxtemplater`, `officegen`, `docx` npm packages |
| DOCX Editing | **OnlyOffice Document Server** (recommended), Collabora Online, WebODF |
| PDF Conversion | LibreOffice headless, `puppeteer`, `pdf-lib` |
| Storage | MinIO (self-hosted S3), AWS S3, Google Cloud Storage |
| Digital Signature | `node-forge`, `pdf-lib` for embedding |
| QR Code | `qrcode` npm package |

---

## Compliance Checklist

### RICS Red Book Requirements

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Identification of the valuer | ✅ | `GET /api/valuers/:id` |
| Identification of the client | ✅ | `GET /api/valuations/:id/engagement` |
| Purpose of valuation | ✅ | Included in valuation record |
| Identification of the asset | ✅ | Property endpoints |
| Basis of value | ✅ | `GET /api/valuations/:id` |
| Valuation date | ✅ | Included in valuation record |
| Inspection date & extent | ✅ | `GET /api/valuations/:id/inspection` |
| Assumptions & special assumptions | ✅ | `GET /api/valuations/:id/engagement` |
| Restrictions on use | ✅ | `GET /api/reports/:id/disclaimers` |
| Confirmation of valuation approach | ✅ | `GET /api/valuations/:id/methods` |
| Amount of valuation | ✅ | Included in valuation record |
| Valuer's signature | ✅ | `POST /api/reports/:id/approve` |
| Statement of compliance with IVS | ✅ | `GET /api/reports/:id/disclaimers` |
| PI insurance disclosure | 🔲 | Add to valuer record |

### GhIS-Specific Requirements

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Ghana Post Digital Address | ✅ | `ComprehensivePropertyForm` |
| Stool/Family land disclosure | ✅ | `tenure_type` in property legal |
| Land title verification | ✅ | `GET /api/properties/:id/legal` |
| GHS to USD exchange rate | ✅ | Include in certification |
| Regional land values | ✅ | `GET /api/market/:region/overview` |
| Metropolitan/District context | ✅ | `GET /api/market/neighbourhood/:id` |
| GhIS member certification | ✅ | Valuer license verification |

### Missing Fields in ComprehensivePropertyForm

The following fields should be added to capture full report data:

```typescript
// Add to ComprehensivePropertyData interface
interface ExtendedPropertyData extends ComprehensivePropertyData {
  // Construction Details
  floor_finish?: string
  wall_finish?: string
  door_types?: string
  window_types?: string
  ceiling_types?: string
  roof_types?: string
  fixtures?: string[]
  
  // Services
  water_supply?: 'public_mains' | 'borehole' | 'well' | 'both'
  electricity_supply?: 'ecg' | 'private' | 'solar' | 'generator'
  drainage_type?: 'public_sewer' | 'septic' | 'soakaway'
  
  // External Works
  boundary_type?: string
  boundary_height_m?: number
  landscaping?: string[]
  water_storage_capacity?: number
  
  // Condition Defects
  condition_defects?: string[]
  structural_notes?: string
  
  // Risk Assessment
  risk_assessment?: {
    employment_stability: 'good' | 'average' | 'fair' | 'poor'
    convenience_employment: 'good' | 'average' | 'fair' | 'poor'
    convenience_shopping: 'good' | 'average' | 'fair' | 'poor'
    // ... etc
  }
}
```

---

## Phased Implementation Plan

### Overview

The implementation is divided into **5 phases** over approximately **8-10 weeks**. Each phase delivers working functionality that can be tested and refined before proceeding.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION TIMELINE                                  │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PHASE 1          PHASE 2          PHASE 3          PHASE 4          PHASE 5  │
│  Foundation       Core Report      Document         Approval &       Polish &  │
│  (Week 1-2)       Generation       Editor           Signature        Launch    │
│                   (Week 3-4)       (Week 5-6)       (Week 7-8)       (Week 9-10)│
│                                                                                 │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐ │
│  │ Database│     │ Report  │     │ OnlyOff │     │ Digital │     │ Testing │ │
│  │ Schema  │────▶│ API &   │────▶│ Editor  │────▶│ Signing │────▶│ & QA    │ │
│  │ + Types │     │ DOCX Gen│     │ + Photos│     │ + PDF   │     │         │ │
│  └─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘ │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Foundation (Week 1-2)

**Goal:** Set up database schema, types, and basic API structure

#### Week 1: Database & Types

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Create database migration for `valuation_reports` table | 🔴 Critical | 2h | Backend |
| Create migration for `report_photos` table | 🔴 Critical | 1h | Backend |
| Create migration for `valuation_inspections` table | 🟠 High | 1h | Backend |
| Create migration for `valuation_engagements` table | 🟠 High | 1h | Backend |
| Create migration for `property_legal` table | 🟠 High | 1h | Backend |
| Create migration for `property_construction` table | 🟠 High | 1h | Backend |
| Create migration for `property_risk_assessments` table | 🟡 Medium | 1h | Backend |
| Create migration for `valuers` table | 🟠 High | 1h | Backend |
| Create migration for `report_audit_log` table | 🟡 Medium | 1h | Backend |

**Deliverable:** All database tables created and migrated

#### Week 2: API Foundation

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Create `ReportService` class structure | 🔴 Critical | 4h | Backend |
| Implement `POST /api/reports` (create draft) | 🔴 Critical | 3h | Backend |
| Implement `GET /api/reports/:id` | 🔴 Critical | 2h | Backend |
| Implement `PUT /api/reports/:id` (update draft) | 🔴 Critical | 2h | Backend |
| Implement `DELETE /api/reports/:id` | 🟡 Medium | 1h | Backend |
| Add report types to frontend | 🔴 Critical | 2h | Frontend |
| Create `reportsApi` client in frontend | 🔴 Critical | 2h | Frontend |

**Deliverable:** Basic CRUD API for reports working

---

### Phase 2: Core Report Generation (Week 3-4)

**Goal:** Generate DOCX reports with all sections populated

#### Week 3: Data Collection Endpoints

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Implement `GET /api/reports/:id/cover` | 🔴 Critical | 2h | Backend |
| Implement `GET /api/reports/:id/transmittal` | 🔴 Critical | 3h | Backend |
| Implement `GET /api/reports/:id/certification` | 🔴 Critical | 2h | Backend |
| Implement `GET /api/reports/:id/disclaimers` | 🟠 High | 1h | Backend |
| Implement `GET /api/properties/:id/legal` | 🔴 Critical | 3h | Backend |
| Implement `GET /api/properties/:id/construction` | 🟠 High | 2h | Backend |
| Implement `GET /api/properties/:id/externals` | 🟠 High | 2h | Backend |
| Implement `GET /api/properties/:id/risk-assessment` | 🟠 High | 2h | Backend |
| Implement `GET /api/valuations/:id/inspection` | 🟠 High | 2h | Backend |
| Implement `GET /api/valuations/:id/engagement` | 🟠 High | 2h | Backend |

**Deliverable:** All data endpoints returning structured JSON

#### Week 4: DOCX Generation

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Install `docxtemplater` + `pizzip` packages | 🔴 Critical | 1h | Backend |
| Create GhIS Standard report template (DOCX) | 🔴 Critical | 8h | Backend/Design |
| Create RICS Residential template (DOCX) | 🟠 High | 6h | Backend/Design |
| Implement `generateDocx()` in ReportService | 🔴 Critical | 6h | Backend |
| Add floor plan image embedding | 🟠 High | 3h | Backend |
| Add location map embedding | 🟡 Medium | 2h | Backend |
| Set up MinIO bucket for report storage | 🔴 Critical | 2h | DevOps |
| Implement report upload to MinIO | 🔴 Critical | 2h | Backend |

**Deliverable:** Working DOCX generation with download

```typescript
// Example: docxtemplater usage
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ImageModule from 'docxtemplater-image-module-free';

async function generateDocx(reportData: ReportData): Promise<Buffer> {
  const templatePath = `./templates/${reportData.template}.docx`;
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  
  const doc = new Docxtemplater(zip, {
    modules: [new ImageModule({ centered: true })],
    paragraphLoop: true,
    linebreaks: true,
  });
  
  doc.render({
    cover: reportData.cover,
    transmittal: reportData.transmittal,
    property: reportData.property,
    valuation: reportData.valuation,
    methods: reportData.methods,
    comparables: reportData.comparables,
    certification: reportData.certification,
    disclaimers: reportData.disclaimers,
  });
  
  return doc.getZip().generate({ type: 'nodebuffer' });
}
```

---

### Phase 3: Document Editor Integration (Week 5-6)

**Goal:** Enable in-browser DOCX editing with photo upload

#### Week 5: OnlyOffice Setup

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Deploy OnlyOffice Document Server (Docker) | 🔴 Critical | 4h | DevOps |
| Configure JWT authentication for OnlyOffice | 🔴 Critical | 2h | DevOps |
| Create `DocumentEditorPage` component | 🔴 Critical | 6h | Frontend |
| Implement OnlyOffice React integration | 🔴 Critical | 4h | Frontend |
| Add callback URL for document save | 🔴 Critical | 3h | Backend |
| Implement auto-save (every 30s) | 🟠 High | 2h | Frontend |

**OnlyOffice Docker Setup:**
```yaml
# docker-compose.yml addition
services:
  onlyoffice:
    image: onlyoffice/documentserver:latest
    container_name: propmetrik-onlyoffice
    ports:
      - "8080:80"
    environment:
      - JWT_ENABLED=true
      - JWT_SECRET=${ONLYOFFICE_JWT_SECRET}
    volumes:
      - onlyoffice_data:/var/www/onlyoffice/Data
      - onlyoffice_logs:/var/log/onlyoffice
    restart: unless-stopped

volumes:
  onlyoffice_data:
  onlyoffice_logs:
```

#### Week 6: Photo Upload & Management

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Implement `POST /api/reports/:id/photos` | 🔴 Critical | 4h | Backend |
| Implement `GET /api/reports/:id/photos` | 🔴 Critical | 2h | Backend |
| Implement `DELETE /api/reports/:id/photos/:photoId` | 🟠 High | 1h | Backend |
| Implement `PUT /api/reports/:id/photos/reorder` | 🟡 Medium | 2h | Backend |
| Create `PhotoUploader` component | 🔴 Critical | 4h | Frontend |
| Add drag-and-drop photo reordering | 🟠 High | 3h | Frontend |
| Image compression before upload | 🟠 High | 2h | Frontend |
| Thumbnail generation | 🟠 High | 2h | Backend |

**Deliverable:** Full document editing with photo management

---

### Phase 4: Approval & Digital Signature (Week 7-8)

**Goal:** Implement approval workflow, PDF generation, and digital signatures

#### Week 7: Approval Workflow

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Implement `POST /api/reports/:id/approve` | 🔴 Critical | 4h | Backend |
| Add status transitions (draft → approved) | 🔴 Critical | 2h | Backend |
| Implement report locking on approval | 🔴 Critical | 2h | Backend |
| Create approval confirmation modal | 🔴 Critical | 3h | Frontend |
| Implement `GET /api/valuers/:id` | 🟠 High | 2h | Backend |
| Create valuer profile/credentials page | 🟠 High | 4h | Frontend |
| Implement `POST /api/valuers/:id/signature` | 🔴 Critical | 3h | Backend |
| Create signature pad component | 🔴 Critical | 4h | Frontend |

**Signature Capture:**
```typescript
// Using react-signature-canvas
import SignatureCanvas from 'react-signature-canvas';

function SignaturePad({ onSave }) {
  const sigRef = useRef<SignatureCanvas>(null);
  
  const handleSave = () => {
    const dataUrl = sigRef.current?.toDataURL('image/png');
    onSave(dataUrl);
  };
  
  return (
    <div>
      <SignatureCanvas
        ref={sigRef}
        canvasProps={{ width: 400, height: 150, className: 'signature-canvas' }}
      />
      <button onClick={handleSave}>Save Signature</button>
    </div>
  );
}
```

#### Week 8: PDF Generation & Digital Seal

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Set up LibreOffice headless for PDF conversion | 🔴 Critical | 3h | DevOps |
| Implement DOCX to PDF conversion service | 🔴 Critical | 4h | Backend |
| Generate SHA-256 hash for document integrity | 🔴 Critical | 2h | Backend |
| Create QR code with verification URL | 🟠 High | 2h | Backend |
| Embed QR code in PDF | 🟠 High | 3h | Backend |
| Implement `GET /api/reports/:id/download` | 🔴 Critical | 2h | Backend |
| Create verification page `/verify/:reportId` | 🟠 High | 4h | Frontend |
| Implement `report_audit_log` tracking | 🟠 High | 2h | Backend |

**PDF Conversion with LibreOffice:**
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function convertToPdf(docxPath: string, outputDir: string): Promise<string> {
  await execAsync(
    `libreoffice --headless --convert-to pdf --outdir ${outputDir} ${docxPath}`
  );
  return docxPath.replace('.docx', '.pdf');
}
```

**Deliverable:** Complete approval flow with signed PDFs

---

### Phase 5: Polish & Launch (Week 9-10)

**Goal:** Testing, bug fixes, UI polish, and production deployment

#### Week 9: Testing & QA

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Write unit tests for ReportService | 🔴 Critical | 4h | Backend |
| Write integration tests for report APIs | 🔴 Critical | 4h | Backend |
| End-to-end testing of full workflow | 🔴 Critical | 6h | QA |
| Test RICS/GhIS compliance checklist | 🔴 Critical | 4h | QA/Product |
| Cross-browser testing (Chrome, Firefox, Safari) | 🟠 High | 3h | QA |
| Mobile responsiveness testing | 🟠 High | 2h | QA |
| Performance testing (large reports) | 🟠 High | 2h | QA |
| Security audit (file upload, authentication) | 🔴 Critical | 4h | Security |

#### Week 10: Polish & Deploy

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| UI/UX polish based on testing feedback | 🔴 Critical | 6h | Frontend |
| Error handling improvements | 🔴 Critical | 3h | Full Stack |
| Loading states and progress indicators | 🟠 High | 2h | Frontend |
| User documentation / help tooltips | 🟡 Medium | 3h | Product |
| Production deployment | 🔴 Critical | 4h | DevOps |
| Monitoring and alerting setup | 🟠 High | 2h | DevOps |
| Team training session | 🟡 Medium | 2h | All |

**Deliverable:** Production-ready report generation system

---

### Dependencies & Prerequisites

#### Infrastructure Requirements

| Component | Requirement | Notes |
|-----------|-------------|-------|
| **OnlyOffice Document Server** | 2 CPU, 4GB RAM minimum | Self-hosted Docker |
| **MinIO** | 10GB+ storage for reports | S3-compatible storage |
| **LibreOffice** | Headless installation | For PDF conversion |
| **Redis** | For job queue | Report generation queue |

#### NPM Packages to Install

```bash
# Backend
npm install docxtemplater pizzip docxtemplater-image-module-free
npm install qrcode
npm install crypto # (built-in, for SHA-256)

# Frontend  
npm install react-signature-canvas
npm install @onlyoffice/document-editor-react
npm install react-dropzone # for photo upload
npm install @dnd-kit/core @dnd-kit/sortable # for photo reordering
```

#### Environment Variables

```env
# OnlyOffice
ONLYOFFICE_URL=http://localhost:8080
ONLYOFFICE_JWT_SECRET=your-secret-key

# MinIO (Reports Storage)
MINIO_REPORTS_BUCKET=propmetrik-reports
MINIO_PHOTOS_BUCKET=propmetrik-report-photos

# PDF Conversion
LIBREOFFICE_PATH=/usr/bin/libreoffice

# Report Verification
VERIFICATION_BASE_URL=https://verify.propmetrik.com
```

---

### Sprint Planning Summary

| Phase | Duration | Key Deliverables | Success Criteria |
|-------|----------|------------------|------------------|
| **Phase 1** | 2 weeks | Database + Basic API | Can create/read report records |
| **Phase 2** | 2 weeks | DOCX Generation | Can download populated DOCX |
| **Phase 3** | 2 weeks | Document Editor | Can edit DOCX in browser + upload photos |
| **Phase 4** | 2 weeks | Approval + PDF | Can approve & get signed PDF |
| **Phase 5** | 2 weeks | Polish + Launch | Production deployment |

---

### Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| OnlyOffice integration complexity | Medium | High | Start with simpler HTML preview fallback |
| Template design delays | High | Medium | Use minimal template initially, enhance later |
| PDF conversion quality issues | Medium | Medium | Test with multiple document types early |
| Large file performance | Low | Medium | Implement chunked upload, compression |
| Digital signature legal validity | Low | High | Consult legal team on Ghana e-signature laws |

---

### MVP vs Full Feature Set

#### MVP (Phase 1-3) - 6 weeks
- ✅ Generate DOCX report from valuation
- ✅ Download DOCX file
- ✅ Basic photo upload (manual insertion)
- ✅ Simple HTML preview (no in-browser editing)

#### Full Feature (Phase 4-5) - 10 weeks
- ✅ In-browser DOCX editing (OnlyOffice)
- ✅ Digital signature capture
- ✅ PDF generation with seal
- ✅ QR code verification
- ✅ Audit trail

**Recommendation:** Start with MVP, deploy to staging, gather feedback, then proceed to full features.

---

## Next Steps

1. **Create database migrations** for new tables
2. **Implement report service** with DOCX generation
3. **Set up OnlyOffice/Collabora** for in-browser editing
4. **Build report preview component** in frontend
5. **Implement digital signature** workflow
6. **Add photo upload** to report editor
7. **Create PDF conversion** pipeline
8. **Build verification page** for QR code links
