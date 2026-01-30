import { useState } from 'react';
import { Recipient, DocumentFile } from './EnvelopeWizard';
import './RecipientSetup.css';

interface RecipientSetupProps {
  recipients: Recipient[];
  onRecipientsChange: (recipients: Recipient[]) => void;
  documents: DocumentFile[];
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

export default function RecipientSetup({ recipients, onRecipientsChange, documents }: RecipientSetupProps) {
  const [isAddingRecipient, setIsAddingRecipient] = useState(false);
  const [newRecipient, setNewRecipient] = useState({
    name: '',
    email: '',
    role: 'signer' as const,
  });
  const [iAmOnlySigner, setIAmOnlySigner] = useState(false);
  const [signingOrder, setSigningOrder] = useState(false);

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
    setIsAddingRecipient(false);
  };

  const removeRecipient = (id: string) => {
    const updated = recipients.filter(r => r.id !== id);
    // Reorder
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

  const moveRecipient = (id: string, direction: 'up' | 'down') => {
    const index = recipients.findIndex(r => r.id === id);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === recipients.length - 1)
    ) {
      return;
    }

    const newRecipients = [...recipients];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newRecipients[index], newRecipients[targetIndex]] = [newRecipients[targetIndex], newRecipients[index]];
    
    // Update order and colors
    newRecipients.forEach((r, i) => {
      r.order = i + 1;
      r.color = RECIPIENT_COLORS[i % RECIPIENT_COLORS.length];
    });
    
    onRecipientsChange(newRecipients);
  };

  return (
    <div className="recipient-setup">
      <div className="setup-layout">
        {/* Left - Document Thumbnail */}
        <div className="document-preview-panel">
          <h3>Documents ({documents.length})</h3>
          <div className="document-thumbnails">
            {documents.map((doc) => (
              <div key={doc.id} className="doc-thumbnail">
                <div className="thumbnail-preview">
                  <span className="doc-icon">📄</span>
                </div>
                <span className="thumbnail-name">{doc.name}</span>
                <span className="thumbnail-pages">
                  {doc.pageCount ? `${doc.pageCount} pages` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right - Recipient Form */}
        <div className="recipient-panel">
          <div className="panel-header">
            <h2>Add Recipients</h2>
          </div>

          {/* Options */}
          <div className="recipient-options">
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={iAmOnlySigner}
                onChange={(e) => setIAmOnlySigner(e.target.checked)}
              />
              <span>I'm the only signer</span>
              <span className="option-help">ⓘ</span>
            </label>

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={signingOrder}
                onChange={(e) => setSigningOrder(e.target.checked)}
              />
              <span>Set signing order</span>
            </label>
          </div>

          {/* Recipient List */}
          <div className="recipient-list">
            {recipients.map((recipient) => (
              <div key={recipient.id} className="recipient-card">
                <div 
                  className="recipient-color-bar"
                  style={{ backgroundColor: recipient.color }}
                />
                
                <div className="recipient-content">
                  <div className="recipient-header">
                    <div 
                      className="recipient-avatar"
                      style={{ backgroundColor: recipient.color }}
                    >
                      {recipient.name.charAt(0).toUpperCase()}
                    </div>
                    
                    {signingOrder && (
                      <div className="order-controls">
                        <button 
                          onClick={() => moveRecipient(recipient.id, 'up')}
                          disabled={recipient.order === 1}
                        >
                          ↑
                        </button>
                        <span className="order-number">{recipient.order}</span>
                        <button 
                          onClick={() => moveRecipient(recipient.id, 'down')}
                          disabled={recipient.order === recipients.length}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="recipient-fields">
                    <div className="field-group">
                      <label>Name *</label>
                      <input
                        type="text"
                        value={recipient.name}
                        onChange={(e) => updateRecipient(recipient.id, { name: e.target.value })}
                        placeholder="Recipient name"
                      />
                    </div>
                    
                    <div className="field-group">
                      <label>Email *</label>
                      <input
                        type="email"
                        value={recipient.email}
                        onChange={(e) => updateRecipient(recipient.id, { email: e.target.value })}
                        placeholder="recipient@email.com"
                      />
                    </div>
                  </div>

                  <div className="recipient-role">
                    <select
                      value={recipient.role}
                      onChange={(e) => updateRecipient(recipient.id, { role: e.target.value as Recipient['role'] })}
                    >
                      <option value="signer">✍️ Needs to Sign</option>
                      <option value="cc">📧 Receives a Copy</option>
                      <option value="viewer">👁️ Needs to View</option>
                    </select>
                    
                    <button className="customize-btn">Customize</button>
                  </div>
                </div>

                <button 
                  className="remove-recipient-btn"
                  onClick={() => removeRecipient(recipient.id)}
                  title="Remove recipient"
                >
                  ✕
                </button>
              </div>
            ))}

            {/* Add Recipient Form */}
            {isAddingRecipient ? (
              <div className="add-recipient-form">
                <div className="form-row">
                  <input
                    type="text"
                    value={newRecipient.name}
                    onChange={(e) => setNewRecipient({ ...newRecipient, name: e.target.value })}
                    placeholder="Name"
                    autoFocus
                  />
                  <input
                    type="email"
                    value={newRecipient.email}
                    onChange={(e) => setNewRecipient({ ...newRecipient, email: e.target.value })}
                    placeholder="Email"
                  />
                  <select
                    value={newRecipient.role}
                    onChange={(e) => setNewRecipient({ ...newRecipient, role: e.target.value as any })}
                  >
                    <option value="signer">Needs to Sign</option>
                    <option value="cc">Receives Copy</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setIsAddingRecipient(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={addRecipient}
                    disabled={!newRecipient.name.trim() || !newRecipient.email.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button 
                className="add-recipient-btn"
                onClick={() => setIsAddingRecipient(true)}
              >
                <span className="plus-icon">+</span>
                Add Recipient
              </button>
            )}
          </div>

          {/* Message Section */}
          <div className="message-section">
            <h3>📧 Add Message</h3>
            <div className="message-hint">
              You can customize the email message in the final step
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
