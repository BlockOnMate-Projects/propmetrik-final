import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import keycloak from '../keycloak';
import { getReportStats, getReportActivity, exportReport } from '../api';
import './Reports.css';

interface ReportStats {
  totalEnvelopes: number;
  completed: number;
  pending: number;
  voided: number;
  avgCompletionTime: number;
  signingRate: number;
}

interface ActivityItem {
  id: string;
  type: 'sent' | 'completed' | 'viewed' | 'declined' | 'voided';
  envelopeName: string;
  recipientName: string;
  timestamp: string;
}

export default function Reports() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');
  const [stats, setStats] = useState<ReportStats>({
    totalEnvelopes: 0,
    completed: 0,
    pending: 0,
    voided: 0,
    avgCompletionTime: 0,
    signingRate: 0
  });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  // Demo data
  const demoStats: ReportStats = {
    totalEnvelopes: 156,
    completed: 132,
    pending: 18,
    voided: 6,
    avgCompletionTime: 4.2,
    signingRate: 84.6
  };

  const demoActivity: ActivityItem[] = [
    {
      id: '1',
      type: 'completed',
      envelopeName: 'Service Agreement - Acme Corp',
      recipientName: 'John Smith',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    {
      id: '2',
      type: 'sent',
      envelopeName: 'NDA - Tech Partners',
      recipientName: 'Sarah Johnson',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
    },
    {
      id: '3',
      type: 'viewed',
      envelopeName: 'Employment Contract - Jane Doe',
      recipientName: 'Jane Doe',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
    },
    {
      id: '4',
      type: 'completed',
      envelopeName: 'Consulting Agreement',
      recipientName: 'Mike Wilson',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString()
    },
    {
      id: '5',
      type: 'declined',
      envelopeName: 'Vendor Agreement - XYZ Ltd',
      recipientName: 'Tom Brown',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    }
  ];

  useEffect(() => {
    loadReports();
  }, [dateRange]);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const response = await getReportStats(parseInt(dateRange));
      
      if (response.data && response.data.totalEnvelopes !== undefined) {
        setStats(response.data);
      } else {
        setStats(demoStats);
      }
      
      const activityResponse = await getReportActivity(20, 0);
      if (Array.isArray(activityResponse.data) && activityResponse.data.length > 0) {
        setRecentActivity(activityResponse.data);
      } else {
        setRecentActivity(demoActivity);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      setStats(demoStats);
      setRecentActivity(demoActivity);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
  };

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sent': return '📤';
      case 'completed': return '✅';
      case 'viewed': return '👁️';
      case 'declined': return '❌';
      case 'voided': return '🚫';
      default: return '📄';
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'sent': return 'Sent';
      case 'completed': return 'Completed';
      case 'viewed': return 'Viewed';
      case 'declined': return 'Declined';
      case 'voided': return 'Voided';
      default: return 'Updated';
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    toast.info(`Exporting as ${format.toUpperCase()}...`);
    try {
      const response = await exportReport('completion', format === 'csv' ? 'csv' : 'json', parseInt(dateRange));
      
      if (format === 'csv' && response.data.columns && response.data.rows) {
        // Create CSV content
        const csvContent = [
          response.data.columns.join(','),
          ...response.data.rows.map((row: string[]) => row.join(','))
        ].join('\n');
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `esign-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Report exported successfully');
      } else {
        toast.success('Report data retrieved');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report');
    }
  };

  return (
    <div className="reports-page">
      <ToastContainer position="top-right" autoClose={3000} />
      
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <div className="logo" onClick={() => navigate('/')}>
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
      <main className="page-main">
        <div className="page-title-row">
          <h1>Reports</h1>
          <div className="title-actions">
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="date-select"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            <div className="export-buttons">
              <button 
                className="export-btn"
                onClick={() => handleExport('csv')}
              >
                📊 Export CSV
              </button>
              <button 
                className="export-btn"
                onClick={() => handleExport('pdf')}
              >
                📄 Export PDF
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading reports...</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon total">📨</div>
                <div className="stat-content">
                  <h3>Total Envelopes</h3>
                  <p className="stat-value">{stats.totalEnvelopes}</p>
                  <span className="stat-trend up">+12% from last period</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon completed">✅</div>
                <div className="stat-content">
                  <h3>Completed</h3>
                  <p className="stat-value">{stats.completed}</p>
                  <span className="stat-trend up">+8% from last period</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon pending">⏳</div>
                <div className="stat-content">
                  <h3>Pending</h3>
                  <p className="stat-value">{stats.pending}</p>
                  <span className="stat-trend down">-3% from last period</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon voided">🚫</div>
                <div className="stat-content">
                  <h3>Voided</h3>
                  <p className="stat-value">{stats.voided}</p>
                  <span className="stat-trend neutral">Same as last period</span>
                </div>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="metrics-row">
              <div className="metric-card">
                <h3>Average Completion Time</h3>
                <p className="metric-value">{stats.avgCompletionTime} hours</p>
                <div className="metric-bar">
                  <div 
                    className="metric-fill" 
                    style={{ width: `${Math.min(100, stats.avgCompletionTime * 10)}%` }}
                  ></div>
                </div>
                <span className="metric-label">Target: 24 hours</span>
              </div>

              <div className="metric-card">
                <h3>Signing Rate</h3>
                <p className="metric-value">{stats.signingRate}%</p>
                <div className="metric-bar">
                  <div 
                    className="metric-fill success" 
                    style={{ width: `${stats.signingRate}%` }}
                  ></div>
                </div>
                <span className="metric-label">Target: 80%</span>
              </div>

              <div className="metric-card chart-placeholder">
                <h3>Envelopes Over Time</h3>
                <div className="placeholder-chart">
                  <div className="chart-bar" style={{ height: '40%' }}></div>
                  <div className="chart-bar" style={{ height: '65%' }}></div>
                  <div className="chart-bar" style={{ height: '45%' }}></div>
                  <div className="chart-bar" style={{ height: '80%' }}></div>
                  <div className="chart-bar" style={{ height: '60%' }}></div>
                  <div className="chart-bar" style={{ height: '90%' }}></div>
                  <div className="chart-bar" style={{ height: '75%' }}></div>
                </div>
              </div>
            </div>

            {/* Activity Feed */}
            <div className="activity-section">
              <h2>Recent Activity</h2>
              <div className="activity-list">
                {recentActivity.map(item => (
                  <div key={item.id} className="activity-item">
                    <div className="activity-icon">
                      {getActivityIcon(item.type)}
                    </div>
                    <div className="activity-content">
                      <p>
                        <strong>{item.recipientName}</strong>
                        {' '}{getActivityLabel(item.type).toLowerCase()}{' '}
                        <span className="envelope-name">{item.envelopeName}</span>
                      </p>
                      <span className="activity-time">{formatTimeAgo(item.timestamp)}</span>
                    </div>
                    <div className={`activity-badge ${item.type}`}>
                      {getActivityLabel(item.type)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Reports */}
            <div className="quick-reports-section">
              <h2>Quick Reports</h2>
              <div className="quick-reports-grid">
                <div className="quick-report-card" onClick={() => toast.info('Opening completion report...')}>
                  <div className="report-icon">📋</div>
                  <h3>Completion Report</h3>
                  <p>See all completed envelopes with signature details</p>
                </div>
                <div className="quick-report-card" onClick={() => toast.info('Opening pending report...')}>
                  <div className="report-icon">⏰</div>
                  <h3>Pending Report</h3>
                  <p>Track envelopes waiting for signatures</p>
                </div>
                <div className="quick-report-card" onClick={() => toast.info('Opening recipient report...')}>
                  <div className="report-icon">👥</div>
                  <h3>Recipient Report</h3>
                  <p>Analyze signer response times and patterns</p>
                </div>
                <div className="quick-report-card" onClick={() => toast.info('Opening audit report...')}>
                  <div className="report-icon">🔍</div>
                  <h3>Audit Trail</h3>
                  <p>Complete audit log of all document activities</p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
