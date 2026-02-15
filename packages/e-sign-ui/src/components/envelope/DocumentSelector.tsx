import { useState, useRef } from 'react';
import { DocumentFile } from './EnvelopeWizard';
import { getGoogleDriveStatus, listGoogleDriveFiles, importGoogleDriveDocument } from '../../api';
import { toast } from 'react-toastify';
import './DocumentSelector.css';

interface DocumentSelectorProps {
  documents: DocumentFile[];
  onDocumentsChange: (docs: DocumentFile[]) => void;
}

export default function DocumentSelector({ documents, onDocumentsChange }: DocumentSelectorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showGooglePicker, setShowGooglePicker] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter(f => 
      f.type === 'application/pdf' || 
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.type === 'application/msword'
    );

    const newDocs: DocumentFile[] = validFiles.map(file => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      source: 'desktop' as const,
      file: file,
      previewUrl: URL.createObjectURL(file)
    }));

    onDocumentsChange([...documents, ...newDocs]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleSourceSelect = (source: 'desktop' | 'google-drive') => {
    setShowSourceMenu(false);
    
    if (source === 'desktop') {
      fileInputRef.current?.click();
    } else if (source === 'google-drive') {
      // Open Google Drive picker
      openGoogleDrivePicker();
    }
  };

  const openGoogleDrivePicker = async () => {
    setIsLoadingDrive(true);
    try {
      // Check if Google Drive is connected
      const statusRes = await getGoogleDriveStatus();
      if (!statusRes.data?.connected) {
        toast.info('Please connect your Google Drive first in Settings');
        setIsLoadingDrive(false);
        return;
      }
      
      // Load files from Google Drive
      const filesRes = await listGoogleDriveFiles();
      if (filesRes.data?.files) {
        setDriveFiles(filesRes.data.files);
        setShowGooglePicker(true);
      } else {
        toast.info('No files found in Google Drive');
      }
    } catch (error: any) {
      console.error('Google Drive error:', error);
      // If not connected, show info message
      if (error.response?.status === 401 || error.response?.status === 403) {
        toast.info('Google Drive integration requires authentication. Please use Desktop upload.');
      } else {
        toast.error('Failed to access Google Drive');
      }
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleGoogleDriveFileSelect = async (file: any) => {
    try {
      toast.info(`Importing ${file.name}...`);
      await importGoogleDriveDocument(file.id);
      
      const newDoc: DocumentFile = {
        id: `gdoc-${file.id}`,
        name: file.name,
        source: 'google-drive' as const,
        driveId: file.id,
        previewUrl: file.thumbnailLink
      };
      
      onDocumentsChange([...documents, newDoc]);
      setShowGooglePicker(false);
      toast.success(`${file.name} imported successfully`);
    } catch {
      toast.error('Failed to import document from Google Drive');
    }
  };

  const removeDocument = (docId: string) => {
    onDocumentsChange(documents.filter(d => d.id !== docId));
  };

  const moveDocument = (docId: string, direction: 'up' | 'down') => {
    const index = documents.findIndex(d => d.id === docId);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === documents.length - 1)
    ) {
      return;
    }

    const newDocs = [...documents];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newDocs[index], newDocs[targetIndex]] = [newDocs[targetIndex], newDocs[index]];
    onDocumentsChange(newDocs);
  };

  return (
    <div className="document-selector">
      <div className="selector-layout">
        {/* Left - Document List */}
        <div className="document-list-panel">
          <h2>Documents</h2>
          
          {documents.length > 0 ? (
            <div className="document-list">
              {documents.map((doc, index) => (
                <div key={doc.id} className="document-item">
                  <div className="doc-preview">
                    <span className="doc-icon">📄</span>
                  </div>
                  <div className="doc-info">
                    <span className="doc-name">{doc.name}</span>
                    <span className="doc-source">
                      {doc.source === 'google-drive' ? '☁️ Google Drive' : '💻 Desktop'}
                    </span>
                  </div>
                  <div className="doc-actions">
                    <button 
                      className="doc-action-btn"
                      onClick={() => moveDocument(doc.id, 'up')}
                      disabled={index === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button 
                      className="doc-action-btn"
                      onClick={() => moveDocument(doc.id, 'down')}
                      disabled={index === documents.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button 
                      className="doc-action-btn delete"
                      onClick={() => removeDocument(doc.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-documents">
              <p>No documents added yet</p>
            </div>
          )}
        </div>

        {/* Right - Upload Area */}
        <div className="upload-panel">
          <div 
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="drop-zone-content">
              <div className="upload-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17,8 12,3 7,8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="drop-text">Drop your files here or</p>
              
              <div className="upload-button-container">
                <button 
                  className="upload-btn"
                  onClick={() => setShowSourceMenu(!showSourceMenu)}
                >
                  Upload ▼
                </button>
                
                {showSourceMenu && (
                  <div className="source-menu">
                    <button 
                      className="source-option"
                      onClick={() => handleSourceSelect('desktop')}
                    >
                      <span className="source-icon">💻</span>
                      Desktop
                    </button>
                    <button 
                      className="source-option"
                      onClick={() => handleSourceSelect('google-drive')}
                      disabled={isLoadingDrive}
                    >
                      <span className="source-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M12 11L7.5 18.5H17L22 9.5L17 2.5L12 11Z"/>
                          <path fill="#34A853" d="M7.5 18.5L2 9.5L7 2.5L12 11L7.5 18.5Z"/>
                          <path fill="#FBBC04" d="M17 2.5L7 2.5L12 11L17 2.5Z"/>
                          <path fill="#EA4335" d="M7.5 18.5H17L22 9.5H12L7.5 18.5Z"/>
                        </svg>
                      </span>
                      {isLoadingDrive ? 'Loading...' : 'Google Drive'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <div className="supported-formats">
            <p>Supported formats: PDF, DOC, DOCX</p>
          </div>
        </div>
      </div>

      {/* Google Drive Picker Modal */}
      {showGooglePicker && (
        <div className="modal-overlay">
          <div className="modal-content google-picker-modal">
            <div className="modal-header">
              <h3>Select from Google Drive</h3>
              <button className="close-btn" onClick={() => setShowGooglePicker(false)}>×</button>
            </div>
            <div className="modal-body">
              {driveFiles.length === 0 ? (
                <p className="empty-state">No documents found in Google Drive</p>
              ) : (
                <ul className="drive-file-list">
                  {driveFiles.map((file: any) => (
                    <li 
                      key={file.id} 
                      className="drive-file-item"
                      onClick={() => handleGoogleDriveFileSelect(file)}
                    >
                      <span className="file-icon">📄</span>
                      <span className="file-name">{file.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
