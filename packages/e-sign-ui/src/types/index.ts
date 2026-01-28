/**
 * E-Sign UI Types
 * Shared types for electronic signature components
 */

// =====================================================
// SIGNATURE DATA TYPES
// =====================================================

export type SignatureType = 'drawn' | 'typed' | 'uploaded';

export interface SignatureData {
    type: SignatureType;
    data: string; // Base64 image data
    fontFamily?: string; // For typed signatures
}

export interface SignatureFont {
    id: string;
    name: string;
    fallback: string;
    preview: string;
}

// =====================================================
// FIELD TYPES
// =====================================================

export type SignatureFieldType = 'signature' | 'initials' | 'date_signed' | 'text' | 'checkbox';

export type SignerRole = 'sender' | 'signer_1' | 'signer_2' | 'signer_3' | 'witness_1' | 'witness_2';

export interface Signer {
    id: string;
    role: SignerRole;
    name: string;
    email: string;
    phone?: string;
    color: string;
    order: number;
    status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
    signedAt?: Date;
}

export interface SignatureField {
    id: string;
    type: SignatureFieldType;
    signerId: string;
    signerRole: SignerRole;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
    label?: string;
    placeholder?: string;
    value?: string;
    signedAt?: Date;
    signatureHash?: string;
    signatureId?: string;
}

// =====================================================
// COMPONENT PROPS TYPES
// =====================================================

export interface SignatureCaptureProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (data: SignatureData) => void;
    isInitials?: boolean;
    signerName?: string;
    /**
     * Theme variant for the modal
     * - 'dark': Dark theme (default for main dashboard)
     * - 'light': Light theme (default for external signing)
     */
    theme?: 'dark' | 'light';
}

export interface SignatureCanvasProps {
    width?: number;
    height?: number;
    className?: string;
    strokeColor?: string;
    strokeWidth?: number;
}

export interface SignatureVerificationProps {
    signerName: string;
    signerEmail: string;
    signatureHash: string;
    signerId: string;
    signedAt: Date;
    documentName?: string;
}
