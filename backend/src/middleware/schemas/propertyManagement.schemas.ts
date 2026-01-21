
import { z } from 'zod';
import {
    TenantStatus,
    TenancyStatus,
    PaymentMethod,
    PaymentStatus,
    WorkOrderStatus,
    Priority,
    Urgency,
    MaintenanceCategory,
    VendorStatus,
    IncomeCategory,
    ExpenseCategory,
    PropertyDocumentType
} from '../../types/property-management.types';

// ==========================================
// TENANT SCHEMAS
// ==========================================

export const createTenantSchema = z.object({
    body: z.object({
        fullName: z.string().min(2, 'Full name is required'),
        ghanaCardNumber: z.string().regex(/^GHA-\d{9}-\d$/, 'Invalid Ghana Card format (e.g., GHA-123456789-0)').optional(),
        dateOfBirth: z.string().optional(), // ISO date string
        phonePrimary: z.string().min(9, 'Primary phone number is required'),
        phoneSecondary: z.string().optional(),
        email: z.string().email('Invalid email address').optional(),
        currentAddress: z.string().optional(),
        digitalAddress: z.string().regex(/^[A-Z0-9]{2}-\d{3,4}-\d{3,4}$/, 'Invalid Ghana Digital Address format').optional(),
        occupation: z.string().optional(),
        employerName: z.string().optional(),
        employerAddress: z.string().optional(),
        employerPhone: z.string().optional(),
        monthlyIncome: z.number().positive('Monthly income must be positive').optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
        emergencyContactRelationship: z.string().optional(),
        characterReferences: z.array(z.object({
            name: z.string().min(2, 'Reference name is required'),
            phone: z.string().min(9, 'Reference phone is required'),
            email: z.string().email().optional(),
            relationship: z.string().min(2, 'Relationship is required'),
            notes: z.string().optional()
        })).optional(),
        previousAddresses: z.array(z.object({
            address: z.string(),
            city: z.string(),
            region: z.string(),
            fromDate: z.string(),
            toDate: z.string(),
            landlordName: z.string().optional(),
            landlordPhone: z.string().optional(),
            reasonForLeaving: z.string().optional()
        })).optional(),
        notes: z.string().optional()
    })
});

export const updateTenantSchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Tenant ID')
    }),
    body: z.object({
        fullName: z.string().min(2).optional(),
        ghanaCardNumber: z.string().regex(/^GHA-\d{9}-\d$/).optional(),
        status: z.nativeEnum(TenantStatus).optional(),
        phonePrimary: z.string().min(9).optional(),
        email: z.string().email().optional(),
        digitalAddress: z.string().optional(),
        monthlyIncome: z.number().positive().optional(),
        creditScore: z.number().min(300).max(850).optional(),
        notes: z.string().optional(),
        // Allow other fields to be updated as needed
        phoneSecondary: z.string().optional(),
        currentAddress: z.string().optional(),
        occupation: z.string().optional(),
        employerName: z.string().optional(),
        employerAddress: z.string().optional(),
        employerPhone: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
        emergencyContactRelationship: z.string().optional()
    })
});

// ==========================================
// TENANCY SCHEMAS
// ==========================================

export const createTenancySchema = z.object({
    body: z.object({
        propertyId: z.string().uuid('Invalid Property ID'),
        tenantId: z.string().uuid('Invalid Tenant ID'),
        unitNumber: z.string().optional(),
        leaseStartDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid start date'),
        leaseEndDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid end date'),
        monthlyRent: z.number().positive('Monthly rent must be positive'),
        rentCurrency: z.string().length(3).default('GHS'),
        advancePaymentMonths: z.number().int().min(0).default(0),
        advancePaymentAmount: z.number().nonnegative().optional(),
        advancePaymentDate: z.string().optional(),
        securityDeposit: z.number().nonnegative().default(0),
        rentDueDay: z.number().min(1).max(31).default(1),
        lateFeeAmount: z.number().nonnegative().default(0),
        lateFeeGraceDays: z.number().nonnegative().default(0),
        renewalOptions: z.object({
            allowRenewal: z.boolean(),
            renewalPeriodMonths: z.number().int().optional(),
            rentIncreasePercent: z.number().optional(),
            noticeRequiredDays: z.number().int().optional()
        }).optional(),
        autoRenew: z.boolean().default(false),
        leaseTerms: z.object({
            petsAllowed: z.boolean().optional(),
            smokingAllowed: z.boolean().optional(),
            sublettingAllowed: z.boolean().optional(),
            maxOccupants: z.number().int().optional(),
            utilitiesIncluded: z.array(z.string()).optional(),
            additionalTerms: z.array(z.string()).optional()
        }).optional(),
        specialConditions: z.string().optional()
    })
});

export const updateTenancySchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Tenancy ID')
    }),
    body: z.object({
        status: z.nativeEnum(TenancyStatus).optional(),
        monthlyRent: z.number().positive().optional(),
        leaseEndDate: z.string().optional(),
        securityDepositPaid: z.boolean().optional(),
        specialConditions: z.string().optional(),
        terminationReason: z.string().optional()
    })
});

export const renewTenancySchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Tenancy ID')
    }),
    body: z.object({
        newEndDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid end date'),
        newMonthlyRent: z.number().positive().optional(),
        advancePaymentAmount: z.number().nonnegative().optional()
    })
});

// ==========================================
// PAYMENT SCHEMAS
// ==========================================

export const createRentPaymentSchema = z.object({
    body: z.object({
        tenancyId: z.string().uuid('Invalid Tenancy ID'),
        paymentAmount: z.number().positive('Payment amount must be positive'),
        currency: z.string().length(3).default('GHS'),
        paymentDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid payment date').default(() => new Date().toISOString()),
        paymentMethod: z.nativeEnum(PaymentMethod),
        mobileMoneyReference: z.string().optional(),
        mobileMoneyNumber: z.string().optional(),
        bankReference: z.string().optional(),
        bankName: z.string().optional(),
        periodStartDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid period start date'),
        periodEndDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid period end date'),
        lateFees: z.number().nonnegative().default(0),
        otherCharges: z.array(z.object({
            description: z.string(),
            amount: z.number(),
            category: z.string().optional()
        })).optional(),
        notes: z.string().optional()
    })
});

export const generateInvoiceSchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Tenancy ID')
    }),
    body: z.object({
        periodStart: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid start date'),
        periodEnd: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid end date')
    })
});

// ==========================================
// WORK ORDER SCHEMAS
// ==========================================

export const createWorkOrderSchema = z.object({
    body: z.object({
        propertyId: z.string().uuid('Invalid Property ID'),
        tenancyId: z.string().uuid('Invalid Tenancy ID').optional(),
        title: z.string().min(5, 'Title must be at least 5 characters'),
        description: z.string().optional(),
        category: z.nativeEnum(MaintenanceCategory),
        priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
        urgency: z.nativeEnum(Urgency).default(Urgency.NORMAL),
        specificLocation: z.string().optional(),
        accessInstructions: z.string().optional(),
        safetyConsiderations: z.array(z.string()).optional(),
        scheduledDate: z.string().optional(),
        scheduledTimeStart: z.string().optional(),
        scheduledTimeEnd: z.string().optional(),
        estimatedCost: z.number().positive().optional(),
        photosBefore: z.array(z.string().url()).optional()
    })
});

export const updateWorkOrderSchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Work Order ID')
    }),
    body: z.object({
        status: z.nativeEnum(WorkOrderStatus).optional(),
        assignedVendorId: z.string().uuid().optional(),
        actualCost: z.number().nonnegative().optional(),
        completionNotes: z.string().optional(),
        photosAfter: z.array(z.string().url()).optional(),
        scheduledDate: z.string().optional()
    })
});

export const assignWorkOrderSchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Work Order ID')
    }),
    body: z.object({
        vendorId: z.string().uuid('Invalid Vendor ID')
    })
});

export const completeWorkOrderSchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Work Order ID')
    }),
    body: z.object({
        actualCost: z.number().nonnegative('Actual cost must be non-negative'),
        completionNotes: z.string().min(10, 'Completion notes required'),
        photosAfter: z.array(z.string().url()).optional()
    })
});

// ==========================================
// VENDOR SCHEMAS
// ==========================================

export const createVendorSchema = z.object({
    body: z.object({
        businessName: z.string().min(2, 'Business name is required'),
        contactPerson: z.string().min(2, 'Contact person is required'),
        phonePrimary: z.string().min(9, 'Primary phone is required'),
        phoneSecondary: z.string().optional(),
        email: z.string().email().optional(),
        address: z.string().optional(),
        digitalAddress: z.string().optional(), // Can add regex if strictly enforced for vendors too
        region: z.string().optional(),
        tinNumber: z.string().optional(),
        businessRegistration: z.string().optional(),
        serviceCategories: z.array(z.nativeEnum(MaintenanceCategory)).min(1, 'At least one service category is required'),
        bankName: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        mobileMoneyNumber: z.string().optional(),
        preferredPaymentMethod: z.nativeEnum(PaymentMethod).optional(),
        notes: z.string().optional()
    })
});

export const updateVendorSchema = z.object({
    params: z.object({
        id: z.string().uuid('Invalid Vendor ID')
    }),
    body: z.object({
        businessName: z.string().min(2).optional(),
        contactPerson: z.string().min(2).optional(),
        phonePrimary: z.string().min(9).optional(),
        status: z.nativeEnum(VendorStatus).optional(),
        serviceCategories: z.array(z.nativeEnum(MaintenanceCategory)).optional(),
        // other fields optional
    })
});

// ==========================================
// DOCUMENT SCHEMAS
// ==========================================

export const createDocumentSchema = z.object({
    body: z.object({
        propertyId: z.string().uuid('Invalid Property ID'),
        tenancyId: z.string().uuid('Invalid Tenancy ID').optional(),
        documentType: z.nativeEnum(PropertyDocumentType),
        title: z.string().min(2, 'Title is required'),
        description: z.string().optional(),
        issueDate: z.string().optional(),
        expiryDate: z.string().optional(),
        issuingAuthority: z.string().optional(),
        referenceNumber: z.string().optional(),
        folderPath: z.string().optional(),
        tags: z.array(z.string()).optional(),
        // File metadata normally handled by upload middleware, but assuming passed in body for now per service signature
        fileUrl: z.string().url('File URL is required').optional(), // Service might generate this or expect it
        fileName: z.string().min(1).optional(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional()
    })
});

// ==========================================
// FINANCIAL SCHEMAS
// ==========================================

export const createFinancialRecordSchema = z.object({
    body: z.object({
        propertyId: z.string().uuid('Invalid Property ID'),
        tenancyId: z.string().uuid().optional(),
        workOrderId: z.string().uuid().optional(),
        recordType: z.enum(['income', 'expense']),
        incomeCategory: z.nativeEnum(IncomeCategory).optional(),
        expenseCategory: z.nativeEnum(ExpenseCategory).optional(),
        amount: z.number().positive('Amount must be positive'),
        currency: z.string().length(3).default('GHS'),
        transactionDate: z.string().refine(date => !isNaN(Date.parse(date)), 'Invalid date'),
        description: z.string().optional(),
        paymentMethod: z.nativeEnum(PaymentMethod).optional(),
        paymentReference: z.string().optional(),
        vendorId: z.string().uuid().optional(),
        isTaxDeductible: z.boolean().default(false),
        taxCategory: z.string().optional()
    }).refine(data => {
        if (data.recordType === 'income' && !data.incomeCategory) return false;
        if (data.recordType === 'expense' && !data.expenseCategory) return false;
        return true;
    }, {
        message: "Income category required for income, Expense category required for expense",
        path: ["body", "category"] // approximate path
    })
});
