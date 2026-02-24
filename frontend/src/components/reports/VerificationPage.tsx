'use client';

/**
 * Report Verification Page
 * 
 * Public page for verifying valuation reports by scanning QR codes
 * or entering report IDs/verification hashes.
 * 
 * Phase 4: Week 8 - Verification Page
 */

import React, { useState, useEffect } from 'react';

// =====================================================
// TYPES
// =====================================================

interface ValuerInfo {
  id: string;
  name: string;
  title: string | null;
  qualifications: string | null;
  license_number: string | null;
  license_issuer: string | null;
  license_status: string;
  license_valid: boolean;
}

interface VerificationResult {
  valid: boolean;
  status: string;
  approved_at?: string;
  approved_by?: string;
  digital_seal_hash?: string;
  verification_url?: string;
  valuer?: ValuerInfo;
  error?: string;
}

interface ReportVerificationPageProps {
  /** Report ID from URL params */
  reportId?: string;
  /** Hash from URL query params */
  hash?: string;
  /** API base URL */
  apiBaseUrl?: string;
}

// =====================================================
// COMPONENT
// =====================================================

export const ReportVerificationPage: React.FC<ReportVerificationPageProps> = ({
  reportId: initialReportId,
  hash: initialHash,
  apiBaseUrl = '/api',
}) => {
  const [reportId, setReportId] = useState(initialReportId || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-verify if reportId provided
  useEffect(() => {
    if (initialReportId) {
      handleVerify(initialReportId);
    } else if (initialHash) {
      handleVerifyByHash(initialHash);
    }
  }, [initialReportId, initialHash]);

  // Verify by report ID
  const handleVerify = async (id?: string) => {
    const targetId = id || reportId;
    if (!targetId) return;

    setIsVerifying(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/reports/${targetId}/verify`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Verification failed');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Verify by hash
  const handleVerifyByHash = async (verifyHash: string) => {
    setIsVerifying(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/reports/verify/${verifyHash}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Verification failed');
      }

      setResult({
        valid: data.valid,
        status: data.report?.status || 'unknown',
        approved_at: data.report?.approved_at,
        digital_seal_hash: data.hash,
        valuer: data.valuer,
        error: data.error,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleVerify();
  };

  return (
    <div className="verification-page">
      <div className="verification-container">
        {/* Header */}
        <div className="header">
          <div className="logo">PROPMETRIK</div>
          <h1>Report Verification</h1>
          <p className="subtitle">
            Verify the authenticity of a valuation report
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="search-form">
          <div className="input-group">
            <input
              type="text"
              value={reportId}
              onChange={(e) => setReportId(e.target.value)}
              placeholder="Enter Report ID or Verification Hash"
              className="search-input"
            />
            <button
              type="submit"
              disabled={!reportId || isVerifying}
              className="verify-button"
            >
              {isVerifying ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>

        {/* Error message */}
        {error && (
          <div className="error-panel">
            <div className="error-icon">✕</div>
            <div className="error-content">
              <h3>Verification Failed</h3>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Verification result */}
        {result && (
          <div className={`result-panel ${result.valid ? 'valid' : 'invalid'}`}>
            {/* Status badge */}
            <div className="status-badge">
              <span className="status-icon">
                {result.valid ? '✓' : '✕'}
              </span>
              <span className="status-text">
                {result.valid ? 'Verified' : 'Not Verified'}
              </span>
            </div>

            {/* Result details */}
            {result.valid && (
              <div className="result-details">
                <div className="detail-section">
                  <h4>Report Status</h4>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="label">Status:</span>
                      <span className={`value status-${result.status}`}>
                        {result.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {result.approved_at && (
                      <div className="detail-item">
                        <span className="label">Approved:</span>
                        <span className="value">
                          {new Date(result.approved_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Digital seal */}
                {result.digital_seal_hash && (
                  <div className="detail-section">
                    <h4>Digital Seal</h4>
                    <div className="hash-display">
                      <code>{result.digital_seal_hash}</code>
                    </div>
                    <p className="hash-note">
                      This cryptographic hash confirms the document&apos;s integrity.
                      Any modification would produce a different hash.
                    </p>
                  </div>
                )}

                {/* Valuer information */}
                {result.valuer && (
                  <div className="detail-section">
                    <h4>Certified By</h4>
                    <div className="valuer-card">
                      <div className="valuer-avatar">
                        {result.valuer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="valuer-info">
                        <div className="valuer-name">{result.valuer.name}</div>
                        {result.valuer.title && (
                          <div className="valuer-title">{result.valuer.title}</div>
                        )}
                        <div className="valuer-credentials">
                          {result.valuer.license_number && (
                            <span className="credential">
                              <strong>License:</strong> {result.valuer.license_number}
                            </span>
                          )}
                          {result.valuer.license_issuer && (
                            <span className="credential">
                              <strong>Issuer:</strong> {result.valuer.license_issuer}
                            </span>
                          )}
                          <span className={`license-status ${result.valuer.license_valid ? 'valid' : 'invalid'}`}>
                            {result.valuer.license_valid ? '● Active License' : '○ License Invalid'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Trust indicators */}
                <div className="trust-indicators">
                  <div className="trust-item">
                    <span className="trust-icon">🔒</span>
                    <span>Digitally Signed</span>
                  </div>
                  <div className="trust-item">
                    <span className="trust-icon">📋</span>
                    <span>RICS/GhIS Compliant</span>
                  </div>
                  <div className="trust-item">
                    <span className="trust-icon">✓</span>
                    <span>Tamper-Evident</span>
                  </div>
                </div>
              </div>
            )}

            {/* Invalid result message */}
            {!result.valid && (
              <div className="invalid-message">
                <p>
                  {result.error || 'This report could not be verified. It may not exist, may not be approved, or may have been modified.'}
                </p>
                <p className="warning">
                  ⚠️ Do not rely on this document for any official purpose.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="footer-info">
          <p>
            PROPMETRIK uses cryptographic digital seals to ensure document authenticity.
            Each approved report receives a unique SHA-256 hash that can be used to verify
            the document has not been altered.
          </p>
          <p className="contact">
            Questions? Contact <a href="mailto:verify@propmetrik.com">verify@propmetrik.com</a>
          </p>
        </div>
      </div>

      {/* Styles */}
      <style jsx>{`
        .verification-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 40px 20px;
        }

        .verification-container {
          max-width: 600px;
          margin: 0 auto;
        }

        .header {
          text-align: center;
          margin-bottom: 32px;
        }

        .logo {
          font-size: 24px;
          font-weight: 700;
          color: white;
          margin-bottom: 16px;
        }

        .header h1 {
          color: white;
          font-size: 32px;
          margin: 0 0 8px;
        }

        .subtitle {
          color: rgba(255, 255, 255, 0.8);
          font-size: 16px;
          margin: 0;
        }

        .search-form {
          margin-bottom: 24px;
        }

        .input-group {
          display: flex;
          gap: 12px;
          background: white;
          padding: 8px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .search-input {
          flex: 1;
          padding: 12px 16px;
          border: none;
          font-size: 16px;
          outline: none;
          background: transparent;
        }

        .verify-button {
          padding: 12px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .verify-button:hover:not(:disabled) {
          background: #5a6fd6;
        }

        .verify-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-panel, .result-panel {
          background: white;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .error-panel {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        .error-icon {
          width: 48px;
          height: 48px;
          background: #fed7d7;
          color: #c53030;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
        }

        .error-content h3 {
          margin: 0 0 8px;
          color: #c53030;
          font-size: 18px;
        }

        .error-content p {
          margin: 0;
          color: #742a2a;
        }

        .status-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 20px;
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .result-panel.valid .status-badge {
          background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
        }

        .result-panel.invalid .status-badge {
          background: linear-gradient(135deg, #fc8181 0%, #f56565 100%);
        }

        .status-icon {
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 24px;
        }

        .status-text {
          color: white;
          font-size: 24px;
          font-weight: 700;
        }

        .detail-section {
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid #e2e8f0;
        }

        .detail-section:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .detail-section h4 {
          margin: 0 0 12px;
          color: #4a5568;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-grid {
          display: grid;
          gap: 12px;
        }

        .detail-item {
          display: flex;
          gap: 8px;
        }

        .detail-item .label {
          color: #718096;
          min-width: 80px;
        }

        .detail-item .value {
          font-weight: 500;
          color: #2d3748;
        }

        .status-approved {
          color: #38a169;
        }

        .hash-display {
          background: #f7fafc;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
        }

        .hash-display code {
          font-family: monospace;
          font-size: 12px;
          color: #4a5568;
          word-break: break-all;
        }

        .hash-note {
          font-size: 13px;
          color: #718096;
          margin: 12px 0 0;
        }

        .valuer-card {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        .valuer-avatar {
          width: 48px;
          height: 48px;
          background: #667eea;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .valuer-info {
          flex: 1;
        }

        .valuer-name {
          font-size: 18px;
          font-weight: 600;
          color: #2d3748;
        }

        .valuer-title {
          font-size: 14px;
          color: #718096;
          margin-top: 2px;
        }

        .valuer-credentials {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .credential {
          font-size: 13px;
          color: #4a5568;
        }

        .license-status {
          font-size: 13px;
          font-weight: 500;
        }

        .license-status.valid {
          color: #38a169;
        }

        .license-status.invalid {
          color: #e53e3e;
        }

        .trust-indicators {
          display: flex;
          justify-content: center;
          gap: 24px;
          padding-top: 16px;
        }

        .trust-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #718096;
        }

        .trust-icon {
          font-size: 16px;
        }

        .invalid-message {
          text-align: center;
          padding: 16px;
        }

        .invalid-message p {
          color: #4a5568;
          margin: 0 0 16px;
        }

        .invalid-message .warning {
          color: #c05621;
          font-weight: 500;
        }

        .footer-info {
          background: rgba(255, 255, 255, 0.1);
          padding: 20px;
          border-radius: 12px;
          text-align: center;
        }

        .footer-info p {
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          margin: 0 0 12px;
          line-height: 1.6;
        }

        .contact {
          font-size: 13px;
        }

        .contact a {
          color: white;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default ReportVerificationPage;
