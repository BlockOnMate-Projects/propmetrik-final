/**
 * Budget API Client
 * Phase 4 Sprint 7 - Enhanced Budget Module
 */

import { fetchApi } from './api';

const BUDGET_BASE = '/budget';

// =====================================================
// TYPES
// =====================================================

export interface MultiCurrencyBudget {
  projectId: string;
  baseCurrency: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  conversions: Record<string, {
    rate: number;
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    rateSource: string;
    rateTimestamp: Date;
  }>;
  lockedRates: Array<{
    currency: string;
    rate: number;
    validUntil: Date;
  }>;
}

export interface BudgetVariance {
  projectId: string;
  originalBudget: number;
  currentBudget: number;
  actualSpend: number;
  variance: number;
  variancePercent: number;
  fxImpact: number;
  inflationImpact: number;
  byCategory: Array<{
    category: string;
    budgeted: number;
    actual: number;
    variance: number;
    variancePercent: number;
  }>;
  byPhase: Array<{
    phaseName: string;
    budgeted: number;
    actual: number;
    variance: number;
    percentComplete: number;
  }>;
}

export interface BudgetForecast {
  projectId: string;
  currentDate: Date;
  estimatedCompletionDate: Date;
  forecastedTotalCost: number;
  forecastedOverrun: number;
  confidenceLevel: number;
  costDrivers: Array<{
    factor: string;
    impact: number;
    likelihood: string;
  }>;
  recommendations: string[];
  monthlyProjections: Array<{
    month: string;
    projected: number;
    cumulative: number;
  }>;
}

export interface BudgetAnalytics {
  multiCurrency: MultiCurrencyBudget;
  variance: BudgetVariance;
  forecast: BudgetForecast;
}

export interface BudgetSnapshot {
  id: string;
  projectId: string;
  snapshotDate: Date;
  snapshotType: 'weekly' | 'monthly' | 'milestone' | 'manual';
  totalBudget: number;
  totalSpent: number;
  totalCommitted: number;
  createdBy: string;
}

export interface ExchangeRateLock {
  id: string;
  projectId: string;
  fromCurrency: string;
  toCurrency: string;
  lockedRate: number;
  lockReason: string;
  validFrom: Date;
  validUntil: Date;
  budgetAmountLocked: number;
  isActive: boolean;
  lockedBy: string;
  createdAt: Date;
}

export interface BudgetAlert {
  id: string;
  projectId: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  thresholdValue: number;
  currentValue: number;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  createdAt: Date;
}

// Invoice Types
export type InvoiceStatus = 'draft' | 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  costCodeId?: string;
}

export interface Invoice {
  id: string;
  projectId: string;
  organizationId: string;
  invoiceNumber: string;
  vendorId?: string;
  vendorName: string;
  description: string;
  status: InvoiceStatus;
  amount: number;
  amountLocal: number;
  currency: string;
  exchangeRateAtCreation: number;
  invoiceDate: Date;
  dueDate: Date;
  paidDate?: Date;
  paymentReference?: string;
  paymentMethod?: string;
  lineItems: InvoiceLineItem[];
  attachments: string[];
  notes?: string;
  taxAmount: number;
  isOverdue: boolean;
  milestoneId?: string;
  submittedBy?: string;
  submittedAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceSummary {
  // Frontend-expected fields
  totalInvoices?: number;
  totalAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  overdueAmount?: number;
  byStatus?: Record<InvoiceStatus, { count: number; amount: number }>;
  // Backend-returned fields
  projectId?: string;
  totalInvoiced?: number;
  totalPaid?: number;
  totalPending?: number;
  totalOverdue?: number;
  overdueCount?: number;
  averageDaysToPay?: number;
  [key: string]: any;
}

// Expense Types
export type ExpenseType = 'material' | 'labor' | 'equipment' | 'subcontractor' | 'overhead' | 'permit' | 'other';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface ExpenseLog {
  id: string;
  projectId: string;
  organizationId: string;
  categoryId?: string;
  expenseType: ExpenseType;
  description: string;
  amount: number;
  currency: string;
  expenseDate: Date;
  receiptUrl?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  status: ExpenseStatus;
  vendorName?: string;
  notes?: string;
  tags?: string[];
  loggedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  offlineId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseSummary {
  totalExpenses: number;
  totalAmount: number;
  approvedAmount: number;
  pendingAmount: number;
  byType: Record<ExpenseType, { count: number; amount: number }>;
  byCategory: Array<{ categoryId: string; name: string; amount: number }>;
}

// =====================================================
// BUDGET ANALYTICS API
// =====================================================

export const budgetApi = {
  // Get comprehensive analytics
  getAnalytics: (projectId: string, currencies?: string[]): Promise<BudgetAnalytics> => {
    const params = currencies ? `?currencies=${currencies.join(',')}` : '';
    return fetchApi(`${BUDGET_BASE}/${projectId}/analytics${params}`);
  },

  // Get multi-currency conversions
  getConversions: (projectId: string, currencies?: string[]): Promise<MultiCurrencyBudget> => {
    const params = currencies ? `?currencies=${currencies.join(',')}` : '';
    return fetchApi(`${BUDGET_BASE}/${projectId}/conversions${params}`);
  },

  // Get variance analysis
  getVariance: (projectId: string): Promise<BudgetVariance> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/variance`);
  },

  // Get forecast
  getForecast: (projectId: string): Promise<BudgetForecast> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/forecast`);
  },

  // Get budget trend
  getTrend: (projectId: string, startDate?: Date, endDate?: Date): Promise<BudgetSnapshot[]> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate.toISOString());
    if (endDate) params.set('endDate', endDate.toISOString());
    const query = params.toString();
    return fetchApi(`${BUDGET_BASE}/${projectId}/trend${query ? `?${query}` : ''}`);
  },

  // Create snapshot
  createSnapshot: (projectId: string, organizationId: string, snapshotType?: string): Promise<BudgetSnapshot> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({ organizationId, snapshotType }),
    });
  },
};

// =====================================================
// EXCHANGE RATE LOCKS API
// =====================================================

export const rateLockApi = {
  // Lock an exchange rate
  lock: (data: {
    projectId: string;
    organizationId: string;
    fromCurrency: string;
    toCurrency: string;
    lockedRate: number;
    lockReason: string;
    validFrom?: Date;
    validUntil?: Date;
    budgetAmountLocked?: number;
  }): Promise<ExchangeRateLock> => {
    return fetchApi(`${BUDGET_BASE}/${data.projectId}/rate-locks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get active locks
  getActive: (projectId: string): Promise<ExchangeRateLock[]> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/rate-locks`);
  },

  // Release a lock
  release: (lockId: string): Promise<void> => {
    return fetchApi(`${BUDGET_BASE}/rate-locks/${lockId}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// BUDGET ALERTS API
// =====================================================

export const alertApi = {
  // Get active alerts
  getAlerts: (projectId: string): Promise<BudgetAlert[]> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/alerts`);
  },

  // Check thresholds
  checkThresholds: (projectId: string, organizationId: string): Promise<BudgetAlert[]> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/alerts/check`, {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
  },

  // Acknowledge alert
  acknowledge: (alertId: string): Promise<void> => {
    return fetchApi(`${BUDGET_BASE}/alerts/${alertId}/acknowledge`, {
      method: 'POST',
    });
  },
};

// =====================================================
// INVOICES API
// =====================================================

export interface InvoiceFilters {
  projectId?: string;
  organizationId?: string;
  vendorId?: string;
  status?: InvoiceStatus;
  isOverdue?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export const invoiceApi = {
  // Create invoice
  create: (data: Partial<Invoice>): Promise<Invoice> => {
    return fetchApi(`${BUDGET_BASE}/invoices`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get invoices with filters
  getAll: (filters?: InvoiceFilters): Promise<{ data: Invoice[]; pagination: { total: number; limit: number; offset: number } }> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.organizationId) params.set('organizationId', filters.organizationId);
    if (filters?.vendorId) params.set('vendorId', filters.vendorId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.isOverdue !== undefined) params.set('isOverdue', String(filters.isOverdue));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('offset', String((filters.page - 1) * (filters.limit || 50)));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    return fetchApi(`${BUDGET_BASE}/invoices${query ? `?${query}` : ''}`);
  },

  // Get invoice by ID
  getById: (id: string): Promise<Invoice> => {
    return fetchApi(`${BUDGET_BASE}/invoices/${id}`);
  },

  // Get project invoices
  getByProject: (projectId: string): Promise<Invoice[]> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/invoices`);
  },

  // Get project summary
  getProjectSummary: (projectId: string): Promise<InvoiceSummary> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/invoices/summary`);
  },

  // Get overdue invoices
  getOverdue: (organizationId?: string): Promise<Invoice[]> => {
    const params = organizationId ? `?organizationId=${organizationId}` : '';
    return fetchApi(`${BUDGET_BASE}/invoices/overdue${params}`);
  },

  // Update invoice
  update: (id: string, data: Partial<Invoice>): Promise<Invoice> => {
    return fetchApi(`${BUDGET_BASE}/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Submit for approval
  submit: (id: string): Promise<Invoice> => {
    return fetchApi(`${BUDGET_BASE}/invoices/${id}/submit`, {
      method: 'POST',
    });
  },

  // Approve invoice
  approve: (id: string): Promise<Invoice> => {
    return fetchApi(`${BUDGET_BASE}/invoices/${id}/approve`, {
      method: 'POST',
    });
  },

  // Reject invoice
  reject: (id: string, reason: string): Promise<Invoice> => {
    return fetchApi(`${BUDGET_BASE}/invoices/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Mark as paid
  pay: (id: string, data: { paidDate?: Date; paymentReference: string; paymentMethod?: string }): Promise<Invoice> => {
    return fetchApi(`${BUDGET_BASE}/invoices/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Delete invoice
  delete: (id: string): Promise<void> => {
    return fetchApi(`${BUDGET_BASE}/invoices/${id}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// EXPENSES API
// =====================================================

export interface ExpenseFilters {
  projectId?: string;
  organizationId?: string;
  loggedBy?: string;
  categoryId?: string;
  expenseType?: ExpenseType;
  status?: ExpenseStatus;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

export const expenseApi = {
  // Create expense
  create: (data: Partial<ExpenseLog>): Promise<ExpenseLog> => {
    return fetchApi(`${BUDGET_BASE}/expenses`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Bulk create (for offline sync)
  bulkCreate: (expenses: Partial<ExpenseLog>[]): Promise<{ created: ExpenseLog[]; duplicates: string[] }> => {
    return fetchApi(`${BUDGET_BASE}/expenses/bulk`, {
      method: 'POST',
      body: JSON.stringify({ expenses }),
    });
  },

  // Get expenses with filters
  getAll: (filters?: ExpenseFilters): Promise<{ data: ExpenseLog[]; pagination: { total: number; limit: number; offset: number } }> => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.organizationId) params.set('organizationId', filters.organizationId);
    if (filters?.loggedBy) params.set('loggedBy', filters.loggedBy);
    if (filters?.categoryId) params.set('categoryId', filters.categoryId);
    if (filters?.expenseType) params.set('expenseType', filters.expenseType);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.startDate) params.set('startDate', filters.startDate.toISOString());
    if (filters?.endDate) params.set('endDate', filters.endDate.toISOString());
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('offset', String((filters.page - 1) * (filters.limit || 50)));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    return fetchApi(`${BUDGET_BASE}/expenses${query ? `?${query}` : ''}`);
  },

  // Get expense by ID
  getById: (id: string): Promise<ExpenseLog> => {
    return fetchApi(`${BUDGET_BASE}/expenses/${id}`);
  },

  // Get project expenses
  getByProject: (projectId: string): Promise<ExpenseLog[]> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/expenses`);
  },

  // Get project summary
  getProjectSummary: (projectId: string): Promise<ExpenseSummary> => {
    return fetchApi(`${BUDGET_BASE}/${projectId}/expenses/summary`);
  },

  // Get nearby expenses (for mobile)
  getNearby: (latitude: number, longitude: number, radius?: number): Promise<ExpenseLog[]> => {
    const params = `?latitude=${latitude}&longitude=${longitude}${radius ? `&radius=${radius}` : ''}`;
    return fetchApi(`${BUDGET_BASE}/expenses/nearby${params}`);
  },

  // Update expense
  update: (id: string, data: Partial<ExpenseLog>): Promise<ExpenseLog> => {
    return fetchApi(`${BUDGET_BASE}/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Approve expense
  approve: (id: string): Promise<ExpenseLog> => {
    return fetchApi(`${BUDGET_BASE}/expenses/${id}/approve`, {
      method: 'POST',
    });
  },

  // Reject expense
  reject: (id: string, reason: string): Promise<ExpenseLog> => {
    return fetchApi(`${BUDGET_BASE}/expenses/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Bulk approve
  bulkApprove: (ids: string[]): Promise<{ message: string }> => {
    return fetchApi(`${BUDGET_BASE}/expenses/bulk-approve`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  // Delete expense
  delete: (id: string): Promise<void> => {
    return fetchApi(`${BUDGET_BASE}/expenses/${id}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// PAYMENT MILESTONES
// =====================================================

export interface PaymentMilestone {
  id: string;
  projectId: string;
  phaseId?: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  percentage?: number;
  dueDate?: Date | string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  paidAmount?: number;
  paidDate?: Date;
  milestoneOrder: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMilestoneFilters {
  phaseId?: string;
  status?: PaymentMilestone['status'];
}

export const paymentMilestoneApi = {
  // Create milestone
  create: (data: Partial<PaymentMilestone>): Promise<PaymentMilestone> => {
    return fetchApi(`${BUDGET_BASE}/${data.projectId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get all milestones for project
  getAll: (projectId: string, filters?: PaymentMilestoneFilters): Promise<PaymentMilestone[]> => {
    const params = new URLSearchParams();
    if (filters?.phaseId) params.set('phaseId', filters.phaseId);
    if (filters?.status) params.set('status', filters.status);
    const query = params.toString();
    return fetchApi(`${BUDGET_BASE}/${projectId}/milestones${query ? `?${query}` : ''}`);
  },

  // Get milestone by ID
  getById: (id: string): Promise<PaymentMilestone> => {
    return fetchApi(`${BUDGET_BASE}/milestones/${id}`);
  },

  // Update milestone
  update: (id: string, data: Partial<PaymentMilestone>): Promise<PaymentMilestone> => {
    return fetchApi(`${BUDGET_BASE}/milestones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Mark as paid
  markAsPaid: (id: string, paidDate?: Date): Promise<PaymentMilestone> => {
    return fetchApi(`${BUDGET_BASE}/milestones/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paidDate }),
    });
  },

  // Cancel milestone
  cancel: (id: string): Promise<PaymentMilestone> => {
    return fetchApi(`${BUDGET_BASE}/milestones/${id}/cancel`, {
      method: 'POST',
    });
  },

  // Link invoice to milestone
  linkInvoice: (milestoneId: string, invoiceId: string): Promise<void> => {
    return fetchApi(`${BUDGET_BASE}/milestones/${milestoneId}/invoices/${invoiceId}`, {
      method: 'POST',
    });
  },

  // Unlink invoice from milestone
  unlinkInvoice: (milestoneId: string, invoiceId: string): Promise<void> => {
    return fetchApi(`${BUDGET_BASE}/milestones/${milestoneId}/invoices/${invoiceId}`, {
      method: 'DELETE',
    });
  },

  // Delete milestone
  delete: (id: string): Promise<void> => {
    return fetchApi(`${BUDGET_BASE}/milestones/${id}`, {
      method: 'DELETE',
    });
  },
};

// =====================================================
// REVENUE SUMMARY
// =====================================================

export interface RevenueTransaction {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  vendorCompany: string | null;
  projectId: string;
  projectName: string | null;
  amount: number;
  totalAmount: number;
  currency: string;
  status: string;
  paidDate: string | null;
  sentAt: string | null;
  createdAt: string;
  platformFee: number;
  paymentMethod: string | null;
}

export interface MonthlyRevenue {
  month: string;
  invoiced: number;
  paid: number;
}

export interface RevenueSummary {
  currency: string;
  totalBudget: number;
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  platformFeesCollected: number;
  overdueCount: number;
  paidCount: number;
  sentCount: number;
  totalCount: number;
  activeProjectCount: number;
  projects: Array<{ id: string; name: string; currency: string }>;
  recentTransactions: RevenueTransaction[];
  monthlyRevenue: MonthlyRevenue[];
}

export const revenueApi = {
  getSummary: async (projectId?: string): Promise<RevenueSummary> => {
    const params = projectId ? `?projectId=${projectId}` : '';
    const res = await fetchApi<{ success: boolean; data: RevenueSummary }>(`${BUDGET_BASE}/revenue/summary${params}`);
    return res.data;
  },
};