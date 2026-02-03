/**
 * Property Management Module Types
 * Phase 4.2: TypeScript interfaces for Property Management
 * 
 * These types align with database schema in 018_property_management_module.sql
 * and architecture specification (lines 2902-3682)
 */

// =====================================================
// ENUMS (matching database enums)
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
    URGENT = 'urgent'
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
// PROPERTY INTERFACES (subset for PM usage)
// =====================================================

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
    parentPropertyId?: string;
    unitNumber?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreatePropertyDto {
    title: string;
    description?: string;
    region: string;
    addressCity: string;
    addressDistrict?: string;
    addressStreet?: string;
    digitalAddress?: string;
    propertyType: string;
    transactionType?: string;
    bedrooms?: number;
    bathrooms?: number;
    floors?: number;
    totalAreaSqm?: number;
    price: number;
    priceCurrency?: string;
    unitsCount?: number;
    parentPropertyId?: string;
    unitNumber?: string;
}

// =====================================================
// TENANT INTERFACES
// =====================================================

export interface Tenant {
    id: string;
    organizationId: string;
    fullName: string;
    ghanaCardNumber?: string;
    dateOfBirth?: Date;
    phonePrimary: string;
    phoneSecondary?: string;
    email?: string;
    currentAddress?: string;
    digitalAddress?: string;
    occupation?: string;
    employerName?: string;
    employerAddress?: string;
    employerPhone?: string;
    monthlyIncome?: number;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelationship?: string;
    creditScore?: number;
    characterReferences: TenantReference[];
    previousAddresses: PreviousAddress[];
    status: TenantStatus;
    notes?: string;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface TenantReference {
    name: string;
    phone: string;
    email?: string;
    relationship: string;
    notes?: string;
}

export interface PreviousAddress {
    address: string;
    city: string;
    region: string;
    fromDate: string;
    toDate: string;
    landlordName?: string;
    landlordPhone?: string;
    reasonForLeaving?: string;
}

export interface CreateTenantDto {
    fullName: string;
    ghanaCardNumber?: string;
    dateOfBirth?: string;
    phonePrimary: string;
    phoneSecondary?: string;
    email?: string;
    currentAddress?: string;
    digitalAddress?: string;
    occupation?: string;
    employerName?: string;
    employerAddress?: string;
    employerPhone?: string;
    monthlyIncome?: number;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelationship?: string;
    characterReferences?: TenantReference[];
    previousAddresses?: PreviousAddress[];
    notes?: string;
}

export interface UpdateTenantDto extends Partial<CreateTenantDto> {
    status?: TenantStatus;
    creditScore?: number;
}

// =====================================================
// TENANCY INTERFACES
// =====================================================

export interface Tenancy {
    id: string;
    referenceNumber: string;
    propertyId: string;
    tenantId: string;
    organizationId: string;
    applicationId?: string;
    unitNumber?: string;
    leaseStartDate: Date;
    leaseEndDate: Date;
    monthlyRent: number;
    rentCurrency: string;
    advancePaymentMonths: number;
    advancePaymentAmount?: number;
    advancePaymentDate?: Date;
    securityDeposit: number;
    securityDepositPaid: boolean;
    rentDueDay: number;
    lateFeeAmount: number;
    lateFeeGraceDays: number;
    status: TenancyStatus;
    renewalOptions: RenewalOptions;
    autoRenew: boolean;
    leaseTerms: LeaseTerms;
    specialConditions?: string;
    leaseDocumentUrl?: string;
    terminatedAt?: Date;
    terminationReason?: string;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
    // Joined data
    tenant?: Tenant;
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
}

export interface RenewalOptions {
    allowRenewal: boolean;
    renewalPeriodMonths?: number;
    rentIncreasePercent?: number;
    noticeRequiredDays?: number;
}

export interface LeaseTerms {
    petsAllowed?: boolean;
    smokingAllowed?: boolean;
    sublettingAllowed?: boolean;
    maxOccupants?: number;
    utilitiesIncluded?: string[];
    tenantUtilities?: string[];
    landlordUtilities?: string[];
    additionalTerms?: string[];
}

export interface CreateTenancyDto {
    propertyId: string;
    tenantId?: string; // Optional - tenant is created after lease is signed
    unitNumber?: string;
    leaseStartDate: string;
    leaseEndDate: string;
    monthlyRent: number;
    rentCurrency?: string;
    advancePaymentMonths?: number;
    advancePaymentAmount?: number;
    advancePaymentDate?: string;
    securityDeposit?: number;
    rentDueDay?: number;
    lateFeeAmount?: number;
    lateFeeGraceDays?: number;
    renewalOptions?: RenewalOptions;
    autoRenew?: boolean;
    leaseTerms?: LeaseTerms;
    specialConditions?: string;
    status?: TenancyStatus | string; // Allow setting initial status
}

export interface UpdateTenancyDto extends Partial<CreateTenancyDto> {
    status?: TenancyStatus;
    securityDepositPaid?: boolean;
    terminationReason?: string;
}

// =====================================================
// RENT PAYMENT INTERFACES
// =====================================================

export interface RentPayment {
    id: string;
    receiptNumber: string;
    tenancyId: string;
    paymentAmount: number;
    currency: string;
    paymentDate: Date;
    paymentMethod: PaymentMethod;
    mobileMoneyReference?: string;
    mobileMoneyNumber?: string;
    bankReference?: string;
    bankName?: string;
    periodStartDate: Date;
    periodEndDate: Date;
    lateFees: number;
    otherCharges: OtherCharge[];
    status: PaymentStatus;
    notes?: string;
    recordedBy?: string;
    createdAt: Date;
    updatedAt: Date;
    // Joined data
    tenancy?: Tenancy;
}

export interface OtherCharge {
    description: string;
    amount: number;
    category?: string;
}

export interface CreateRentPaymentDto {
    tenancyId: string;
    paymentAmount: number;
    currency?: string;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    mobileMoneyReference?: string;
    mobileMoneyNumber?: string;
    bankReference?: string;
    bankName?: string;
    periodStartDate: string;
    periodEndDate: string;
    lateFees?: number;
    otherCharges?: OtherCharge[];
    notes?: string;
}

// =====================================================
// VENDOR INTERFACES
// =====================================================

export interface Vendor {
    id: string;
    organizationId: string;
    businessName: string;
    contactPerson: string;
    phonePrimary: string;
    phoneSecondary?: string;
    email?: string;
    address?: string;
    digitalAddress?: string;
    region?: string;
    tinNumber?: string;
    businessRegistration?: string;
    serviceCategories: MaintenanceCategory[];
    totalJobsCompleted: number;
    averageRating: number;
    totalRatings: number;
    bankName?: string;
    bankAccountNumber?: string;
    mobileMoneyNumber?: string;
    preferredPaymentMethod?: PaymentMethod;
    status: VendorStatus;
    notes?: string;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateVendorDto {
    businessName: string;
    contactPerson: string;
    phonePrimary: string;
    phoneSecondary?: string;
    email?: string;
    address?: string;
    digitalAddress?: string;
    region?: string;
    tinNumber?: string;
    businessRegistration?: string;
    serviceCategories: MaintenanceCategory[];
    bankName?: string;
    bankAccountNumber?: string;
    mobileMoneyNumber?: string;
    preferredPaymentMethod?: PaymentMethod;
    notes?: string;
    status?: VendorStatus;
}

export interface UpdateVendorDto extends Partial<CreateVendorDto> {
    status?: VendorStatus;
}

export interface VendorRating {
    vendorId: string;
    workOrderId: string;
    rating: number; // 1-5
    qualityOfWork: number;
    timeliness: number;
    communication: number;
    valueForMoney: number;
    wouldRecommend: boolean;
    comments?: string;
}

// =====================================================
// WORK ORDER INTERFACES
// =====================================================

export interface WorkOrder {
    id: string;
    referenceNumber: string;
    propertyId: string;
    tenancyId?: string;
    organizationId: string;
    assignedVendorId?: string;
    title: string;
    description?: string;
    category: MaintenanceCategory;
    priority: Priority;
    urgency: Urgency;
    specificLocation?: string;
    accessInstructions?: string;
    safetyConsiderations: string[];
    status: WorkOrderStatus;
    scheduledDate?: Date;
    scheduledTimeStart?: string;
    scheduledTimeEnd?: string;
    completedAt?: Date;
    estimatedCost?: number;
    actualCost?: number;
    budgetApproved: boolean;
    approvedBy?: string;
    approvedAt?: Date;
    photosBefore: string[];
    photosAfter: string[];
    documents: string[];
    completionNotes?: string;
    reportedBy?: string;
    reportedAt: Date;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
    // Joined data
    vendor?: Vendor;
    tenancy?: Tenancy;
    property?: {
        id: string;
        title: string;
        address: string;
    };
}

export interface CreateWorkOrderDto {
    propertyId: string;
    tenancyId?: string;
    title: string;
    description?: string;
    category: MaintenanceCategory;
    priority?: Priority;
    urgency?: Urgency;
    specificLocation?: string;
    accessInstructions?: string;
    safetyConsiderations?: string[];
    scheduledDate?: string;
    scheduledTimeStart?: string;
    scheduledTimeEnd?: string;
    estimatedCost?: number;
    photosBefore?: string[];
}

export interface UpdateWorkOrderDto extends Partial<CreateWorkOrderDto> {
    status?: WorkOrderStatus;
    assignedVendorId?: string;
    actualCost?: number;
    completionNotes?: string;
    photosAfter?: string[];
}

// =====================================================
// DOCUMENT INTERFACES
// =====================================================

export interface PropertyDocument {
    id: string;
    propertyId: string;
    tenancyId?: string;
    organizationId: string;
    documentType: PropertyDocumentType;
    title: string;
    description?: string;
    fileUrl: string;
    fileName: string;
    fileSizeBytes?: number;
    mimeType?: string;
    issueDate?: Date;
    expiryDate?: Date;
    issuingAuthority?: string;
    referenceNumber?: string;
    isVerified: boolean;
    verifiedBy?: string;
    verifiedAt?: Date;
    folderPath: string;
    tags: string[];
    uploadedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreatePropertyDocumentDto {
    propertyId: string;
    tenancyId?: string;
    documentType: PropertyDocumentType;
    title: string;
    description?: string;
    issueDate?: string;
    expiryDate?: string;
    issuingAuthority?: string;
    referenceNumber?: string;
    folderPath?: string;
    tags?: string[];
}

// =====================================================
// FINANCIAL INTERFACES
// =====================================================

export interface FinancialRecord {
    id: string;
    referenceNumber: string;
    propertyId: string;
    tenancyId?: string;
    workOrderId?: string;
    organizationId: string;
    recordType: 'income' | 'expense';
    incomeCategory?: IncomeCategory;
    expenseCategory?: ExpenseCategory;
    amount: number;
    currency: string;
    transactionDate: Date;
    description?: string;
    paymentMethod?: PaymentMethod;
    paymentReference?: string;
    vendorId?: string;
    receiptUrl?: string;
    invoiceUrl?: string;
    isTaxDeductible: boolean;
    taxCategory?: string;
    recordedBy?: string;
    createdAt: Date;
    updatedAt: Date;
    // Joined data
    vendor?: Vendor;
}

export interface CreateFinancialRecordDto {
    propertyId: string;
    tenancyId?: string;
    workOrderId?: string;
    recordType: 'income' | 'expense';
    incomeCategory?: IncomeCategory;
    expenseCategory?: ExpenseCategory;
    amount: number;
    currency?: string;
    transactionDate: string;
    description?: string;
    paymentMethod?: PaymentMethod;
    paymentReference?: string;
    vendorId?: string;
    isTaxDeductible?: boolean;
    taxCategory?: string;
}

// =====================================================
// PORTFOLIO INTERFACES
// =====================================================

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
}

export interface PortfolioValue {
    totalValue: number;
    currentMarketValue: number;
    purchaseValue: number;
    appreciationAmount: number;
    appreciationPercentage: number;
    lastUpdated: Date;
    valuationConfidence: number;
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
}

export interface CashFlowAnalysis {
    period: {
        startDate: Date;
        endDate: Date;
    };
    totalIncome: number;
    totalExpenses: number;
    netCashFlow: number;
    incomeByCategory: Record<IncomeCategory, number>;
    expensesByCategory: Record<ExpenseCategory, number>;
    monthlyBreakdown: MonthlyFinancials[];
}

export interface MonthlyFinancials {
    month: string;
    income: number;
    expenses: number;
    netCashFlow: number;
}

export interface ROIAnalysis {
    propertyId: string;
    purchasePrice: number;
    currentValue: number;
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    capitalGain: number;
    totalReturn: number;
    annualizedROI: number;
    cashOnCashReturn: number;
    capRate: number;
}

// =====================================================
// QUERY/FILTER INTERFACES
// =====================================================

export interface TenantFilters {
    status?: TenantStatus;
    search?: string;
    organizationId?: string;
    hasActiveTenancy?: boolean;
}

export interface TenancyFilters {
    status?: TenancyStatus;
    propertyId?: string;
    tenantId?: string;
    organizationId?: string;
    leaseExpiringWithinDays?: number;
}

export interface WorkOrderFilters {
    status?: WorkOrderStatus;
    category?: MaintenanceCategory;
    priority?: Priority;
    propertyId?: string;
    vendorId?: string;
    organizationId?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface FinancialFilters {
    recordType?: 'income' | 'expense';
    propertyId?: string;
    tenancyId?: string;
    organizationId?: string;
    dateFrom?: string;
    dateTo?: string;
    incomeCategory?: IncomeCategory;
    expenseCategory?: ExpenseCategory;
}

// =====================================================
// PAGINATION INTERFACES
// =====================================================

export interface PaginationParams {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}
