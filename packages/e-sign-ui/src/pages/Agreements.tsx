import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getUserInfo, logout as authLogout } from '../propmetrik-auth';
import { getEnvelopes, getSignatureRequests, voidEnvelope, resendEnvelope, downloadEnvelopeDocument } from '../api';
import { EnvelopeWizard } from '../components/envelope';
import './Agreements.css';

interface Agreement {
  id: string;
  subject: string;
  status: 'pending' | 'completed' | 'voided' | 'expired' | 'declined';
  created_at: string;
  expires_at?: string;
  recipients: { name: string; email: string; status: string; signed_at?: string }[];
  documents: { name: string }[];
}

type FilterStatus = 'all' | 'action_required' | 'waiting' | 'completed' | 'voided';

export default function Agreements() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showEnvelopeWizard, setShowEnvelopeWizard] = useState(false);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [filteredAgreements, setFilteredAgreements] = useState<Agreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgreements, setSelectedAgreements] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAgreements();
  }, []);

  useEffect(() => {
    filterAgreements();
  }, [agreements, filterStatus, searchQuery]);

  const loadAgreements = async () => {
    setIsLoading(true);
    try {
      // Load from both envelopes and signature-requests APIs
      const [envelopesRes, requestsRes] = await Promise.all([
        getEnvelopes().catch(() => ({ data: [] })),
        getSignatureRequests().catch(() => ({ data: [] }))
      ]);

      const envelopes = Array.isArray(envelopesRes.data) ? envelopesRes.data : [];
      const requests = Array.isArray(requestsRes.data) ? requestsRes.data : 
                       (requestsRes.data?.items || requestsRes.data?.signature_requests || []);

      // Transform signature requests to agreement format
      const fromRequests: Agreement[] = requests.map((req: any) => ({
        id: `req-${req.id}`,
        subject: req.title || req.document?.title || 'Untitled Document',
        status: req.status,
        created_at: req.created_at,
        recipients: req.signers?.map((s: any) => ({
          name: s.full_name || s.email,
          email: s.email,
          status: s.status,
          signed_at: s.signed_at
        })) || [{
          name: req.signer_name,
          email: req.signer_email,
          status: req.status,
          signed_at: req.signed_at
        }],
        documents: [{ name: req.title || req.document?.title || 'Document' }]
      }));

      // Transform envelopes to agreement format
      const fromEnvelopes: Agreement[] = envelopes.map((env: any) => ({
        id: env.id,
        subject: env.subject,
        status: env.status,
        created_at: env.created_at,
        expires_at: env.expires_at,
        recipients: env.recipients || [],
        documents: env.documents || []
      }));

      setAgreements([...fromEnvelopes, ...fromRequests]);
    } catch (error) {
      console.error('Error loading agreements:', error);
      toast.error('Failed to load agreements');
    } finally {
      setIsLoading(false);
    }
  };

  const filterAgreements = () => {
    let filtered = [...agreements];

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(a => {
        switch (filterStatus) {
          case 'action_required':
            return a.status === 'pending';
          case 'waiting':
            return a.status === 'pending';
          case 'completed':
            return a.status === 'completed';
          case 'voided':
            return a.status === 'voided' || a.status === 'expired';
          default:
            return true;
        }
      });
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.subject.toLowerCase().includes(query) ||
        a.recipients.some(r => 
          r.name?.toLowerCase().includes(query) || 
          r.email?.toLowerCase().includes(query)
        )
      );
    }

    setFilteredAgreements(filtered);
  };

  const handleLogout = () => {
    authLogout();
    window.location.reload();
  };

  const handleVoid = async (id: string) => {
    if (!confirm('Are you sure you want to void this agreement?')) return;
    
    try {
      await voidEnvelope(id);
      toast.success('Agreement voided');
      loadAgreements();
    } catch (error) {
      toast.error('Failed to void agreement');
    }
  };

  const handleResend = async (id: string) => {
    try {
      await resendEnvelope(id);
      toast.success('Reminder sent');
    } catch (error) {
      toast.error('Failed to send reminder');
    }
  };

  const handleDownload = async (id: string) => {
    toast.info('Downloading document...');
    try {
      // Handle both envelope IDs and signature request IDs
      const actualId = id.startsWith('req-') ? id.replace('req-', '') : id;
      const response = await downloadEnvelopeDocument(actualId);
      
      // Create download link
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agreement-${actualId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Document downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download document');
    }
  };

  const toggleSelectAll = () => {
    if (selectedAgreements.size === filteredAgreements.length) {
      setSelectedAgreements(new Set());
    } else {
      setSelectedAgreements(new Set(filteredAgreements.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedAgreements);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedAgreements(newSelected);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="status-badge completed">✓ Completed</span>;
      case 'pending':
        return <span className="status-badge pending">⏳ Pending</span>;
      case 'voided':
        return <span className="status-badge voided">⊘ Voided</span>;
      case 'expired':
        return <span className="status-badge expired">⏰ Expired</span>;
      case 'declined':
        return <span className="status-badge declined">✕ Declined</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (showEnvelopeWizard) {
    return (
      <EnvelopeWizard
        onComplete={() => {
          setShowEnvelopeWizard(false);
          loadAgreements();
        }}
        onCancel={() => setShowEnvelopeWizard(false)}
      />
    );
  }

  return (
    <div className="agreements-page">
      <ToastContainer position="top-right" autoClose={3000} />
      
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <div className="logo" onClick={() => navigate('/')}>
            <span className="logo-icon">✒️</span>
            <span className="logo-text">PROPMETRIK E-Sign</span>
          </div>
        </div>
        
        <nav className="header-nav">
          <button onClick={() => navigate('/')} className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Home</button>
          <button onClick={() => navigate('/agreements')} className={`nav-link ${location.pathname === '/agreements' ? 'active' : ''}`}>Agreements</button>
          <button onClick={() => navigate('/templates')} className={`nav-link ${location.pathname === '/templates' ? 'active' : ''}`}>Templates</button>
          <button onClick={() => navigate('/reports')} className={`nav-link ${location.pathname === '/reports' ? 'active' : ''}`}>Reports</button>
        </nav>

        <div className="header-right">
          <button className="icon-btn">🔔</button>
          <div className="user-menu" onClick={() => toast.info('Profile settings coming soon')} style={{ cursor: 'pointer' }}>
            <span className="user-avatar">
              {getUserInfo()?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
            <span className="user-name">
              {getUserInfo()?.name || 'User'}
            </span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-main">
        <div className="page-title-row">
          <h1>Agreements</h1>
          <button 
            className="new-btn"
            onClick={() => setShowEnvelopeWizard(true)}
          >
            + New
          </button>
        </div>

        {/* Filters */}
        <div className="filters-row">
          <div className="filter-tabs">
            <button 
              className={`filter-tab ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
            >
              All
            </button>
            <button 
              className={`filter-tab ${filterStatus === 'action_required' ? 'active' : ''}`}
              onClick={() => setFilterStatus('action_required')}
            >
              Action Required
            </button>
            <button 
              className={`filter-tab ${filterStatus === 'waiting' ? 'active' : ''}`}
              onClick={() => setFilterStatus('waiting')}
            >
              Waiting for Others
            </button>
            <button 
              className={`filter-tab ${filterStatus === 'completed' ? 'active' : ''}`}
              onClick={() => setFilterStatus('completed')}
            >
              Completed
            </button>
            <button 
              className={`filter-tab ${filterStatus === 'voided' ? 'active' : ''}`}
              onClick={() => setFilterStatus('voided')}
            >
              Voided/Expired
            </button>
          </div>

          <div className="search-box">
            <input
              type="text"
              placeholder="Search agreements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>

        {/* Agreements Table */}
        <div className="agreements-table-container">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading agreements...</p>
            </div>
          ) : filteredAgreements.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No agreements found</h3>
              <p>{searchQuery ? 'Try a different search term' : 'Create your first agreement to get started'}</p>
              <button 
                className="start-btn"
                onClick={() => setShowEnvelopeWizard(true)}
              >
                Create Agreement
              </button>
            </div>
          ) : (
            <table className="agreements-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedAgreements.size === filteredAgreements.length && filteredAgreements.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Recipients</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgreements.map(agreement => (
                  <tr key={agreement.id}>
                    <td className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedAgreements.has(agreement.id)}
                        onChange={() => toggleSelect(agreement.id)}
                      />
                    </td>
                    <td className="subject-col">
                      <span className="subject-text">{agreement.subject}</span>
                      {agreement.documents.length > 0 && (
                        <span className="doc-count">
                          📄 {agreement.documents.length} document{agreement.documents.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td>{getStatusBadge(agreement.status)}</td>
                    <td className="recipients-col">
                      {agreement.recipients.slice(0, 2).map((r, i) => (
                        <span key={i} className="recipient-chip">
                          {r.name || r.email}
                        </span>
                      ))}
                      {agreement.recipients.length > 2 && (
                        <span className="more-recipients">
                          +{agreement.recipients.length - 2} more
                        </span>
                      )}
                    </td>
                    <td className="date-col">{formatDate(agreement.created_at)}</td>
                    <td className="actions-col">
                      {agreement.status === 'completed' && (
                        <button 
                          className="action-btn"
                          onClick={() => handleDownload(agreement.id)}
                        >
                          Download
                        </button>
                      )}
                      {agreement.status === 'pending' && (
                        <>
                          <button 
                            className="action-btn"
                            onClick={() => handleResend(agreement.id)}
                          >
                            Resend
                          </button>
                          <button 
                            className="action-btn secondary"
                            onClick={() => handleVoid(agreement.id)}
                          >
                            Void
                          </button>
                        </>
                      )}
                      {(agreement.status === 'voided' || agreement.status === 'expired') && (
                        <button className="action-btn">Copy</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {filteredAgreements.length > 0 && (
          <div className="pagination">
            <span className="page-info">
              Showing {filteredAgreements.length} of {agreements.length} agreements
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
