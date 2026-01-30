import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import keycloak from '../keycloak';
import api from '../api';
import { EnvelopeWizard } from '../components/envelope';
import './Dashboard.css';

interface Envelope {
  id: number;
  subject: string;
  status: 'pending' | 'completed' | 'voided' | 'expired';
  created_at: string;
  recipients: { name: string; email: string; status: string }[];
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
  const [showEnvelopeWizard, setShowEnvelopeWizard] = useState(false);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [templates] = useState<Template[]>([
    { id: 1, name: 'Employment Eligibility Verification: I-9', description: 'Starter Template' },
    { id: 2, name: 'Sample W9', description: 'Starter Template' },
  ]);
  const [stats, setStats] = useState({
    actionRequired: 0,
    waitingForOthers: 0,
    expiringSoon: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load envelopes/signature requests
      const response = await api.get('/signature-requests');
      const data = response.data;
      
      // Ensure data is an array
      const dataArray = Array.isArray(data) ? data : (data?.items || data?.results || []);
      
      // Transform to envelope format
      const envelopeList: Envelope[] = dataArray.map((req: any) => ({
        id: req.id,
        subject: `Complete with Cedyn: ${req.document?.title || req.title || 'Document'}`,
        status: req.status,
        created_at: req.created_at,
        recipients: [{ 
          name: req.signer_name, 
          email: req.signer_email, 
          status: req.status 
        }],
      }));

      setEnvelopes(envelopeList);

      // Calculate stats
      setStats({
        actionRequired: envelopeList.filter(e => e.status === 'pending').length,
        waitingForOthers: envelopeList.filter(e => e.status === 'pending').length,
        expiringSoon: 0,
        completed: envelopeList.filter(e => e.status === 'completed').length,
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setEnvelopes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
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

  const handleDownload = async (_id: number) => {
    toast.info('Downloading document...');
  };

  const handleResend = async (_id: number) => {
    toast.info('Resending envelope...');
  };

  const handleCopy = async (_id: number) => {
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

  if (showEnvelopeWizard) {
    return (
      <EnvelopeWizard
        onComplete={() => {
          setShowEnvelopeWizard(false);
          loadDashboardData();
        }}
        onCancel={() => setShowEnvelopeWizard(false)}
        currentUser={{
          name: keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || 'Me',
          email: keycloak.tokenParsed?.email || '',
        }}
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
              {keycloak.tokenParsed?.preferred_username?.charAt(0).toUpperCase() || 'U'}
            </span>
            <span className="user-name">
              {keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username}
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
                {keycloak.tokenParsed?.preferred_username?.charAt(0).toUpperCase() || 'C'}
              </span>
              <span className="welcome-signature">
                {keycloak.tokenParsed?.name || 'Cedyn User'}
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
                      <span className="activity-subject">{envelope.subject}</span>
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
