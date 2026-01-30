import { useEffect, useState } from 'react';
import { getInboxSignatureRequests } from '../api';
import { toast } from 'react-toastify';
import './InboxList.css';

interface Signer {
  id: number;
  email: string;
  full_name?: string;
  status: string;
  signed_at?: string;
}

interface InboxRequest {
  id: number;
  title: string;
  message?: string;
  status: string;
  created_at: string;
  expires_at?: string;
  document: {
    id: number;
    title: string;
  };
  creator: {
    email: string;
    full_name?: string;
  };
  signers: Signer[];
}

interface InboxListProps {
  refreshTrigger: number;
}

function InboxList({ refreshTrigger }: InboxListProps) {
  const [requests, setRequests] = useState<InboxRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'signed'>('all');

  useEffect(() => {
    loadInboxRequests();
  }, [refreshTrigger, filter]);

  const loadInboxRequests = async () => {
    try {
      setLoading(true);
      const statusFilter = filter === 'all' ? undefined : filter;
      const response = await getInboxSignatureRequests(0, 50, statusFilter);
      setRequests(response.data.signature_requests || []);
    } catch (error: any) {
      console.error('Failed to load inbox:', error);
      toast.error('Failed to load pending signatures');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { text: string; className: string } } = {
      pending: { text: 'Pending', className: 'status-pending' },
      signed: { text: 'Signed', className: 'status-signed' },
      declined: { text: 'Declined', className: 'status-declined' },
    };

    const statusInfo = statusMap[status] || { text: status, className: '' };

    return (
      <span className={`status-badge ${statusInfo.className}`}>
        {statusInfo.text}
      </span>
    );
  };

  const getMySignerStatus = (request: InboxRequest): string => {
    // Get current user email from somewhere (you may need to pass it as prop)
    const userEmail = localStorage.getItem('userEmail'); // Or get from context/props
    const mySigner = request.signers?.find(s => s.email === userEmail);
    return mySigner?.status || 'pending';
  };

  const handleSign = (request: InboxRequest) => {
    const mySigner = request.signers?.find(s => s.email === localStorage.getItem('userEmail'));
    if (mySigner) {
      // Navigate to signing page
      window.location.href = `/sign/${mySigner.id}`;
    }
  };

  const isExpired = (expiresAt?: string): boolean => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="inbox-loading">
        <div className="spinner"></div>
        <p>Loading pending signatures...</p>
      </div>
    );
  }

  return (
    <div className="inbox-list">
      <div className="inbox-header">
        <h2>📥 Pending Signatures</h2>
        <div className="inbox-filters">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button
            className={`filter-btn ${filter === 'signed' ? 'active' : ''}`}
            onClick={() => setFilter('signed')}
          >
            Signed
          </button>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="inbox-empty">
          <div className="empty-icon">📭</div>
          <h3>No pending signatures</h3>
          <p>When someone requests your signature, it will appear here.</p>
        </div>
      ) : (
        <div className="inbox-grid">
          {requests.map((request) => {
            const myStatus = getMySignerStatus(request);
            const expired = isExpired(request.expires_at);
            const canSign = myStatus === 'pending' && !expired;

            return (
              <div key={request.id} className={`inbox-card ${expired ? 'expired' : ''}`}>
                <div className="card-header">
                  <div className="card-title">
                    <h3>{request.document.title}</h3>
                    {getStatusBadge(myStatus)}
                  </div>
                  {expired && (
                    <span className="expired-badge">⏰ Expired</span>
                  )}
                </div>

                <div className="card-body">
                  <div className="card-info">
                    <span className="info-label">From:</span>
                    <span className="info-value">
                      {request.creator?.full_name || request.creator?.email}
                    </span>
                  </div>

                  {request.message && (
                    <div className="card-message">
                      <span className="info-label">Message:</span>
                      <p>{request.message}</p>
                    </div>
                  )}

                  <div className="card-meta">
                    <span className="meta-item">
                      📅 Requested: {new Date(request.created_at).toLocaleDateString()}
                    </span>
                    {request.expires_at && (
                      <span className="meta-item">
                        ⏳ Expires: {new Date(request.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {request.signers && request.signers.length > 1 && (
                    <div className="signers-progress">
                      <span className="info-label">Signers:</span>
                      <div className="signers-list">
                        {request.signers.map((signer) => (
                          <div key={signer.id} className="signer-item">
                            <span>{signer.full_name || signer.email}</span>
                            {getStatusBadge(signer.status)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="card-footer">
                  {canSign ? (
                    <button
                      className="sign-btn primary"
                      onClick={() => handleSign(request)}
                    >
                      ✍️ Review & Sign
                    </button>
                  ) : myStatus === 'signed' ? (
                    <button className="sign-btn signed" disabled>
                      ✅ Signed
                    </button>
                  ) : myStatus === 'declined' ? (
                    <span className="declined-text">❌ Declined</span>
                  ) : expired ? (
                    <span className="expired-text">⏰ Expired</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default InboxList;
