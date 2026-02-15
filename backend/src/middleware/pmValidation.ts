/**
 * Property Management Validation Schemas
 * 
 * Zod schemas for all Property Management API endpoints
 * Used with validation middleware for request validation
 */

import { z } from 'zod';
import { 
  uuidSchema, 
  emailSchema, 
  phoneSchema, 
  paginationSchema,
  ghanaPhoneSchema,
  currencySchema,
  ghanaRegionSchema 
} from './validation';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const pmIdParamSchema = z.object({
  id: uuidSchema,
});

export const pmPropertyIdParamSchema = z.object({
  propertyId: uuidSchema,
});

export const pmTenantIdParamSchema = z.object({
  tenantId: uuidSchema,
});

export const pmTenancyIdParamSchema = z.object({
  tenancyId: uuidSchema,
});

// Date schemas
export const dateSchema = z.coerce.date();
export const futureDateSchema = z.coerce.date().refine(
  (date) => date > new Date(),
  'Date must be in the future'
);

// Currency amount (Ghana-focused)
export const amountSchema = z.number().positive('Amount must be positive');
export const ghsCurrencySchema = z.enum(['GHS', 'USD']).default('GHS');

// ============================================================================
// PROPERTY SCHEMAS
// ============================================================================

export const createPropertySchema = z.object({
  name: z.string().min(1).max(255),
  addressStreet: z.string().min(1).max(255),
  addressCity: z.string().min(1).max(100),
  addressRegion: ghanaRegionSchema.optional(),
  digitalAddress: z.string().regex(/^[A-Z]{2}-\d{3,4}-\d{4}$/).optional(),
  propertyType: z.enum([
    'residential', 'commercial', 'industrial', 'mixed_use', 'land'
  ]),
  operationalStatus: z.enum(['operational', 'under_renovation', 'vacant', 'planned']).default('operational'),
  totalUnits: z.number().int().min(1).optional(),
  yearBuilt: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  totalSquareMeters: z.number().positive().optional(),
  amenities: z.array(z.string()).optional(),
  description: z.string().max(2000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

export const propertyQuerySchema = paginationSchema.extend({
  propertyType: z.enum(['residential', 'commercial', 'industrial', 'mixed_use', 'land']).optional(),
  operationalStatus: z.enum(['operational', 'under_renovation', 'vacant', 'planned']).optional(),
  city: z.string().optional(),
  region: ghanaRegionSchema.optional(),
  search: z.string().optional(),
});

// ============================================================================
// UNIT SCHEMAS
// ============================================================================

export const createUnitSchema = z.object({
  unitNumber: z.string().min(1).max(50),
  floor: z.number().int().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  squareMeters: z.number().positive().optional(),
  marketRent: z.number().positive(),
  rentCurrency: ghsCurrencySchema,
  status: z.enum(['vacant', 'occupied', 'maintenance', 'reserved']).default('vacant'),
  amenities: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
});

export const updateUnitSchema = createUnitSchema.partial();

// ============================================================================
// TENANT SCHEMAS
// ============================================================================

export const createTenantSchema = z.object({
  fullName: z.string().min(2).max(255),
  email: emailSchema,
  phone: ghanaPhoneSchema.or(phoneSchema),
  idType: z.enum(['ghana_card', 'passport', 'voter_id', 'drivers_license']).optional(),
  idNumber: z.string().max(50).optional(),
  dateOfBirth: dateSchema.optional(),
  nationality: z.string().max(50).default('Ghanaian'),
  occupation: z.string().max(100).optional(),
  employer: z.string().max(255).optional(),
  employerAddress: z.string().max(255).optional(),
  monthlyIncome: z.number().positive().optional(),
  emergencyContactName: z.string().max(255).optional(),
  emergencyContactPhone: phoneSchema.optional(),
  emergencyContactRelationship: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const tenantQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'inactive', 'pending', 'blacklisted']).optional(),
  search: z.string().optional(),
  propertyId: uuidSchema.optional(),
});

export const screenTenantSchema = z.object({
  tenantId: uuidSchema,
  checkType: z.enum(['background', 'credit', 'employment', 'reference']),
  result: z.enum(['pass', 'fail', 'pending', 'review_required']),
  notes: z.string().max(2000).optional(),
  verifiedBy: z.string().max(100).optional(),
});

// ============================================================================
// TENANCY (LEASE) SCHEMAS
// ============================================================================

const createTenancyBaseSchema = z.object({
  tenantId: uuidSchema,
  unitId: uuidSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  rentAmount: z.number().positive(),
  rentCurrency: ghsCurrencySchema,
  securityDeposit: z.number().nonnegative().optional(),
  paymentFrequency: z.enum(['monthly', 'quarterly', 'biannual', 'annual']).default('monthly'),
  rentDueDay: z.number().int().min(1).max(28).default(1),
  advanceMonths: z.number().int().min(0).max(24).default(0), // Ghana-specific
  leaseType: z.enum(['fixed', 'month_to_month', 'periodic']).default('fixed'),
  terms: z.string().max(5000).optional(),
  specialConditions: z.string().max(2000).optional(),
});

export const createTenancySchema = createTenancyBaseSchema.refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

export const updateTenancySchema = createTenancyBaseSchema.partial();

export const tenancyQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'pending', 'expired', 'terminated', 'renewed']).optional(),
  propertyId: uuidSchema.optional(),
  tenantId: uuidSchema.optional(),
  expiringWithinDays: z.coerce.number().int().positive().optional(),
});

export const renewTenancySchema = z.object({
  newEndDate: futureDateSchema,
  newRentAmount: z.number().positive().optional(),
  renewalTerms: z.string().max(2000).optional(),
});

export const terminateTenancySchema = z.object({
  terminationDate: dateSchema,
  reason: z.enum([
    'end_of_lease', 'mutual_agreement', 'non_payment', 
    'lease_violation', 'property_sale', 'other'
  ]),
  notes: z.string().max(2000).optional(),
  refundAmount: z.number().nonnegative().optional(),
});

// ============================================================================
// PAYMENT SCHEMAS
// ============================================================================

export const createPaymentSchema = z.object({
  tenancyId: uuidSchema,
  amount: z.number().positive(),
  currency: ghsCurrencySchema,
  paymentDate: dateSchema,
  paymentMethod: z.enum([
    'cash', 'bank_transfer', 'mobile_money', 'cheque', 'paystack', 'card'
  ]),
  paymentType: z.enum(['rent', 'deposit', 'utility', 'fee', 'other']).default('rent'),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  periodStart: dateSchema.optional(),
  periodEnd: dateSchema.optional(),
});

export const initiatePaymentSchema = z.object({
  tenancyId: uuidSchema.optional(),
  invoiceId: uuidSchema.optional(),
  amount: z.number().positive(),
  currency: ghsCurrencySchema,
  email: emailSchema,
  paymentMethod: z.enum(['paystack', 'mobile_money']).default('paystack'),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
}).refine(
  (data) => data.tenancyId || data.invoiceId,
  { message: 'Either tenancyId or invoiceId is required' }
);

export const paymentQuerySchema = paginationSchema.extend({
  tenancyId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  status: z.enum(['pending', 'completed', 'failed', 'refunded']).optional(),
  paymentType: z.enum(['rent', 'deposit', 'utility', 'fee', 'other']).optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});

// ============================================================================
// MAINTENANCE SCHEMAS
// ============================================================================

export const createMaintenanceRequestSchema = z.object({
  tenancyId: uuidSchema,
  category: z.enum([
    'plumbing', 'electrical', 'hvac', 'appliance', 'structural',
    'pest_control', 'landscaping', 'security', 'cleaning', 'other'
  ]),
  description: z.string().min(10).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'emergency']).default('medium'),
  location: z.string().max(255).optional(),
  preferredContactMethod: z.enum(['phone', 'email', 'whatsapp', 'sms']).default('phone'),
  preferredTimeSlot: z.enum(['morning', 'afternoon', 'evening', 'anytime']).default('anytime'),
  permissionToEnter: z.boolean().default(false),
  photos: z.array(z.string().url()).max(5).optional(),
});

export const updateMaintenanceRequestSchema = z.object({
  status: z.enum([
    'pending', 'acknowledged', 'assigned', 'scheduled', 
    'in_progress', 'completed', 'cancelled', 'on_hold'
  ]).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'emergency']).optional(),
  notes: z.string().max(2000).optional(),
  resolutionNotes: z.string().max(2000).optional(),
});

export const maintenanceQuerySchema = paginationSchema.extend({
  status: z.enum([
    'pending', 'acknowledged', 'assigned', 'scheduled',
    'in_progress', 'completed', 'cancelled', 'on_hold'
  ]).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'emergency']).optional(),
  category: z.string().optional(),
  propertyId: uuidSchema.optional(),
  tenancyId: uuidSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});

// ============================================================================
// WORK ORDER SCHEMAS
// ============================================================================

export const createWorkOrderSchema = z.object({
  requestId: uuidSchema,
  description: z.string().min(5).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'emergency']).default('medium'),
  estimatedDuration: z.number().positive().optional(), // hours
  estimatedCost: z.number().nonnegative().optional(),
  vendorId: uuidSchema.optional(),
  scheduledDate: dateSchema.optional(),
  notes: z.string().max(2000).optional(),
});

export const updateWorkOrderSchema = z.object({
  status: z.enum([
    'pending', 'assigned', 'scheduled', 'in_progress',
    'completed', 'cancelled', 'on_hold'
  ]).optional(),
  actualDuration: z.number().positive().optional(),
  actualCost: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  completionNotes: z.string().max(2000).optional(),
});

export const assignWorkOrderSchema = z.object({
  vendorId: uuidSchema,
  vendorName: z.string().max(255).optional(),
  vendorPhone: phoneSchema.optional(),
  scheduledDate: dateSchema,
  notes: z.string().max(500).optional(),
});

export const workOrderQuerySchema = paginationSchema.extend({
  status: z.enum([
    'pending', 'assigned', 'scheduled', 'in_progress',
    'completed', 'cancelled', 'on_hold'
  ]).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent', 'emergency']).optional(),
  vendorId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});

// ============================================================================
// VENDOR SCHEMAS
// ============================================================================

export const createVendorSchema = z.object({
  name: z.string().min(2).max(255),
  contactName: z.string().max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  alternatePhone: phoneSchema.optional(),
  serviceCategories: z.array(z.enum([
    'plumbing', 'electrical', 'hvac', 'appliance', 'structural',
    'pest_control', 'landscaping', 'security', 'cleaning', 'general'
  ])).min(1),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  region: ghanaRegionSchema.optional(),
  licenseNumber: z.string().max(50).optional(),
  insuranceInfo: z.string().max(500).optional(),
  taxId: z.string().max(50).optional(),
  bankAccount: z.string().max(100).optional(),
  bankName: z.string().max(100).optional(),
  hourlyRate: z.number().positive().optional(),
  currency: ghsCurrencySchema,
  notes: z.string().max(2000).optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const vendorQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  city: z.string().optional(),
});

export const rateVendorSchema = z.object({
  workOrderId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  review: z.string().max(1000).optional(),
  wouldRecommend: z.boolean().optional(),
});

// ============================================================================
// APPLICATION SCHEMAS
// ============================================================================

export const createApplicationSchema = z.object({
  unitId: uuidSchema,
  propertyId: uuidSchema.optional(),
  fullName: z.string().min(2).max(255),
  email: emailSchema,
  phone: ghanaPhoneSchema.or(phoneSchema),
  dateOfBirth: dateSchema.optional(),
  nationality: z.string().max(50).default('Ghanaian'),
  idType: z.enum(['ghana_card', 'passport', 'voter_id', 'drivers_license']).optional(),
  idNumber: z.string().max(50).optional(),
  currentAddress: z.string().max(500).optional(),
  employmentStatus: z.enum([
    'employed', 'self_employed', 'unemployed', 'student', 'retired'
  ]),
  employer: z.string().max(255).optional(),
  employerAddress: z.string().max(255).optional(),
  occupation: z.string().max(100).optional(),
  monthlyIncome: z.number().nonnegative().optional(),
  moveInDate: dateSchema,
  emergencyContactName: z.string().max(255).optional(),
  emergencyContactPhone: phoneSchema.optional(),
  emergencyContactRelationship: z.string().max(50).optional(),
  references: z.array(z.object({
    name: z.string().max(255),
    phone: phoneSchema,
    relationship: z.string().max(50),
  })).max(3).optional(),
  additionalOccupants: z.number().int().min(0).max(10).default(0),
  hasPets: z.boolean().default(false),
  petDetails: z.string().max(500).optional(),
  hasVehicle: z.boolean().default(false),
  vehicleDetails: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum([
    'pending', 'screening', 'approved', 'rejected', 
    'withdrawn', 'expired', 'converted'
  ]),
  notes: z.string().max(2000).optional(),
  rejectionReason: z.string().max(500).optional(),
});

export const convertApplicationSchema = z.object({
  leaseStartDate: dateSchema,
  leaseEndDate: dateSchema,
  rentAmount: z.number().positive(),
  securityDeposit: z.number().nonnegative().optional(),
  rentCurrency: ghsCurrencySchema,
  advanceMonths: z.number().int().min(0).max(24).default(0),
  specialTerms: z.string().max(2000).optional(),
}).refine(
  (data) => data.leaseEndDate > data.leaseStartDate,
  { message: 'Lease end date must be after start date', path: ['leaseEndDate'] }
);

export const applicationQuerySchema = paginationSchema.extend({
  status: z.enum([
    'pending', 'screening', 'approved', 'rejected',
    'withdrawn', 'expired', 'converted'
  ]).optional(),
  propertyId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});

// ============================================================================
// FINANCIAL SCHEMAS
// ============================================================================

export const financialRecordSchema = z.object({
  propertyId: uuidSchema,
  type: z.enum(['income', 'expense']),
  category: z.string().max(100),
  amount: z.number().positive(),
  currency: ghsCurrencySchema,
  date: dateSchema,
  description: z.string().max(500).optional(),
  reference: z.string().max(100).optional(),
  vendorId: uuidSchema.optional(),
  tenancyId: uuidSchema.optional(),
});

export const financialQuerySchema = paginationSchema.extend({
  propertyId: uuidSchema.optional(),
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});

export const cashOnCashInputSchema = z.object({
  purchasePrice: z.number().positive(),
  downPayment: z.number().positive(),
  closingCosts: z.number().nonnegative().optional(),
  renovationCosts: z.number().nonnegative().optional(),
  annualDebtService: z.number().nonnegative().optional(),
});

// ============================================================================
// INVOICE SCHEMAS
// ============================================================================

export const createInvoiceSchema = z.object({
  tenancyId: uuidSchema,
  type: z.enum(['rent', 'utility', 'fee', 'deposit', 'other']),
  amount: z.number().positive(),
  currency: ghsCurrencySchema,
  dueDate: dateSchema,
  description: z.string().max(500).optional(),
  lineItems: z.array(z.object({
    description: z.string().max(255),
    amount: z.number(),
    quantity: z.number().int().min(1).default(1),
  })).optional(),
});

export const invoiceQuerySchema = paginationSchema.extend({
  tenancyId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled', 'partial']).optional(),
  type: z.enum(['rent', 'utility', 'fee', 'deposit', 'other']).optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});

// ============================================================================
// NOTIFICATION SCHEMAS
// ============================================================================

export const sendRentReminderSchema = z.object({
  tenantId: uuidSchema.optional(),
  tenancyId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  daysBefore: z.number().int().min(1).max(30).default(3),
  channels: z.array(z.enum(['email', 'sms', 'whatsapp', 'push'])).min(1).default(['email', 'sms']),
}).refine(
  (data) => data.tenantId || data.tenancyId || data.propertyId,
  { message: 'At least one of tenantId, tenancyId, or propertyId is required' }
);

export const sendLeaseExpirySchema = z.object({
  daysBeforeExpiry: z.number().int().min(1).max(90).default(60),
  propertyId: uuidSchema.optional(),
  channels: z.array(z.enum(['email', 'sms', 'whatsapp'])).min(1).default(['email']),
});

export const bulkEmergencyAlertSchema = z.object({
  propertyId: uuidSchema,
  alertType: z.enum(['fire', 'water_leak', 'security', 'power_outage', 'general']),
  message: z.string().min(10).max(1000),
  instructions: z.string().max(1000).optional(),
  contactNumber: phoneSchema.optional(),
});

// ============================================================================
// REPORT SCHEMAS
// ============================================================================

export const reportQuerySchema = z.object({
  propertyId: uuidSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});

export const agedReceivablesQuerySchema = reportQuerySchema.extend({
  asOfDate: dateSchema.optional(),
  agingBuckets: z.array(z.number().int().positive()).default([30, 60, 90, 120]),
});

// ============================================================================
// BULK OPERATIONS SCHEMAS
// ============================================================================

export const bulkRentIncreaseSchema = z.object({
  propertyId: uuidSchema.optional(),
  tenancyIds: z.array(uuidSchema).optional(),
  increaseType: z.enum(['percentage', 'fixed']),
  increaseValue: z.number().positive(),
  effectiveDate: futureDateSchema,
  reason: z.string().max(500).optional(),
  notifyTenants: z.boolean().default(true),
}).refine(
  (data) => data.propertyId || (data.tenancyIds && data.tenancyIds.length > 0),
  { message: 'Either propertyId or tenancyIds is required' }
);

// Export all schemas as a namespace for easy import
export const PMSchemas = {
  // Property
  createProperty: createPropertySchema,
  updateProperty: updatePropertySchema,
  propertyQuery: propertyQuerySchema,
  
  // Unit
  createUnit: createUnitSchema,
  updateUnit: updateUnitSchema,
  
  // Tenant
  createTenant: createTenantSchema,
  updateTenant: updateTenantSchema,
  tenantQuery: tenantQuerySchema,
  screenTenant: screenTenantSchema,
  
  // Tenancy
  createTenancy: createTenancySchema,
  updateTenancy: updateTenancySchema,
  tenancyQuery: tenancyQuerySchema,
  renewTenancy: renewTenancySchema,
  terminateTenancy: terminateTenancySchema,
  
  // Payment
  createPayment: createPaymentSchema,
  initiatePayment: initiatePaymentSchema,
  paymentQuery: paymentQuerySchema,
  
  // Maintenance
  createMaintenanceRequest: createMaintenanceRequestSchema,
  updateMaintenanceRequest: updateMaintenanceRequestSchema,
  maintenanceQuery: maintenanceQuerySchema,
  
  // Work Order
  createWorkOrder: createWorkOrderSchema,
  updateWorkOrder: updateWorkOrderSchema,
  assignWorkOrder: assignWorkOrderSchema,
  workOrderQuery: workOrderQuerySchema,
  
  // Vendor
  createVendor: createVendorSchema,
  updateVendor: updateVendorSchema,
  vendorQuery: vendorQuerySchema,
  rateVendor: rateVendorSchema,
  
  // Application
  createApplication: createApplicationSchema,
  updateApplicationStatus: updateApplicationStatusSchema,
  convertApplication: convertApplicationSchema,
  applicationQuery: applicationQuerySchema,
  
  // Financial
  financialRecord: financialRecordSchema,
  financialQuery: financialQuerySchema,
  cashOnCashInput: cashOnCashInputSchema,
  
  // Invoice
  createInvoice: createInvoiceSchema,
  invoiceQuery: invoiceQuerySchema,
  
  // Notification
  sendRentReminder: sendRentReminderSchema,
  sendLeaseExpiry: sendLeaseExpirySchema,
  bulkEmergencyAlert: bulkEmergencyAlertSchema,
  
  // Reports
  reportQuery: reportQuerySchema,
  agedReceivablesQuery: agedReceivablesQuerySchema,
  
  // Bulk
  bulkRentIncrease: bulkRentIncreaseSchema,
  
  // Params
  idParam: pmIdParamSchema,
  propertyIdParam: pmPropertyIdParamSchema,
  tenantIdParam: pmTenantIdParamSchema,
  tenancyIdParam: pmTenancyIdParamSchema,
};

// Export types
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateTenancyInput = z.infer<typeof createTenancySchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateMaintenanceRequestInput = z.infer<typeof createMaintenanceRequestSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
