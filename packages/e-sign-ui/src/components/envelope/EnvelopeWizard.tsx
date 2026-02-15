import { useState, useCallback, useEffect } from 'react';
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

// External document data from PROPMETRIK integration
export interface ExternalDocumentData {
  documentUrl: string;
  documentKey: string;
  filename: string;
  subject: string;
  message: string;
  signers: Array<{ name: string; email: string; role: string }>;
  tenancyId?: string;
  applicationId?: string;
  propertyName?: string;
}

interface EnvelopeWizardProps {
  onComplete: () => void;
  onCancel: () => void;
  currentUser?: CurrentUser;
  externalDocument?: ExternalDocumentData | null;
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

// New: Hybrid mode - current user signs first, then sends to others
const STEPS_SIGN_AND_SEND = [
  { id: 1, label: 'Prepare', icon: '📝' },
  { id: 2, label: 'Place Fields', icon: '✍️' },
  { id: 3, label: 'Sign', icon: '✍️' },
  { id: 4, label: 'Review & Send', icon: '📤' },
];

export default function EnvelopeWizard({ onComplete, onCancel, currentUser, externalDocument }: EnvelopeWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSelfSigning, setIsSelfSigning] = useState(false);
  const [isSignAndSend, setIsSignAndSend] = useState(false); // Hybrid mode: current user signs, then sends to others
  const [currentUserRecipientId, setCurrentUserRecipientId] = useState<string | null>(null);
  const [signedFields, setSignedFields] = useState<Set<string>>(new Set());
  const [isLoadingExternalDoc, setIsLoadingExternalDoc] = useState(false);

  // Load external document if provided (from PROPMETRIK integration)
  useEffect(() => {
    if (externalDocument) {
      loadExternalDocument(externalDocument);
    }
  }, [externalDocument]);

  const loadExternalDocument = async (extDoc: ExternalDocumentData) => {
    // Prevent double loading
    if (isLoadingExternalDoc || documents.length > 0) {
      console.log('⏭️ Skipping external document load - already loaded or loading');
      return;
    }
    
    setIsLoadingExternalDoc(true);
    try {
      console.log('📄 Loading external document:', extDoc.filename);
      console.log('📋 Signers received:', extDoc.signers);
      
      // Fetch the PDF from the presigned URL
      const response = await fetch(extDoc.documentUrl, {
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status}`);
      }
      
      const blob = await response.blob();
      const file = new File([blob], extDoc.filename, { type: 'application/pdf' });
      
      // Create document entry
      const doc: DocumentFile = {
        id: `ext-doc-${Date.now()}`,
        name: extDoc.filename,
        source: 'desktop',
        file: file,
      };
      
      setDocuments([doc]);
      setSubject(extDoc.subject);
      setMessage(extDoc.message);
      
      // Create recipients from signers
      const RECIPIENT_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c'];
      const recipientList: Recipient[] = extDoc.signers.map((signer, index) => ({
        id: `recipient-${index + 1}`,
        name: signer.name,
        email: signer.email,
        role: 'signer' as const,
        color: RECIPIENT_COLORS[index % RECIPIENT_COLORS.length],
        order: index + 1
      }));
      
      console.log('👥 Created recipients:', recipientList);
      
      setRecipients(recipientList);
      checkSelfSigning(recipientList);
      
      // Skip to step 2 (field placement) since document is already loaded
      setCurrentStep(2);
      
      console.log('✅ External document loaded successfully with', recipientList.length, 'signers');
    } catch (error) {
      console.error('Failed to load external document:', error);
    } finally {
      setIsLoadingExternalDoc(false);
    }
  };

  // Detect self-signing mode (only signer is current user) OR sign-and-send mode (current user is one of multiple signers)
  const checkSelfSigning = (recipientList: Recipient[]) => {
    const signers = recipientList.filter(r => r.role === 'signer');
    
    // Check if current user is among the signers
    const currentUserSigner = currentUser ? signers.find(s => 
      s.email.toLowerCase() === currentUser.email.toLowerCase()
    ) : null;
    
    if (signers.length === 1 && signers[0].id === 'self-signer' && currentUser) {
      // Pure self-signing: only one signer and it's the current user
      setIsSelfSigning(true);
      setIsSignAndSend(false);
      setCurrentUserRecipientId('self-signer');
    } else if (currentUserSigner && signers.length > 1) {
      // Hybrid mode: current user is one of multiple signers - they sign first, then send to others
      setIsSelfSigning(false);
      setIsSignAndSend(true);
      setCurrentUserRecipientId(currentUserSigner.id);
      console.log('📝 Sign & Send mode: Current user will sign first, then send to others');
    } else if (currentUserSigner && signers.length === 1) {
      // Current user is the only signer (matched by email)
      setIsSelfSigning(true);
      setIsSignAndSend(false);
      setCurrentUserRecipientId(currentUserSigner.id);
    } else {
      // Current user is not a signer, just sending to others
      setIsSelfSigning(false);
      setIsSignAndSend(false);
      setCurrentUserRecipientId(null);
    }
  };

  const STEPS = isSelfSigning ? STEPS_SELF_SIGN : (isSignAndSend ? STEPS_SIGN_AND_SEND : STEPS_SEND);
  const totalSteps = STEPS.length;

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
          // For sending to others (or sign-and-send): each signer needs at least one signature field
          const signers = recipients.filter(r => r.role === 'signer');
          return signers.every(signer => 
            fields.some(f => f.recipientId === signer.id && f.type === 'signature')
          );
        }
      case 3:
        if (isSignAndSend) {
          // For sign-and-send: current user's fields must be signed
          const currentUserFields = fields.filter(f => f.recipientId === currentUserRecipientId);
          const allCurrentUserSigned = currentUserFields.every(f => signedFields.has(f.id));
          return currentUserFields.length > 0 && allCurrentUserSigned;
        }
        return true; // Ready to send/complete for other modes
      case 4:
        return true; // Final step - ready to send (only for sign-and-send mode)
      default:
        return false;
    }
  }, [currentStep, documents, recipients, fields, subject, isSelfSigning, isSignAndSend, signedFields, currentUserRecipientId]);

  const handleNext = () => {
    if (canProceed() && currentStep < totalSteps) {
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

        {/* Step 3 for regular send mode (not self-sign, not sign-and-send) */}
        {currentStep === 3 && !isSelfSigning && !isSignAndSend && (
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

        {/* Step 3 for self-signing mode */}
        {currentStep === 3 && isSelfSigning && (
          <SelfSignComplete
            documents={documents}
            fields={fields}
            signedFields={signedFields}
            onComplete={onComplete}
            currentUser={currentUser}
          />
        )}

        {/* Step 3 for sign-and-send mode: Current user signs their fields */}
        {currentStep === 3 && isSignAndSend && (
          <FieldPlacement
            documents={documents}
            recipients={recipients.filter(r => r.id === currentUserRecipientId)} // Only show current user's recipient
            fields={fields.filter(f => f.recipientId === currentUserRecipientId)} // Only show current user's fields
            onFieldsChange={(newFields) => {
              // Merge updated fields back into the full fields array
              setFields(prev => prev.map(f => {
                const updated = newFields.find(nf => nf.id === f.id);
                return updated || f;
              }));
            }}
            isSelfSigning={true} // Enable signing mode for this step
            signedFields={signedFields}
            onFieldSigned={handleFieldSigned}
            currentUser={currentUser}
          />
        )}

        {/* Step 4 for sign-and-send mode: Review and send to remaining signers */}
        {currentStep === 4 && isSignAndSend && (
          <EnvelopeReview
            documents={documents}
            recipients={recipients}
            fields={fields}
            subject={subject}
            message={message}
            onSubjectChange={setSubject}
            onMessageChange={setMessage}
            onComplete={onComplete}
            currentUserSigned={true}
            currentUserRecipientId={currentUserRecipientId}
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
          
          {currentStep < totalSteps ? (
            <button 
              className="btn btn-primary"
              onClick={handleNext}
              disabled={!canProceed()}
            >
              {currentStep === 2 && isSelfSigning ? 'Finish' : 
               currentStep === 3 && isSignAndSend ? 'Continue to Send →' : 
               'Next →'}
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
