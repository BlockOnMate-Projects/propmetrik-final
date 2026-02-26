'use client';

/**
 * ApprovalModal Component
 * 
 * Modal for report approval workflow with:
 * - Pre-approval checklist
 * - Valuer credential verification
 * - Digital signature requirement
 * - Approval confirmation
 * 
 * Phase 4: Week 7 - Approval Workflow
 */

import React, { useState, useEffect, useRef } from 'react';
import SignaturePad, { SignaturePadRef } from './SignaturePad';

// =====================================================
// TYPES
// =====================================================

export interface ValuerCredentials {
  id: string;
  name: string;
  title: string | null;
  qualifications: string | null;
  license_number: string | null;
  license_issuer: string | null;
  license_status: string;
  license_valid: boolean;
  pi_insured: boolean;
  pi_valid: boolean;
  has_signature: boolean;
  can_approve: boolean;
  issues: string[];
}

export interface ApprovalCheckResult {
  can_approve: boolean;
  reasons: string[];
}

export interface ApprovalResult {
  success: boolean;
  report_id: string;
  status: string;
  approved_at?: string;
  approved_by?: string;
  digital_seal_hash?: string;
  verification_url?: string;
  pdf?: {
    success: boolean;
    url?: string;
    error?: string;
  };
}

export interface ApprovalModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Report ID to approve */
  reportId: string;
  /** Valuer credentials */
  valuer: ValuerCredentials | null;
  /** Pre-approval check result */
  approvalCheck?: ApprovalCheckResult;
  /** Callback on successful approval */
  onApprovalComplete?: (result: ApprovalResult) => void;
  /** API base URL */
  apiBaseUrl?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  isOpen,
  onClose,
  reportId,
  valuer,
  approvalCheck,
  onApprovalComplete,
  apiBaseUrl = '/api',
}) => {
  const signatureRef = useRef<SignaturePadRef>(null);
  
  // State
  const [step, setStep] = useState<'checklist' | 'signature' | 'confirm' | 'complete'>('checklist');
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);
  const [comments, setComments] = useState('');
  const [generatePdf, setGeneratePdf] = useState(true);

  // Checklist items
  const [checklist, setChecklist] = useState({
    reviewedContent: false,
    verifiedData: false,
    confirmedCompliance: false,
    acceptResponsibility: false,
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('checklist');
      setHasSignature(valuer?.has_signature || false);
      setSignatureDataUrl(null);
      setError(null);
      setApprovalResult(null);
      setChecklist({
        reviewedContent: false,
        verifiedData: false,
        confirmedCompliance: false,
        acceptResponsibility: false,
      });
    }
  }, [isOpen, valuer]);

  // Check if checklist is complete
  const isChecklistComplete = Object.values(checklist).every(Boolean);

  // Check if can proceed to approval
  // Signature is collected in step 2 of the modal, so don't block on it in step 1
  const nonSignatureIssues = (valuer?.issues || []).filter(
    (issue: string) => !issue.toLowerCase().includes('signature')
  );
  const canProceed = approvalCheck?.can_approve && (valuer?.can_approve || nonSignatureIssues.length === 0);

  // Handle signature save
  const handleSignatureSave = async (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    
    // Upload signature to server if valuer doesn't have one
    if (!valuer?.has_signature) {
      try {
        const response = await fetch(`${apiBaseUrl}/valuers/${valuer?.id}/signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature_data_url: dataUrl }),
        });

        if (!response.ok) {
          throw new Error('Failed to save signature');
        }

        setHasSignature(true);
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  // Handle approval submission
  const handleApprove = async () => {
    if (!valuer) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/reports/${reportId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuer_id: valuer.id,
          comments: comments || undefined,
          generate_pdf: generatePdf,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Approval failed');
      }

      setApprovalResult(result);
      setStep('complete');
      onApprovalComplete?.(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="approval-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        className="approval-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Header */}
        <div className="modal-header">
          <h2>Approve Valuation Report</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {/* Error message */}
          {error && (
            <div className="error-message">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Step 1: Checklist */}
          {step === 'checklist' && (
            <div className="step-content">
              <h3>Pre-Approval Checklist</h3>
              
              {/* Valuer info */}
              {valuer && (
                <div className="valuer-info">
                  <div className="valuer-name">{valuer.name}</div>
                  <div className="valuer-details">
                    {valuer.title && <span>{valuer.title}</span>}
                    {valuer.license_number && (
                      <span>License: {valuer.license_number}</span>
                    )}
                  </div>
                  {!valuer.can_approve && (
                    <div className="valuer-issues">
                      {valuer.issues.map((issue, i) => (
                        <div key={i} className="issue-item">⚠️ {issue}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Approval check results */}
              {approvalCheck && !approvalCheck.can_approve && (
                <div className="approval-issues">
                  <h4>Cannot Approve:</h4>
                  {approvalCheck.reasons.map((reason, i) => (
                    <div key={i} className="issue-item">❌ {reason}</div>
                  ))}
                </div>
              )}

              {/* Checklist */}
              <div className="checklist">
                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.reviewedContent}
                    onChange={(e) => setChecklist(prev => ({
                      ...prev,
                      reviewedContent: e.target.checked,
                    }))}
                    disabled={!canProceed}
                  />
                  <span>I have reviewed all report content for accuracy</span>
                </label>

                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.verifiedData}
                    onChange={(e) => setChecklist(prev => ({
                      ...prev,
                      verifiedData: e.target.checked,
                    }))}
                    disabled={!canProceed}
                  />
                  <span>I have verified the valuation data and calculations</span>
                </label>

                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.confirmedCompliance}
                    onChange={(e) => setChecklist(prev => ({
                      ...prev,
                      confirmedCompliance: e.target.checked,
                    }))}
                    disabled={!canProceed}
                  />
                  <span>This report complies with RICS/GhIS standards</span>
                </label>

                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checklist.acceptResponsibility}
                    onChange={(e) => setChecklist(prev => ({
                      ...prev,
                      acceptResponsibility: e.target.checked,
                    }))}
                    disabled={!canProceed}
                  />
                  <span>I accept professional responsibility for this valuation</span>
                </label>
              </div>

              <div className="step-actions">
                <button className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={() => setStep('signature')}
                  disabled={!isChecklistComplete || !canProceed}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Signature */}
          {step === 'signature' && (
            <div className="step-content">
              <h3>Digital Signature</h3>
              
              {valuer?.has_signature ? (
                <div className="existing-signature">
                  <p>✓ Using signature on file</p>
                  <p className="signature-note">
                    Your saved digital signature will be applied to this report.
                  </p>
                </div>
              ) : (
                <div className="signature-capture">
                  <p>Please sign below to confirm your approval:</p>
                  <SignaturePad
                    ref={signatureRef}
                    width={400}
                    height={150}
                    onSave={handleSignatureSave}
                    onChange={(isEmpty) => setHasSignature(!isEmpty || !!signatureDataUrl)}
                  />
                </div>
              )}

              <div className="step-actions">
                <button className="btn-secondary" onClick={() => setStep('checklist')}>
                  Back
                </button>
                <button
                  className="btn-primary"
                  onClick={() => setStep('confirm')}
                  disabled={!hasSignature && !signatureDataUrl}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 'confirm' && (
            <div className="step-content">
              <h3>Confirm Approval</h3>
              
              <div className="confirmation-summary">
                <div className="summary-item">
                  <span className="label">Report ID:</span>
                  <span className="value">{reportId.substring(0, 8)}...</span>
                </div>
                <div className="summary-item">
                  <span className="label">Valuer:</span>
                  <span className="value">{valuer?.name}</span>
                </div>
                <div className="summary-item">
                  <span className="label">License:</span>
                  <span className="value">{valuer?.license_number || 'N/A'}</span>
                </div>
              </div>

              <div className="options">
                <label className="option-item">
                  <input
                    type="checkbox"
                    checked={generatePdf}
                    onChange={(e) => setGeneratePdf(e.target.checked)}
                  />
                  <span>Generate PDF with digital seal and QR code</span>
                </label>
              </div>

              <div className="comments-field">
                <label>Comments (optional):</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Add any notes about this approval..."
                  rows={3}
                />
              </div>

              <div className="warning-box">
                <strong>⚠️ This action cannot be undone.</strong>
                <p>
                  Once approved, the report will be locked and a digital seal will be
                  applied. The report can only be revised by creating a new version.
                </p>
              </div>

              <div className="step-actions">
                <button className="btn-secondary" onClick={() => setStep('signature')}>
                  Back
                </button>
                <button
                  className="btn-approve"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Approving...' : 'Approve Report'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && approvalResult && (
            <div className="step-content">
              <div className="success-icon">✓</div>
              <h3>Report Approved</h3>
              
              <div className="result-summary">
                <div className="summary-item">
                  <span className="label">Status:</span>
                  <span className="value status-approved">Approved</span>
                </div>
                <div className="summary-item">
                  <span className="label">Approved At:</span>
                  <span className="value">
                    {new Date(approvalResult.approved_at!).toLocaleString()}
                  </span>
                </div>
                {approvalResult.digital_seal_hash && (
                  <div className="summary-item">
                    <span className="label">Digital Seal:</span>
                    <span className="value hash">
                      {approvalResult.digital_seal_hash.substring(0, 16)}...
                    </span>
                  </div>
                )}
                {approvalResult.pdf?.success && (
                  <div className="summary-item">
                    <span className="label">PDF:</span>
                    <span className="value">✓ Generated</span>
                  </div>
                )}
              </div>

              {approvalResult.verification_url && (
                <div className="verification-info">
                  <p>Verification URL:</p>
                  <a href={approvalResult.verification_url} target="_blank" rel="noopener noreferrer">
                    {approvalResult.verification_url}
                  </a>
                </div>
              )}

              <div className="step-actions">
                <button className="btn-primary" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Styles */}
        <style jsx>{`
          .approval-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .approval-modal {
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 560px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #e2e8f0;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 20px;
            color: #1a202c;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: #718096;
            line-height: 1;
          }

          .modal-content {
            padding: 24px;
          }

          .error-message {
            background: #fed7d7;
            color: #c53030;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
          }

          .step-content h3 {
            margin: 0 0 20px;
            font-size: 18px;
            color: #2d3748;
          }

          .valuer-info {
            background: #f7fafc;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
          }

          .valuer-name {
            font-weight: 600;
            font-size: 16px;
            color: #2d3748;
          }

          .valuer-details {
            font-size: 14px;
            color: #718096;
            margin-top: 4px;
          }

          .valuer-details span:not(:last-child)::after {
            content: ' • ';
          }

          .valuer-issues, .approval-issues {
            background: #fffaf0;
            border: 1px solid #ed8936;
            padding: 12px;
            border-radius: 8px;
            margin-top: 12px;
          }

          .issue-item {
            font-size: 14px;
            color: #c05621;
            margin: 4px 0;
          }

          .checklist {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 24px;
          }

          .checklist-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            cursor: pointer;
          }

          .checklist-item input {
            margin-top: 3px;
          }

          .checklist-item span {
            font-size: 14px;
            color: #4a5568;
          }

          .step-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
          }

          .btn-secondary {
            padding: 10px 20px;
            border: 1px solid #e2e8f0;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            color: #4a5568;
          }

          .btn-primary {
            padding: 10px 20px;
            border: none;
            background: #3182ce;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          }

          .btn-primary:disabled, .btn-approve:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .btn-approve {
            padding: 10px 24px;
            border: none;
            background: #38a169;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
          }

          .existing-signature {
            background: #f0fff4;
            padding: 16px;
            border-radius: 8px;
            text-align: center;
          }

          .signature-note {
            font-size: 14px;
            color: #718096;
            margin-top: 8px;
          }

          .confirmation-summary, .result-summary {
            background: #f7fafc;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
          }

          .summary-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
          }

          .summary-item:last-child {
            border-bottom: none;
          }

          .summary-item .label {
            color: #718096;
            font-size: 14px;
          }

          .summary-item .value {
            font-weight: 500;
            font-size: 14px;
            color: #2d3748;
          }

          .status-approved {
            color: #38a169;
          }

          .hash {
            font-family: monospace;
            font-size: 12px;
          }

          .options {
            margin-bottom: 16px;
          }

          .option-item {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          }

          .comments-field {
            margin-bottom: 16px;
          }

          .comments-field label {
            display: block;
            font-size: 14px;
            color: #4a5568;
            margin-bottom: 8px;
          }

          .comments-field textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 14px;
            resize: vertical;
          }

          .warning-box {
            background: #fffaf0;
            border: 1px solid #ed8936;
            padding: 16px;
            border-radius: 8px;
          }

          .warning-box strong {
            color: #c05621;
          }

          .warning-box p {
            margin: 8px 0 0;
            font-size: 14px;
            color: #744210;
          }

          .success-icon {
            width: 60px;
            height: 60px;
            background: #38a169;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            margin: 0 auto 16px;
          }

          .verification-info {
            background: #ebf8ff;
            padding: 16px;
            border-radius: 8px;
            text-align: center;
          }

          .verification-info p {
            font-size: 14px;
            color: #4a5568;
            margin: 0 0 8px;
          }

          .verification-info a {
            color: #3182ce;
            word-break: break-all;
            font-size: 14px;
          }
        `}</style>
      </div>
    </div>
  );
};

export default ApprovalModal;
