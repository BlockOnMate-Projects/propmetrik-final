import { useEffect, useState } from 'react';
import { getDocuments, deleteDocument, downloadDocument } from '../api';
import { toast } from 'react-toastify';
import './DocumentsList.css';

interface Document {
  id: number;
  title: string;
  file_size: number;
  mime_type: string;
  status: string;
  created_at: string;
  signed_file_path?: string;
  original_format?: string;
}

interface DocumentsListProps {
  onSelectDocument?: (doc: Document) => void;
  onQuickSign?: (doc: Document) => void;
  refreshTrigger?: number;
}

function DocumentsList({ onSelectDocument, onQuickSign, refreshTrigger }: DocumentsListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState<number | null>(null);
  const limit = 10;

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await getDocuments(page * limit, limit);
      setDocuments(response.data.documents || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [page, refreshTrigger]);

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    try {
      await deleteDocument(id);
      toast.success('Document deleted successfully');
      loadDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast.error('Failed to delete document');
    }
  };

  const handleDownload = async (id: number, title: string) => {
    try {
      const response = await downloadDocument(id);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = title;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Document downloaded');
    } catch (error) {
      console.error('Failed to download document:', error);
      toast.error('Failed to download document');
    }
  };

  const handleSelect = (doc: Document) => {
    setSelectedDoc(doc.id);
    onSelectDocument?.(doc);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const totalPages = Math.ceil(total / limit);

  if (loading && documents.length === 0) {
    return <div className="loading">Loading documents...</div>;
  }

  return (
    <div className="documents-list">
      <div className="list-header">
        <h3>📄 Your Documents ({total})</h3>
      </div>

      {documents.length === 0 ? (
        <div className="empty-state">
          <p>No documents yet. Upload your first document to get started!</p>
        </div>
      ) : (
        <>
          <div className="documents-table">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr 
                    key={doc.id} 
                    className={selectedDoc === doc.id ? 'selected' : ''}
                    onClick={() => handleSelect(doc)}
                  >
                    <td className="doc-title">
                      <span className="doc-icon">📄</span>
                      {doc.title}
                    </td>
                    <td>{formatFileSize(doc.file_size)}</td>
                    <td>
                      <span className={`status-badge status-${doc.status}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td>{formatDate(doc.created_at)}</td>
                    <td className="actions">
                      {doc.mime_type === 'application/pdf' && !doc.signed_file_path && onQuickSign && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickSign(doc);
                          }}
                          className="action-btn sign-btn"
                          title="Quick Sign"
                        >
                          ✍️
                        </button>
                      )}
                      {doc.signed_file_path && (
                        <span className="signed-badge" title="Document is signed">
                          ✅
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(doc.id, doc.title);
                        }}
                        className="action-btn download-btn"
                        title="Download"
                      >
                        ⬇️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(doc.id, doc.title);
                        }}
                        className="action-btn delete-btn"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

export default DocumentsList;
