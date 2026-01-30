import { useState, useCallback } from 'react';
import PrepareEnvelope from './PrepareEnvelope';
import FieldPlacement from './FieldPlacement';
import EnvelopeReview from './EnvelopeReview';
import SelfSignComplete from './SelfSignComplete';
import './EnvelopeWizard.css';

export interface DocumentFile {
  id: string;
  name: string;
  source: 'desktop' | 'google-drive';
  file?: File;
  driveId?: string;
  pageCount?: number;
  previewUrl?: string;
  pdfBytes?: ArrayBuffer; // Raw PDF bytes for manipulation
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'cc' | 'viewer';
  color: string;
  order: number;
}

export interface SignatureData {
  type: 'typed' | 'drawn' | 'uploaded';
  data: string; // Base64 image data URL
  fontFamily?: string; // For typed signatures
}

export interface PlacedField {
  id: string;
  type: 'signature' | 'initial' | 'date_signed' | 'name' | 'email' | 'company' | 'title' | 'text' | 'checkbox' | 'dropdown';
  recipientId: string;
  documentId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
  signatureData?: SignatureData; // The actual signature image/data when signed
  value?: string; // For text, date, name, email fields
}

interface CurrentUser {
  name: string;
  email: string;
}

interface EnvelopeWizardProps {
  onComplete: () => void;
  onCancel: () => void;
  currentUser?: CurrentUser;
}

const STEPS_SEND = [
  { id: 1, label: 'Prepare', icon: '📝' },
  { id: 2, label: 'Place Fields', icon: '✍️' },
  { id: 3, label: 'Review & Send', icon: '📤' },
];

const STEPS_SELF_SIGN = [
  { id: 1, label: 'Prepare', icon: '📝' },
  { id: 2, label: 'Sign', icon: '✍️' },
  { id: 3, label: 'Complete', icon: '✓' },
];

export default function EnvelopeWizard({ onComplete, onCancel, currentUser }: EnvelopeWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSelfSigning, setIsSelfSigning] = useState(false);
  const [signedFields, setSignedFields] = useState<Set<string>>(new Set());

  // Detect self-signing mode (only signer is current user)
  const checkSelfSigning = (recipientList: Recipient[]) => {
    const signers = recipientList.filter(r => r.role === 'signer');
    if (signers.length === 1 && signers[0].id === 'self-signer' && currentUser) {
      setIsSelfSigning(true);
    } else {
      setIsSelfSigning(false);
    }
  };

  const STEPS = isSelfSigning ? STEPS_SELF_SIGN : STEPS_SEND;

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 1:
        // Need at least 1 document, 1 signer, and a subject
        const hasDocuments = documents.length > 0;
        const hasSigners = recipients.filter(r => r.role === 'signer').length > 0;
        const hasSubject = subject.trim() !== '';
        return hasDocuments && hasSigners && hasSubject;
      case 2:
        if (isSelfSigning) {
          // For self-signing: need at least one field AND all fields must be signed
          const hasFields = fields.length > 0;
          const allSigned = fields.every(f => signedFields.has(f.id));
          return hasFields && allSigned;
        } else {
          // For sending to others: each signer needs at least one signature field
          const signers = recipients.filter(r => r.role === 'signer');
          return signers.every(signer => 
            fields.some(f => f.recipientId === signer.id && f.type === 'signature')
          );
        }
      case 3:
        return true; // Ready to send/complete
      default:
        return false;
    }
  }, [currentStep, documents, recipients, fields, subject, isSelfSigning, signedFields]);

  const handleNext = () => {
    if (canProceed() && currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleDocumentsChange = (docs: DocumentFile[]) => {
    setDocuments(docs);
    // Auto-generate subject from first document
    if (docs.length > 0 && !subject) {
      setSubject(`Please sign: ${docs[0].name}`);
    }
  };

  const handleRecipientsChange = (recipientList: Recipient[]) => {
    setRecipients(recipientList);
    checkSelfSigning(recipientList);
  };

  const handleFieldSigned = (fieldId: string, signatureData?: SignatureData, value?: string) => {
    setSignedFields(prev => new Set([...prev, fieldId]));
    // Update the field with signature data or value
    setFields(prev => prev.map(field => 
      field.id === fieldId 
        ? { ...field, signatureData, value } 
        : field
    ));
  };



  return (
    <div className="envelope-wizard">
      {/* Header */}
      <div className="wizard-header">
        <div className="wizard-title">
          <button className="back-btn" onClick={onCancel}>
            ← Back
          </button>
          <h1>Create Envelope</h1>
        </div>
        
        {/* Progress Steps */}
        <div className="wizard-steps">
          {STEPS.map((step, index) => (
            <div 
              key={step.id}
              className={`wizard-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
            >
              <div className="step-indicator">
                {currentStep > step.id ? '✓' : step.id}
              </div>
              <span className="step-label">{step.label}</span>
              {index < STEPS.length - 1 && <div className="step-connector" />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="wizard-content">
        {currentStep === 1 && (
          <PrepareEnvelope
            documents={documents}
            onDocumentsChange={handleDocumentsChange}
            recipients={recipients}
            onRecipientsChange={handleRecipientsChange}
            subject={subject}
            onSubjectChange={setSubject}
            message={message}
            onMessageChange={setMessage}
            currentUser={currentUser}
          />
        )}

        {currentStep === 2 && (
          <FieldPlacement
            documents={documents}
            recipients={recipients}
            fields={fields}
            onFieldsChange={setFields}
            isSelfSigning={isSelfSigning}
            signedFields={signedFields}
            onFieldSigned={handleFieldSigned}
            currentUser={currentUser}
          />
        )}

        {currentStep === 3 && !isSelfSigning && (
          <EnvelopeReview
            documents={documents}
            recipients={recipients}
            fields={fields}
            subject={subject}
            message={message}
            onSubjectChange={setSubject}
            onMessageChange={setMessage}
            onComplete={onComplete}
          />
        )}

        {currentStep === 3 && isSelfSigning && (
          <SelfSignComplete
            documents={documents}
            fields={fields}
            signedFields={signedFields}
            onComplete={onComplete}
          />
        )}
      </div>

      {/* Footer */}
      <div className="wizard-footer">
        <div className="footer-left">
          {currentStep > 1 && (
            <button className="btn btn-secondary" onClick={handleBack}>
              ← Back
            </button>
          )}
        </div>
        
        <div className="footer-right">
          <button className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          
          {currentStep < 3 ? (
            <button 
              className="btn btn-primary"
              onClick={handleNext}
              disabled={!canProceed()}
            >
              {currentStep === 2 && isSelfSigning ? 'Finish' : 'Next'} →
            </button>
          ) : isSelfSigning ? (
            <button 
              className="btn btn-primary btn-send"
              onClick={onComplete}
            >
              ✓ Done
            </button>
          ) : (
            <button 
              className="btn btn-primary btn-send"
              disabled={!canProceed()}
              onClick={onComplete}
            >
              📤 Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
