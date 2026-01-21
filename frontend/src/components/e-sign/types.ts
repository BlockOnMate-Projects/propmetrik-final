/**
 * E-Sign Component Types
 * DocuSign-style electronic signature system
 */

export type SignatureFieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox';

export type SignerRole = 'sender' | 'signer_1' | 'signer_2' | 'signer_3' | 'witness_1' | 'witness_2';

export interface Signer {
    id: string;
    role: SignerRole;
    name: string;
    email: string;
    phone?: string;
    color: string; // For visual distinction
    order: number; // Signing order
    status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
    signedAt?: Date;
}

export interface SignatureField {
    id: string;
    type: SignatureFieldType;
    signerId: string;
    signerRole: SignerRole;
    page: number;
    x: number; // Percentage from left
    y: number; // Percentage from top
    width: number; // Percentage of page width
    height: number; // Percentage of page height
    required: boolean;
    label?: string;
    placeholder?: string;
    value?: string; // Captured signature data (base64 for signature/initials)
    signedAt?: Date;
}

export interface SignatureData {
    type: 'drawn' | 'typed' | 'uploaded';
    data: string; // Base64 image data
    fontFamily?: string; // For typed signatures
}

export interface DocumentPage {
    pageNumber: number;
    width: number;
    height: number;
    imageUrl?: string; // Pre-rendered page image
}

export interface ESignDocument {
    id: string;
    name: string;
    type: 'pdf' | 'docx';
    url: string;
    totalPages: number;
    pages: DocumentPage[];
    status: 'draft' | 'sent' | 'in_progress' | 'completed' | 'voided' | 'declined';
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

export interface ESignEnvelope {
    id: string;
    name: string;
    documents: ESignDocument[];
    signers: Signer[];
    fields: SignatureField[];
    message?: string;
    status: 'draft' | 'sent' | 'in_progress' | 'completed' | 'voided' | 'declined';
    expiresAt?: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

// Field templates for quick placement
// Field templates - dimensions in pixels (will be scaled with document)
export interface FieldTemplate {
    type: SignatureFieldType;
    label: string;
    icon: string;
    defaultWidth: number;  // Base pixels at 100% scale
    defaultHeight: number; // Base pixels at 100% scale
}

export const FIELD_TEMPLATES: FieldTemplate[] = [
    { type: 'signature', label: 'Signature', icon: 'Pen', defaultWidth: 120, defaultHeight: 24 },
    { type: 'initials', label: 'Initials', icon: 'Type', defaultWidth: 50, defaultHeight: 24 },
    { type: 'date', label: 'Date Signed', icon: 'Calendar', defaultWidth: 80, defaultHeight: 20 },
    { type: 'text', label: 'Text', icon: 'AlignLeft', defaultWidth: 100, defaultHeight: 20 },
    { type: 'checkbox', label: 'Checkbox', icon: 'CheckSquare', defaultWidth: 18, defaultHeight: 18 },
];

// Signer colors for visual distinction
export const SIGNER_COLORS: Record<SignerRole, string> = {
    'sender': '#6B7280',
    'signer_1': '#3B82F6', // Blue
    'signer_2': '#10B981', // Green
    'signer_3': '#8B5CF6', // Purple
    'witness_1': '#F59E0B', // Amber
    'witness_2': '#EF4444', // Red
};

export const SIGNER_LABELS: Record<SignerRole, string> = {
    'sender': 'Sender',
    'signer_1': 'Signer 1',
    'signer_2': 'Signer 2',
    'signer_3': 'Signer 3',
    'witness_1': 'Witness 1',
    'witness_2': 'Witness 2',
};
