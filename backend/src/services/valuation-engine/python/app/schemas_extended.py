"""
Extended Schemas - Complete Type System
Python Pydantic models matching all TypeScript interfaces

This file ensures complete 1:1 compatibility between the TypeScript
valuation engine and Python implementation, covering all data types
used across the PROPMETRIK valuation system.
"""

from datetime import datetime, date
from typing import List, Optional, Dict, Any, Union, Tuple
from decimal import Decimal
from enum import Enum
import uuid

from pydantic import BaseModel, Field, validator
from pydantic.types import EmailStr


# ============================================================================
# EXTENDED ENUMS
# ============================================================================

class PropertyCondition(str, Enum):
    """Property condition assessment"""
    excellent = "excellent"
    very_good = "very_good"
    good = "good"
    fair = "fair"
    poor = "poor"
    very_poor = "very_poor"

class PropertyAge(str, Enum):
    """Property age categories"""
    new = "new"              # 0-2 years
    recent = "recent"        # 3-5 years
    modern = "modern"        # 6-10 years
    established = "established"  # 11-20 years
    mature = "mature"        # 21-40 years
    old = "old"             # 41+ years

class OwnershipType(str, Enum):
    """Property ownership types in Ghana"""
    freehold = "freehold"
    leasehold = "leasehold"
    customary = "customary"
    family_land = "family_land"
    government = "government"
    stool_land = "stool_land"
    skin_land = "skin_land"

class DocumentStatus(str, Enum):
    """Land title document status"""
    registered_title = "registered_title"
    deed_of_assignment = "deed_of_assignment"
    indenture = "indenture"
    site_plan = "site_plan"
    building_permit = "building_permit"
    occupancy_certificate = "occupancy_certificate"
    pending = "pending"
    missing = "missing"

class DataSource(str, Enum):
    """Data source types"""
    manual_entry = "manual_entry"
    database_match = "database_match"
    web_scraping = "web_scraping"
    api_integration = "api_integration"
    field_survey = "field_survey"
    public_records = "public_records"
    estate_agent = "estate_agent"

class ValidationStatus(str, Enum):
    """Data validation status"""
    validated = "validated"
    pending_validation = "pending_validation"
    requires_review = "requires_review"
    rejected = "rejected"
    outdated = "outdated"


# ============================================================================
# PROPERTY MODELS
# ============================================================================

class PropertyLocation(BaseModel):
    """Detailed property location information"""
    latitude: Optional[float] = Field(None, description="Latitude coordinate")
    longitude: Optional[float] = Field(None, description="Longitude coordinate")
    address_street: Optional[str] = Field(None, description="Street address")
    address_city: str = Field(..., description="City/town")
    address_district: Optional[str] = Field(None, description="District")
    region: str = Field(..., description="Ghana region")
    digital_address: Optional[str] = Field(None, description="Ghana Digital Address")
    postal_code: Optional[str] = Field(None, description="Postal code")
    neighborhood: Optional[str] = Field(None, description="Neighborhood/estate name")
    landmarks: Optional[List[str]] = Field(None, description="Nearby landmarks")
    accessibility: Optional[str] = Field(None, description="Accessibility notes")

class PropertyFeatures(BaseModel):
    """Property features and amenities"""
    # Basic features
    bedrooms: Optional[int] = Field(None, ge=0, description="Number of bedrooms")
    bathrooms: Optional[int] = Field(None, ge=0, description="Number of bathrooms")
    toilets: Optional[int] = Field(None, ge=0, description="Number of toilets")
    living_rooms: Optional[int] = Field(None, ge=0, description="Number of living rooms")
    kitchens: Optional[int] = Field(None, ge=0, description="Number of kitchens")
    
    # Areas
    building_area_sqm: Optional[float] = Field(None, ge=0, description="Building area in sqm")
    land_area_sqm: Optional[float] = Field(None, ge=0, description="Land area in sqm")
    garage_spaces: Optional[int] = Field(None, ge=0, description="Garage/parking spaces")
    
    # Construction
    construction_type: Optional[str] = Field(None, description="Construction type")
    roofing_material: Optional[str] = Field(None, description="Roofing material")
    wall_material: Optional[str] = Field(None, description="Wall material")
    flooring_material: Optional[str] = Field(None, description="Flooring material")
    
    # Amenities
    swimming_pool: bool = Field(False, description="Has swimming pool")
    generator: bool = Field(False, description="Has generator")
    solar_power: bool = Field(False, description="Has solar power")
    security_features: Optional[List[str]] = Field(None, description="Security features")
    gardens: bool = Field(False, description="Has gardens")
    servants_quarters: bool = Field(False, description="Has servants quarters")
    
    # Utilities
    electricity: bool = Field(True, description="Has electricity connection")
    water_supply: bool = Field(True, description="Has water supply")
    internet_ready: bool = Field(False, description="Internet/cable ready")
    air_conditioning: bool = Field(False, description="Has air conditioning")

class PropertyLegal(BaseModel):
    """Legal and documentation information"""
    ownership_type: OwnershipType = Field(..., description="Type of ownership")
    title_documents: List[DocumentStatus] = Field(..., description="Available documents")
    lease_term_years: Optional[int] = Field(None, description="Lease term if applicable")
    lease_expiry: Optional[date] = Field(None, description="Lease expiry date")
    encumbrances: Optional[List[str]] = Field(None, description="Encumbrances or liens")
    planning_permission: bool = Field(False, description="Has planning permission")
    building_permit_status: DocumentStatus = Field(DocumentStatus.pending, description="Building permit status")
    survey_plan: bool = Field(False, description="Has survey plan")
    litigation_status: Optional[str] = Field(None, description="Any litigation issues")

class PropertyFinancial(BaseModel):
    """Financial information for income properties"""
    current_rental_income: Optional[float] = Field(None, description="Current monthly rental")
    potential_rental_income: Optional[float] = Field(None, description="Potential monthly rental")
    annual_expenses: Optional[float] = Field(None, description="Annual operating expenses")
    vacancy_rate: Optional[float] = Field(None, ge=0, le=1, description="Vacancy rate %")
    management_fees: Optional[float] = Field(None, description="Management fees %")
    service_charge: Optional[float] = Field(None, description="Monthly service charge")
    property_tax: Optional[float] = Field(None, description="Annual property tax")
    insurance_cost: Optional[float] = Field(None, description="Annual insurance cost")

class PropertyValuation(BaseModel):
    """Property valuation record"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str = Field(..., description="Property ID")
    valuer_id: Optional[str] = Field(None, description="Valuer ID")
    
    # Valuation details
    valuation_date: date = Field(..., description="Valuation date")
    valuation_type: str = Field(..., description="Type of valuation")
    valuation_purpose: str = Field(..., description="Purpose of valuation")
    
    # Values
    estimated_value: float = Field(..., description="Estimated value in GHS")
    value_currency: str = Field("GHS", description="Value currency")
    value_per_sqm: Optional[float] = Field(None, description="Value per sqm")
    confidence_score: float = Field(..., ge=0, le=1, description="Confidence score")
    
    # Method information
    primary_method: str = Field(..., description="Primary valuation method")
    methods_used: List[str] = Field(..., description="All methods used")
    method_weights: Optional[Dict[str, float]] = Field(None, description="Method weights")
    
    # Range
    value_range_low: Optional[float] = Field(None, description="Value range low")
    value_range_high: Optional[float] = Field(None, description="Value range high")
    
    # Status and workflow
    status: str = Field("draft", description="Valuation status")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    reviewed_at: Optional[datetime] = Field(None, description="Review timestamp")
    reviewed_by: Optional[str] = Field(None, description="Reviewer ID")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# ============================================================================
# TRANSACTION MODELS
# ============================================================================

class TransactionParty(BaseModel):
    """Transaction party information"""
    name: Optional[str] = Field(None, description="Party name")
    party_type: str = Field(..., description="buyer/seller/landlord/tenant")
    contact_info: Optional[Dict[str, str]] = Field(None, description="Contact information")
    is_corporate: bool = Field(False, description="Is corporate entity")
    nationality: Optional[str] = Field(None, description="Nationality")

class TransactionDetails(BaseModel):
    """Property transaction details"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str = Field(..., description="Property ID")
    transaction_type: str = Field(..., description="Sale/rental/lease")
    
    # Price and terms
    transaction_price: float = Field(..., description="Transaction price")
    price_currency: str = Field("GHS", description="Price currency")
    price_per_sqm: Optional[float] = Field(None, description="Price per sqm")
    deposit_amount: Optional[float] = Field(None, description="Deposit amount")
    
    # Dates
    transaction_date: date = Field(..., description="Transaction date")
    listing_date: Optional[date] = Field(None, description="Original listing date")
    days_on_market: Optional[int] = Field(None, description="Days on market")
    
    # Parties
    buyer: Optional[TransactionParty] = Field(None, description="Buyer information")
    seller: Optional[TransactionParty] = Field(None, description="Seller information")
    
    # Transaction specifics
    financing_type: Optional[str] = Field(None, description="Financing type")
    down_payment_pct: Optional[float] = Field(None, description="Down payment %")
    mortgage_terms: Optional[Dict[str, Any]] = Field(None, description="Mortgage terms")
    
    # Market conditions
    market_conditions: Optional[str] = Field(None, description="Market conditions at time")
    negotiation_notes: Optional[str] = Field(None, description="Negotiation notes")
    special_circumstances: Optional[List[str]] = Field(None, description="Special circumstances")
    
    # Data quality
    data_source: DataSource = Field(..., description="Data source")
    data_quality_score: float = Field(..., ge=0, le=1, description="Data quality score")
    validation_status: ValidationStatus = Field(..., description="Validation status")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# ============================================================================
# USER AND WORKFLOW MODELS
# ============================================================================

class UserProfile(BaseModel):
    """User profile information"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr = Field(..., description="User email")
    full_name: str = Field(..., description="Full name")
    
    # Professional info
    professional_designation: Optional[str] = Field(None, description="Professional designation")
    license_number: Optional[str] = Field(None, description="License number")
    organization: Optional[str] = Field(None, description="Organization")
    specializations: Optional[List[str]] = Field(None, description="Specialization areas")
    
    # Contact
    phone: Optional[str] = Field(None, description="Phone number")
    address: Optional[str] = Field(None, description="Address")
    
    # Permissions
    role: str = Field("user", description="User role")
    permissions: List[str] = Field(default_factory=list, description="User permissions")
    
    # Status
    is_active: bool = Field(True, description="Is account active")
    email_verified: bool = Field(False, description="Is email verified")
    last_login: Optional[datetime] = Field(None, description="Last login timestamp")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class WorkflowTask(BaseModel):
    """Workflow task for valuation process"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    valuation_id: str = Field(..., description="Related valuation ID")
    task_type: str = Field(..., description="Type of task")
    task_name: str = Field(..., description="Task name")
    description: Optional[str] = Field(None, description="Task description")
    
    # Assignment
    assigned_to: Optional[str] = Field(None, description="Assigned user ID")
    assigned_by: Optional[str] = Field(None, description="Assigning user ID")
    
    # Status
    status: str = Field("pending", description="Task status")
    priority: str = Field("normal", description="Task priority")
    due_date: Optional[datetime] = Field(None, description="Due date")
    
    # Completion
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    completed_by: Optional[str] = Field(None, description="Completing user ID")
    completion_notes: Optional[str] = Field(None, description="Completion notes")
    
    # Dependencies
    depends_on: Optional[List[str]] = Field(None, description="Dependent task IDs")
    blocks: Optional[List[str]] = Field(None, description="Tasks blocked by this")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class QualityCheck(BaseModel):
    """Quality check record"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    valuation_id: str = Field(..., description="Related valuation ID")
    check_type: str = Field(..., description="Type of quality check")
    check_name: str = Field(..., description="Check name")
    
    # Results
    status: str = Field("pending", description="Check status")
    passed: Optional[bool] = Field(None, description="Did check pass")
    score: Optional[float] = Field(None, ge=0, le=1, description="Quality score")
    findings: Optional[List[str]] = Field(None, description="Check findings")
    recommendations: Optional[List[str]] = Field(None, description="Recommendations")
    
    # Execution
    checked_by: Optional[str] = Field(None, description="Checker user ID")
    checked_at: Optional[datetime] = Field(None, description="Check timestamp")
    auto_check: bool = Field(False, description="Automated check")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# ============================================================================
# API RESPONSE MODELS
# ============================================================================

class APIResponse(BaseModel):
    """Standard API response wrapper"""
    success: bool = Field(..., description="Request success status")
    message: Optional[str] = Field(None, description="Response message")
    data: Optional[Any] = Field(None, description="Response data")
    errors: Optional[List[str]] = Field(None, description="Error messages")
    meta: Optional[Dict[str, Any]] = Field(None, description="Metadata")
    timestamp: datetime = Field(default_factory=datetime.now, description="Response timestamp")

class PaginatedResponse(BaseModel):
    """Paginated API response"""
    success: bool = Field(..., description="Request success status")
    data: List[Any] = Field(..., description="Data items")
    pagination: Dict[str, Any] = Field(..., description="Pagination info")
    total: int = Field(..., description="Total items")
    page: int = Field(..., description="Current page")
    per_page: int = Field(..., description="Items per page")
    pages: int = Field(..., description="Total pages")

class ValidationError(BaseModel):
    """Validation error details"""
    field: str = Field(..., description="Field name")
    message: str = Field(..., description="Error message")
    value: Optional[Any] = Field(None, description="Invalid value")
    constraint: Optional[str] = Field(None, description="Validation constraint")


# ============================================================================
# SEARCH AND FILTER MODELS
# ============================================================================

class PropertySearchFilters(BaseModel):
    """Property search filters"""
    # Location filters
    regions: Optional[List[str]] = Field(None, description="Ghana regions")
    cities: Optional[List[str]] = Field(None, description="Cities")
    districts: Optional[List[str]] = Field(None, description="Districts")
    
    # Property type filters
    property_types: Optional[List[str]] = Field(None, description="Property types")
    transaction_types: Optional[List[str]] = Field(None, description="Transaction types")
    
    # Size filters
    bedrooms_min: Optional[int] = Field(None, ge=0, description="Minimum bedrooms")
    bedrooms_max: Optional[int] = Field(None, ge=0, description="Maximum bedrooms")
    building_area_min: Optional[float] = Field(None, ge=0, description="Minimum building area")
    building_area_max: Optional[float] = Field(None, ge=0, description="Maximum building area")
    land_area_min: Optional[float] = Field(None, ge=0, description="Minimum land area")
    land_area_max: Optional[float] = Field(None, ge=0, description="Maximum land area")
    
    # Price filters
    price_min: Optional[float] = Field(None, ge=0, description="Minimum price")
    price_max: Optional[float] = Field(None, ge=0, description="Maximum price")
    price_per_sqm_min: Optional[float] = Field(None, ge=0, description="Minimum price per sqm")
    price_per_sqm_max: Optional[float] = Field(None, ge=0, description="Maximum price per sqm")
    
    # Date filters
    date_from: Optional[date] = Field(None, description="Date from")
    date_to: Optional[date] = Field(None, description="Date to")
    
    # Quality filters
    data_quality_min: Optional[float] = Field(None, ge=0, le=1, description="Minimum data quality")
    validated_only: bool = Field(False, description="Only validated records")
    
    # Additional filters
    keywords: Optional[str] = Field(None, description="Keyword search")
    amenities: Optional[List[str]] = Field(None, description="Required amenities")
    exclude_distressed: bool = Field(True, description="Exclude distressed sales")

class SearchResult(BaseModel):
    """Search result item"""
    id: str = Field(..., description="Record ID")
    title: str = Field(..., description="Record title")
    summary: str = Field(..., description="Record summary")
    score: float = Field(..., ge=0, le=1, description="Search relevance score")
    type: str = Field(..., description="Result type")
    data: Dict[str, Any] = Field(..., description="Result data")
    highlights: Optional[List[str]] = Field(None, description="Search highlights")


# ============================================================================
# INTEGRATION MODELS
# ============================================================================

class ExternalDataSource(BaseModel):
    """External data source configuration"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., description="Data source name")
    type: str = Field(..., description="Source type")
    url: Optional[str] = Field(None, description="Source URL")
    api_key: Optional[str] = Field(None, description="API key")
    
    # Configuration
    update_frequency: str = Field("daily", description="Update frequency")
    data_types: List[str] = Field(..., description="Types of data provided")
    coverage_regions: List[str] = Field(..., description="Geographic coverage")
    
    # Status
    is_active: bool = Field(True, description="Is source active")
    last_sync: Optional[datetime] = Field(None, description="Last sync timestamp")
    sync_status: str = Field("pending", description="Sync status")
    
    # Quality
    reliability_score: float = Field(..., ge=0, le=1, description="Source reliability")
    data_quality_avg: float = Field(..., ge=0, le=1, description="Average data quality")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class DataSyncLog(BaseModel):
    """Data synchronization log entry"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_id: str = Field(..., description="Data source ID")
    sync_type: str = Field(..., description="Sync type")
    
    # Sync details
    started_at: datetime = Field(..., description="Sync start time")
    completed_at: Optional[datetime] = Field(None, description="Sync completion time")
    status: str = Field("running", description="Sync status")
    
    # Results
    records_processed: int = Field(0, description="Records processed")
    records_created: int = Field(0, description="Records created")
    records_updated: int = Field(0, description="Records updated")
    records_failed: int = Field(0, description="Records failed")
    errors: Optional[List[str]] = Field(None, description="Error messages")
    
    # Performance
    duration_seconds: Optional[float] = Field(None, description="Sync duration")
    throughput_per_second: Optional[float] = Field(None, description="Records per second")


# ============================================================================
# TYPE UNIONS AND HELPERS
# ============================================================================

# Common type unions
PropertyValueType = Union[int, float, str, bool, None]
SearchFilterValue = Union[str, int, float, bool, List[str], List[int], List[float]]

# Validation helpers
def validate_ghana_phone(phone: str) -> bool:
    """Validate Ghana phone number format"""
    import re
    pattern = r'^(\+233|0)(20|21|23|24|25|26|27|28|29|50|54|55|59)\d{7}$'
    return bool(re.match(pattern, phone))

def validate_digital_address(address: str) -> bool:
    """Validate Ghana digital address format"""
    import re
    pattern = r'^[A-Z]{2}-\d{3,4}-\d{4}$'
    return bool(re.match(pattern, address))


# ============================================================================
# EXPORT ALL MODELS
# ============================================================================

__all__ = [
    # Enums
    'PropertyCondition', 'PropertyAge', 'OwnershipType', 'DocumentStatus',
    'DataSource', 'ValidationStatus', 'MarketTrend', 'MarketCycle', 'MarketActivity',
    'InventoryLevel',
    
    # Property models
    'PropertyLocation', 'PropertyFeatures', 'PropertyLegal', 'PropertyFinancial',
    'PropertyValuation',
    
    # Transaction models
    'TransactionParty', 'TransactionDetails',
    
    # User and workflow
    'UserProfile', 'WorkflowTask', 'QualityCheck',
    
    # API responses
    'APIResponse', 'PaginatedResponse', 'ValidationError',
    
    # Search models
    'PropertySearchFilters', 'SearchResult',
    
    # Integration models
    'ExternalDataSource', 'DataSyncLog',
    
    # Helpers
    'validate_ghana_phone', 'validate_digital_address'
]