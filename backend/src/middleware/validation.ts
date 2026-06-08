import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errorHandler';

/**
 * Validation targets in request
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Validate request middleware factory
 */
export function validate<T extends ZodSchema>(
  schema: T,
  target: ValidationTarget = 'body'
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req[target];
      const validated = await schema.parseAsync(data);
      
      // Replace request data with validated data
      req[target] = validated;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        next(new ValidationError(`Validation failed for ${target}`, details));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate multiple targets at once
 */
export function validateRequest(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors: Array<{ target: string; field: string; message: string }> = [];
    
    for (const [target, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      
      try {
        const data = req[target as ValidationTarget];
        const validated = await schema.parseAsync(data);
        req[target as ValidationTarget] = validated;
      } catch (error) {
        if (error instanceof ZodError) {
          for (const err of error.errors) {
            errors.push({
              target,
              field: err.path.join('.'),
              message: err.message,
            });
          }
        } else {
          return next(error);
        }
      }
    }
    
    if (errors.length > 0) {
      return next(new ValidationError('Request validation failed', errors));
    }
    
    next();
  };
}

// ==========================================
// Common Zod schemas for reuse
// ==========================================

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Pagination schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Common string schemas
export const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format');
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Ghana-specific schemas
export const ghanaRegionSchema = z.enum([
  'greater_accra',
  'kumasi_metro',
  'eastern',
  'western_cluster',
  'northern_cluster',
]);

export const ghanaPhoneSchema = z.string().regex(
  /^(\+233|0)[2-9]\d{8}$/,
  'Invalid Ghana phone number format'
);

// Address schema
export const addressSchema = z.object({
  street: z.string().min(1).max(255).optional(),
  city: z.string().min(1).max(100),
  region: ghanaRegionSchema,
  district: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  digitalAddress: z.string().regex(/^[A-Z]{2}-\d{3,4}-\d{4}$/, 'Invalid Ghana Post GPS address').optional(),
  landmark: z.string().max(255).optional(),
});

// Coordinates schema
export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Property-related schemas
export const propertyTypeSchema = z.enum([
  'residential_house',
  'apartment_flat',
  'commercial_shop',
  'commercial_office',
  'warehouse',
  'land',
  'industrial',
  'mixed_use',
]);

export const propertyConditionSchema = z.enum([
  'excellent',
  'good',
  'fair',
  'poor',
  'renovation_required',
  'under_construction',
]);

export const transactionTypeSchema = z.enum([
  'sale',
  'rental',
  'lease',
]);

export const currencySchema = z.enum(['GHS', 'USD', 'EUR', 'GBP']);

// Price schema
export const priceSchema = z.object({
  amount: z.number().positive('Price must be positive'),
  currency: currencySchema.default('GHS'),
});

// Date range schema
export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => !data.from || !data.to || data.from <= data.to,
  { message: 'From date must be before or equal to to date' }
);

// Search filters schema
export const propertySearchFiltersSchema = z.object({
  propertyType: propertyTypeSchema.optional(),
  transactionType: transactionTypeSchema.optional(),
  region: ghanaRegionSchema.optional(),
  city: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  maxBedrooms: z.coerce.number().int().min(0).optional(),
  minBathrooms: z.coerce.number().int().min(0).optional(),
  minArea: z.coerce.number().positive().optional(),
  maxArea: z.coerce.number().positive().optional(),
  condition: propertyConditionSchema.optional(),
  hasParking: z.coerce.boolean().optional(),
  furnished: z.coerce.boolean().optional(),
  // Geo search
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().positive().max(50).optional(), // km
}).merge(paginationSchema);

// File upload validation
export const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimetype: z.string().regex(/^[\w-]+\/[\w-]+$/),
  size: z.number().positive().max(50 * 1024 * 1024), // 50MB max
});

export const imageUploadSchema = fileUploadSchema.extend({
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  size: z.number().positive().max(10 * 1024 * 1024), // 10MB max for images
});

export const documentUploadSchema = fileUploadSchema.extend({
  mimetype: z.enum([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
  ]),
  size: z.number().positive().max(25 * 1024 * 1024), // 25MB max for documents
});

// ==========================================
// Land Value Validation Schemas
// ==========================================

/**
 * Request body for calculating land value
 * 
 * If user_entered_value is provided, it is a 100% OVERRIDE
 * that bypasses the valuation methods entirely.
 */
export const landValueCalculateRequestSchema = z.object({
  user_entered_value: z.number().positive('User entered value must be positive').optional(),
  user_justification: z.string().min(10, 'Justification must be at least 10 characters').max(500).optional(),
  force_recalculate: z.boolean().default(false),
}).refine(
  (data) => {
    // If user_entered_value is provided, justification is required
    if (data.user_entered_value !== undefined && data.user_entered_value !== null) {
      return data.user_justification !== undefined && data.user_justification !== null;
    }
    return true;
  },
  { 
    message: 'user_justification is required when providing user_entered_value',
    path: ['user_justification'],
  }
);

/**
 * Query params for land comparables endpoint
 */
export const landComparablesQuerySchema = z.object({
  max_distance_km: z.coerce.number().positive().max(100).default(10),
  max_results: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Comparable strength enum for land value
 */
export const comparableStrengthSchema = z.enum(['weak', 'balanced', 'strong']);

/**
 * Land value method detail schema
 */
export const landValueMethodDetailSchema = z.object({
  value: z.number().nonnegative(),
  value_per_sqm: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  weighted_contribution: z.number().nonnegative(),
  method_specific: z.record(z.any()).optional(),
});

/**
 * Land comparable summary schema
 */
export const landComparableSummarySchema = z.object({
  id: z.string(),
  distance_km: z.number().nonnegative(),
  sale_date: z.string(),
  sale_price_per_sqm: z.number().positive(),
  adjusted_price_per_sqm: z.number().positive(),
  similarity_score: z.number().min(0).max(1),
  adjustment_factor: z.number().positive(),
});

/**
 * Full land value response schema for TypeScript type generation
 */
export const landValueResponseSchema = z.object({
  success: z.boolean(),
  final_land_value: z.number().nonnegative(),
  final_land_value_per_sqm: z.number().nonnegative(),
  land_area_sqm: z.number().positive(),
  confidence_score: z.number().min(0).max(1),
  primary_method: z.string(),
  
  // User override info
  is_user_override: z.boolean().default(false),
  user_justification: z.string().optional(),
  
  // Method details (only present if not user override)
  methods: z.object({
    residual: landValueMethodDetailSchema.optional(),
    comparable: landValueMethodDetailSchema.optional(),
  }).optional(),
  
  // Comparable details
  comparables_summary: z.object({
    count_found: z.number().int().nonnegative(),
    count_used: z.number().int().nonnegative(),
    strength: comparableStrengthSchema,
    top_comparables: z.array(landComparableSummarySchema),
  }).optional(),
  
  // Reconciliation details
  reconciliation: z.object({
    method_weights: z.record(z.number()),
    weight_justification: z.string(),
    value_spread_pct: z.number().nonnegative(),
    outlier_flags: z.array(z.string()),
  }).optional(),
  
  comparable_strength: comparableStrengthSchema.or(z.literal('N/A')),
  
  // Disclosure (RICS compliance)
  disclosure_required: z.boolean().default(false),
  disclosure_text: z.string().default(''),
  
  // Metadata
  cached: z.boolean().default(false),
  error: z.string().optional(),
});

// Export types inferred from schemas
export type LandValueCalculateRequest = z.infer<typeof landValueCalculateRequestSchema>;
export type LandComparablesQuery = z.infer<typeof landComparablesQuerySchema>;
export type LandValueResponse = z.infer<typeof landValueResponseSchema>;
export type LandComparableSummary = z.infer<typeof landComparableSummarySchema>;
export type ComparableStrength = z.infer<typeof comparableStrengthSchema>;

// ==========================================
// Pagination Clamp Middleware
// ==========================================
export function clampPagination(req: Request, _res: Response, next: NextFunction) {
    if (req.query.page) {
        const page = parseInt(req.query.page as string, 10);
        (req.query as any).page = String(Math.max(1, isNaN(page) ? 1 : page));
    }
    if (req.query.limit) {
        const limit = parseInt(req.query.limit as string, 10);
        (req.query as any).limit = String(Math.min(100, Math.max(1, isNaN(limit) ? 10 : limit)));
    }
    next();
}

// ==========================================
// Property Management Validation Schemas
// ==========================================

export const pmCreatePropertySchema = z.object({
    name: z.string().max(255).optional(),
  title: z.string().min(1, 'Property title is required').max(255),
    propertyType: z.string().max(100).optional(),
  transactionType: z.string().max(50).optional(),
    status: z.string().max(50).optional(),
    addressLine1: z.string().max(255).optional(),
    addressLine2: z.string().max(255).optional(),
  addressStreet: z.string().max(255).optional(),
  addressCity: z.string().max(100).optional(),
  addressDistrict: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    price: z.number().min(0).optional(),
    currency: z.string().max(10).optional(),
    priceCurrency: z.string().max(10).optional(),
    digitalAddress: z.string().max(50).optional(),
    bedrooms: z.number().int().min(0).max(100).optional(),
    bathrooms: z.number().min(0).max(100).optional(),
    totalAreaSqm: z.number().min(0).optional(),
    floors: z.number().int().min(0).max(200).optional(),
    yearBuilt: z.number().int().min(1800).max(2100).optional(),
    description: z.string().max(5000).optional(),
    amenities: z.array(z.string()).optional(),
    unitNumber: z.string().max(50).optional(),
    monthlyRent: z.number().min(0).optional(),
    floorNumber: z.number().int().min(0).max(500).optional(),
    totalUnits: z.number().int().min(0).optional(),
    units: z.array(z.object({
        label: z.string().min(1, 'Unit label is required').max(50),
        floorNumber: z.number().int().min(0).max(500).optional(),
        bedrooms: z.number().int().min(0).max(100).optional(),
        bathrooms: z.number().min(0).max(100).optional(),
        totalAreaSqm: z.number().min(0).optional(),
        price: z.number().min(0).optional(),
    })).max(500).optional(),
}).passthrough();

export const pmCreateTenantSchema = z.object({
    fullName: z.string().min(1, 'Full name is required').max(255),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(20).optional(),
    nationalId: z.string().max(50).optional(),
    notes: z.string().max(2000).optional(),
}).passthrough();

export const pmCreateTenancySchema = z.object({
    propertyId: uuidSchema,
    tenantId: uuidSchema,
    leaseStartDate: z.string().min(1),
    leaseEndDate: z.string().min(1),
    monthlyRent: z.number().min(0),
    securityDeposit: z.number().min(0).optional(),
    currency: z.string().max(10).optional(),
}).passthrough();

export const pmTerminateTenancySchema = z.object({
    reason: z.string().max(1000).optional(),
    terminationDate: z.string().optional(),
});

export const pmRenewTenancySchema = z.object({
    newEndDate: z.string().min(1, 'New end date is required'),
    newMonthlyRent: z.number().min(0).optional(),
    advancePaymentAmount: z.number().min(0).optional(),
});

export const pmRecordPaymentSchema = z.object({
    tenancyId: uuidSchema,
    amount: z.number().min(0.01, 'Amount must be positive'),
    paymentMethod: z.string().max(50).optional(),
    paymentDate: z.string().optional(),
    referenceNumber: z.string().max(100).optional(),
    notes: z.string().max(1000).optional(),
    currency: z.string().max(10).optional(),
}).passthrough();

export const pmInitializePaymentSchema = z.object({
    tenancyId: uuidSchema,
    amount: z.number().min(0.01),
    email: z.string().email(),
    channel: z.string().optional(),
    callbackUrl: z.string().url().optional(),
});

export const pmCreateWorkOrderSchema = z.object({
    propertyId: uuidSchema,
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().max(5000).optional(),
    category: z.string().max(100).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    estimatedCost: z.number().min(0).optional(),
}).passthrough();

export const pmAssignWorkOrderSchema = z.object({
    vendorId: uuidSchema,
    scheduledDate: z.string().optional(),
    scheduledTimeStart: z.string().optional(),
    scheduledTimeEnd: z.string().optional(),
});

export const pmCompleteWorkOrderSchema = z.object({
    actualCost: z.number().min(0).optional(),
    completionNotes: z.string().max(2000).optional(),
    photosAfter: z.array(z.string()).optional(),
});

export const pmCreateVendorSchema = z.object({
    name: z.string().min(1).max(255),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(20).optional(),
    category: z.string().max(100).optional(),
}).passthrough();

export const pmCreateDocumentSchema = z.object({
    propertyId: uuidSchema,
    tenancyId: uuidSchema.optional(),
    documentType: z.string().min(1).max(100),
    title: z.string().min(1).max(255),
    fileUrl: z.string().min(1),
    fileName: z.string().min(1).max(255),
}).passthrough();

export const pmCreateFinancialSchema = z.object({
    propertyId: uuidSchema,
    recordType: z.enum(['income', 'expense']),
    category: z.string().min(1).max(100),
    amount: z.number().min(0.01, 'Amount must be positive'),
    currency: z.string().max(10).optional(),
    description: z.string().max(1000).optional(),
    transactionDate: z.string().optional(),
}).passthrough();

export const pmBulkRentIncreaseSchema = z.object({
    tenancyIds: z.array(uuidSchema).optional(),
    propertyIds: z.array(uuidSchema).optional(),
    increaseType: z.enum(['percentage', 'fixed']),
    increaseValue: z.number().min(0),
    effectiveDate: z.string().min(1),
    notifyTenants: z.boolean().optional(),
    reason: z.string().max(500).optional(),
});

export const pmBulkStatusUpdateSchema = z.object({
    resource: z.string().min(1),
    ids: z.array(uuidSchema).min(1),
    status: z.string().min(1).max(50),
});

export const pmBulkImportSchema = z.object({
    type: z.string().min(1),
    data: z.array(z.record(z.unknown())).min(1).max(1000),
    validateOnly: z.boolean().optional(),
});

export const pmCreateApplicationSchema = z.object({
    propertyId: uuidSchema,
    unitId: uuidSchema.optional(),
    applicationType: z.enum(['rental', 'purchase']).optional(),
}).passthrough();

export const pmRejectApplicationSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required').max(1000),
});

export const pmCreateApplicationLinkSchema = z.object({
    propertyId: uuidSchema,
    applicationType: z.enum(['rental', 'purchase']).optional(),
    maxUses: z.number().int().min(1).max(1000).optional(),
    expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const pmSignLeaseSchema = z.object({
    signatureDataUrl: z.string().min(1),
    signerToken: z.string().min(1),
    fieldId: z.string().optional(),
});

export const pmSendMessageSchema = z.object({
    content: z.string().min(1, 'Message content is required').max(5000),
});

export const pmRegisterAccountSchema = z.object({
    bankCode: z.string().min(1),
    accountNumber: z.string().min(1).max(30),
    businessName: z.string().min(1).max(255),
    contactEmail: z.preprocess(
        (value) => value === '' ? undefined : value,
        z.string().email().optional()
    ),
    contactPhone: z.string().optional(),
});

