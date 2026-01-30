import { useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api';
import { DocumentFile, Recipient, PlacedField } from './EnvelopeWizard';
import './EnvelopeReview.css';

interface EnvelopeReviewProps {
  documents: DocumentFile[];
  recipients: Recipient[];
  fields: PlacedField[];
  subject: string;
  message: string;
  onSubjectChange: (subject: string) => void;
  onMessageChange: (message: string) => void;
  onComplete: () => void;
}

export default function EnvelopeReview({
  documents,
  recipients,
  fields,
  subject,
  message,
  onSubjectChange,
  onMessageChange,
  onComplete,
}: EnvelopeReviewProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reminderFrequency, setReminderFrequency] = useState('3');
  const [expiresInDays, setExpiresInDays] = useState('30');

  const signers = recipients.filter(r => r.role === 'signer');
  const ccRecipients = recipients.filter(r => r.role === 'cc');

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare envelope data
      const envelopeData = {
        subject,
        message,
        documents: documents.map(doc => ({
          id: doc.id,
          name: doc.name,
          source: doc.source,
          driveId: doc.driveId,
        })),
        recipients: recipients.map(r => ({
          name: r.name,
          email: r.email,
          role: r.role,
          order: r.order,
        })),
        fields: fields.map(f => ({
          type: f.type,
          recipientEmail: recipients.find(r => r.id === f.recipientId)?.email,
          documentIndex: documents.findIndex(d => d.id === f.documentId),
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required,
        })),
        settings: {
          reminderFrequencyDays: parseInt(reminderFrequency),
          expiresInDays: parseInt(expiresInDays),
        },
      };

      // Upload files if from desktop
      const formData = new FormData();
      formData.append('envelope_data', JSON.stringify(envelopeData));
      
      documents.forEach((doc, index) => {
        if (doc.file) {
          formData.append('files', doc.file);
        }
      });

      await api.post('/envelopes/create', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Envelope sent successfully!');
      onComplete();
    } catch (error: any) {
      console.error('Error sending envelope:', error);
      toast.error(error.response?.data?.detail || 'Failed to send envelope');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="envelope-review">
      <div className="review-layout">
        {/* Left - Summary */}
        <div className="summary-panel">
          <h2>Review Your Envelope</h2>

          {/* Documents Summary */}
          <div className="summary-section">
            <h3>📄 Documents ({documents.length})</h3>
            <div className="summary-list">
              {documents.map(doc => (
                <div key={doc.id} className="summary-item">
                  <span className="item-icon">📄</span>
                  <span className="item-name">{doc.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recipients Summary */}
          <div className="summary-section">
            <h3>👥 Recipients ({recipients.length})</h3>
            <div className="summary-list">
              {signers.map(signer => (
                <div key={signer.id} className="summary-item">
                  <span 
                    className="recipient-dot"
                    style={{ backgroundColor: signer.color }}
                  />
                  <div className="recipient-info">
                    <span className="item-name">{signer.name}</span>
                    <span className="item-email">{signer.email}</span>
                  </div>
                  <span className="role-badge signer">Signer</span>
                </div>
              ))}
              {ccRecipients.map(cc => (
                <div key={cc.id} className="summary-item">
                  <span 
                    className="recipient-dot"
                    style={{ backgroundColor: cc.color }}
                  />
                  <div className="recipient-info">
                    <span className="item-name">{cc.name}</span>
                    <span className="item-email">{cc.email}</span>
                  </div>
                  <span className="role-badge cc">Copy</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fields Summary */}
          <div className="summary-section">
            <h3>✍️ Signature Fields ({fields.length})</h3>
            <div className="fields-summary">
              {signers.map(signer => {
                const signerFields = fields.filter(f => f.recipientId === signer.id);
                return (
                  <div key={signer.id} className="signer-fields">
                    <span 
                      className="signer-indicator"
                      style={{ backgroundColor: signer.color }}
                    >
                      {signer.name.charAt(0)}
                    </span>
                    <span className="signer-name">{signer.name}</span>
                    <span className="field-count">{signerFields.length} fields</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right - Message Form */}
        <div className="message-panel">
          <div className="message-header">
            <h2>📧 Email Message</h2>
            <p>Customize the message recipients will see</p>
          </div>

          <div className="form-group">
            <label>Email Subject *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Enter email subject"
              className="subject-input"
            />
            <span className="char-count">{subject.length}/100</span>
          </div>

          <div className="form-group">
            <label>Message</label>
            <textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="Add a personal message to the email (optional)"
              className="message-input"
              rows={6}
            />
            <span className="char-count">{message.length}/10000</span>
          </div>

          {/* Settings */}
          <div className="settings-section">
            <h3>⚙️ Settings</h3>
            
            <div className="setting-row">
              <label>Reminder Frequency</label>
              <select 
                value={reminderFrequency}
                onChange={(e) => setReminderFrequency(e.target.value)}
              >
                <option value="1">Every day</option>
                <option value="2">Every 2 days</option>
                <option value="3">Every 3 days</option>
                <option value="7">Weekly</option>
                <option value="0">No reminders</option>
              </select>
            </div>

            <div className="setting-row">
              <label>Expires After</label>
              <select 
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
              </select>
            </div>
          </div>

          {/* Send Button */}
          <div className="send-section">
            <button
              className="send-button"
              onClick={handleSend}
              disabled={isSubmitting || !subject.trim()}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner"></span>
                  Sending...
                </>
              ) : (
                <>
                  📤 Send Envelope
                </>
              )}
            </button>
            <p className="send-note">
              Recipients will receive an email with a link to sign the documents
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
