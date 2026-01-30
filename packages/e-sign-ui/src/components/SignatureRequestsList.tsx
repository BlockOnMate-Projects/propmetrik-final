import { useEffect, useState } from 'react';
import { getSignatureRequests, updateSignatureRequestStatus } from '../api';
import { toast } from 'react-toastify';
import './SignatureRequestsList.css';

interface SignatureRequest {
  id: number;
  title: string;
  status: string;
  created_at: string;
  expires_at?: string;
  completed_at?: string;
  signers: Array<{
    id: number;
    email: string;
    full_name?: string;
    status: string;
  }>;
}

interface SignatureRequestsListProps {
  refreshTrigger?: number;
}

function SignatureRequestsList({ refreshTrigger }: SignatureRequestsListProps) {
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = 10;

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await getSignatureRequests(page * limit, limit);
      setRequests(response.data.signature_requests || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to load signature requests:', error);
      toast.error('Failed to load signature requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [page, refreshTrigger]);

  const handleStatusUpdate = async (id: number, newStatus: string) => {
    if (!confirm(`Are you sure you want to mark this request as ${newStatus}?`)) {
      return;
    }

    try {
      await updateSignatureRequestStatus(id, newStatus);
      toast.success(`Status updated to ${newStatus}`);
      loadRequests();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'gray',
      pending: 'yellow',
      completed: 'green',
      cancelled: 'red',
      expired: 'red'
    };
    return colors[status] || 'gray';
  };

  const getSignerStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'yellow',
      signed: 'green',
      declined: 'red'
    };
    return colors[status] || 'gray';
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const totalPages = Math.ceil(total / limit);

  if (loading && requests.length === 0) {
    return <div className="loading">Loading signature requests...</div>;
  }

  return (
    <div className="signature-requests-list">
      <div className="list-header">
        <h3>✍️ Signature Requests ({total})</h3>
      </div>

      {requests.length === 0 ? (
        <div className="empty-state">
          <p>No signature requests yet. Create your first signature request to get started!</p>
        </div>
      ) : (
        <>
          <div className="requests-container">
            {requests.map((request) => {
              const isExpanded = expandedId === request.id;
              const signedCount = request.signers.filter(s => s.status === 'signed').length;
              const totalSigners = request.signers.length;

              return (
                <div key={request.id} className="request-card">
                  <div className="request-header" onClick={() => toggleExpand(request.id)}>
                    <div className="request-title">
                      <h4>{request.title}</h4>
                      <span className={`status-badge status-${getStatusColor(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                    <div className="request-meta">
                      <span className="progress">
                        {signedCount}/{totalSigners} signed
                      </span>
                      <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="request-details">
                      <div className="details-grid">
                        <div className="detail-item">
                          <strong>Created:</strong> {formatDate(request.created_at)}
                        </div>
                        {request.expires_at && (
                          <div className="detail-item">
                            <strong>Expires:</strong> {formatDate(request.expires_at)}
                          </div>
                        )}
                        {request.completed_at && (
                          <div className="detail-item">
                            <strong>Completed:</strong> {formatDate(request.completed_at)}
                          </div>
                        )}
                      </div>

                      <div className="signers-section">
                        <strong>Signers:</strong>
                        <div className="signers-list">
                          {request.signers.map((signer) => (
                            <div key={signer.id} className="signer-item">
                              <div className="signer-info">
                                <span className="signer-email">
                                  📧 {signer.email}
                                </span>
                                {signer.full_name && (
                                  <span className="signer-name">({signer.full_name})</span>
                                )}
                                <span className="email-sent-indicator" title="Email notification sent">
                                  ✓ Email Sent
                                </span>
                              </div>
                              <span className={`signer-status status-${getSignerStatusColor(signer.status)}`}>
                                {signer.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {request.status === 'pending' && (
                        <div className="request-actions">
                          <button
                            onClick={() => handleStatusUpdate(request.id, 'cancelled')}
                            className="action-btn cancel-btn"
                          >
                            Cancel Request
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="page-btn"
              >
                ← Previous
              </button>
              <span className="page-info">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="page-btn"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SignatureRequestsList;
