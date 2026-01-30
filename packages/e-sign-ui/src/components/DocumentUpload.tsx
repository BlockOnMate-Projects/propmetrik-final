import { useState, useRef } from 'react';
import { uploadDocument } from '../api';
import { toast } from 'react-toastify';
import './DocumentUpload.css';

interface DocumentUploadProps {
  onUploadSuccess?: () => void;
}

function DocumentUpload({ onUploadSuccess }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      toast.error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
      return;
    }

    // Validate file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size exceeds 50MB limit');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name);

      await uploadDocument(formData);
      toast.success(`"${file.name}" uploaded successfully!`);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      onUploadSuccess?.();
    } catch (error: any) {
      console.error('Upload failed:', error);
      const errorMsg = error?.response?.data?.detail || 'Failed to upload document';
      toast.error(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="document-upload">
      <input
        ref={fileInputRef}
        type="file"
        onChange={(e) => handleFileSelect(e.target.files)}
        accept=".pdf,.doc,.docx"
        style={{ display: 'none' }}
        disabled={uploading}
      />

      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleButtonClick}
      >
        {uploading ? (
          <div className="upload-status">
            <div className="spinner"></div>
            <p>Uploading document...</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">📤</div>
            <h3>Upload Document</h3>
            <p>Drag and drop your file here, or click to browse</p>
            <p className="upload-hint">Supported: PDF, DOC, DOCX (Max 50MB)</p>
          </>
        )}
      </div>
    </div>
  );
}

export default DocumentUpload;
