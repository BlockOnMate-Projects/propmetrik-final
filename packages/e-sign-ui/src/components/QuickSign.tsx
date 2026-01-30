import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import * as pdfjsLib from 'pdfjs-dist';
import api from '../api';
import './QuickSign.css';

// Set worker path for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface QuickSignProps {
  document?: {
    id: number;
    title: string;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface SignaturePosition {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Signature font options (DocuSign-style)
const SIGNATURE_FONTS = [
  { name: 'Classic', font: 'italic 48px "Brush Script MT", cursive' },
  { name: 'Elegant', font: 'italic 44px Georgia, serif' },
  { name: 'Modern', font: '42px "Segoe Script", cursive' },
  { name: 'Bold', font: 'bold italic 40px "Times New Roman", serif' },
  { name: 'Simple', font: 'italic 38px Arial, sans-serif' },
  { name: 'Handwritten', font: '44px "Comic Sans MS", fantasy' },
];

function QuickSign({ document: documentProp, onSuccess, onCancel }: QuickSignProps) {
  const [file, setFile] = useState<File | null>(null);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signatureType, setSignatureType] = useState<'drawn' | 'typed' | 'uploaded'>('typed');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<SignaturePosition>({
    page: 1,
    x: 50,
    y: 85,
    width: 200,
    height: 60
  });
  const [previewUrl, setPreviewUrl] = useState<string>('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Initialize drawing canvas
  useEffect(() => {
    if (signatureType === 'drawn' && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = 400;
      canvas.height = 120;
      
      const context = canvas.getContext('2d');
      if (context) {
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = '#1a365d';
        context.lineWidth = 2.5;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        contextRef.current = context;
      }
    }
  }, [signatureType]);

  // Generate preview URL
  useEffect(() => {
    if (documentProp) {
      setPreviewUrl(`${api.defaults.baseURL}/quick-sign/${documentProp.id}/preview`);
    }
  }, [documentProp]);

  // Generate typed signature with selected font
  const generateTypedSignature = useCallback((name: string, fontIndex: number) => {
    if (!name.trim()) return '';
    
    const canvas = window.document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw signature text
      ctx.font = SIGNATURE_FONTS[fontIndex].font;
      ctx.fillStyle = '#1a365d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, canvas.width / 2, canvas.height / 2);
      
      // Add underline
      const textWidth = ctx.measureText(name).width;
      ctx.strokeStyle = '#1a365d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo((canvas.width - textWidth) / 2, canvas.height / 2 + 25);
      ctx.lineTo((canvas.width + textWidth) / 2, canvas.height / 2 + 25);
      ctx.stroke();
      
      return canvas.toDataURL('image/png');
    }
    return '';
  }, []);

  // Update signature when font or name changes
  useEffect(() => {
    if (signatureType === 'typed' && typedName.trim()) {
      setSignatureData(generateTypedSignature(typedName, selectedFont));
    }
  }, [typedName, selectedFont, signatureType, generateTypedSignature]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast.error('Only PDF files can be signed directly');
        return;
      }
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !contextRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (contextRef.current) {
      contextRef.current.closePath();
    }
    setIsDrawing(false);
    
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    if (canvasRef.current && contextRef.current) {
      contextRef.current.fillStyle = '#fff';
      contextRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setSignatureData('');
    }
    setTypedName('');
  };

  const handleTypedNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedName(e.target.value);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSignatureData(event.target?.result as string);
      };
      reader.readAsDataURL(uploadedFile);
    }
  };

  // Drag handlers for signature placement
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !previewContainerRef.current) return;
    
    const container = previewContainerRef.current;
    const rect = container.getBoundingClientRect();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    
    setPosition(prev => ({
      ...prev,
      x: Math.max(10, Math.min(90, x)),
      y: Math.max(10, Math.min(90, y))
    }));
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDrag);
      window.addEventListener('touchend', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDrag, handleDragEnd]);

  const handleSubmit = async () => {
    if (!signatureData) {
      toast.error('Please create your signature first');
      return;
    }

    if (!file && !documentProp) {
      toast.error('Please upload a PDF file');
      return;
    }

    setIsLoading(true);

    try {
      if (documentProp) {
        await api.post(`/quick-sign/${documentProp.id}/sign`, {
          signature_data: signatureData,
          signature_type: signatureType,
          page: position.page,
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height
        });
        toast.success('Document signed successfully!');
      } else if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('signature_data', signatureData);
        formData.append('signature_type', signatureType);
        formData.append('page', position.page.toString());
        formData.append('x', position.x.toString());
        formData.append('y', position.y.toString());
        formData.append('width', position.width.toString());
        formData.append('height', position.height.toString());

        await api.post('/quick-sign/upload-and-sign', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Document uploaded and signed successfully!');
      }

      onSuccess?.();
    } catch (error: any) {
      console.error('Quick sign error:', error);
      toast.error(error.response?.data?.detail || 'Failed to sign document');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="quick-sign">
      <div className="quick-sign-header">
        <h2>✍️ Quick Sign</h2>
        <p>Create your signature and place it on the document</p>
      </div>

      <div className="quick-sign-layout">
        {/* Left Panel - Signature Creation */}
        <div className="signature-panel">
          {/* Document Upload (if no document provided) */}
          {!documentProp && (
            <div className="quick-sign-section">
              <h3>📄 Select Document</h3>
              <div className="file-upload-area">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  id="quick-sign-file"
                  className="file-input"
                />
                <label htmlFor="quick-sign-file" className="file-label">
                  {file ? (
                    <span className="file-selected">📄 {file.name}</span>
                  ) : (
                    <span>
                      <span className="upload-icon">📤</span>
                      <span>Click to upload PDF</span>
                    </span>
                  )}
                </label>
              </div>
            </div>
          )}

          {documentProp && (
            <div className="quick-sign-section document-info">
              <h3>📄 Document</h3>
              <p className="document-name">{documentProp.title}</p>
            </div>
          )}

          {/* Signature Creation */}
          <div className="quick-sign-section">
            <h3>✍️ Create Your Signature</h3>
            
            <div className="signature-type-tabs">
              <button
                className={`sig-tab ${signatureType === 'typed' ? 'active' : ''}`}
                onClick={() => { setSignatureType('typed'); clearSignature(); }}
              >
                ⌨️ Type
              </button>
              <button
                className={`sig-tab ${signatureType === 'drawn' ? 'active' : ''}`}
                onClick={() => { setSignatureType('drawn'); clearSignature(); }}
              >
                ✏️ Draw
              </button>
              <button
                className={`sig-tab ${signatureType === 'uploaded' ? 'active' : ''}`}
                onClick={() => { setSignatureType('uploaded'); clearSignature(); }}
              >
                📷 Upload
              </button>
            </div>

            <div className="signature-input-area">
              {signatureType === 'typed' && (
                <div className="type-signature">
                  <input
                    type="text"
                    placeholder="Type your full name"
                    value={typedName}
                    onChange={handleTypedNameChange}
                    className="typed-name-input"
                  />
                  
                  {typedName && (
                    <>
                      <p className="font-label">Select signature style:</p>
                      <div className="font-options">
                        {SIGNATURE_FONTS.map((fontOption, index) => (
                          <button
                            key={index}
                            className={`font-option ${selectedFont === index ? 'active' : ''}`}
                            onClick={() => setSelectedFont(index)}
                          >
                            <span 
                              className="font-preview"
                              style={{ 
                                fontStyle: fontOption.font.includes('italic') ? 'italic' : 'normal',
                                fontWeight: fontOption.font.includes('bold') ? 'bold' : 'normal',
                                fontFamily: fontOption.font.split('"').length > 1 
                                  ? fontOption.font.split('"')[1] 
                                  : 'cursive'
                              }}
                            >
                              {typedName}
                            </span>
                            <small>{fontOption.name}</small>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  
                  {signatureData && (
                    <div className="signature-preview-box">
                      <p>Your Signature:</p>
                      <img src={signatureData} alt="Your Signature" />
                    </div>
                  )}
                </div>
              )}

              {signatureType === 'drawn' && (
                <div className="draw-signature">
                  <p className="draw-hint">Draw your signature below:</p>
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="signature-canvas"
                  />
                  <button className="clear-btn" onClick={clearSignature}>
                    Clear
                  </button>
                </div>
              )}

              {signatureType === 'uploaded' && (
                <div className="upload-signature">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    id="signature-image"
                    className="file-input"
                  />
                  <label htmlFor="signature-image" className="file-label small">
                    {signatureData ? 'Change Image' : 'Upload Signature Image'}
                  </label>
                  {signatureData && (
                    <div className="signature-preview-box">
                      <p>Your Signature:</p>
                      <img src={signatureData} alt="Uploaded Signature" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Page Selection */}
          {signatureData && (
            <div className="quick-sign-section">
              <h3>📍 Placement</h3>
              <div className="placement-controls">
                <div className="control-group">
                  <label>Page Number</label>
                  <input
                    type="number"
                    min="1"
                    value={position.page}
                    onChange={(e) => setPosition({ ...position, page: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <p className="placement-hint">
                  👆 Drag the signature on the preview to position it
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Document Preview with Signature Overlay */}
        <div className="preview-panel">
          <h3>📋 Document Preview</h3>
          {previewUrl ? (
            <div 
              className="document-preview-container" 
              ref={previewContainerRef}
            >
              <iframe
                src={previewUrl}
                title="Document Preview"
                className="preview-iframe"
              />
              
              {/* Draggable Signature Overlay */}
              {signatureData && (
                <div
                  className={`signature-overlay ${isDragging ? 'dragging' : ''}`}
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  onMouseDown={handleDragStart}
                  onTouchStart={handleDragStart}
                >
                  <img src={signatureData} alt="Signature" />
                  <div className="overlay-hint">Drag to position</div>
                </div>
              )}
            </div>
          ) : (
            <div className="no-preview">
              <p>📄 Upload a document to see preview</p>
            </div>
          )}
        </div>
      </div>

      <div className="quick-sign-actions">
        <button
          className="cancel-btn"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          className="sign-btn"
          onClick={handleSubmit}
          disabled={isLoading || !signatureData || (!file && !documentProp)}
        >
          {isLoading ? 'Signing...' : '✍️ Sign Document'}
        </button>
      </div>
    </div>
  );
}

export default QuickSign;
