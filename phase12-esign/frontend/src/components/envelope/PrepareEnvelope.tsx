import { useState, useRef } from 'react';
import { DocumentFile, Recipient } from './EnvelopeWizard';
import './PrepareEnvelope.css';

interface CurrentUser {
  name: string;
  email: string;
}

interface PrepareEnvelopeProps {
  documents: DocumentFile[];
  onDocumentsChange: (docs: DocumentFile[]) => void;
  recipients: Recipient[];
  onRecipientsChange: (recipients: Recipient[]) => void;
  subject: string;
  onSubjectChange: (subject: string) => void;
  message: string;
  onMessageChange: (message: string) => void;
  currentUser?: CurrentUser;
}

// Color palette for recipients (DocuSign-style)
const RECIPIENT_COLORS = [
  '#4318ff', // Purple/Blue - Primary signer
  '#22c55e', // Green
  '#f59e0b', // Orange
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
];

export default function PrepareEnvelope({
  documents,
  onDocumentsChange,
  recipients,
  onRecipientsChange,
  subject,
  onSubjectChange,
  message,
  onMessageChange,
  currentUser,
}: PrepareEnvelopeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [newRecipient, setNewRecipient] = useState({ name: '', email: '', role: 'signer' as const });
  const [isOnlySigner, setIsOnlySigner] = useState(false);
  const [signingOrderEnabled, setSigningOrderEnabled] = useState(false);

  // Handle "I'm the only signer" toggle
  const handleOnlySignerToggle = (checked: boolean) => {
    setIsOnlySigner(checked);
    
    if (checked && currentUser) {
      // Add current user as the only signer
      const selfRecipient: Recipient = {
        id: 'self-signer',
        name: currentUser.name,
        email: currentUser.email,
        role: 'signer',
        color: RECIPIENT_COLORS[0],
        order: 1,
      };
      onRecipientsChange([selfRecipient]);
    } else if (!checked) {
      // Remove self-signer if unchecked and it was the only one
      if (recipients.length === 1 && recipients[0].id === 'self-signer') {
        onRecipientsChange([]);
      }
    }
  };

  // Document handling
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    const newDocs: DocumentFile[] = Array.from(files).map(file => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: file.name,
      source: 'desktop' as const,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    onDocumentsChange([...documents, ...newDocs]);
    
    // Auto-generate subject if empty
    if (!subject && newDocs.length > 0) {
      onSubjectChange(`Please sign: ${newDocs[0].name.replace(/\.[^/.]+$/, '')}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const removeDocument = (id: string) => {
    onDocumentsChange(documents.filter(d => d.id !== id));
  };

  // Recipient handling
  const addRecipient = () => {
    if (!newRecipient.name.trim() || !newRecipient.email.trim()) return;

    const recipient: Recipient = {
      id: `recipient-${Date.now()}`,
      name: newRecipient.name.trim(),
      email: newRecipient.email.trim(),
      role: newRecipient.role,
      color: RECIPIENT_COLORS[recipients.length % RECIPIENT_COLORS.length],
      order: recipients.length + 1,
    };

    onRecipientsChange([...recipients, recipient]);
    setNewRecipient({ name: '', email: '', role: 'signer' });
  };

  const removeRecipient = (id: string) => {
    const updated = recipients.filter(r => r.id !== id);
    updated.forEach((r, i) => {
      r.order = i + 1;
      r.color = RECIPIENT_COLORS[i % RECIPIENT_COLORS.length];
    });
    onRecipientsChange(updated);
  };

  const updateRecipient = (id: string, updates: Partial<Recipient>) => {
    onRecipientsChange(
      recipients.map(r => r.id === id ? { ...r, ...updates } : r)
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newRecipient.name && newRecipient.email) {
      addRecipient();
    }
  };

  return (
    <div className="prepare-envelope">
      {/* Left Column - Documents */}
      <div className="prepare-column documents-column">
        <div className="column-header">
          <h2>📄 Documents</h2>
          <span className="doc-count">{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Document List */}
        {documents.length > 0 && (
          <div className="document-list">
            {documents.map((doc, index) => (
              <div key={doc.id} className="document-item">
                <div className="doc-icon">📄</div>
                <div className="doc-info">
                  <span className="doc-name">{doc.name}</span>
                  <span className="doc-source">From {doc.source === 'desktop' ? 'Desktop' : 'Google Drive'}</span>
                </div>
                <div className="doc-actions">
                  <button 
                    className="move-btn"
                    disabled={index === 0}
                    onClick={() => {
                      const newDocs = [...documents];
                      [newDocs[index - 1], newDocs[index]] = [newDocs[index], newDocs[index - 1]];
                      onDocumentsChange(newDocs);
                    }}
                  >↑</button>
                  <button 
                    className="move-btn"
                    disabled={index === documents.length - 1}
                    onClick={() => {
                      const newDocs = [...documents];
                      [newDocs[index], newDocs[index + 1]] = [newDocs[index + 1], newDocs[index]];
                      onDocumentsChange(newDocs);
                    }}
                  >↓</button>
                  <button 
                    className="remove-btn"
                    onClick={() => removeDocument(doc.id)}
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Drop Zone */}
        <div 
          className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx"
            onChange={(e) => handleFileSelect(e.target.files)}
            style={{ display: 'none' }}
          />
          <div className="drop-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="drop-text">Drop files here or <span className="upload-link">browse</span></p>
        </div>
      </div>

      {/* Right Column - Recipients & Message */}
      <div className="prepare-column recipients-column">
        {/* Recipients Section */}
        <div className="section recipients-section">
          <div className="column-header">
            <h2>👥 Add Recipients</h2>
          </div>

          {/* I'm the only signer checkbox */}
          <div className="only-signer-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isOnlySigner}
                onChange={(e) => handleOnlySignerToggle(e.target.checked)}
              />
              <span className="checkbox-custom"></span>
              <span className="checkbox-text">I'm the only signer</span>
              <span className="info-icon" title="Check this if you're the only one who needs to sign this document">ⓘ</span>
            </label>
          </div>

          {/* Set signing order option */}
          <div className="signing-order-row">
            <label className={`checkbox-label ${isOnlySigner ? 'disabled' : ''}`}>
              <input 
                type="checkbox" 
                checked={signingOrderEnabled}
                onChange={(e) => setSigningOrderEnabled(e.target.checked)}
                disabled={isOnlySigner}
              />
              <span className="checkbox-custom"></span>
              <span className="checkbox-text">Set signing order</span>
            </label>
            {signingOrderEnabled && !isOnlySigner && (
              <span className="order-hint">Drag recipients to reorder</span>
            )}
          </div>

          {/* Recipient List */}
          {!isOnlySigner && recipients.length > 0 && (
            <div className="recipient-list">
              {recipients.map((recipient, index) => (
                <div key={recipient.id} className="recipient-row">
                  {signingOrderEnabled && (
                    <div className="order-controls">
                      <button 
                        className="order-btn"
                        onClick={() => {
                          if (index > 0) {
                            const newRecipients = [...recipients];
                            [newRecipients[index], newRecipients[index - 1]] = [newRecipients[index - 1], newRecipients[index]];
                            newRecipients.forEach((r, i) => r.order = i + 1);
                            onRecipientsChange(newRecipients);
                          }
                        }}
                        disabled={index === 0}
                      >↑</button>
                      <span className="order-number">{index + 1}</span>
                      <button 
                        className="order-btn"
                        onClick={() => {
                          if (index < recipients.length - 1) {
                            const newRecipients = [...recipients];
                            [newRecipients[index], newRecipients[index + 1]] = [newRecipients[index + 1], newRecipients[index]];
                            newRecipients.forEach((r, i) => r.order = i + 1);
                            onRecipientsChange(newRecipients);
                          }
                        }}
                        disabled={index === recipients.length - 1}
                      >↓</button>
                    </div>
                  )}
                  <div 
                    className="recipient-avatar"
                    style={{ backgroundColor: recipient.color }}
                  >
                    {recipient.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="recipient-inputs">
                    <input
                      type="text"
                      value={recipient.name}
                      onChange={(e) => updateRecipient(recipient.id, { name: e.target.value })}
                      placeholder="Name"
                      className="name-input"
                    />
                    <input
                      type="email"
                      value={recipient.email}
                      onChange={(e) => updateRecipient(recipient.id, { email: e.target.value })}
                      placeholder="Email"
                      className="email-input"
                    />
                  </div>
                  <select
                    value={recipient.role}
                    onChange={(e) => updateRecipient(recipient.id, { role: e.target.value as Recipient['role'] })}
                    className="role-select"
                  >
                    <option value="signer">Needs to Sign</option>
                    <option value="cc">Receives Copy</option>
                    <option value="viewer">Needs to View</option>
                  </select>
                  <button 
                    className="remove-recipient-btn"
                    onClick={() => removeRecipient(recipient.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Recipient Row - Only show when not "only signer" */}
          {!isOnlySigner && (
            <div className="add-recipient-row">
              <div 
                className="recipient-avatar placeholder"
                style={{ backgroundColor: RECIPIENT_COLORS[recipients.length % RECIPIENT_COLORS.length] + '40' }}
              >
                +
              </div>
              <div className="recipient-inputs">
                <input
                  type="text"
                  value={newRecipient.name}
                  onChange={(e) => setNewRecipient({ ...newRecipient, name: e.target.value })}
                  onKeyPress={handleKeyPress}
                  placeholder="Name *"
                  className="name-input"
                />
                <input
                  type="email"
                  value={newRecipient.email}
                  onChange={(e) => setNewRecipient({ ...newRecipient, email: e.target.value })}
                  onKeyPress={handleKeyPress}
                  placeholder="Email *"
                  className="email-input"
                />
              </div>
              <select
                value={newRecipient.role}
                onChange={(e) => setNewRecipient({ ...newRecipient, role: e.target.value as any })}
                className="role-select"
              >
                <option value="signer">Needs to Sign</option>
                <option value="cc">Receives Copy</option>
                <option value="viewer">Needs to View</option>
              </select>
              <button 
                className="add-btn"
                onClick={addRecipient}
                disabled={!newRecipient.name || !newRecipient.email}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Message Section */}
        <div className="section message-section">
          <div className="column-header">
            <h2>✉️ Email Subject & Message</h2>
          </div>

          <div className="message-fields">
            <div className="field-group">
              <label>Email Subject *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="Please sign: Document Name"
                className="subject-input"
              />
            </div>

            <div className="field-group">
              <label>Message to Recipients (optional)</label>
              <textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Add a personal message to your recipients..."
                className="message-textarea"
                rows={4}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
