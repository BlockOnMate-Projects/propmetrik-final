/**
 * Reports Components Index
 * 
 * Exports for report-related UI components.
 * Phase 3: Tiptap-based Report Editor
 * Phase 4: Approval & Digital Signature
 */

// Phase 3: Tiptap Report Editor & Photo Upload
export { ReportEditor } from './ReportEditor';
export { PhotoUploader } from './PhotoUploader';

// Phase 4: Approval Workflow
export { SignaturePad, type SignaturePadRef, type SignaturePadProps } from './SignaturePad';
export { ApprovalModal, type ApprovalModalProps, type ValuerCredentials, type ApprovalCheckResult, type ApprovalResult } from './ApprovalModal';
export { ReportVerificationPage } from './VerificationPage';
