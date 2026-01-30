import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getUserInfo, logout as authLogout } from '../propmetrik-auth';
import { getTemplates, deleteTemplate, useTemplate, getTemplateCategories } from '../api';
import './Templates.css';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
  used_count: number;
  document_name?: string;
  document_drive_id?: string;
  fields: { type: string }[];
  is_shared: boolean;
}

export default function Templates() {
  const navigate = useNavigate();
  const location = useLocation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Demo templates
  const demoTemplates: Template[] = [
    {
      id: 'demo-1',
      name: 'Employment Eligibility Verification: I-9',
      description: 'Standard I-9 form for verifying employment eligibility',
      category: 'HR',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      used_count: 156,
      document_name: 'Form I-9.pdf',
      fields: [{ type: 'signature' }, { type: 'date_signed' }, { type: 'name' }],
      is_shared: true
    },
    {
      id: 'demo-2',
      name: 'Sample W9',
      description: 'IRS Form W-9 for tax identification',
      category: 'Finance',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      used_count: 89,
      document_name: 'W-9.pdf',
      fields: [{ type: 'signature' }, { type: 'date_signed' }],
      is_shared: true
    },
    {
      id: 'demo-3',
      name: 'Non-Disclosure Agreement',
      description: 'Standard NDA template for business relationships',
      category: 'Legal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      used_count: 234,
      document_name: 'NDA.pdf',
      fields: [{ type: 'signature' }, { type: 'date_signed' }, { type: 'name' }, { type: 'company' }],
      is_shared: false
    },
    {
      id: 'demo-4',
      name: 'Service Agreement',
      description: 'General service agreement for contractors',
      category: 'Legal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      used_count: 67,
      document_name: 'Service Agreement.pdf',
      fields: [{ type: 'signature' }, { type: 'date_signed' }, { type: 'initial' }],
      is_shared: false
    }
  ];

  useEffect(() => {
    loadTemplates();
    loadCategories();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await getTemplates(
        selectedCategory !== 'all' ? selectedCategory : undefined,
        searchQuery || undefined
      );
      const apiTemplates = Array.isArray(response.data) ? response.data : [];
      
      // If no API templates, show demo templates
      if (apiTemplates.length === 0) {
        setTemplates(demoTemplates);
      } else {
        setTemplates(apiTemplates);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      setTemplates(demoTemplates);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await getTemplateCategories();
      if (Array.isArray(response.data) && response.data.length > 0) {
        // Categories from API + 'all'
        // Already handled in the UI
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleLogout = () => {
    authLogout();
    window.location.reload();
  };

  const handleUseTemplate = async (template: Template) => {
    try {
      await useTemplate(template.id);
      toast.success(`Template "${template.name}" selected. Opening envelope wizard...`);
      // TODO: Open envelope wizard with template pre-filled
    } catch (error) {
      toast.info(`Using template: ${template.name}`);
    }
  };

  const handleEditTemplate = (template: Template) => {
    toast.info(`Editing template: ${template.name}`);
    // TODO: Open template editor
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    
    try {
      await deleteTemplate(template.id);
      toast.success('Template deleted');
      loadTemplates();
    } catch (error) {
      toast.error('Failed to delete template');
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set(templates.map(t => t.category))];

  return (
    <div className="templates-page">
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
          <h1>Templates</h1>
          <button 
            className="new-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + Create Template
          </button>
        </div>

        {/* Filters */}
        <div className="filters-row">
          <div className="filter-left">
            <div className="category-select">
              <select 
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-right">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="search-icon">🔍</span>
            </div>
            
            <div className="view-toggle">
              <button 
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                ⊞
              </button>
              <button 
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                ☰
              </button>
            </div>
          </div>
        </div>

        {/* Templates */}
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading templates...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No templates found</h3>
            <p>Create a template to speed up your workflow</p>
            <button 
              className="start-btn"
              onClick={() => setShowCreateModal(true)}
            >
              Create Template
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="templates-grid">
            {filteredTemplates.map(template => (
              <div key={template.id} className="template-card">
                <div className="template-preview">
                  <div className="preview-placeholder">📄</div>
                  {template.is_shared && (
                    <span className="shared-badge">Starter</span>
                  )}
                </div>
                
                <div className="template-info">
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  
                  <div className="template-meta">
                    <span className="category-tag">{template.category}</span>
                    <span className="use-count">Used {template.used_count} times</span>
                  </div>
                </div>

                <div className="template-actions">
                  <button 
                    className="use-btn"
                    onClick={() => handleUseTemplate(template)}
                  >
                    Use
                  </button>
                  {!template.is_shared && (
                    <>
                      <button 
                        className="edit-btn"
                        onClick={() => handleEditTemplate(template)}
                      >
                        ✏️
                      </button>
                      <button 
                        className="delete-btn"
                        onClick={() => handleDeleteTemplate(template)}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="templates-list">
            {filteredTemplates.map(template => (
              <div key={template.id} className="template-row">
                <div className="row-preview">
                  <div className="preview-placeholder small">📄</div>
                </div>
                
                <div className="row-info">
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                </div>

                <div className="row-meta">
                  <span className="category-tag">{template.category}</span>
                </div>

                <div className="row-stats">
                  <span>Used {template.used_count} times</span>
                </div>

                <div className="row-actions">
                  <button 
                    className="use-btn"
                    onClick={() => handleUseTemplate(template)}
                  >
                    Use
                  </button>
                  {!template.is_shared && (
                    <button 
                      className="edit-btn"
                      onClick={() => handleEditTemplate(template)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Template</h2>
              <button 
                className="close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>Template creation will be available soon.</p>
              <p>For now, you can:</p>
              <ul>
                <li>Create an envelope and save it as a template</li>
                <li>Use existing starter templates</li>
              </ul>
            </div>
            <div className="modal-footer">
              <button 
                className="cancel-btn"
                onClick={() => setShowCreateModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
