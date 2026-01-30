import { useState } from 'react';
import { toast } from 'react-toastify';
import { PDFDocument, rgb } from 'pdf-lib';
import api from '../../api';
import { DocumentFile, PlacedField } from './EnvelopeWizard';
import './SelfSignComplete.css';

interface SelfSignCompleteProps {
  documents: DocumentFile[];
  fields: PlacedField[];
  signedFields: Set<string>;
  onComplete: () => void;
}

export default function SelfSignComplete({
  documents,
  fields,
  signedFields,
  onComplete,
}: SelfSignCompleteProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const allSigned = fields.every(f => signedFields.has(f.id));
  const signedCount = fields.filter(f => signedFields.has(f.id)).length;

  // Embed signatures into PDF
  const generateSignedPdf = async (): Promise<Uint8Array | null> => {
    const doc = documents[0];
    if (!doc?.file) return null;

    try {
      // Load the original PDF
      const pdfBytes = await doc.file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

      // Process each field
      for (const field of fields) {
        if (!signedFields.has(field.id)) continue;

        const page = pages[field.page - 1];
        if (!page) continue;

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

        if (field.type === 'signature' && field.signatureData) {
          // Embed signature image
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

            // Draw the signature on the page
            page.drawImage(image, {
              x: absX,
              y: pdfY,
              width: absWidth,
              height: absHeight,
            });
          } catch (imgError) {
            console.error('Error embedding signature image:', imgError);
          }
        } else if (field.type === 'initial' && field.value) {
          // Draw initials as styled text (larger font, centered)
          page.drawText(field.value, {
            x: absX + absWidth / 2 - (field.value.length * 4),
            y: pdfY + absHeight / 2 - 6,
            size: 14,
            color: rgb(0.1, 0.1, 0.18),
          });
        } else if (field.value) {
          // Draw text fields (date, name, email)
          page.drawText(field.value, {
            x: absX + 5,
            y: pdfY + absHeight / 2 - 6,
            size: 12,
            color: rgb(0, 0, 0),
          });
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
    setIsSaving(true);
    try {
      // Generate signed PDF
      const signedPdfBytes = await generateSignedPdf();
      
      // Save the signed document to user's account
      const formData = new FormData();
      formData.append('envelope_data', JSON.stringify({
        documents: documents.map(doc => ({
          id: doc.id,
          name: doc.name,
          source: doc.source,
        })),
        fields: fields.map(f => ({
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          signed: signedFields.has(f.id),
          value: f.value,
        })),
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
        formData.append('file_0', signedFile);
      } else {
        documents.forEach((doc, index) => {
          if (doc.file) {
            formData.append(`file_${index}`, doc.file);
          }
        });
      }

      await api.post('/envelopes/create', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Signed document saved to your account!');
      onComplete();
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Failed to save document');
    } finally {
      setIsSaving(false);
    }
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
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <span className="spinner"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    💾 Save to My Documents
                  </>
                )}
              </button>
            </div>

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
