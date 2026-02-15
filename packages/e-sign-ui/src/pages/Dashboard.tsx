import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getUserInfo, logout as authLogout } from '../propmetrik-auth';
import api from '../api';
import { EnvelopeWizard } from '../components/envelope';
import './Dashboard.css';

// External document data received from parent (PROPMETRIK main app)
interface ExternalDocumentData {
  documentUrl: string;
  documentKey: string;
  filename: string;
  subject: string;
  message: string;
  signers: Array<{ name: string; email: string; role: string }>;
  tenancyId?: string;
  applicationId?: string;
  propertyName?: string;
}

interface Envelope {
  id: string;
  subject: string;
  status: 'pending' | 'completed' | 'voided' | 'expired';
  created_at: string;
  recipients: { name: string; email: string; status: string }[];
  documents?: { id: string; name: string; download_url?: string | null }[];
}

interface Template {
  id: number;
  name: string;
  description: string;
  preview_url?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [showEnvelopeWizard, setShowEnvelopeWizard] = useState(false);
  const [externalDocument, setExternalDocument] = useState<ExternalDocumentData | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [templates] = useState<Template[]>([
    { id: 1, name: 'Employment Eligibility Verification: I-9', description: 'Starter Template' },
    { id: 2, name: 'Sample W9', description: 'Starter Template' },
  ]);
  const stats = useMemo(() => {
    const pendingCount = envelopes.filter(e => e.status === 'pending').length;
    const completedCount = envelopes.filter(e => e.status === 'completed').length;
    return {
      actionRequired: pendingCount,
      waitingForOthers: pendingCount,
      expiringSoon: 0,
      completed: completedCount,
    };
  }, [envelopes]);
  const [isLoading, setIsLoading] = useState(true);

  // Handle external document loading from parent window (PROPMETRIK main app)
  useEffect(() => {
    const handleExternalDocument = (event: MessageEvent) => {
      if (event.data?.type === 'LOAD_DOCUMENT' && event.data?.data) {
        console.log('📄 Received external document from PROPMETRIK:', event.data.data);
        setExternalDocument(event.data.data);
        setShowEnvelopeWizard(true);
        
        // Notify parent that we're ready
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'ESIGN_READY' }, '*');
        }
      }
    };

    window.addEventListener('message', handleExternalDocument);
    
    // Check if we're in embedded mode
    const mode = searchParams.get('mode');
    if (mode === 'embedded') {
      console.log('🔗 E-Sign UI in embedded mode, waiting for document...');
      // Notify parent that we're ready to receive documents
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'ESIGN_READY' }, '*');
      }
    }

    return () => window.removeEventListener('message', handleExternalDocument);
  }, [searchParams]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load envelopes + signature requests for full dashboard stats
      const [envelopesRes, requestsRes] = await Promise.all([
        api.get('/envelopes').catch(() => ({ data: [] })),
        api.get('/signature-requests').catch(() => ({ data: [] })),
      ]);

      const envelopesData = envelopesRes.data;
      const requestsData = requestsRes.data;

      const envelopesArray = Array.isArray(envelopesData)
        ? envelopesData
        : (envelopesData?.items || envelopesData?.results || []);

      const requestsArray = Array.isArray(requestsData)
        ? requestsData
        : (requestsData?.items || requestsData?.results || requestsData?.signature_requests || []);

      const normalizeStatus = (status?: string, recipients?: { status: string }[]) => {
        const raw = (status || '').toString().trim().toLowerCase();
        if (['completed', 'complete', 'signed'].includes(raw)) return 'completed';
        if (['voided', 'void'].includes(raw)) return 'voided';
        if (['expired', 'expire'].includes(raw)) return 'expired';
        if (recipients && recipients.length > 0) {
          const allCompleted = recipients.every(r => (r.status || '').toString().trim().toLowerCase() === 'completed');
          if (allCompleted) return 'completed';
        }
        return 'pending';
      };

      const fromEnvelopes: Envelope[] = envelopesArray.map((env: any) => {
        const recipients = env.recipients || [];
        return {
        id: env.id,
        subject: env.subject || `Document ${env.id}`,
        status: normalizeStatus(env.status, recipients),
        created_at: env.created_at,
        recipients,
        documents: env.documents || [],
        };
      });

      const fromRequests: Envelope[] = requestsArray.map((req: any) => {
        const recipients = req.signers?.map((s: any) => ({
          name: s.full_name || s.email,
          email: s.email,
          status: s.status,
        })) || [{
          name: req.signer_name,
          email: req.signer_email,
          status: req.status,
        }];
        return {
        id: String(req.id),
        subject: `Complete with Cedyn: ${req.document?.title || req.title || 'Document'}`,
        status: normalizeStatus(req.status, recipients),
        created_at: req.created_at,
        recipients,
      };
      });

      const envelopeList = [...fromEnvelopes, ...fromRequests];

      // Debug: log raw and normalized statuses
      console.log('📊 Dashboard status debug', {
        envelopes: envelopesArray.map((e: any) => ({ id: e.id, status: e.status })),
        requests: requestsArray.map((r: any) => ({ id: r.id, status: r.status })),
        normalized: envelopeList.map((e) => ({ id: e.id, status: e.status }))
      });

      setEnvelopes(envelopeList);

    } catch (error) {
      console.error('Error loading dashboard:', error);
      setEnvelopes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    authLogout();
    window.location.reload();
  };

  const getStatusAction = (envelope: Envelope) => {
    switch (envelope.status) {
      case 'completed':
        return { label: 'Download', action: () => handleDownload(envelope.id) };
      case 'pending':
        return { label: 'Resend', action: () => handleResend(envelope.id) };
      case 'voided':
        return { label: 'Copy', action: () => handleCopy(envelope.id) };
      default:
        return { label: 'View', action: () => {} };
    }
  };

  const handleDownload = async (id: string) => {
    try {
      toast.info('Downloading document...');
      const envelope = envelopes.find(e => e.id === id);
      const doc = envelope?.documents?.[0];

      const downloadUrl = doc?.download_url || null;
      if (!downloadUrl) {
        // Fetch full envelope to get documents if not already present
        const detail = await api.get(`/envelopes/${id}`);
        const detailDoc = detail.data?.documents?.[0];
        if (!detailDoc?.download_url) {
          toast.error('No downloadable document found');
          return;
        }
        await downloadFile(detailDoc.download_url, detailDoc.name || 'document.pdf');
        return;
      }

      await downloadFile(downloadUrl, doc?.name || 'document.pdf');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download document');
    }
  };

  const downloadFile = async (url: string, filename: string) => {
    const response = await api.get(url, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const handleResend = async (_id: string) => {
    toast.info('Resending envelope...');
  };

  const handleCopy = async (_id: string) => {
    toast.info('Creating copy...');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="status-badge completed">✓ Completed</span>;
      case 'pending':
        return <span className="status-badge pending">Waiting for 1 other</span>;
      case 'voided':
        return <span className="status-badge voided">⊘ Voided</span>;
      case 'expired':
        return <span className="status-badge expired">Expired</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  // Handle envelope wizard completion
  const handleEnvelopeComplete = () => {
    setShowEnvelopeWizard(false);
    setExternalDocument(null);
    loadDashboardData();
    
    // Notify parent window of completion
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'ESIGN_COMPLETE' }, '*');
    }
  };

  // Handle envelope wizard cancellation
  const handleEnvelopeCancel = () => {
    setShowEnvelopeWizard(false);
    setExternalDocument(null);
    
    // Notify parent window of cancellation
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'ESIGN_CANCEL' }, '*');
    }
  };

  if (showEnvelopeWizard) {
    return (
      <EnvelopeWizard
        onComplete={handleEnvelopeComplete}
        onCancel={handleEnvelopeCancel}
        currentUser={{
          name: getUserInfo()?.name || 'Me',
          email: getUserInfo()?.email || '',
        }}
        externalDocument={externalDocument}
      />
    );
  }

  return (
    <div className="dashboard">
      <ToastContainer position="top-right" autoClose={3000} />
      
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">✒️</span>
            <span className="logo-text">Cedyn E-Sign</span>
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
      <main className="dashboard-main">
        {/* Welcome Banner */}
        <section className="welcome-section">
          <div className="welcome-content">
            <h1>Welcome back</h1>
            <div className="welcome-user">
              <span className="welcome-avatar">
                {getUserInfo()?.name?.charAt(0).toUpperCase() || 'C'}
              </span>
              <span className="welcome-signature">
                {getUserInfo()?.name || 'Cedyn User'}
              </span>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-number">{stats.actionRequired}</span>
              <span className="stat-label">Action Required</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats.waitingForOthers}</span>
              <span className="stat-label">Waiting for Others</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats.expiringSoon}</span>
              <span className="stat-label">Expiring Soon</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats.completed}</span>
              <span className="stat-label">Completed</span>
            </div>
          </div>
        </section>

        {/* Get Started Section */}
        <section className="get-started-section">
          <div className="section-header">
            <h2>Get Started or Use Templates</h2>
            <button className="browse-btn">Browse all Templates →</button>
          </div>

          <div className="start-options">
            {/* Sign or Get Signatures Card */}
            <div className="start-card primary">
              <div className="card-content">
                <h3>Sign or get signatures</h3>
                <button 
                  className="start-btn"
                  onClick={() => setShowEnvelopeWizard(true)}
                >
                  Start
                </button>
              </div>
            </div>

            {/* Template Cards */}
            {templates.map(template => (
              <div key={template.id} className="start-card template">
                <div className="template-badge">Starter Templates</div>
                <div className="template-preview">
                  <div className="preview-placeholder">📄</div>
                </div>
                <div className="template-info">
                  <span className="template-name">{template.name}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Agreement Activity */}
        <section className="activity-section">
          <div className="section-header">
            <h2>Agreement activity <span className="info-icon">ⓘ</span></h2>
          </div>

          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading your agreements...</p>
            </div>
          ) : envelopes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <h3>No agreements yet</h3>
              <p>Start by creating your first envelope</p>
              <button 
                className="start-btn"
                onClick={() => setShowEnvelopeWizard(true)}
              >
                Create Envelope
              </button>
            </div>
          ) : (
            <div className="activity-list">
              {envelopes.map(envelope => {
                const action = getStatusAction(envelope);
                return (
                  <div key={envelope.id} className="activity-item">
                    <div className="activity-info">
                      <button
                        className="activity-subject"
                        onClick={() => envelope.status === 'completed' ? handleDownload(envelope.id) : navigate('/agreements')}
                      >
                        {envelope.subject}
                      </button>
                      <span className="activity-time">{formatTimeAgo(envelope.created_at)}</span>
                    </div>
                    <div className="activity-status">
                      {getStatusBadge(envelope.status)}
                    </div>
                    <div className="activity-action">
                      <button 
                        className="action-btn"
                        onClick={action.action}
                      >
                        {action.label}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
