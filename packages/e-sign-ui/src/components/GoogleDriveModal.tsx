import { useEffect, useState } from 'react';
import { initiateGoogleAuth, listGoogleDriveFiles, importGoogleDriveDocument, disconnectGoogleDrive } from '../api';
import { toast } from 'react-toastify';
import './GoogleDriveModal.css';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime: string;
  iconLink?: string;
  thumbnailLink?: string;
}

interface GoogleDriveModalProps {
  onClose: () => void;
  onImport: () => void;
  isConnected: boolean;
  onConnected: () => void;
}

function GoogleDriveModal({ onClose, onImport, isConnected, onConnected }: GoogleDriveModalProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (isConnected) {
      loadFiles();
    }
  }, [isConnected]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const response = await initiateGoogleAuth();
      const authUrl = response.data.auth_url;
      
      // Open Google OAuth in new window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        authUrl,
        'Google Drive Authorization',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Listen for OAuth callback
      const checkPopup = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkPopup);
          setConnecting(false);
          
          // Check if successfully connected
          setTimeout(() => {
            loadFiles();
            onConnected();
          }, 1000);
        }
      }, 500);

    } catch (error: any) {
      console.error('Failed to initiate Google auth:', error);
      toast.error('Failed to connect to Google Drive');
      setConnecting(false);
    }
  };

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await listGoogleDriveFiles();
      setFiles(response.data.files || []);
    } catch (error: any) {
      console.error('Failed to load Google Drive files:', error);
      if (error.response?.status === 401) {
        toast.error('Google Drive authorization expired. Please reconnect.');
      } else {
        toast.error('Failed to load Google Drive files');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    try {
      setImporting(true);
      await importGoogleDriveDocument(selectedFile.id);
      toast.success(`Imported: ${selectedFile.name}`);
      onImport();
    } catch (error: any) {
      console.error('Failed to import document:', error);
      toast.error('Failed to import document');
    } finally {
      setImporting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Drive?')) {
      return;
    }

    try {
      await disconnectGoogleDrive();
      toast.success('Google Drive disconnected');
      onClose();
    } catch (error: any) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect Google Drive');
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(2)} KB`;
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.includes('document')) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word')) return '📘';
    if (mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('presentation')) return '📊';
    return '📎';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content google-drive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 0L0 9.5h5.5L11 0z"/>
              <path d="M11 0l5.5 9.5H11z"/>
              <path d="M0 9.5L2.75 14h10.5L16 9.5z"/>
            </svg>
            Google Drive
          </h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {!isConnected ? (
            <div className="connect-prompt">
              <div className="connect-icon">
                <svg width="64" height="64" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.5 0L0 9.5h5.5L11 0z"/>
                  <path d="M11 0l5.5 9.5H11z"/>
                  <path d="M0 9.5L2.75 14h10.5L16 9.5z"/>
                </svg>
              </div>
              <h3>Connect to Google Drive</h3>
              <p>Import documents from your Google Drive to create signature requests</p>
              <button
                className="connect-drive-btn"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? '🔄 Connecting...' : '🔗 Connect Google Drive'}
              </button>
            </div>
          ) : loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading your Google Drive files...</p>
            </div>
          ) : (
            <>
              <div className="drive-actions">
                <button className="refresh-btn" onClick={loadFiles} disabled={loading}>
                  🔄 Refresh
                </button>
                <button className="disconnect-btn" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>

              {files.length === 0 ? (
                <div className="empty-state">
                  <p>No compatible documents found in your Google Drive</p>
                  <small>Supported: Google Docs, PDFs, Word documents</small>
                </div>
              ) : (
                <div className="files-list">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className={`file-item ${selectedFile?.id === file.id ? 'selected' : ''}`}
                      onClick={() => setSelectedFile(file)}
                    >
                      <div className="file-icon">{getFileIcon(file.mimeType)}</div>
                      <div className="file-info">
                        <div className="file-name">{file.name}</div>
                        <div className="file-meta">
                          <span>{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <span>{new Date(file.modifiedTime).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {selectedFile?.id === file.id && (
                        <div className="selected-indicator">✓</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {isConnected && selectedFile && (
          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? '⏳ Importing...' : '📥 Import Document'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GoogleDriveModal;
