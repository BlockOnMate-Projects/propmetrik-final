export interface Property {
  id: string;
  title: string;
  addressStreet: string;
  addressCity: string;
  addressDistrict: string;
  price: number;
  priceCurrency: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  totalAreaSqm?: number;
  description?: string;
  images?: string[];
}

export interface ApplicationInput {
  propertyId: string;
  applicationToken?: string;
  applicant: {
    fullName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    currentAddress: string;
    employment: {
      status: string;
      employer: string;
      position: string;
      monthlyIncome: number;
      currency: string;
    };
    emergencyContact: {
      name: string;
      relationship: string;
      phone: string;
      email: string;
    };
    references: Array<{
      name: string;
      relationship: string;
      phone: string;
      email: string;
    }>;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Validate an application link token and get the associated property ID
 * This is the first step when a tenant clicks an application link
 */
export async function validateApplicationToken(token: string): Promise<{ valid: boolean; propertyId?: string; organizationId?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/v1/pm/application-links/${token}/validate`);

    if (!res.ok) {
      return { valid: false };
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to validate token:", error);
    return { valid: false };
  }
}

/**
 * Fetch property details by property ID
 */
export async function getPropertyById(propertyId: string): Promise<Property> {
  // Fetch the real property from PM properties endpoint
  try {
    const res = await fetch(`${API_URL}/api/v1/pm/properties/${propertyId}`);

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Property not found');
      }
      throw new Error('Failed to fetch property details');
    }

    const data = await res.json();

    // Map backend snake_case to frontend camelCase
    return {
      id: data.id,
      title: data.title,
      addressStreet: data.addressStreet || data.address_street || '',
      addressCity: data.addressCity || data.address_city || '',
      addressDistrict: data.addressDistrict || data.address_district || '',
      price: data.price,
      priceCurrency: data.priceCurrency || data.price_currency || 'GHS',
      propertyType: data.propertyType || data.property_type || '',
      description: data.description || '',
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      totalAreaSqm: data.totalAreaSqm || data.total_area_sqm
    };
  } catch (error) {
    console.error("Failed to fetch property:", error);
    throw error;
  }
}

export async function submitApplication(data: ApplicationInput): Promise<{ id: string; status: string; applicationToken?: string }> {
  // If we have an application token, use the public endpoint for link-based submissions
  // Otherwise, use the standard endpoint (requires authentication)
  const url = data.applicationToken
    ? `${API_URL}/api/v1/pm/application-links/${data.applicationToken}/apply`
    : `${API_URL}/api/v1/pm/applications`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // For token-based submission, propertyId comes from the validated token
      // But we include it for direct submissions
      propertyId: data.propertyId,
      applicantFullName: data.applicant.fullName,
      applicantEmail: data.applicant.email,
      applicantPhone: data.applicant.phone,
      applicantDateOfBirth: data.applicant.dateOfBirth,
      applicantCurrentAddress: data.applicant.currentAddress,
      occupation: data.applicant.employment.position,
      employerName: data.applicant.employment.employer,
      monthlyIncome: data.applicant.employment.monthlyIncome,
      emergencyContactName: data.applicant.emergencyContact.name,
      emergencyContactRelationship: data.applicant.emergencyContact.relationship,
      emergencyContactPhone: data.applicant.emergencyContact.phone,
      characterReferences: data.applicant.references.map(ref => ({
        fullName: ref.name,
        relationship: ref.relationship,
        phone: ref.phone,
        email: ref.email
      }))
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Failed to submit application');
  }

  return res.json();
}

export interface ApplicationStatus {
  id: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'lease_generated' | 'tenant_signed' | 'active';
  propertyName: string;
  propertyAddress: string;
  applicantName: string;
  submittedAt: string;
  signerToken?: string;
  envelopeId?: string;
  timeline: Array<{
    stage: string;
    date: string;
    notes?: string;
  }>;
}

export async function getApplicationStatus(idOrToken: string): Promise<ApplicationStatus> {
  // Try fetching by application token (public endpoint)
  try {
    const res = await fetch(`${API_URL}/api/v1/pm/applications/public/${idOrToken}`);
    if (res.ok) {
      const data = await res.json();
      // Transform backend snake_case to frontend camelCase
      return {
        id: data.id,
        status: data.status,
        propertyName: data.propertyName || data.property_name || 'Property',
        propertyAddress: data.propertyAddress || data.property_address || '',
        applicantName: data.applicantFullName || data.applicant_full_name || '',
        submittedAt: data.submittedAt || data.submitted_at || data.createdAt || data.created_at || new Date().toISOString(),
        signerToken: data.signerToken || data.signer_token || undefined,
        envelopeId: data.envelopeId || data.envelope_id || undefined,
        timeline: buildTimeline(data),
      };
    }
  } catch (e) {
    console.warn("Failed to fetch application status from backend", e);
  }

  throw new Error('Application not found');
}

// Helper to build timeline from application data
function buildTimeline(data: any): Array<{ stage: string; date: string; notes?: string }> {
  const timeline: Array<{ stage: string; date: string; notes?: string }> = [];

  // Always add created/submitted event
  const createdDate = data.submittedAt || data.submitted_at || data.createdAt || data.created_at;
  if (createdDate) {
    timeline.push({ stage: 'Application Submitted', date: createdDate, notes: 'Your application has been received' });
  }

  // Add status-based events
  const status = data.status?.toLowerCase();
  if (status === 'under_review' || status === 'approved' || status === 'rejected') {
    timeline.push({ stage: 'Under Review', date: data.updatedAt || data.updated_at || createdDate, notes: 'Property manager is reviewing your application' });
  }
  if (status === 'approved' || status === 'lease_generated') {
    timeline.push({ stage: 'Approved', date: data.reviewedAt || data.reviewed_at || data.updatedAt || data.updated_at, notes: 'Congratulations! Your application has been approved' });
  }
  if (status === 'lease_generated') {
    timeline.push({ stage: 'Lease Sent', date: data.updatedAt || data.updated_at, notes: 'Your lease agreement has been sent for signing. Please check your email.' });
  }
  if (status === 'rejected') {
    timeline.push({ stage: 'Rejected', date: data.updatedAt || data.updated_at, notes: data.rejectionReason || 'Your application was not approved' });
  }

  return timeline;
}

export interface LeaseAgreement {
  id: string;
  applicationId: string;
  content: string; // HTML content or URL to PDF
  terms: {
    startDate: string;
    endDate: string;
    rentAmount: number;
    securityDeposit: number;
  };
  hasSigned: boolean;
  tenantName?: string;
}

export async function getLeaseByApplicationId(applicationId: string, signerToken?: string): Promise<LeaseAgreement> {
  // First try to get real lease data from the API
  try {
    const tokenParam = signerToken ? `?token=${encodeURIComponent(signerToken)}` : '';
    const res = await fetch(`${API_URL}/api/v1/pm/applications/${applicationId}/lease${tokenParam}`);
    if (res.ok) {
      const data = await res.json();
      return {
        id: data.id || `lease-${applicationId}`,
        applicationId,
        content: data.content || data.documentHtml || '',
        terms: {
          startDate: data.terms?.startDate || data.startDate || '',
          endDate: data.terms?.endDate || data.endDate || '',
          rentAmount: data.terms?.rentAmount || data.rentAmount || 0,
          securityDeposit: data.terms?.securityDeposit || data.securityDeposit || 0,
        },
        hasSigned: data.hasSigned || false,
        tenantName: data.tenantName,
      };
    }
  } catch (error) {
    console.error('Error fetching real lease data:', error);
  }

  // Fallback to mock implementation
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: `lease-${applicationId}`,
        applicationId,
        content: `
          <h3>RESIDENTIAL LEASE AGREEMENT</h3>
          <p>This Lease Agreement is made between <strong>Cedyn Properties</strong> (Landlord) and <strong>Tenant Name</strong> (Tenant).</p>
          <p>1. <strong>PROPERTY</strong>: The Landlord agrees to lease to the Tenant the property located at 123 Ghana Avenue.</p>
          <p>2. <strong>TERM</strong>: The lease shall start on 2024-03-01 and end on 2025-03-01.</p>
          <p>3. <strong>RENT</strong>: The Tenant agrees to pay ₵5,000 per month.</p>
          <p>4. <strong>SECURITY DEPOSIT</strong>: A security deposit of ₵10,000 is required.</p>
          <br/>
          <p>By signing below, the Tenant agrees to all terms and conditions of this agreement.</p>
        `,
        terms: {
          startDate: '2024-03-01',
          endDate: '2025-03-01',
          rentAmount: 5000,
          securityDeposit: 10000
        },
        hasSigned: false,
        tenantName: 'John Doe'
      });
    }, 800);
  });
}

export async function submitLeaseSignature(
  leaseId: string, 
  signatureDataUrl: string
): Promise<boolean> {
  // Try real API endpoint
  try {
    const res = await fetch(`${API_URL}/api/v1/pm/leases/${leaseId}/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signatureDataUrl,
      }),
    });

    if (res.ok) {
      return true;
    }
  } catch (error) {
    console.error('Error submitting to real API:', error);
  }

  // Fallback mock
  console.log(`Submitting signature for lease ${leaseId}`);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 1500);
  });
}

// =====================================================
// TENANT PORTAL AUTH & SESSION
// =====================================================

let sessionToken: string | null = null;

export function setSessionToken(token: string) {
  sessionToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('tenant_session', token);
  }
}

export function getSessionToken(): string | null {
  if (sessionToken) return sessionToken;
  if (typeof window !== 'undefined') {
    sessionToken = localStorage.getItem('tenant_session');
  }
  return sessionToken;
}

export function clearSession() {
  sessionToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('tenant_session');
  }
}

async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = getSessionToken();
  if (!token) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Not authenticated');
  }

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    'Authorization': `Bearer ${token}`,
  };
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Session expired. Please sign in again.');
  }

  return res;
}

// =====================================================
// AUTH API
// =====================================================

export async function requestMagicLink(identifier: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier })
  });

  return res.json();
}

export async function getKeycloakAuthUrl(
  redirectUri: string,
  loginHint?: string,
  codeChallenge?: string,
  codeChallengeMethod: 'S256' | 'plain' = 'S256'
): Promise<{ success: boolean; authUrl: string }> {
  const query = new URLSearchParams({ redirectUri });
  if (loginHint) {
    query.append('loginHint', loginHint);
  }
  if (codeChallenge) {
    query.append('codeChallenge', codeChallenge);
    query.append('codeChallengeMethod', codeChallengeMethod);
  }

  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/keycloak/config?${query.toString()}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to initialize Keycloak login');
  }

  return res.json();
}

export async function exchangeKeycloakCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/keycloak/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri, codeVerifier })
  });

  const data = await res.json();
  if (data.success && data.accessToken) {
    setSessionToken(data.accessToken);
  }

  return data;
}

export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/keycloak/password-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (data.success && data.accessToken) {
      setSessionToken(data.accessToken);
    }

    return data;
  } catch (err: any) {
    return { success: false, error: 'Unable to reach the server. Please try again.' };
  }
}

export async function getResetPasswordUrl(
  redirectUri: string,
  loginHint?: string
): Promise<{ success: boolean; url: string }> {
  const query = new URLSearchParams({ redirectUri });
  if (loginHint) {
    query.append('loginHint', loginHint);
  }

  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/keycloak/reset-password-url?${query.toString()}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to get reset password URL');
  }

  return res.json();
}

export async function requestOTP(identifier: string, method: 'sms' | 'email'): Promise<{ success: boolean; message: string }> {
  const payload = method === 'sms'
    ? { phone: identifier }
    : { email: identifier };

  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return res.json();
}

export async function verifyOTP(identifier: string, otp: string, method: 'sms' | 'email'): Promise<{ success: boolean; token?: string; error?: string }> {
  const payload = method === 'sms'
    ? { phone: identifier, otp }
    : { email: identifier, otp };

  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.success && data.sessionToken) {
    setSessionToken(data.sessionToken);
  }
  return data;
}

export async function verifyMagicLink(token: string): Promise<{ success: boolean; setupRequired?: boolean; tenantEmail?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/verify?token=${token}`);
  const data = await res.json();

  return data;
}

export async function completePasswordSetup(
  token: string,
  password: string,
  confirmPassword: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/v1/tenant-portal/auth/setup-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, confirmPassword })
  });

  const data = await res.json();
  if (data.success && data.accessToken) {
    setSessionToken(data.accessToken);
  }

  return data;
}

export async function logout(): Promise<void> {
  try {
    await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/auth/logout`, { method: 'POST' });
  } finally {
    clearSession();
  }
}

// =====================================================
// TENANT PROFILE & TENANCIES
// =====================================================

export interface TenantProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  phoneSecondary?: string;
  currentAddress?: string;
  digitalAddress?: string;
  occupation?: string;
  tenancies: Array<{
    id: string;
    propertyId: string;
    propertyTitle: string;
    propertyAddress: string;
    startDate: string;
    endDate: string;
    rentAmount: number;
    rentCurrency: string;
    status: string;
  }>;
}

function normalizeTenantProfile(data: any): TenantProfile {
  const tenanciesSource = data?.tenancies || data?.activeTenancies || [];

  return {
    id: data?.id,
    fullName: data?.fullName || data?.full_name || '',
    email: data?.email || '',
    phone: data?.phone || data?.phonePrimary || data?.phone_primary || '',
    phoneSecondary: data?.phoneSecondary || data?.phone_secondary || '',
    currentAddress: data?.currentAddress || data?.current_address || '',
    digitalAddress: data?.digitalAddress || data?.digital_address || '',
    occupation: data?.occupation || '',
    tenancies: Array.isArray(tenanciesSource)
      ? tenanciesSource.map((tenancy: any) => ({
          id: tenancy.id,
          propertyId: tenancy.propertyId || tenancy.property_id,
          propertyTitle: tenancy.propertyTitle || tenancy.property_title || '',
          propertyAddress: tenancy.propertyAddress || tenancy.property_address || '',
          startDate: tenancy.startDate || tenancy.leaseStartDate || tenancy.lease_start_date,
          endDate: tenancy.endDate || tenancy.leaseEndDate || tenancy.lease_end_date,
          rentAmount: Number(tenancy.rentAmount ?? tenancy.monthlyRent ?? tenancy.monthly_rent ?? 0),
          rentCurrency: tenancy.rentCurrency || tenancy.currency || 'GHS',
          status: tenancy.status || 'active',
        }))
      : [],
  };
}

export async function getTenantProfile(): Promise<TenantProfile> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/profile`);
  if (!res.ok) throw new Error('Failed to fetch profile');
  const data = await res.json();
  return normalizeTenantProfile(data);
}

export async function updateTenantProfile(data: { email?: string; phoneSecondary?: string; currentAddress?: string }): Promise<TenantProfile> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/profile`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

// =====================================================
// PAYMENTS
// =====================================================

export interface PaymentSummary {
  totalExpected: number;
  totalPaid: number;
  totalOutstanding: number;
  currency: string;
  overdueSchedules: number;
  nextPaymentDue?: {
    dueDate: string;
    amount: number;
  };
}

export interface RentSchedule {
  id: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  amountOutstanding: number;
  status: string;
}

export interface PaymentHistory {
  id: string;
  paymentDate: string;
  paymentAmount: number;
  paymentMethod: string;
  reference: string;
  status: string;
}

export async function getPaymentSummary(tenancyId: string): Promise<PaymentSummary> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/summary/${tenancyId}`);
  if (!res.ok) throw new Error('Failed to fetch payment summary');
  const raw = await res.json();

  // Normalize backend shape { arrears, recentPayments, upcomingSchedules }
  // into the PaymentSummary the frontend expects
  const arrears = raw.arrears || raw;
  const upcomingSchedules = raw.upcomingSchedules || [];

  // Find next upcoming schedule with outstanding amount
  const nextSchedule = upcomingSchedules.find((s: any) =>
    Number(s.amount_outstanding || s.amountOutstanding || s.expected_amount || 0) > 0
  );

  // totalOutstanding from backend includes ALL future schedules which is misleading.
  // Show only overdue + currently-due outstanding (not future months).
  const overdueAmt = Array.isArray(arrears.overdueSchedules)
    ? arrears.overdueSchedules.reduce((s: number, o: any) => s + Number(o.amountOutstanding || o.amount_outstanding || 0), 0)
    : 0;
  const dueAmt = Array.isArray(arrears.dueSchedules)
    ? arrears.dueSchedules.reduce((s: number, o: any) => s + Number(o.amountOutstanding || o.amount_outstanding || 0), 0)
    : 0;
  // If current period exists and is not yet paid, include its outstanding
  const currentOut = arrears.currentPeriod
    ? Number(arrears.currentPeriod.amountOutstanding || arrears.currentPeriod.amount_outstanding || 0)
    : 0;
  const displayOutstanding = overdueAmt + dueAmt + (overdueAmt + dueAmt === 0 ? currentOut : 0);

  return {
    totalExpected: Number(arrears.totalExpected ?? 0),
    totalPaid: Number(arrears.totalPaid ?? 0),
    totalOutstanding: displayOutstanding,
    currency: arrears.currency || 'GHS',
    overdueSchedules: Array.isArray(arrears.overdueSchedules) ? arrears.overdueSchedules.length : Number(arrears.overdueSchedules ?? 0),
    nextPaymentDue: nextSchedule
      ? {
          dueDate: nextSchedule.due_date || nextSchedule.dueDate,
          amount: Number(nextSchedule.expected_amount || nextSchedule.expectedAmount || 0),
        }
      : undefined,
  };
}

export async function getRentSchedules(tenancyId: string): Promise<RentSchedule[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/schedules/${tenancyId}`);
  if (!res.ok) throw new Error('Failed to fetch rent schedules');
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : (raw.schedules || raw.data || []);
  return list.map((s: any) => ({
    id: s.id,
    periodStart: s.period_start_date || s.periodStart || s.periodStartDate,
    periodEnd: s.period_end_date || s.periodEnd || s.periodEndDate,
    dueDate: s.due_date || s.dueDate,
    amountDue: Number(s.expected_amount || s.amountDue || s.expectedAmount || 0),
    amountPaid: Number(s.amount_paid || s.amountPaid || 0),
    amountOutstanding: Number(s.amount_outstanding || s.amountOutstanding || 0),
    status: s.status || 'upcoming',
  }));
}

export async function getPaymentHistory(tenancyId: string): Promise<PaymentHistory[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/history/${tenancyId}`);
  if (!res.ok) throw new Error('Failed to fetch payment history');
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : (raw.data || raw.payments || []);
  return list.map((p: any) => ({
    id: p.id,
    paymentDate: p.payment_date || p.paymentDate,
    paymentAmount: Number(p.payment_amount || p.paymentAmount || 0),
    paymentMethod: p.payment_method || p.paymentMethod || '',
    reference: p.reference || p.mobile_money_reference || p.bank_reference || p.mobileMoneyReference || p.bankReference || p.receipt_number || '',
    status: p.status || 'completed',
  }));
}

export async function initiatePayment(tenancyId: string, amount: number, scheduleIds?: string[], channel?: string): Promise<{ authorizationUrl: string; reference: string; feeBreakdown?: any }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/initiate`, {
    method: 'POST',
    body: JSON.stringify({ tenancyId, amount, scheduleIds, channel })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to initiate payment');
  }
  return res.json();
}

export interface FeeBreakdown {
  principalAmount: number;
  serviceFee: number;
  totalCharge: number;
  feeMode: string;
  feeDescription: string;
  currency: string;
}

/**
 * Preview fee breakdown before initiating payment.
 */
export async function calculateFee(tenancyId: string, amount: number): Promise<FeeBreakdown> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/calculate-fee`, {
    method: 'POST',
    body: JSON.stringify({ tenancyId, amount })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to calculate fee');
  }
  return res.json();
}

export async function verifyPayment(reference: string): Promise<{ success: boolean; payment?: any }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/verify/${reference}`);
  return res.json();
}

// =====================================================
// CRYPTO (USDT) PAYMENT API
// =====================================================

export interface CryptoStatus {
  available: boolean;
  network: string;
  contractAddress: string | null;
}

export interface CryptoInitResult {
  contractAddress: string;
  recipientEntityId: string;
  recipientWallet: string;
  principalUSDT: number;
  feeUSDT: number;
  totalUSDT: number;
  principalSubunits: string;
  feeSubunits: string;
  totalSubunits: string;
  exchangeRate: number;
  referenceHash: string;
  paymentReference: string;
  abiEncodedMetadata: string;
  contractPaymentType: number;
  rateSource: string;
  rateTimestamp: string;
}

export interface CryptoVerifyResult {
  success: boolean;
  paymentReference?: string;
  txHash?: string;
  blockNumber?: number;
  payerWallet?: string;
  recipientWallet?: string;
  principalUSDT?: number;
  feeUSDT?: number;
  error?: string;
}

/** Check if USDT payment rail is configured */
export async function getCryptoStatus(): Promise<CryptoStatus> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/crypto/status`);
  return res.json();
}

/** Initialize a USDT crypto payment (pre-flight before wallet signing) */
export async function initiateCryptoPayment(
  tenancyId: string,
  amount: number,
  payerWalletAddress: string,
  scheduleIds?: string[],
): Promise<CryptoInitResult> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/crypto/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenancyId, amount, payerWalletAddress, scheduleIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to initiate crypto payment');
  }
  return res.json();
}

/** Verify on-chain transaction after user submits it */
export async function verifyCryptoPayment(txHash: string): Promise<CryptoVerifyResult> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/crypto/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  });
  return res.json();
}

// =====================================================
// UNIFIED CRYPTO PAYMENT — ANY COIN → ANY COIN
// =====================================================

export interface SettlementCoin {
  id: string;
  coin_symbol: string;
  chain: string;
  display_name: string;
  nowpayments_ticker: string;
  address_regex: string;
  is_evm_native: boolean;
  is_active: boolean;
  logo_url?: string | null;
  coin_name?: string;
}

export interface CryptoEstimate {
  amountGhs: number;
  amountUsd: number;
  platformFeeGhs: number;
  platformFeeUsd: number;
  totalChargeGhs: number;
  totalChargeUsd: number;
  feeDescription: string;
  payCurrency: string;
  estimatedPayAmount: number;
  minimumPayAmount: number;
  isBelowMinimum: boolean;
  error?: string;
}

export interface UnifiedCryptoResult {
  route: 'on_chain' | 'nowpayments';
  settlementMode: 'direct' | 'escrow';
  onChainResult?: CryptoInitResult;
  nowPaymentsResult?: {
    paymentId: number;
    depositAddress: string;
    payAmount: number;
    payCurrency: string;
    priceAmountUsd: number;
    outcomeCurrency: string;
    estimatedOutcomeAmount?: number;
    expiresAt?: string;
    status: string;
  };
  invoiceUrl?: string;
  paymentReference: string;
  description: string;
}

export interface NowPaymentsStatus {
  paymentId: number;
  status: string;
  actuallyPaid: number;
  payAmount: number;
  payCurrency: string;
  outcomeAmount: number;
  outcomeCurrency: string;
  updatedAt: string;
}

/** Get list of supported crypto coins for payment */
export async function getSettlementCoins(): Promise<SettlementCoin[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/crypto/settlement-coins`);
  const data = await res.json();
  return data.coins || [];
}

/** Get estimated conversion amount before paying */
export async function getCryptoEstimate(
  amount: number,
  payCurrency: string,
  payChain?: string,
  tenancyId?: string,
): Promise<CryptoEstimate> {
  const params = new URLSearchParams({ amount: amount.toString(), payCurrency });
  if (payChain) params.set('payChain', payChain);
  if (tenancyId) params.set('tenancyId', tenancyId);
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/crypto/estimate?${params}`);
  return res.json();
}

/** Initialize a unified crypto payment (any coin → any coin) */
export async function initiateUnifiedCrypto(params: {
  tenancyId: string;
  amount: number;
  payerCurrency: string;
  payerChain: string;
  payerWalletAddress?: string;
  scheduleIds?: string[];
}): Promise<UnifiedCryptoResult> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/crypto/unified-initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to initiate crypto payment');
  }
  return res.json();
}

/** Poll NOWPayments payment status */
export async function getNowPaymentsStatus(paymentId: number): Promise<NowPaymentsStatus> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/payments/crypto/nowpayments-status/${paymentId}`);
  return res.json();
}

// =====================================================
// MAINTENANCE REQUESTS
// =====================================================

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  propertyTitle: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  title: string;
  description: string;
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  location?: string;
  scheduledDate?: string;
  completedAt?: string;
  vendorName?: string;
  estimatedCost?: number;
  actualCost?: number;
}

export interface CreateMaintenanceParams {
  title: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  description: string;
  location?: string;
  preferredContactMethod?: 'phone' | 'email' | 'sms';
  preferredTimeSlot?: string;
  images?: File[];
}

export async function getMaintenanceRequests(tenancyId: string): Promise<MaintenanceRequest[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/maintenance/${tenancyId}`);
  if (!res.ok) throw new Error('Failed to fetch maintenance requests');
  const data = await res.json();
  // Handle both wrapped {workOrders: [...]} and raw array responses
  return data.workOrders || (Array.isArray(data) ? data : []);
}

export async function getMaintenanceStatus(workOrderId: string): Promise<MaintenanceRequest> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/maintenance/status/${workOrderId}`);
  if (!res.ok) throw new Error('Failed to fetch maintenance status');
  return res.json();
}

export async function createMaintenanceRequest(tenancyId: string, params: CreateMaintenanceParams): Promise<MaintenanceRequest> {
  const token = getSessionToken();
  if (!token) throw new Error('Not authenticated');

  // Use FormData for file uploads
  const formData = new FormData();
  formData.append('tenancyId', tenancyId);
  formData.append('title', params.title);
  formData.append('category', params.category);
  formData.append('priority', params.priority);
  formData.append('description', params.description);
  if (params.location) formData.append('location', params.location);
  if (params.preferredContactMethod) formData.append('preferredContactMethod', params.preferredContactMethod);
  if (params.preferredTimeSlot) formData.append('preferredTimeSlot', params.preferredTimeSlot);

  // Append images if present
  if (params.images) {
    params.images.forEach((file, idx) => {
      formData.append('images', file);
    });
  }

  const res = await fetch(`${API_URL}/api/v1/tenant-portal/maintenance`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create maintenance request');
  }
  return res.json();
}

// =====================================================
// DOCUMENTS
// =====================================================

export interface TenantDocument {
  id: string;
  documentType: string;
  title?: string;
  description?: string;
  fileName?: string;
  filename?: string;
  fileUrl?: string;
  downloadUrl?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  isVerified?: boolean;
  uploadedBy?: string;
  uploadedAt?: string;
  createdAt?: string;
}

export async function getTenantDocuments(tenancyId: string): Promise<TenantDocument[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/documents/${tenancyId}`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  const data = await res.json();
  return data.documents || [];
}

export async function uploadTenantDocument(
  tenancyId: string,
  file: File,
  documentType: string,
  title?: string,
  description?: string
): Promise<TenantDocument> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tenancyId', tenancyId);
  formData.append('documentType', documentType);
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);

  const token = getSessionToken();
  const res = await fetch(`${API_URL}/api/v1/tenant-portal/documents/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload document');
  }
  const data = await res.json();
  return data.document;
}

// =====================================================
// SESSIONS
// =====================================================

export interface TenantSession {
  id: string;
  authMethod: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

export async function getActiveSessions(): Promise<TenantSession[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  const data = await res.json();
  return data.sessions || [];
}

export async function revokeSession(sessionId: string): Promise<void> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to revoke session');
}

// =====================================================
// PASSWORD CHANGE
// =====================================================

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to change password');
  return data;
}

// =====================================================
// TWO-FACTOR AUTH
// =====================================================

export async function get2FAStatus(): Promise<{ enabled: boolean; method: string }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/2fa/status`);
  if (!res.ok) throw new Error('Failed to get 2FA status');
  return res.json();
}

export async function enable2FA(method: 'email' | 'sms'): Promise<{ success: boolean; message: string }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/2fa/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to enable 2FA');
  return data;
}

export async function verify2FA(otp: string, method: 'email' | 'sms'): Promise<{ success: boolean }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, method }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid verification code');
  return data;
}

export async function disable2FA(password: string): Promise<{ success: boolean }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/2fa/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to disable 2FA');
  return data;
}

// =====================================================
// NOTIFICATIONS
// =====================================================

export interface TenantNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export async function getNotifications(limit?: number): Promise<{ notifications: TenantNotification[]; unreadCount: number }> {
  const url = `${API_URL}/api/v1/tenant-portal/notifications${limit ? `?limit=${limit}` : ''}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function markNotificationRead(id: string): Promise<void> {
  await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/notifications/mark-all-read`, { method: 'POST' });
}

// =====================================================
// MESSAGING
// =====================================================

export interface Conversation {
  id: string;
  tenancyId: string;
  organizationName: string;
  subject: string;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
}

export interface Message {
  id: string;
  senderType: 'tenant' | 'landlord' | 'system';
  senderId?: string;
  content: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  isRead: boolean;
  createdAt: string;
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/conversations`);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  const data = await res.json();
  return data.conversations || [];
}

export async function createConversation(tenancyId: string, subject: string, message: string): Promise<Conversation> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenancyId, subject, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create conversation');
  return data.conversation;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  const data = await res.json();
  return data.messages || [];
}

export async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send message');
  return data.message;
}

// ─── Utility Charges ───────────────────────────────────────────

export type UtilityType = 'electricity' | 'water' | 'gas' | 'internet' | 'waste' | 'security' | 'sewage' | 'maintenance' | 'other';
export type UtilityChargeStatus = 'pending' | 'applied' | 'paid' | 'waived' | 'disputed';

export interface UtilityCharge {
  id: string;
  tenancy_id: string;
  utility_type: UtilityType;
  billing_period_start: string;
  billing_period_end: string;
  amount: number;
  currency: string;
  description?: string;
  status: UtilityChargeStatus;
  applied_to_schedule_id?: string;
  applied_at?: string;
  dispute_reason?: string;
  dispute_resolved_at?: string;
  dispute_resolution?: string;
  created_at: string;
  schedule_period_number?: number;
  schedule_due_date?: string;
  evidence_url?: string;
}

export async function getUtilityCharges(tenancyId: string): Promise<{ charges: UtilityCharge[] }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/utility-charges/${tenancyId}`);
  if (!res.ok) throw new Error('Failed to fetch utility charges');
  return res.json();
}

export async function disputeUtilityCharge(chargeId: string, reason: string): Promise<{ charge: UtilityCharge }> {
  const res = await authenticatedFetch(`${API_URL}/api/v1/tenant-portal/utility-charges/${chargeId}/dispute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to dispute charge');
  return data;
}
