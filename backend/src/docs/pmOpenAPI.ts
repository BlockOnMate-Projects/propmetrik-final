/**
 * Property Management API - OpenAPI 3.0 Specification
 * 
 * Auto-generates OpenAPI documentation from Zod schemas
 * and route definitions for the Property Management module.
 */

import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { PMSchemas } from '../middleware/pmValidation';

// Extend Zod with OpenAPI capabilities
extendZodWithOpenApi(z);

// Create OpenAPI registry
const registry = new OpenAPIRegistry();

// ============================================================================
// COMMON COMPONENTS
// ============================================================================

// Standard error response
const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    requestId: z.string().optional(),
    timestamp: z.string(),
  }),
}).openapi('ErrorResponse');

// Standard success response wrapper
const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

// Pagination metadata
const paginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
}).openapi('PaginationMeta');

// Register common schemas
registry.register('ErrorResponse', errorResponseSchema);
registry.register('PaginationMeta', paginationMetaSchema);

// Security scheme
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

registry.registerComponent('securitySchemes', 'organizationId', {
  type: 'apiKey',
  in: 'header',
  name: 'x-organization-id',
});

// ============================================================================
// PROPERTY ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/properties',
  tags: ['Properties'],
  summary: 'List all properties',
  description: 'Get a paginated list of properties for the organization',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    query: PMSchemas.propertyQuery.openapi('PropertyQueryParams'),
  },
  responses: {
    200: {
      description: 'List of properties',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.array(z.object({
              id: z.string().uuid(),
              name: z.string(),
              addressStreet: z.string(),
              addressCity: z.string(),
              propertyType: z.string(),
              operationalStatus: z.string(),
              totalUnits: z.number().nullable(),
              occupiedUnits: z.number().nullable(),
              vacantUnits: z.number().nullable(),
              createdAt: z.string(),
              updatedAt: z.string(),
            })),
            meta: paginationMetaSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    500: { description: 'Internal server error' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/properties',
  tags: ['Properties'],
  summary: 'Create a property',
  description: 'Create a new property in the organization portfolio',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createProperty.openapi('CreatePropertyRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Property created successfully' },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/properties/{propertyId}',
  tags: ['Properties'],
  summary: 'Get property by ID',
  description: 'Retrieve detailed information about a specific property',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ propertyId: z.string().uuid() }),
  },
  responses: {
    200: { description: 'Property details' },
    404: { description: 'Property not found' },
  },
});

// ============================================================================
// TENANT ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/tenants',
  tags: ['Tenants'],
  summary: 'List all tenants',
  description: 'Get a paginated list of tenants',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    query: PMSchemas.tenantQuery.openapi('TenantQueryParams'),
  },
  responses: {
    200: { description: 'List of tenants' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/tenants',
  tags: ['Tenants'],
  summary: 'Create a tenant',
  description: 'Create a new tenant record',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createTenant.openapi('CreateTenantRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Tenant created' },
    400: { description: 'Validation error' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/tenants/{tenantId}/screen',
  tags: ['Tenants'],
  summary: 'Screen a tenant',
  description: 'Record screening result for a tenant',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ tenantId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.screenTenant.openapi('ScreenTenantRequest'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Screening recorded' },
    404: { description: 'Tenant not found' },
  },
});

// ============================================================================
// TENANCY (LEASE) ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/tenancies',
  tags: ['Tenancies'],
  summary: 'List all tenancies',
  description: 'Get a paginated list of lease agreements',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    query: PMSchemas.tenancyQuery.openapi('TenancyQueryParams'),
  },
  responses: {
    200: { description: 'List of tenancies' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/tenancies',
  tags: ['Tenancies'],
  summary: 'Create a tenancy',
  description: 'Create a new lease agreement linking a tenant to a unit',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createTenancy.openapi('CreateTenancyRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Tenancy created' },
    400: { description: 'Validation error - overlapping tenancy or invalid dates' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/tenancies/{tenancyId}/renew',
  tags: ['Tenancies'],
  summary: 'Renew a tenancy',
  description: 'Renew an existing lease agreement',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ tenancyId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.renewTenancy.openapi('RenewTenancyRequest'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Tenancy renewed' },
    404: { description: 'Tenancy not found' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/tenancies/{tenancyId}/terminate',
  tags: ['Tenancies'],
  summary: 'Terminate a tenancy',
  description: 'Terminate a lease agreement early',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ tenancyId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.terminateTenancy.openapi('TerminateTenancyRequest'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Tenancy terminated' },
  },
});

// ============================================================================
// PAYMENT ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/payments',
  tags: ['Payments'],
  summary: 'List payments',
  description: 'Get a paginated list of rent payments',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    query: PMSchemas.paymentQuery.openapi('PaymentQueryParams'),
  },
  responses: {
    200: { description: 'List of payments' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/payments',
  tags: ['Payments'],
  summary: 'Record a payment',
  description: 'Manually record a rent payment',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createPayment.openapi('CreatePaymentRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Payment recorded' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/payments/initiate',
  tags: ['Payments'],
  summary: 'Initiate online payment',
  description: 'Initialize a Paystack payment transaction',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.initiatePayment.openapi('InitiatePaymentRequest'),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Payment initialized',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              authorizationUrl: z.string().url(),
              reference: z.string(),
              accessCode: z.string(),
            }),
          }),
        },
      },
    },
  },
});

// ============================================================================
// MAINTENANCE ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/maintenance/requests',
  tags: ['Maintenance'],
  summary: 'List maintenance requests',
  description: 'Get all maintenance requests with filters',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    query: PMSchemas.maintenanceQuery.openapi('MaintenanceQueryParams'),
  },
  responses: {
    200: { description: 'List of maintenance requests' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/maintenance/requests',
  tags: ['Maintenance'],
  summary: 'Create maintenance request',
  description: 'Submit a new maintenance request',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createMaintenanceRequest.openapi('CreateMaintenanceRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Maintenance request created' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/maintenance/work-orders',
  tags: ['Maintenance'],
  summary: 'Create work order',
  description: 'Create a work order from a maintenance request',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createWorkOrder.openapi('CreateWorkOrderRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Work order created' },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/property-management/maintenance/work-orders/{workOrderId}/assign',
  tags: ['Maintenance'],
  summary: 'Assign work order',
  description: 'Assign a vendor to a work order',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ workOrderId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.assignWorkOrder.openapi('AssignWorkOrderRequest'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Work order assigned' },
  },
});

// ============================================================================
// VENDOR ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/vendors',
  tags: ['Vendors'],
  summary: 'List vendors',
  description: 'Get list of maintenance vendors/contractors',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    query: PMSchemas.vendorQuery.openapi('VendorQueryParams'),
  },
  responses: {
    200: { description: 'List of vendors' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/vendors',
  tags: ['Vendors'],
  summary: 'Create vendor',
  description: 'Add a new maintenance vendor',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createVendor.openapi('CreateVendorRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Vendor created' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/vendors/{vendorId}/rate',
  tags: ['Vendors'],
  summary: 'Rate vendor',
  description: 'Submit a rating and review for a vendor after work completion',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ vendorId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.rateVendor.openapi('RateVendorRequest'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Rating submitted' },
  },
});

// ============================================================================
// APPLICATION ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/applications',
  tags: ['Applications'],
  summary: 'List applications',
  description: 'Get rental applications with filters',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    query: PMSchemas.applicationQuery.openapi('ApplicationQueryParams'),
  },
  responses: {
    200: { description: 'List of applications' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/applications',
  tags: ['Applications'],
  summary: 'Submit application',
  description: 'Submit a new rental application',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.createApplication.openapi('CreateApplicationRequest'),
        },
      },
    },
  },
  responses: {
    201: { description: 'Application submitted' },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/property-management/applications/{applicationId}/status',
  tags: ['Applications'],
  summary: 'Update application status',
  description: 'Update the status of a rental application',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ applicationId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.updateApplicationStatus.openapi('UpdateApplicationStatusRequest'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Status updated' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/property-management/applications/{applicationId}/convert',
  tags: ['Applications'],
  summary: 'Convert to tenancy',
  description: 'Convert an approved application to an active tenancy',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ applicationId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: PMSchemas.convertApplication.openapi('ConvertApplicationRequest'),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Application converted to tenancy',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              tenantId: z.string().uuid(),
              tenancyId: z.string().uuid(),
            }),
          }),
        },
      },
    },
  },
});

// ============================================================================
// FINANCIAL ENDPOINTS
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/financials/noi/{propertyId}',
  tags: ['Financial Reports'],
  summary: 'Calculate NOI',
  description: 'Calculate Net Operating Income for a property',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ propertyId: z.string().uuid() }),
    query: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'NOI calculation',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              propertyId: z.string(),
              noi: z.number(),
              grossIncome: z.number(),
              operatingExpenses: z.number(),
              vacancy: z.number(),
              effectiveGrossIncome: z.number(),
              expenseBreakdown: z.record(z.number()),
            }),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/financials/cap-rate/{propertyId}',
  tags: ['Financial Reports'],
  summary: 'Calculate Cap Rate',
  description: 'Calculate Capitalization Rate with Ghana market benchmarks',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ propertyId: z.string().uuid() }),
    query: z.object({
      marketValue: z.coerce.number().positive().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Cap rate calculation with benchmarks',
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/financials/irr/{propertyId}',
  tags: ['Financial Reports'],
  summary: 'Calculate IRR',
  description: 'Calculate Internal Rate of Return using Newton-Raphson method',
  security: [{ bearerAuth: [], organizationId: [] }],
  request: {
    params: z.object({ propertyId: z.string().uuid() }),
    query: z.object({
      holdingPeriod: z.coerce.number().int().min(1).max(30).default(10),
      discountRate: z.coerce.number().min(0).max(1).default(0.1),
    }),
  },
  responses: {
    200: { description: 'IRR calculation with NPV and payback period' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/property-management/financials/portfolio-summary',
  tags: ['Financial Reports'],
  summary: 'Portfolio financial summary',
  description: 'Get aggregated financial metrics across all properties',
  security: [{ bearerAuth: [], organizationId: [] }],
  responses: {
    200: {
      description: 'Portfolio financial summary',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              totalProperties: z.number(),
              totalUnits: z.number(),
              occupiedUnits: z.number(),
              totalMarketValue: z.number(),
              totalAnnualIncome: z.number(),
              portfolioNOI: z.number(),
              averageCapRate: z.number(),
              occupancyRate: z.number(),
            }),
          }),
        },
      },
    },
  },
});

// ============================================================================
// GENERATE OPENAPI DOCUMENT
// ============================================================================

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openAPIDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'PROPMETRIK Property Management API',
    version: '1.0.0',
    description: `
# Property Management API

Complete API for managing properties, tenants, leases, payments, and maintenance in Ghana.

## Features
- **Properties**: Full portfolio management with multi-unit support
- **Tenants**: Tenant screening, verification, and management
- **Leases**: Ghana-specific lease terms with advance payment support
- **Payments**: Paystack integration for online payments
- **Maintenance**: Work order management with vendor assignment
- **Financial Reports**: NOI, Cap Rate, IRR calculations with Ghana benchmarks

## Authentication
All endpoints require:
- \`Authorization: Bearer <token>\` - JWT from Keycloak
- \`x-organization-id\` header - Organization UUID

## Ghana-Specific Features
- GhanaPost Digital Address integration
- Mobile Money support via Paystack
- Regional pricing (Greater Accra, Ashanti, etc.)
- Advance rent payment tracking (1-2 years)
    `,
    contact: {
      name: 'PROPMETRIK Support',
      email: 'support@propmetrik.com',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: process.env.APP_URL || 'http://localhost:4000',
      description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
    },
    {
      url: 'https://api.propmetrik.com',
      description: 'Production server',
    },
  ],
  tags: [
    { name: 'Properties', description: 'Property portfolio management' },
    { name: 'Tenants', description: 'Tenant management and screening' },
    { name: 'Tenancies', description: 'Lease agreement management' },
    { name: 'Payments', description: 'Rent collection and payment processing' },
    { name: 'Maintenance', description: 'Maintenance requests and work orders' },
    { name: 'Vendors', description: 'Vendor/contractor management' },
    { name: 'Applications', description: 'Rental application processing' },
    { name: 'Financial Reports', description: 'Financial analysis and reporting' },
  ],
});

// ============================================================================
// MERGE CRM API SPEC
// ============================================================================
import { getCrmOpenAPISpec } from './crmOpenAPI';

const crmSpec = getCrmOpenAPISpec();

// Merge CRM tags
if (crmSpec.tags) {
  openAPIDocument.tags = [...(openAPIDocument.tags || []), ...crmSpec.tags];
}

// Merge CRM paths
if (crmSpec.paths) {
  openAPIDocument.paths = { ...(openAPIDocument.paths || {}), ...crmSpec.paths };
}

// Merge CRM component schemas
if (crmSpec.components?.schemas) {
  openAPIDocument.components = openAPIDocument.components || {};
  openAPIDocument.components.schemas = {
    ...(openAPIDocument.components.schemas || {}),
    ...crmSpec.components.schemas,
  };
}

export default openAPIDocument;
