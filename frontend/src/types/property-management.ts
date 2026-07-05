
/**
 * Property Management Module Types
 * Mirrored from backend for frontend use
 */

// =====================================================
// ENUMS
// =====================================================

export enum TenantStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    BLACKLISTED = 'blacklisted',
    PENDING_VERIFICATION = 'pending_verification'
}

export enum TenancyStatus {
    PENDING_SIGNATURE = 'pending_signature', // Lease generated, awaiting e-signatures
    PENDING = 'pending',
    ACTIVE = 'active',
    EXPIRED = 'expired',
    TERMINATED = 'terminated',
    RENEWED = 'renewed'
}

export enum PaymentMethod {
    CASH = 'cash',
    BANK_TRANSFER = 'bank_transfer',
    BANK_DEPOSIT = 'bank_deposit',
    CHEQUE = 'cheque',
    MOBILE_MONEY_MTN = 'mobile_money_mtn',
    MOBILE_MONEY_VODAFONE = 'mobile_money_vodafone',
    MOBILE_MONEY_AIRTELTIGO = 'mobile_money_airteltigo',
    PAYSTACK = 'paystack',
    FLUTTERWAVE = 'flutterwave'
}

export enum PaymentStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REFUNDED = 'refunded',
    PARTIALLY_PAID = 'partially_paid'
}

export enum WorkOrderStatus {
    OPEN = 'open',
    ASSIGNED = 'assigned',
    IN_PROGRESS = 'in_progress',
    PENDING_APPROVAL = 'pending_approval',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}

export enum Priority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    URGENT = 'urgent',
    CRITICAL = 'critical'
}

export enum Urgency {
    ROUTINE = 'routine',
    NORMAL = 'normal',
    URGENT = 'urgent',
    EMERGENCY = 'emergency'
}

export enum MaintenanceCategory {
    PLUMBING = 'plumbing',
    ELECTRICAL = 'electrical',
    HVAC = 'hvac',
    ROOFING = 'roofing',
    PAINTING = 'painting',
    FLOORING = 'flooring',
    DOORS_WINDOWS = 'doors_windows',
    SECURITY = 'security',
    WATER_SUPPLY = 'water_supply',
    BOREHOLE = 'borehole',
    GENERATOR = 'generator',
    SOLAR_SYSTEM = 'solar_system',
    COMPOUND_MAINTENANCE = 'compound_maintenance',
    PEST_CONTROL = 'pest_control',
    SEPTIC_TANK = 'septic_tank',
    OTHER = 'other'
}

export enum VendorStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SUSPENDED = 'suspended',
    PENDING_VERIFICATION = 'pending_verification'
}

export enum IncomeCategory {
    RENTAL_INCOME = 'rental_income',
    PARKING_FEES = 'parking_fees',
    UTILITY_CHARGES = 'utility_charges',
    SERVICE_CHARGES = 'service_charges',
    LATE_FEES = 'late_fees',
    SECURITY_DEPOSIT_FORFEITURE = 'security_deposit_forfeiture',
    OTHER_INCOME = 'other_income'
}

export enum ExpenseCategory {
    PROPERTY_TAXES = 'property_taxes',
    INSURANCE = 'insurance',
    MAINTENANCE_REPAIRS = 'maintenance_repairs',
    UTILITIES_ECG = 'utilities_ecg',
    UTILITIES_WATER = 'utilities_water',
    UTILITIES_WASTE = 'utilities_waste',
    SECURITY_SERVICES = 'security_services',
    PROPERTY_MANAGEMENT_FEES = 'property_management_fees',
    LEGAL_FEES = 'legal_fees',
    MARKETING_ADVERTISING = 'marketing_advertising',
    DEPRECIATION = 'depreciation',
    AGENT_COMMISSION = 'agent_commission',
    OTHER_EXPENSES = 'other_expenses'
}

export enum PropertyDocumentType {
    INDENTURE = 'indenture',
    LEASE_AGREEMENT = 'lease_agreement',
    POWER_OF_ATTORNEY = 'power_of_attorney',
    LANDS_COMMISSION_SEARCH = 'lands_commission_search',
    SITE_PLAN = 'site_plan',
    BUILDING_PERMIT = 'building_permit',
    OCCUPANCY_CERTIFICATE = 'occupancy_certificate',
    ENVIRONMENTAL_PERMIT = 'environmental_permit',
    FIRE_CERTIFICATE = 'fire_certificate',
    PROPERTY_TAX_RECEIPTS = 'property_tax_receipts',
    VALUATION_REPORTS = 'valuation_reports',
    INSURANCE_POLICIES = 'insurance_policies',
    MORTGAGE_DOCUMENTS = 'mortgage_documents',
    TENANT_AGREEMENTS = 'tenant_agreements',
    MAINTENANCE_RECORDS = 'maintenance_records',
    UTILITY_BILLS = 'utility_bills',
    VENDOR_CONTRACTS = 'vendor_contracts',
    PROPERTY_PHOTOS = 'property_photos',
    INSPECTION_REPORTS = 'inspection_reports',
    CORRESPONDENCE = 'correspondence',
    OTHER = 'other'
}

// =====================================================
// INTERFACES
// =====================================================

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}

export interface Tenant {
    id: string;
    organizationId: string;
    fullName: string;
    ghanaCardNumber?: string;
    phonePrimary: string;
    phoneSecondary?: string;
    email?: string;
    dateOfBirth?: string;
    currentAddress?: string;
    digitalAddress?: string;
    occupation?: string;
    employer?: string;
    employerPhone?: string;
    monthlyIncome?: number;
    creditScore?: number;
    emergencyContactName?: string;
    emergencyContactRelationship?: string;
    emergencyContactPhone?: string;
    status: TenantStatus;
    [key: string]: any; // Allow for other fields
}

// Lease/Tenancy creation input
export interface CreateTenancyInput {
    // Property Info
    propertyId: string;
    tenantId: string;
    
    // Landlord Info (fetched from organization or property)
    landlordName?: string;
    landlordAddress?: string;
    landlordIdNumber?: string;
    landlordContact?: string;
    
    // Lease Terms
    leaseStartDate: string;
    leaseEndDate: string;
    termMonths?: number;
    noticePeriodMonths?: number;
    
    // Rent & Payment
    monthlyRent: number;
    rentCurrency: string;
    advanceMonths?: number; // How many months advance (max 6 in Ghana)
    advanceAmount?: number;
    paymentDueDay?: number; // Day of month rent is due
    paymentMethod?: 'bank_transfer' | 'mobile_money' | 'cash' | 'other';
    paymentDetails?: string; // Bank account, MoMo number, etc.
    latePaymentPenaltyPercent?: number;
    latePaymentGraceDays?: number;
    
    // Security Deposit
    securityDeposit?: number;
    securityDepositMonths?: number;
    
    // Property Use
    useType?: 'residential' | 'commercial';
    maxOccupants?: number;
    petsAllowed?: boolean;
    petDetails?: string;
    
    // Property Inclusions
    includedAmenities?: string[];
    excludedAmenities?: string[];
    
    // Utilities
    tenantUtilities?: string[]; // What tenant pays
    landlordUtilities?: string[]; // What landlord pays
    
    // Termination
    earlyTerminationNoticePeriod?: number;
    
    // Special Conditions
    specialConditions?: string;
    
    // Jurisdiction
    disputeResolutionCity?: string;
}

export interface Tenancy {
    id: string;
    referenceNumber: string;
    propertyId: string;
    tenantId: string;
    applicationId?: string;
    leaseStartDate: string;
    leaseEndDate: string;
    monthlyRent: number;
    rentCurrency: string;
    status: TenancyStatus;
    leaseStatus?: string;
    leaseDocumentUrl?: string;
    leaseSignedUrl?: string;
    leaseSentAt?: string;
    tenantSignedAt?: string;
    landlordSignedAt?: string;
    esignEnvelopeId?: string;
    esignStatus?: string;
    esignCreatedAt?: string;
    esignCompletedAt?: string;
    paymentFreq?: string;
    advancePaymentMonths?: number;
    rentDueDay?: number;
    lateFeeGraceDays?: number;
    tenant?: {
        id?: string;
        organizationId?: string;
        fullName: string;
        phonePrimary?: string;
        email?: string;
        currentAddress?: string;
        digitalAddress?: string;
        ghanaCardNumber?: string;
        occupation?: string;
        employerName?: string;
    };
    property?: {
        id: string;
        title: string;
        address: string;
        addressStreet?: string;
        addressCity?: string;
        addressRegion?: string;
        digitalAddress?: string;
        propertyType?: string;
        bedrooms?: number;
        bathrooms?: number;
    };
    [key: string]: any;
}

export interface Vendor {
    id: string;
    organizationId: string;
    businessName: string;
    contactPerson: string;
    phonePrimary: string;
    email?: string;
    serviceCategories: MaintenanceCategory[];
    totalJobsCompleted: number;
    averageRating: number;
    status: VendorStatus;
    activeJobs?: number; // Computed on frontend or backend
    [key: string]: any;
}

export interface WorkOrder {
    id: string;
    referenceNumber: string;
    propertyId: string;
    title: string;
    description?: string;
    category: MaintenanceCategory;
    priority: Priority;
    status: WorkOrderStatus;
    assignedVendorId?: string;
    assignedTo?: string; // Vendor name for display
    dateReported?: string;
    scheduledDate?: string;
    property?: {
        id: string;
        title: string;
    };
    [key: string]: any;
}

export interface PropertyDocument {
    id: string;
    documentType: PropertyDocumentType;
    title: string;
    fileName: string;
    fileSizeBytes?: number;
    fileUrl: string;
    propertyId: string;
    uploadedBy?: string;
    createdAt: string;
    property?: {
        title: string;
    };
    [key: string]: any;
}

/** Unified document vault item — aggregated from multiple tables */
export interface VaultDocument {
    id: string;
    title: string;
    fileName: string;
    fileUrl: string;
    fileSizeBytes?: number;
    mimeType?: string;
    documentType: string;
    source: 'upload' | 'lease' | 'signed_lease';
    propertyId?: string;
    propertyTitle?: string;
    tenancyId?: string;
    tenantName?: string;
    signingStatus?: string;
    isVerified: boolean;
    tags?: string[];
    createdAt: string;
    updatedAt?: string;
}

export interface VaultSummary {
    totalFiles: number;
    totalStorageBytes: number;
    leaseDocuments: number;
    signedLeases: number;
    tenantUploads: number;
    byType: Record<string, number>;
}

export interface FinancialRecord {
    id: string;
    transactionDate: string;
    description?: string;
    recordType: 'income' | 'expense';
    amount: number;
    currency: string;
    status: PaymentStatus; // Mapped from payment status or manual
    category: string; // incomeCategory or expenseCategory
    propertyId: string;
    property?: {
        title: string;
    };
    [key: string]: any;
}

/**
 * FX metadata returned alongside any GHS-normalized aggregate. Lets the UI stamp
 * "rates as of HH:MM (USD 15.50)" and warn when a rate fell back to 1:1.
 */
export interface PortfolioFxMeta {
    baseCurrency: string;
    rates: Record<string, number>;
    ratesAsOf: string;
    ratesSource: string;
    ratesDegraded: boolean;
}

export interface PortfolioMetrics {
    totalProperties: number;
    propertyGrowth: number;
    occupancyRate: number;
    occupancyTrend: number;
    monthlyIncome: number;
    incomeTrend: number;
    totalValue: number;
    valueTrend: number;
    totalTenants: number;
    activeTenancies: number;
    pendingWorkOrders: number;
    overduePayments: number;
    collectionRate: number;
    fx?: PortfolioFxMeta;
}

export interface PortfolioValue {
    totalValue: number;
    currentMarketValue: number;
    purchaseValue: number;
    appreciationAmount: number;
    appreciationPercentage: number;
    lastUpdated: string;
    valuationConfidence: number;
    fx?: PortfolioFxMeta;
}

export interface PortfolioComposition {
    byType: {
        type: string;
        count: number;
        value: number;
    }[];
    byRegion: {
        region: string;
        count: number;
        value: number;
    }[];
    byStatus: {
        status: string;
        count: number;
        value: number;
    }[];
    fx?: PortfolioFxMeta;
}

export interface LeasePortfolioSummary {
    globalOccupancyRate: number;
    activeLeases: number;
    totalUnits: number;
    expiringSoon: {
        within30Days: number;
        within60Days: number;
        within90Days: number;
    };
    totalMonthlyRevenue: number;
    revenueCurrency: string;
    fx?: PortfolioFxMeta;
}

export interface Property {
    id: string;
    organizationId?: string;
    referenceNumber: string;
    title: string;
    description?: string;
    region: string;
    addressCity: string;
    addressDistrict?: string;
    addressStreet?: string;
    digitalAddress?: string;
    propertyType: string;
    transactionType: string;
    bedrooms?: number;
    bathrooms?: number;
    floors?: number;
    totalAreaSqm?: number;
    price: number;
    priceCurrency: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    parentPropertyId?: string;
    unitNumber?: string;
    floorNumber?: number;
    totalUnits?: number;
    // Transient for creation
    unitsCount?: number;
    units?: PropertyUnitInput[];
    // Computed fields optionally returned
    occupancy_rate?: number;
    // Marketing video shown on public marketplace listing
    video_url?: string | null;
}

export interface PropertyUnitInput {
    label: string;
    floorNumber?: number;
    bedrooms?: number;
    bathrooms?: number;
    totalAreaSqm?: number;
    price?: number;
}
