import { useState } from 'react';
import { createSignatureRequest } from '../api';
import { toast } from 'react-toastify';
import './CreateSignatureRequest.css';

interface Document {
  id: number;
  title: string;
}

interface CreateSignatureRequestProps {
  document?: Document;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface Signer {
  email: string;
  full_name: string;
  order: number;
}

function CreateSignatureRequest({ document, onSuccess, onCancel }: CreateSignatureRequestProps) {
  const [title, setTitle] = useState(document ? `Signature Request: ${document.title}` : '');
  const [message, setMessage] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [signers, setSigners] = useState<Signer[]>([
    { email: '', full_name: '', order: 1 }
  ]);
  const [creating, setCreating] = useState(false);

  const addSigner = () => {
    setSigners([...signers, { email: '', full_name: '', order: signers.length + 1 }]);
  };

  const removeSigner = (index: number) => {
    if (signers.length <= 1) {
      toast.warning('At least one signer is required');
      return;
    }
    const newSigners = signers.filter((_, i) => i !== index);
    // Reorder remaining signers
    newSigners.forEach((signer, i) => {
      signer.order = i + 1;
    });
    setSigners(newSigners);
  };

  const updateSigner = (index: number, field: keyof Signer, value: string) => {
    const newSigners = [...signers];
    newSigners[index] = { ...newSigners[index], [field]: value };
    setSigners(newSigners);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!document) {
      toast.error('Please select a document first');
      return;
    }

    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    // Validate signers
    const validSigners = signers.filter(s => s.email.trim());
    if (validSigners.length === 0) {
      toast.error('Please add at least one signer');
      return;
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const signer of validSigners) {
      if (!emailRegex.test(signer.email)) {
        toast.error(`Invalid email: ${signer.email}`);
        return;
      }
    }

    setCreating(true);

    try {
      await createSignatureRequest({
        document_id: document.id,
        title: title.trim(),
        message: message.trim() || undefined,
        signers: validSigners,
        expires_in_days: expiresInDays
      });

      toast.success('Signature request created successfully!');
      onSuccess?.();
    } catch (error: any) {
      console.error('Failed to create signature request:', error);
      const errorMsg = error?.response?.data?.detail || 'Failed to create signature request';
      toast.error(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  if (!document) {
    return (
      <div className="create-signature-request">
        <div className="empty-state">
          <p>Please select a document from the list to create a signature request.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="create-signature-request">
      <div className="form-header">
        <h3>✍️ Create Signature Request</h3>
        <p className="selected-doc">Document: <strong>{document.title}</strong></p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Request Title *</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., NDA Signature Request"
            required
            disabled={creating}
          />
        </div>

        <div className="form-group">
          <label htmlFor="message">Message to Signers (optional)</label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Please review and sign the attached document..."
            rows={3}
            disabled={creating}
          />
        </div>

        <div className="form-group">
          <label htmlFor="expires">Expires In (days)</label>
          <input
            id="expires"
            type="number"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(parseInt(e.target.value))}
            min="1"
            max="365"
            disabled={creating}
          />
        </div>

        <div className="signers-section">
          <div className="signers-header">
            <label>Signers *</label>
            <button
              type="button"
              onClick={addSigner}
              className="add-signer-btn"
              disabled={creating}
            >
              + Add Signer
            </button>
          </div>

          {signers.map((signer, index) => (
            <div key={index} className="signer-item">
              <div className="signer-order">#{signer.order}</div>
              <div className="signer-fields">
                <input
                  type="email"
                  value={signer.email}
                  onChange={(e) => updateSigner(index, 'email', e.target.value)}
                  placeholder="signer@example.com"
                  required
                  disabled={creating}
                />
                <input
                  type="text"
                  value={signer.full_name}
                  onChange={(e) => updateSigner(index, 'full_name', e.target.value)}
                  placeholder="Full Name (optional)"
                  disabled={creating}
                />
              </div>
              {signers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSigner(index)}
                  className="remove-signer-btn"
                  disabled={creating}
                  title="Remove signer"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="form-actions">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="cancel-btn"
              disabled={creating}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="submit-btn"
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Signature Request'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateSignatureRequest;
