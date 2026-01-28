/**
 * E-Sign Components - Central Export
 * DocuSign-style electronic signature system
 * 
 * Note: SignatureCapture and related utilities are now imported from the
 * shared @propmetrik/e-sign-ui package for consistency across all frontends.
 */

export * from './types';
export { PDFViewer } from './PDFViewer';
export { ESignEditor } from './ESignEditor';
export { CertificateViewer } from './CertificateViewer';
export { ValuerSelectionModal } from './ValuerSelectionModal';

// Re-export from shared package for backwards compatibility
export { 
    SignatureCapture, 
    SignatureCanvas,
    SIGNATURE_FONTS,
    loadSignatureFonts,
    generateTypedSignatureImage,
    formatSignatureDate,
} from '@propmetrik/e-sign-ui';
