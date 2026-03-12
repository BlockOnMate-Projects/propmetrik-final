/**
 * E-Sign shared types
 */

// ─── Core Types ─────────────────────────────────────────

export interface DocumentFile {
  id: string;
  name: string;
  source: 'desktop' | 'google-drive';
  file?: File;
  driveId?: string;
  pageCount?: number;
  previewUrl?: string;
  pdfBytes?: ArrayBuffer;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'cc' | 'viewer';
  color: string;
  order: number;
}

export interface SignatureData {
  type: 'typed' | 'drawn' | 'uploaded';
  data: string; // Base64 image data URL
  fontFamily?: string;
}

export interface PlacedField {
  id: string;
  type: FieldType;
  recipientId: string;
  documentId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
  signatureData?: SignatureData;
  value?: string;
}

export type FieldType =
  | 'signature'
  | 'initial'
  | 'stamp'
  | 'date_signed'
  | 'name'
  | 'email'
  | 'company'
  | 'title'
  | 'text'
  | 'number'
  | 'checkbox'
  | 'dropdown'
  | 'radio';

// ─── Field Definitions ────────────────────────────────────

export const STANDARD_FIELDS: { type: FieldType; label: string; icon: string }[] = [
  { type: 'signature', label: 'Signature', icon: '✍️' },
  { type: 'initial', label: 'Initial', icon: '🔤' },
  { type: 'stamp', label: 'Stamp', icon: '🔖' },
  { type: 'date_signed', label: 'Date Signed', icon: '📅' },
  { type: 'name', label: 'Name', icon: '👤' },
  { type: 'email', label: 'Email', icon: '📧' },
  { type: 'company', label: 'Company', icon: '🏢' },
  { type: 'title', label: 'Title', icon: '💼' },
];

export const DATA_FIELDS: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: '📝' },
  { type: 'number', label: 'Number', icon: '🔢' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { type: 'dropdown', label: 'Dropdown', icon: '📋' },
  { type: 'radio', label: 'Radio', icon: '🔘' },
];

export const ALL_FIELDS = [...STANDARD_FIELDS, ...DATA_FIELDS];

export function getFieldDef(type: string) {
  return ALL_FIELDS.find(f => f.type === type);
}

// ─── Envelope Types ──────────────────────────────────────

export type EnvelopeStatus = 'draft' | 'pending' | 'in_progress' | 'sent' | 'delivered' | 'completed' | 'voided' | 'declined';

export interface Envelope {
  id: string;
  name?: string;
  subject?: string;
  message?: string;
  status: EnvelopeStatus;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  completed_at?: string;
  completedAt?: string;
  voided_at?: string;
  voidedAt?: string;
  context_type?: string;
  context_entity_name?: string;
  signers?: EnvelopeSigner[];
  documents?: EnvelopeDocument[];
  audit_log?: AuditEntry[];
  auditLog?: AuditEntry[];
}

export interface EnvelopeSigner {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  signing_order?: number;
  signingOrder?: number;
  signed_at?: string;
  signedAt?: string;
  declined_at?: string;
  decline_reason?: string;
  signing_url?: string;
}

export interface EnvelopeDocument {
  id: string;
  name?: string;
  filename?: string;
  url?: string;
  document_url?: string;
  download_url?: string;
  mime_type?: string;
  mimeType?: string;
  size?: number;
}

export interface AuditEntry {
  id?: string;
  action?: string;
  event_type?: string;
  eventType?: string;
  actor_name?: string;
  actor_email?: string;
  ip_address?: string;
  created_at?: string;
  createdAt?: string;
  timestamp?: string;
  details?: string | Record<string, any>;
}

// ─── Template Types ────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  fields?: any[];
  recipients?: any[];
}

// ─── Stats ─────────────────────────────────────────────

export interface ESignStats {
  total: number;
  pending: number;
  completed: number;
  voided: number;
  declined: number;
}

// ─── External Document Data (from PM/CRM/Valuation integration) ──

export interface ExternalDocumentData {
  documentUrl: string;
  documentKey: string;
  filename: string;
  subject: string;
  message: string;
  signers: Array<{ name: string; email: string; role: string }>;
  tenancyId?: string;
  applicationId?: string;
  propertyName?: string;
}

// ─── Recipient Colors ───────────────────────────────────

export const RECIPIENT_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c',
  '#0891b2', '#4f46e5', '#be123c', '#15803d', '#c2410c',
];
