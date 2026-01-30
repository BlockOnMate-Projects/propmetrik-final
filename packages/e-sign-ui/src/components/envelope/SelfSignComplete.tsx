import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import api from '../../api';
import { DocumentFile, PlacedField } from './EnvelopeWizard';
import { getUserInfo } from '../../propmetrik-auth';
import './SelfSignComplete.css';

interface CurrentUser {
  name: string;
  email: string;
  signerPmtId?: string;
}

interface SelfSignCompleteProps {
  documents: DocumentFile[];
  fields: PlacedField[];
  signedFields: Set<string>;
  onComplete: () => void;
  currentUser?: CurrentUser;
}

export default function SelfSignComplete({
  documents,
  fields,
  signedFields,
  onComplete,
  currentUser,
}: SelfSignCompleteProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [savedEnvelopeId, setSavedEnvelopeId] = useState<string | null>(null);
  const [signerPmtId, setSignerPmtId] = useState<string | null>(null);
  const saveAttemptedRef = useRef(false);

  const resolvedUser = currentUser || {
    name: getUserInfo()?.name || 'Me',
    email: getUserInfo()?.email || '',
  };

  const allSigned = fields.every(f => signedFields.has(f.id));
  const signedCount = fields.filter(f => signedFields.has(f.id)).length;

  // Auto-save when all fields are signed
  useEffect(() => {
    if (allSigned && !saveAttemptedRef.current && !hasSaved) {
      saveAttemptedRef.current = true;
      handleAutoSave();
    }
  }, [allSigned]);

  // Fetch or create signer PMT ID before generating PDF
  const fetchSignerPmtId = async (): Promise<string | null> => {
    try {
      // Create a temporary envelope request to get the PMT ID assigned
      const response = await api.post('/users/get-or-create-signer-id', {
        email: resolvedUser.email,
        name: resolvedUser.name,
      });
      return response.data?.signer_pmt_id || null;
    } catch (error) {
      console.warn('Could not fetch signer PMT ID, will use placeholder:', error);
      return null;
    }
  };

  const handleAutoSave = async () => {
    setIsSaving(true);
    try {
      // First, get the PMT ID so we can include it in the PDF badge
      let pmtId = signerPmtId;
      if (!pmtId) {
        pmtId = await fetchSignerPmtId();
        if (pmtId) {
          setSignerPmtId(pmtId);
        }
      }
      
      // Generate PDF with the PMT ID badge
      const signedPdfBytes = await generateSignedPdf(pmtId || undefined);
      const envelopeId = await saveToAccount(signedPdfBytes);
      if (envelopeId) {
        setSavedEnvelopeId(envelopeId);
      }
      setHasSaved(true);
      toast.success('Document automatically saved to your account!');
    } catch (error) {
      console.error('Auto-save error:', error);
      // Don't show error toast for auto-save, user can still manually save
    } finally {
      setIsSaving(false);
    }
  };

  // Embed field images into PDF with signer credentials badge (like DocuSign)
  const generateSignedPdf = async (pmtId?: string): Promise<Uint8Array | null> => {
    const doc = documents[0];
    if (!doc?.file) return null;

    try {
      // Load the original PDF
      const pdfBytes = await doc.file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      
      // Embed font for signer badge text
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      console.log('📄 Generating signed PDF with fields:', fields.map(f => ({
        id: f.id,
        type: f.type,
        value: f.value,
        hasSignatureData: !!f.signatureData,
        isSigned: signedFields.has(f.id)
      })));

      // Get signer ID for the badge (no timestamp needed - documents have date fields)
      const signerIdForBadge = pmtId || signerPmtId || 'PMT-PENDING';

      // Process each field - ALL fields use signatureData (image) approach
      for (const field of fields) {
        if (!signedFields.has(field.id)) {
          console.log(`⏭️ Skipping unsigned field: ${field.type} (${field.id})`);
          continue;
        }

        const page = pages[field.page - 1];
        if (!page) {
          console.log(`⚠️ Page ${field.page} not found for field ${field.id}`);
          continue;
        }

        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();
        
        // Field coordinates are stored as percentages (0-100)
        // Convert to absolute PDF coordinates
        const absX = (field.x / 100) * pageWidth;
        const absY = (field.y / 100) * pageHeight;
        const absWidth = (field.width / 100) * pageWidth;
        const absHeight = (field.height / 100) * pageHeight;
        
        // Convert from top-left origin (web) to bottom-left origin (PDF)
        const pdfY = pageHeight - absY - absHeight;

        console.log(`📍 Processing field: ${field.type}, value: "${field.value}", signatureData: ${!!field.signatureData}`);

        // UNIFIED APPROACH: All fields with signatureData embed as images
        if (field.signatureData?.data) {
          try {
            const imageData = field.signatureData.data;
            let image;
            
            if (imageData.startsWith('data:image/png')) {
              const base64Data = imageData.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              image = await pdfDoc.embedPng(imageBytes);
            } else if (imageData.startsWith('data:image/jpeg') || imageData.startsWith('data:image/jpg')) {
              const base64Data = imageData.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              image = await pdfDoc.embedJpg(imageBytes);
            } else {
              // Try PNG as default
              const base64Data = imageData.split(',')[1];
              const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              image = await pdfDoc.embedPng(imageBytes);
            }

            // Draw the image on the page
            page.drawImage(image, {
              x: absX,
              y: pdfY,
              width: absWidth,
              height: absHeight,
            });
            console.log(`✅ Embedded ${field.type} image at (${absX.toFixed(0)}, ${pdfY.toFixed(0)}) size: ${absWidth.toFixed(0)}x${absHeight.toFixed(0)}`);

            // Add DocuSign-style signer badge: "Signed by:" at TOP, signature in MIDDLE, PMT ID at BOTTOM
            if (field.type === 'signature') {
              const badgeFontSize = 6;
              
              // "Signed by:" label ABOVE the signature
              const topLabelY = pdfY + absHeight + 2; // Position above signature
              page.drawText('Signed by:', {
                x: absX,
                y: topLabelY,
                size: badgeFontSize,
                font: helveticaBold,
                color: rgb(0.3, 0.3, 0.3),
              });
              
              // Permanent Signer ID BELOW the signature (no name, no timestamp)
              const bottomLabelY = pdfY - 8; // Position below signature
              page.drawText(signerIdForBadge, {
                x: absX,
                y: bottomLabelY,
                size: badgeFontSize,
                font: helveticaBold,
                color: rgb(0.0, 0.4, 0.7), // Blue color for PMT ID
              });
              
              console.log(`✅ Added signer badge: ${signerIdForBadge} at Y=${bottomLabelY}`);
            }
          } catch (imgError) {
            console.error(`Error embedding ${field.type} image:`, imgError);
          }
        } else {
          console.log(`⚠️ Field ${field.type} has no signatureData image to embed!`);
        }
      }

      // Save and return the modified PDF
      return await pdfDoc.save();
    } catch (error) {
      console.error('Error generating signed PDF:', error);
      return null;
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // If saved to server, download the certified version with Certificate of Completion
      if (savedEnvelopeId) {
        try {
          // Get envelope details to find the document ID
          const envelopeResponse = await api.get(`/envelopes/${savedEnvelopeId}`);
          const envelope = envelopeResponse.data;
          
          if (envelope.documents && envelope.documents.length > 0 && envelope.documents[0].download_url) {
            // Download from server (includes Certificate of Completion)
            const downloadResponse = await api.get(envelope.documents[0].download_url, {
              responseType: 'blob'
            });
            
            const blob = new Blob([downloadResponse.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `certified_${documents[0]?.name || 'document.pdf'}`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Certified document with Certificate of Completion downloaded!');
            return;
          }
        } catch (serverError) {
          console.warn('Could not download from server, falling back to local:', serverError);
        }
      }
      
      // Fallback: Generate client-side signed PDF (without certificate)
      const signedPdfBytes = await generateSignedPdf();
      
      if (signedPdfBytes) {
        // Create download from signed PDF
        const blob = new Blob([signedPdfBytes as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `signed_${documents[0]?.name || 'document.pdf'}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Signed document downloaded successfully!');
      } else {
        // Fallback to original if PDF generation fails
        if (documents[0]?.file) {
          const url = URL.createObjectURL(documents[0].file);
          const a = document.createElement('a');
          a.href = url;
          a.download = `signed_${documents[0].name}`;
          a.click();
          URL.revokeObjectURL(url);
          toast.warning('Downloaded original document (signature embedding failed)');
        } else {
          toast.error('No document available to download');
        }
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveToAccount = async () => {
    if (hasSaved) {
      toast.info('Document already saved to your account');
      return;
    }
    setIsSaving(true);
    try {
      // First, get the PMT ID so we can include it in the PDF badge
      let pmtId = signerPmtId;
      if (!pmtId) {
        pmtId = await fetchSignerPmtId();
        if (pmtId) {
          setSignerPmtId(pmtId);
        }
      }
      
      const signedPdfBytes = await generateSignedPdf(pmtId || undefined);
      const envelopeId = await saveToAccount(signedPdfBytes);
      if (envelopeId) {
        setSavedEnvelopeId(envelopeId);
      }
      setHasSaved(true);
      toast.success('Signed document saved to your account!');
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Failed to save document');
    } finally {
      setIsSaving(false);
    }
  };

  // Shared save logic - returns envelope ID
  const saveToAccount = async (signedPdfBytes: Uint8Array | null): Promise<string | null> => {
    if (!resolvedUser.email) {
      toast.error('Unable to save: missing user email');
      throw new Error('Missing user email');
    }
    const formData = new FormData();
      formData.append('envelope_data', JSON.stringify({
      subject: `Self-signed: ${documents[0]?.name || 'Document'}`,
      message: '',
      documents: documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        source: doc.source,
      })),
      recipients: [{
          name: resolvedUser.name,
          email: resolvedUser.email,
        role: 'signer',
        order: 1,
      }],
      fields: fields.map(f => ({
        type: f.type,
          recipientEmail: resolvedUser.email,
        documentIndex: 0,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: true,
      })),
      settings: {
        reminderFrequencyDays: 3,
        expiresInDays: 30,
      },
      status: 'completed',
      signedAt: new Date().toISOString(),
      isSelfSigned: true,
    }));

    // If we have a signed PDF, use it; otherwise use original
    if (signedPdfBytes) {
      const signedBlob = new Blob([signedPdfBytes as BlobPart], { type: 'application/pdf' });
      const signedFile = new File([signedBlob], `signed_${documents[0]?.name || 'document.pdf'}`, {
        type: 'application/pdf'
      });
      formData.append('files', signedFile);
    } else {
      documents.forEach((doc, index) => {
        if (doc.file) {
          formData.append('files', doc.file);
        }
      });
    }

    const response = await api.post('/envelopes/create', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    // Capture the signer PMT ID from response
    const pmtIds = response.data?.signer_pmt_ids;
    if (pmtIds && pmtIds.length > 0) {
      setSignerPmtId(pmtIds[0]);
    }
    
    // Return envelope ID for downloading the certified version
    return response.data?.envelope_id || null;
  };

  return (
    <div className="self-sign-complete">
      <div className="complete-content">
        {allSigned ? (
          <>
            <div className="success-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#22c55e" />
                <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h1>Document Signed!</h1>
            <p className="complete-message">
              You have successfully signed the document. You can now download your signed copy or save it to your account.
            </p>

            <div className="document-summary">
              <div className="doc-icon">📄</div>
              <div className="doc-info">
                <h3>{documents[0]?.name}</h3>
                <span className="signed-badge">✓ Signed by you</span>
              </div>
            </div>

            <div className="action-buttons">
              <button 
                className="download-btn"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <span className="spinner"></span>
                    Preparing...
                  </>
                ) : (
                  <>
                    ⬇️ Download Signed Document
                  </>
                )}
              </button>

              <button 
                className="save-btn"
                onClick={handleSaveToAccount}
                disabled={isSaving || hasSaved}
              >
                {isSaving ? (
                  <>
                    <span className="spinner"></span>
                    Saving...
                  </>
                ) : hasSaved ? (
                  <>
                    ✓ Saved to My Documents
                  </>
                ) : (
                  <>
                    💾 Save to My Documents
                  </>
                )}
              </button>
            </div>

            {hasSaved && (
              <div className="auto-saved-notice">
                ✓ Document automatically saved to your account
              </div>
            )}

            <div className="share-options">
              <p>Share signed document:</p>
              <div className="share-buttons">
                <button className="share-btn email">📧 Email</button>
                <button className="share-btn link">🔗 Copy Link</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="pending-icon">⚠️</div>
            <h1>Signing Incomplete</h1>
            <p className="pending-message">
              You have {signedCount} of {fields.length} fields completed.
              Please go back and complete all required fields.
            </p>

            <div className="incomplete-fields">
              <h4>Remaining fields:</h4>
              <ul>
                {fields.filter(f => !signedFields.has(f.id)).map(field => (
                  <li key={field.id}>
                    {field.type.replace('_', ' ')} on page {field.page}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
