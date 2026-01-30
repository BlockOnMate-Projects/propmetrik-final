import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { getSignerInfo, signDocumentPublic, declineSignature } from '../api';
import { toast } from 'react-toastify';
import './SignaturePage.css';

interface SignerInfo {
  request_id: number;
  request_title: string;
  request_message: string;
  document_id: number;
  document_title: string;
  signer_name: string;
  signer_email: string;
  signer_order: number;
  status: string;
  can_sign: boolean;
}

function SignaturePage() {
  const { accessToken } = useParams<{ accessToken: string }>();
  const sigCanvas = useRef<SignatureCanvas>(null);
  
  const [signerInfo, setSignerInfo] = useState<SignerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  useEffect(() => {
    if (accessToken) {
      loadSignerInfo();
    }
  }, [accessToken]);

  const loadSignerInfo = async () => {
    if (!accessToken) return;

    try {
      const response = await getSignerInfo(accessToken);
      const data = response.data;
      setSignerInfo(data);

      if (data.status === 'signed') {
        toast.info('This document has already been signed.');
      } else if (data.status === 'declined') {
        toast.warning('This signature request was declined.');
      } else if (!data.can_sign) {
        toast.warning('You cannot sign this document yet. Please wait for previous signers.');
      }
    } catch (error: any) {
      console.error('Failed to load signer info:', error);
      toast.error(error.response?.data?.detail || 'Failed to load signature request');
    } finally {
      setLoading(false);
    }
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
  };

  const handleSign = async () => {
    if (!signerInfo?.can_sign) {
      toast.error('You cannot sign this document at this time');
      return;
    }

    if (sigCanvas.current?.isEmpty()) {
      toast.error('Please provide your signature');
      return;
    }

    if (!accessToken) {
      toast.error('Invalid access token');
      return;
    }

    setSigning(true);

    try {
      const signatureData = sigCanvas.current?.toDataURL('image/png') || '';
      await signDocumentPublic(accessToken, signatureData, 'drawn');

      toast.success('Document signed successfully!');
      setTimeout(() => {
        setSignerInfo(prev => prev ? { ...prev, status: 'signed', can_sign: false } : null);
      }, 1000);
    } catch (error: any) {
      console.error('Failed to sign document:', error);
      toast.error(error.response?.data?.detail || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  const handleDecline = async () => {
    if (!declineReason.trim()) {
      toast.error('Please provide a reason for declining');
      return;
    }

    if (!accessToken) {
      toast.error('Invalid access token');
      return;
    }

    setSigning(true);

    try {
      await declineSignature(accessToken, declineReason);
      toast.success('Signature request declined');
      setShowDeclineDialog(false);
      setTimeout(() => {
        setSignerInfo(prev => prev ? { ...prev, status: 'declined', can_sign: false } : null);
      }, 1000);
    } catch (error: any) {
      console.error('Failed to decline:', error);
      toast.error(error.response?.data?.detail || 'Failed to decline signature request');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="signature-page">
        <div className="signature-container">
          <div className="card">
            <div className="loading">Loading signature request...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!signerInfo) {
    return (
      <div className="signature-page">
        <div className="signature-container">
          <div className="card">
            <h1>Invalid Signature Request</h1>
            <p>This signature request could not be found or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  const canInteract = signerInfo.status === 'pending' && signerInfo.can_sign;

  return (
    <div className="signature-page">
      <div className="signature-container">
        <div className="card">
          <h1>📝 {signerInfo.request_title}</h1>
          
          <div className="request-info">
            <div className="info-row">
              <span className="label">Document:</span>
              <span className="value">{signerInfo.document_title}</span>
            </div>
            <div className="info-row">
              <span className="label">Signer:</span>
              <span className="value">{signerInfo.signer_name} ({signerInfo.signer_email})</span>
            </div>
            <div className="info-row">
              <span className="label">Signing Order:</span>
              <span className="value">#{signerInfo.signer_order}</span>
            </div>
            <div className="info-row">
              <span className="label">Status:</span>
              <span className={`status-badge ${signerInfo.status}`}>
                {signerInfo.status.toUpperCase()}
              </span>
            </div>
            {signerInfo.request_message && (
              <div className="message-box">
                <strong>Message:</strong>
                <p>{signerInfo.request_message}</p>
              </div>
            )}
          </div>

          {signerInfo.status === 'signed' && (
            <div className="status-message success">
              ✅ You have already signed this document
            </div>
          )}

          {signerInfo.status === 'declined' && (
            <div className="status-message declined">
              ❌ You have declined this signature request
            </div>
          )}

          {signerInfo.status === 'pending' && !signerInfo.can_sign && (
            <div className="status-message warning">
              ⏳ Please wait for previous signers to complete before you can sign
            </div>
          )}

          {canInteract && (
            <>
              <p className="instruction">
                Please draw your signature in the box below using your mouse or touch screen.
              </p>

              <div className="signature-pad-container">
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{
                    className: 'signature-canvas',
                    width: 600,
                    height: 200,
                  }}
                />
              </div>

              <div className="signature-actions">
                <button 
                  onClick={clearSignature} 
                  className="clear-btn" 
                  disabled={signing}
                >
                  Clear
                </button>
                <button 
                  onClick={handleSign} 
                  className="sign-btn" 
                  disabled={signing}
                >
                  {signing ? 'Signing...' : '✍️ Sign Document'}
                </button>
                <button 
                  onClick={() => setShowDeclineDialog(true)} 
                  className="decline-btn"
                  disabled={signing}
                >
                  Decline
                </button>
              </div>
            </>
          )}

          {showDeclineDialog && (
            <div className="decline-dialog">
              <h3>Decline Signature Request</h3>
              <p>Please provide a reason for declining:</p>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Enter reason..."
                rows={4}
                disabled={signing}
              />
              <div className="dialog-actions">
                <button 
                  onClick={() => setShowDeclineDialog(false)} 
                  className="cancel-btn"
                  disabled={signing}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDecline} 
                  className="confirm-decline-btn"
                  disabled={signing}
                >
                  {signing ? 'Declining...' : 'Confirm Decline'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SignaturePage;
