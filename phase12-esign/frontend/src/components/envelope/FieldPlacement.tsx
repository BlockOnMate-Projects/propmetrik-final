import { useState, useRef, useEffect, useCallback } from 'react';
import { DocumentFile, Recipient, PlacedField, SignatureData } from './EnvelopeWizard';
import './FieldPlacement.css';

interface FieldPlacementProps {
  documents: DocumentFile[];
  recipients: Recipient[];
  fields: PlacedField[];
  onFieldsChange: (fields: PlacedField[]) => void;
  isSelfSigning?: boolean;
  signedFields?: Set<string>;
  onFieldSigned?: (fieldId: string, signatureData?: SignatureData, value?: string) => void;
  currentUser?: { name: string; email: string };
}

// Field type definitions
const STANDARD_FIELDS = [
  { type: 'signature', label: 'Signature', icon: '✍️' },
  { type: 'initial', label: 'Initial', icon: '🔤' },
  { type: 'stamp', label: 'Stamp', icon: '🔖' },
  { type: 'date_signed', label: 'Date Signed', icon: '📅' },
  { type: 'name', label: 'Name', icon: '👤' },
  { type: 'email', label: 'Email', icon: '📧' },
  { type: 'company', label: 'Company', icon: '🏢' },
  { type: 'title', label: 'Title', icon: '💼' },
];

const DATA_FIELDS = [
  { type: 'text', label: 'Text', icon: '📝' },
  { type: 'number', label: 'Number', icon: '🔢' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { type: 'dropdown', label: 'Dropdown', icon: '📋' },
  { type: 'radio', label: 'Radio', icon: '🔘' },
];

interface PageData {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
}

export default function FieldPlacement({ 
  documents, 
  recipients, 
  fields, 
  onFieldsChange,
  isSelfSigning = false,
  signedFields = new Set(),
  onFieldSigned,
  currentUser,
}: FieldPlacementProps) {
  const [activeRecipient, setActiveRecipient] = useState<Recipient | null>(
    recipients.find(r => r.role === 'signer') || null
  );
  const [activeDocument, setActiveDocument] = useState<DocumentFile | null>(documents[0] || null);
  const [zoom, setZoom] = useState(100);
  const [draggedFieldType, setDraggedFieldType] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<PlacedField | null>(null);
  const [searchFields, setSearchFields] = useState('');
  const [pdfPages, setPdfPages] = useState<PageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [fieldToSign, setFieldToSign] = useState<PlacedField | null>(null);
  
  // Local storage for field values to display immediately after signing
  const [localFieldValues, setLocalFieldValues] = useState<Map<string, { value?: string; signatureData?: SignatureData }>>(new Map());
  
  // Drag state for moving fields
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load PDF and extract all pages
  useEffect(() => {
    const loadPdf = async () => {
      if (!activeDocument?.file) return;
      
      setIsLoading(true);
      setPdfPages([]);
      
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        
        const arrayBuffer = await activeDocument.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const pages: PageData[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ 
              canvasContext: ctx, 
              viewport,
              // @ts-ignore - pdfjs-dist types are inconsistent
            } as any).promise;
            pages.push({
              pageNum: i,
              dataUrl: canvas.toDataURL(),
              width: viewport.width,
              height: viewport.height,
            });
          }
        }
        
        setPdfPages(pages);
      } catch (error) {
        console.error('Error loading PDF:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [activeDocument?.id]);

  // Handle dropping new field from palette
  const handlePageDrop = (e: React.DragEvent, pageNum: number, pageElement: HTMLDivElement) => {
    e.preventDefault();
    if (!draggedFieldType || !activeRecipient || !activeDocument) return;

    const rect = pageElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newField: PlacedField = {
      id: `field-${Date.now()}`,
      type: draggedFieldType as PlacedField['type'],
      recipientId: activeRecipient.id,
      documentId: activeDocument.id,
      page: pageNum,
      x: Math.max(2, Math.min(78, x)),
      y: Math.max(2, Math.min(92, y)),
      width: draggedFieldType === 'signature' ? 20 : 15,
      height: draggedFieldType === 'signature' ? 6 : 4,
      required: true,
    };

    onFieldsChange([...fields, newField]);
    setDraggedFieldType(null);
    
    // In self-signing mode, immediately sign/fill the field when dropped
    if (isSelfSigning) {
      if (newField.type === 'signature') {
        setFieldToSign(newField);
        setShowSignatureModal(true);
      } else if (['date_signed', 'name', 'email'].includes(newField.type)) {
        // Auto-fill these fields immediately
        onFieldSigned?.(newField.id);
      }
    } else {
      setSelectedField(newField);
    }
  };

  // Start dragging a placed field
  const handleFieldMouseDown = (e: React.MouseEvent, field: PlacedField) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedField(field);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  // Start resizing a field
  const handleResizeMouseDown = (e: React.MouseEvent, field: PlacedField, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedField(field);
    setIsResizing(true);
    setResizeHandle(handle);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  // Handle mouse move for dragging/resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedField) return;
      
      const pageElement = pageRefs.current.get(selectedField.page);
      if (!pageElement) return;
      
      const rect = pageElement.getBoundingClientRect();
      const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
      const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;

      if (isDragging) {
        const newX = Math.max(2, Math.min(78, selectedField.x + deltaX));
        const newY = Math.max(2, Math.min(92, selectedField.y + deltaY));
        
        onFieldsChange(fields.map(f => 
          f.id === selectedField.id ? { ...f, x: newX, y: newY } : f
        ));
        
        setDragStart({ x: e.clientX, y: e.clientY });
        setSelectedField({ ...selectedField, x: newX, y: newY });
      }

      if (isResizing && resizeHandle) {
        let newWidth = selectedField.width;
        let newHeight = selectedField.height;
        let newX = selectedField.x;
        let newY = selectedField.y;

        if (resizeHandle.includes('e')) {
          newWidth = Math.max(8, Math.min(40, selectedField.width + deltaX));
        }
        if (resizeHandle.includes('w')) {
          const widthChange = -deltaX;
          newWidth = Math.max(8, Math.min(40, selectedField.width + widthChange));
          newX = selectedField.x - widthChange;
        }
        if (resizeHandle.includes('s')) {
          newHeight = Math.max(3, Math.min(20, selectedField.height + deltaY));
        }
        if (resizeHandle.includes('n')) {
          const heightChange = -deltaY;
          newHeight = Math.max(3, Math.min(20, selectedField.height + heightChange));
          newY = selectedField.y - heightChange;
        }

        onFieldsChange(fields.map(f => 
          f.id === selectedField.id ? { ...f, x: newX, y: newY, width: newWidth, height: newHeight } : f
        ));
        
        setDragStart({ x: e.clientX, y: e.clientY });
        setSelectedField({ ...selectedField, x: newX, y: newY, width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, selectedField, dragStart, fields, onFieldsChange, resizeHandle]);

  const handleFieldDragStart = (fieldType: string) => {
    setDraggedFieldType(fieldType);
  };

  const deleteField = (fieldId: string) => {
    onFieldsChange(fields.filter(f => f.id !== fieldId));
    setSelectedField(null);
  };

  const getFieldsForPage = useCallback((pageNum: number) => {
    if (!activeDocument) return [];
    return fields.filter(f => f.documentId === activeDocument.id && f.page === pageNum);
  }, [fields, activeDocument]);

  const getRecipientById = (id: string) => recipients.find(r => r.id === id);
  const signers = recipients.filter(r => r.role === 'signer');

  const scrollToPage = (pageNum: number) => {
    const pageElement = pageRefs.current.get(pageNum);
    if (pageElement && scrollContainerRef.current) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Get saved signature from localStorage
  const getSavedSignature = (): SignatureData | null => {
    try {
      const saved = localStorage.getItem('cedyn_esign_signature');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  // Generate initials from a name (e.g., "Eric Inkoom Danso" -> "EID")
  const generateInitials = (name: string): string => {
    if (!name) return 'XX';
    return name
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => word[0].toUpperCase())
      .join('');
  };

  // Store field value locally for immediate display
  const storeLocalValue = (fieldId: string, value?: string, signatureData?: SignatureData) => {
    setLocalFieldValues(prev => {
      const newMap = new Map(prev);
      newMap.set(fieldId, { value, signatureData });
      return newMap;
    });
  };

  // Handle clicking a field in self-signing mode
  const handleFieldClick = (e: React.MouseEvent, field: PlacedField) => {
    e.stopPropagation();
    
    if (isSelfSigning && !signedFields.has(field.id)) {
      if (field.type === 'signature') {
        // Check for saved signature first - auto-apply if exists
        const savedSig = getSavedSignature();
        if (savedSig) {
          storeLocalValue(field.id, undefined, savedSig);
          onFieldSigned?.(field.id, savedSig);
        } else {
          // No saved signature, show modal to create one
          setFieldToSign(field);
          setShowSignatureModal(true);
        }
      } else if (field.type === 'initial') {
        // Auto-generate initials from user name
        const initials = generateInitials(currentUser?.name || '');
        storeLocalValue(field.id, initials);
        onFieldSigned?.(field.id, undefined, initials);
      } else if (field.type === 'date_signed') {
        // Auto-fill date
        const dateValue = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        storeLocalValue(field.id, dateValue);
        onFieldSigned?.(field.id, undefined, dateValue);
      } else if (field.type === 'name' && currentUser) {
        storeLocalValue(field.id, currentUser.name);
        onFieldSigned?.(field.id, undefined, currentUser.name);
      } else if (field.type === 'email' && currentUser) {
        storeLocalValue(field.id, currentUser.email);
        onFieldSigned?.(field.id, undefined, currentUser.email);
      }
    } else {
      setSelectedField(field);
    }
  };

  // Apply signature - now properly tracks signature data
  const handleApplySignature = (signatureData: SignatureData) => {
    if (fieldToSign) {
      storeLocalValue(fieldToSign.id, undefined, signatureData);
      onFieldSigned?.(fieldToSign.id, signatureData);
      setShowSignatureModal(false);
      setFieldToSign(null);
    }
  };

  // Count signed fields for progress
  const signedCount = fields.filter(f => signedFields.has(f.id)).length;

  return (
    <div className="field-placement">
      {/* Left Sidebar - Field Palette or Signing Progress */}
      <div className="field-sidebar">
        {isSelfSigning ? (
          <>
            {/* Self-signing mode - simplified palette with progress */}
            <div className="signing-header">
              <h3>Sign Document</h3>
              <p className="signing-instruction">
                {fields.length === 0 
                  ? 'Drag fields onto the document to sign'
                  : signedCount === fields.length 
                    ? 'All fields signed! Click Finish to complete.'
                    : `${signedCount} of ${fields.length} fields completed`
                }
              </p>
            </div>

            {fields.length > 0 && (
              <div className="progress-stats">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${fields.length > 0 ? (signedCount / fields.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="field-category">
              <h4>Add Your Signature</h4>
              <div className="field-list">
                <div
                  className="field-item signature-field"
                  draggable
                  onDragStart={() => handleFieldDragStart('signature')}
                >
                  <span className="field-icon">✍️</span>
                  <span className="field-label">Signature</span>
                </div>
                <div
                  className="field-item"
                  draggable
                  onDragStart={() => handleFieldDragStart('initial')}
                >
                  <span className="field-icon">🔤</span>
                  <span className="field-label">Initial</span>
                </div>
              </div>
            </div>

            <div className="field-category">
              <h4>Auto-Fill Fields</h4>
              <div className="field-list">
                <div
                  className="field-item"
                  draggable
                  onDragStart={() => handleFieldDragStart('date_signed')}
                >
                  <span className="field-icon">📅</span>
                  <span className="field-label">Date Signed</span>
                </div>
                <div
                  className="field-item"
                  draggable
                  onDragStart={() => handleFieldDragStart('name')}
                >
                  <span className="field-icon">👤</span>
                  <span className="field-label">Name</span>
                </div>
                <div
                  className="field-item"
                  draggable
                  onDragStart={() => handleFieldDragStart('email')}
                >
                  <span className="field-icon">📧</span>
                  <span className="field-label">Email</span>
                </div>
              </div>
            </div>

            {fields.length > 0 && (
              <div className="fields-summary">
                <h4>Placed Fields</h4>
                {fields.map(field => {
                  const isSigned = signedFields.has(field.id);
                  return (
                    <div 
                      key={field.id} 
                      className={`sign-field-item ${isSigned ? 'signed' : 'pending'}`}
                      onClick={() => {
                        if (!isSigned) {
                          scrollToPage(field.page);
                          if (field.type === 'signature') {
                            setFieldToSign(field);
                            setShowSignatureModal(true);
                          } else {
                            onFieldSigned?.(field.id);
                          }
                        }
                      }}
                    >
                      <span className="field-status">{isSigned ? '✓' : '○'}</span>
                      <span className="field-name">
                        {STANDARD_FIELDS.find(f => f.type === field.type)?.icon || '📝'}{' '}
                        {field.type.replace('_', ' ')}
                      </span>
                      <span className="field-page">Page {field.page}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Normal mode - field palette */}
            <div className="recipient-selector">
              <div className="recipient-dropdown" style={{ borderColor: activeRecipient?.color }}>
                <span className="dropdown-indicator" style={{ backgroundColor: activeRecipient?.color }}></span>
                <select
                  value={activeRecipient?.id || ''}
                  onChange={(e) => setActiveRecipient(recipients.find(r => r.id === e.target.value) || null)}
                >
                  {signers.map(signer => (
                    <option key={signer.id} value={signer.id}>{signer.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field-search">
              <input
                type="text"
                placeholder="Search Fields"
                value={searchFields}
                onChange={(e) => setSearchFields(e.target.value)}
              />
              <span className="search-icon">🔍</span>
            </div>

            <div className="field-category">
              <h4>Standard Fields</h4>
              <div className="field-list">
                {STANDARD_FIELDS.filter(f => 
                  f.label.toLowerCase().includes(searchFields.toLowerCase())
                ).map(field => (
                  <div
                    key={field.type}
                    className="field-item"
                    draggable
                    onDragStart={() => handleFieldDragStart(field.type)}
                    style={{ borderLeftColor: activeRecipient?.color || '#4318ff' }}
                  >
                    <span className="field-icon">{field.icon}</span>
                    <span className="field-label">{field.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="field-category">
              <h4>Data Fields</h4>
              <div className="field-list">
                {DATA_FIELDS.filter(f => 
                  f.label.toLowerCase().includes(searchFields.toLowerCase())
                ).map(field => (
                  <div
                    key={field.type}
                    className="field-item"
                    draggable
                    onDragStart={() => handleFieldDragStart(field.type)}
                    style={{ borderLeftColor: activeRecipient?.color || '#4318ff' }}
                  >
                    <span className="field-icon">{field.icon}</span>
                    <span className="field-label">{field.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Content - Continuous Document View */}
      <div className="document-editor">
        <div className="editor-toolbar">
          <div className="toolbar-left">
            <button className="toolbar-btn" onClick={() => selectedField && deleteField(selectedField.id)} disabled={!selectedField}>
              🗑 Delete
            </button>
          </div>
          <div className="toolbar-center">
            <div className="zoom-controls">
              <button className="toolbar-btn" onClick={() => setZoom(Math.max(50, zoom - 10))}>−</button>
              <span className="zoom-value">{zoom}%</span>
              <button className="toolbar-btn" onClick={() => setZoom(Math.min(150, zoom + 10))}>+</button>
            </div>
          </div>
          <div className="toolbar-right">
            <span className="page-indicator">{pdfPages.length} pages</span>
          </div>
        </div>

        <div className="continuous-scroll-container" ref={scrollContainerRef}>
          {isLoading && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <p>Loading document...</p>
            </div>
          )}
          
          <div className="pages-wrapper" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
            {pdfPages.map((page) => (
              <div
                key={page.pageNum}
                className="pdf-page-container"
                ref={(el) => { if (el) pageRefs.current.set(page.pageNum, el); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const el = pageRefs.current.get(page.pageNum);
                  if (el) handlePageDrop(e, page.pageNum, el);
                }}
                onClick={() => setSelectedField(null)}
              >
                <div className="page-number-badge">Page {page.pageNum}</div>
                <img src={page.dataUrl} alt={`Page ${page.pageNum}`} draggable={false} />
                
                {/* Fields on this page */}
                {getFieldsForPage(page.pageNum).map(field => {
                  const recipient = getRecipientById(field.recipientId);
                  const isSelected = selectedField?.id === field.id;
                  const isSigned = signedFields.has(field.id);
                  
                  return (
                    <div
                      key={field.id}
                      className={`placed-field ${isSelected ? 'selected' : ''} ${isSelfSigning ? 'self-sign-mode' : ''} ${isSigned ? 'signed' : ''}`}
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        height: `${field.height}%`,
                        borderColor: isSigned ? '#22c55e' : (recipient?.color || '#7c3aed'),
                        cursor: isDragging ? 'grabbing' : 'grab',
                      }}
                      onMouseDown={(e) => handleFieldMouseDown(e, field)}
                      onClick={(e) => handleFieldClick(e, field)}
                    >
                      {isSigned ? (
                        <div className="signed-content">
                          {field.type === 'signature' ? (
                            field.signatureData || localFieldValues.get(field.id)?.signatureData ? (
                              <>
                                <img 
                                  src={(localFieldValues.get(field.id)?.signatureData || field.signatureData)?.data} 
                                  alt="Signature" 
                                  className="signature-image"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                                {isSelfSigning && (
                                  <button 
                                    className="change-signature-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFieldToSign(field);
                                      setShowSignatureModal(true);
                                    }}
                                  >
                                    Change
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="signed-check">✓</span>
                            )
                          ) : field.type === 'initial' ? (
                            <span className="initials-text">{localFieldValues.get(field.id)?.value || field.value || generateInitials(currentUser?.name || '')}</span>
                          ) : field.type === 'date_signed' ? (
                            <span className="date-text">{localFieldValues.get(field.id)?.value || field.value || new Date().toLocaleDateString()}</span>
                          ) : field.type === 'name' ? (
                            <span className="name-text">{localFieldValues.get(field.id)?.value || field.value || currentUser?.name || 'Name'}</span>
                          ) : field.type === 'email' ? (
                            <span className="email-text">{localFieldValues.get(field.id)?.value || field.value || currentUser?.email || 'Email'}</span>
                          ) : (
                            <span className="signed-check">✓</span>
                          )}
                        </div>
                      ) : isSelfSigning ? (
                        <span className="click-to-sign">
                          {STANDARD_FIELDS.find(f => f.type === field.type)?.icon || '📝'}
                          {' '}Click to {field.type === 'signature' ? 'sign' : 'fill'}
                        </span>
                      ) : (
                        <span className="field-type-label">
                          {STANDARD_FIELDS.find(f => f.type === field.type)?.icon || 
                           DATA_FIELDS.find(f => f.type === field.type)?.icon || '📝'}
                          {' '}{field.type.replace('_', ' ')}
                        </span>
                      )}
                      
                      {isSelected && (
                        <>
                          <button 
                            className="delete-field-btn"
                            onMouseDown={(e) => { e.stopPropagation(); deleteField(field.id); }}
                          >
                            ✕
                          </button>
                          {/* Resize handles - always visible when selected */}
                          <div className="resize-handle nw" onMouseDown={(e) => handleResizeMouseDown(e, field, 'nw')} />
                          <div className="resize-handle ne" onMouseDown={(e) => handleResizeMouseDown(e, field, 'ne')} />
                          <div className="resize-handle sw" onMouseDown={(e) => handleResizeMouseDown(e, field, 'sw')} />
                          <div className="resize-handle se" onMouseDown={(e) => handleResizeMouseDown(e, field, 'se')} />
                          <div className="resize-handle n" onMouseDown={(e) => handleResizeMouseDown(e, field, 'n')} />
                          <div className="resize-handle s" onMouseDown={(e) => handleResizeMouseDown(e, field, 's')} />
                          <div className="resize-handle e" onMouseDown={(e) => handleResizeMouseDown(e, field, 'e')} />
                          <div className="resize-handle w" onMouseDown={(e) => handleResizeMouseDown(e, field, 'w')} />
                        </>
                      )}
                    </div>
                  );
                })}
                
                {draggedFieldType && (
                  <div className="drop-hint-overlay">Drop field here</div>
                )}
              </div>
            ))}
            
            {pdfPages.length === 0 && !isLoading && (
              <div className="no-pages-message">
                <p>No document loaded</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Page Navigation */}
      <div className="thumbnail-sidebar">
        <h4>{activeDocument?.name}</h4>
        <p className="page-count">Pages: {pdfPages.length}</p>
        
        <div className="page-thumbnails">
          {pdfPages.map((page) => (
            <div
              key={page.pageNum}
              className="page-thumb"
              onClick={() => scrollToPage(page.pageNum)}
            >
              <img src={page.dataUrl} alt={`Page ${page.pageNum}`} />
              <span className="thumb-page-num">{page.pageNum}</span>
              
              {getFieldsForPage(page.pageNum).length > 0 && (
                <div className="field-indicator">
                  {getFieldsForPage(page.pageNum).length}
                </div>
              )}
            </div>
          ))}
        </div>

        {documents.length > 1 && (
          <div className="other-documents">
            <h5>Other Documents</h5>
            {documents.filter(d => d.id !== activeDocument?.id).map(doc => (
              <button
                key={doc.id}
                className="doc-switch-btn"
                onClick={() => setActiveDocument(doc)}
              >
                📄 {doc.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignatureModal
          signerName={currentUser?.name || ''}
          onApply={handleApplySignature}
          onCancel={() => {
            setShowSignatureModal(false);
            setFieldToSign(null);
          }}
        />
      )}
    </div>
  );
}

// Signature Modal Component
function SignatureModal({ 
  signerName, 
  onApply, 
  onCancel 
}: { 
  signerName: string; 
  onApply: (signature: SignatureData) => void; 
  onCancel: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'type' | 'draw' | 'upload' | 'saved'>('type');
  const [typedSignature, setTypedSignature] = useState(signerName);
  const [selectedFont, setSelectedFont] = useState('dancing');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<SignatureData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Load saved signature from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cedyn_esign_signature');
    if (saved) {
      try {
        setSavedSignature(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved signature:', e);
      }
    }
  }, []);

  const fonts = [
    { id: 'dancing', name: 'Elegant Script', style: "'Dancing Script', cursive" },
    { id: 'caveat', name: 'Casual Hand', style: "'Caveat', cursive" },
    { id: 'pacifico', name: 'Smooth Script', style: "'Pacifico', cursive" },
    { id: 'greatvibes', name: 'Formal Script', style: "'Great Vibes', cursive" },
    { id: 'allura', name: 'Classic Signature', style: "'Allura', cursive" },
    { id: 'sacramento', name: 'Modern Script', style: "'Sacramento', cursive" },
  ];

  // Save signature to localStorage
  const saveSignature = (signature: SignatureData) => {
    localStorage.setItem('cedyn_esign_signature', JSON.stringify(signature));
    setSavedSignature(signature);
  };

  // Generate typed signature as image
  const generateTypedSignatureImage = (text: string, fontFamily: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `48px ${fontFamily}`;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    return canvas.toDataURL('image/png');
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleApply = () => {
    let signatureData: SignatureData | null = null;
    
    if (activeTab === 'type') {
      const fontStyle = fonts.find(f => f.id === selectedFont)?.style || fonts[0].style;
      const imageData = generateTypedSignatureImage(typedSignature || signerName, fontStyle);
      signatureData = {
        type: 'typed',
        data: imageData,
        fontFamily: fontStyle,
      };
    } else if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (canvas) {
        signatureData = {
          type: 'drawn',
          data: canvas.toDataURL('image/png'),
        };
      }
    } else if (activeTab === 'upload' && uploadedImage) {
      signatureData = {
        type: 'uploaded',
        data: uploadedImage,
      };
    } else if (activeTab === 'saved' && savedSignature) {
      signatureData = savedSignature;
    }
    
    if (signatureData) {
      // Save for future use
      saveSignature(signatureData);
      onApply(signatureData);
    }
  };

  return (
    <div className="signature-modal-overlay" onClick={onCancel}>
      <div className="signature-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Your Signature</h2>
          <button className="close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="signature-tabs">
          {savedSignature && (
            <button 
              className={`tab ${activeTab === 'saved' ? 'active' : ''}`}
              onClick={() => setActiveTab('saved')}
            >
              ✓ Saved
            </button>
          )}
          <button 
            className={`tab ${activeTab === 'type' ? 'active' : ''}`}
            onClick={() => setActiveTab('type')}
          >
            Type
          </button>
          <button 
            className={`tab ${activeTab === 'draw' ? 'active' : ''}`}
            onClick={() => setActiveTab('draw')}
          >
            Draw
          </button>
          <button 
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
        </div>

        <div className="signature-content">
          {activeTab === 'saved' && savedSignature && (
            <div className="saved-signature">
              <p className="saved-label">Your saved signature:</p>
              <div className="saved-preview">
                <img src={savedSignature.data} alt="Saved signature" />
              </div>
              <button 
                className="clear-saved-btn"
                onClick={() => {
                  localStorage.removeItem('cedyn_esign_signature');
                  setSavedSignature(null);
                  setActiveTab('type');
                }}
              >
                🗑️ Remove saved signature
              </button>
            </div>
          )}
          
          {activeTab === 'type' && (
            <div className="type-signature">
              <input
                type="text"
                value={typedSignature}
                onChange={(e) => setTypedSignature(e.target.value)}
                placeholder="Type your name"
                className="signature-input"
              />
              
              <div className="font-options">
                {fonts.map(font => (
                  <div
                    key={font.id}
                    className={`font-option ${selectedFont === font.id ? 'selected' : ''}`}
                    onClick={() => setSelectedFont(font.id)}
                  >
                    <span style={{ fontFamily: font.style, fontSize: '24px' }}>
                      {typedSignature || signerName}
                    </span>
                  </div>
                ))}
              </div>

              <div className="signature-preview" style={{ fontFamily: fonts.find(f => f.id === selectedFont)?.style }}>
                {typedSignature || signerName}
              </div>
            </div>
          )}

          {activeTab === 'draw' && (
            <div className="draw-signature">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="signature-canvas"
              />
              <button className="clear-btn" onClick={clearCanvas}>Clear</button>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="upload-signature">
              <div className="upload-zone">
                {uploadedImage ? (
                  <div className="uploaded-preview">
                    <img src={uploadedImage} alt="Uploaded signature" />
                    <button className="remove-btn" onClick={() => setUploadedImage(null)}>✕ Remove</button>
                  </div>
                ) : (
                  <>
                    <span>📤</span>
                    <p>Drag & drop an image or click to upload</p>
                    <input type="file" accept="image/*" onChange={handleFileUpload} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <p className="legal-text">
            By clicking "Apply", I agree that this signature will be the electronic representation of my signature.
          </p>
          <div className="modal-actions">
            <button className="cancel-btn" onClick={onCancel}>Cancel</button>
            <button 
              className="apply-btn" 
              onClick={handleApply}
              disabled={
                (activeTab === 'type' && !typedSignature) ||
                (activeTab === 'upload' && !uploadedImage)
              }
            >
              Apply Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
