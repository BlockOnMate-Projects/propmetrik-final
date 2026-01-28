'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { 
    Pen, 
    Type, 
    Calendar, 
    AlignLeft, 
    CheckSquare,
    Trash2,
    GripVertical,
    ZoomIn,
    ZoomOut,
    ChevronLeft,
    ChevronRight,
    RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
    SignatureField, 
    SignatureFieldType, 
    SignerRole,
    FIELD_TEMPLATES,
    SIGNER_COLORS,
    SIGNER_LABELS,
    Signer
} from './types';

// Drag item type
const FIELD_TYPE = 'SIGNATURE_FIELD';

interface DragItem {
    type: string;
    fieldType: SignatureFieldType;
    id?: string;
    isNew?: boolean;
}

// Field icon component
const FieldIcon = ({ type }: { type: SignatureFieldType }) => {
    switch (type) {
        case 'signature': return <Pen className="h-3 w-3" />;
        case 'initials': return <Type className="h-3 w-3" />;
        case 'date': return <Calendar className="h-3 w-3" />;
        case 'text': return <AlignLeft className="h-3 w-3" />;
        case 'checkbox': return <CheckSquare className="h-3 w-3" />;
        default: return null;
    }
};

// Draggable field template in sidebar
interface FieldTemplateItemProps {
    type: SignatureFieldType;
    label: string;
    selectedSigner: Signer | null;
}

function FieldTemplateItem({ type, label, selectedSigner }: FieldTemplateItemProps) {
    const divRef = useRef<HTMLDivElement>(null);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: FIELD_TYPE,
        item: { type: FIELD_TYPE, fieldType: type, isNew: true } as DragItem,
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }), [type]);

    // Connect drag ref
    drag(divRef);

    const signerColor = selectedSigner ? SIGNER_COLORS[selectedSigner.role] : '#6B7280';

    return (
        <div
            ref={divRef}
            className={`flex items-center gap-2 p-2 rounded border cursor-grab active:cursor-grabbing transition-all ${
                isDragging 
                    ? 'opacity-50 border-amber-500' 
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
            style={{ borderLeftColor: signerColor, borderLeftWidth: 3 }}
        >
            <FieldIcon type={type} />
            <span className="text-xs font-mono text-zinc-300">{label}</span>
        </div>
    );
}

// Placed field on document
interface PlacedFieldProps {
    field: SignatureField;
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onMove: (x: number, y: number) => void;
    onResize: (width: number, height: number) => void;
    scale: number;
    pageWidth: number;
    pageHeight: number;
    signers: Signer[];
    mode: 'prepare' | 'sign';
    onSignField?: () => void;
}

function PlacedField({ 
    field, 
    isSelected, 
    onSelect, 
    onDelete, 
    onMove,
    onResize,
    scale,
    pageWidth,
    pageHeight,
    signers,
    mode,
    onSignField
}: PlacedFieldProps) {
    const fieldRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [isDraggingField, setIsDraggingField] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0, fieldX: 0, fieldY: 0 });
    const resizeStartPos = useRef({ x: 0, y: 0, fieldWidth: 0, fieldHeight: 0 });

    const signer = signers.find(s => s.id === field.signerId);
    const signerColor = signer ? SIGNER_COLORS[signer.role] : '#6B7280';

    // Field uses pixel coordinates stored in x, y, width, height
    // Scale them with the document scale
    const left = field.x * scale;
    const top = field.y * scale;
    const width = field.width * scale;
    const height = field.height * scale;

    // Handle drag start
    const handleMouseDown = (e: React.MouseEvent) => {
        if (mode !== 'prepare') return;
        e.stopPropagation();
        onSelect();
        
        dragStartPos.current = {
            x: e.clientX,
            y: e.clientY,
            fieldX: field.x,
            fieldY: field.y
        };
        setIsDraggingField(true);
    };

    // Handle resize start
    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        resizeStartPos.current = {
            x: e.clientX,
            y: e.clientY,
            fieldWidth: field.width,
            fieldHeight: field.height
        };
        setIsResizing(true);
    };

    // Handle drag
    useEffect(() => {
        if (!isDraggingField) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = (e.clientX - dragStartPos.current.x) / scale;
            const deltaY = (e.clientY - dragStartPos.current.y) / scale;

            let newX = dragStartPos.current.fieldX + deltaX;
            let newY = dragStartPos.current.fieldY + deltaY;

            // Clamp to page bounds (in pixels)
            newX = Math.max(0, Math.min(pageWidth - field.width, newX));
            newY = Math.max(0, Math.min(pageHeight - field.height, newY));

            onMove(newX, newY);
        };

        const handleMouseUp = () => {
            setIsDraggingField(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingField, pageWidth, pageHeight, scale, field.width, field.height, onMove]);

    // Handle resize
    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = (e.clientX - resizeStartPos.current.x) / scale;
            const deltaY = (e.clientY - resizeStartPos.current.y) / scale;

            let newWidth = resizeStartPos.current.fieldWidth + deltaX;
            let newHeight = resizeStartPos.current.fieldHeight + deltaY;

            // Minimum size constraints (pixels)
            newWidth = Math.max(40, Math.min(300, newWidth));
            newHeight = Math.max(16, Math.min(60, newHeight));

            // Clamp to page bounds
            if (field.x + newWidth > pageWidth) newWidth = pageWidth - field.x;
            if (field.y + newHeight > pageHeight) newHeight = pageHeight - field.y;

            onResize(newWidth, newHeight);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, pageWidth, pageHeight, scale, field.x, field.y, onResize]);

    // Handle field click in sign mode
    const handleClick = () => {
        if (mode === 'sign' && !field.value && onSignField) {
            onSignField();
        }
    };

    return (
        <div
            ref={fieldRef}
            className={`absolute transition-all ${
                isSelected ? 'ring-2 ring-amber-500 ring-offset-1' : ''
            } ${isDraggingField ? 'cursor-grabbing' : mode === 'prepare' ? 'cursor-grab' : 'cursor-pointer'}`}
            style={{
                left,
                top,
                width,
                height,
                backgroundColor: field.value ? 'transparent' : `${signerColor}15`,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: signerColor,
                borderRadius: 2,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            {/* Field content */}
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
                {field.value ? (
                    // Show captured signature/value
                    field.type === 'signature' || field.type === 'initials' ? (
                        <img 
                            src={field.value} 
                            alt="Signature" 
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <span 
                            className="text-xs font-mono px-1 truncate"
                            style={{ color: signerColor }}
                        >
                            {field.value}
                        </span>
                    )
                ) : (
                    // Show placeholder - compact DocuSign style
                    <div 
                        className="flex items-center justify-center gap-0.5 px-1 w-full h-full"
                        style={{ backgroundColor: `${signerColor}15` }}
                    >
                        <FieldIcon type={field.type} />
                        <span 
                            className="text-[7px] font-medium truncate leading-none"
                            style={{ color: signerColor }}
                        >
                            {field.type === 'signature' ? 'Sign' : field.type === 'initials' ? 'Init' : field.type === 'date' ? 'Date' : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* Delete button (prepare mode only) */}
            {mode === 'prepare' && isSelected && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            )}

            {/* Resize handle (prepare mode only) */}
            {mode === 'prepare' && isSelected && (
                <div
                    className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-500 rounded-sm cursor-se-resize hover:bg-amber-400 transition-colors flex items-center justify-center"
                    onMouseDown={handleResizeMouseDown}
                >
                    <svg className="w-2 h-2 text-white" viewBox="0 0 6 6" fill="currentColor">
                        <circle cx="1" cy="5" r="0.8" />
                        <circle cx="3" cy="5" r="0.8" />
                        <circle cx="5" cy="5" r="0.8" />
                        <circle cx="3" cy="3" r="0.8" />
                        <circle cx="5" cy="3" r="0.8" />
                        <circle cx="5" cy="1" r="0.8" />
                    </svg>
                </div>
            )}
        </div>
    );
}

// Document page with drop zone
interface DocumentPageProps {
    pageNumber: number;
    pageImage: string;
    fields: SignatureField[];
    selectedFieldId: string | null;
    onSelectField: (id: string | null) => void;
    onAddField: (type: SignatureFieldType, x: number, y: number) => void;
    onDeleteField: (id: string) => void;
    onMoveField: (id: string, x: number, y: number) => void;
    onResizeField: (id: string, width: number, height: number) => void;
    scale: number;
    signers: Signer[];
    mode: 'prepare' | 'sign';
    onSignField?: (field: SignatureField) => void;
}

function DocumentPage({
    pageNumber,
    pageImage,
    fields,
    selectedFieldId,
    onSelectField,
    onAddField,
    onDeleteField,
    onMoveField,
    onResizeField,
    scale,
    signers,
    mode,
    onSignField
}: DocumentPageProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [pageSize, setPageSize] = useState({ width: 612, height: 792 }); // Default letter size

    // Handle drop
    const [{ isOver }, drop] = useDrop(() => ({
        accept: FIELD_TYPE,
        drop: (item: DragItem, monitor) => {
            if (!containerRef.current || !item.isNew) return;

            const offset = monitor.getClientOffset();
            const containerRect = containerRef.current.getBoundingClientRect();

            if (offset) {
                // Calculate drop position in pixels (unscaled)
                const x = (offset.x - containerRect.left) / scale;
                const y = (offset.y - containerRect.top) / scale;
                
                console.log('[PDFViewer] Field dropped:', {
                    clientOffset: offset,
                    containerRect: {
                        left: containerRect.left,
                        top: containerRect.top,
                        width: containerRect.width,
                        height: containerRect.height
                    },
                    scale,
                    pageSize,
                    calculatedPosition: { x, y }
                });
                
                onAddField(item.fieldType, x, y);
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    }), [onAddField, scale, pageSize]);

    // Combine refs using callback ref pattern
    const setRefs = useCallback((node: HTMLDivElement | null) => {
        // Update the mutable ref
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        drop(node);
    }, [drop]);

    // Filter fields for this page
    const pageFields = fields.filter(f => f.page === pageNumber);

    return (
        <div className="mb-4">
            {/* Page number indicator */}
            <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-[10px] font-mono text-zinc-500">Page {pageNumber}</span>
            </div>

            {/* Page container */}
            <div
                ref={setRefs}
                className={`relative bg-white shadow-lg mx-auto transition-all ${
                    isOver ? 'ring-2 ring-amber-500' : ''
                }`}
                style={{
                    width: pageSize.width * scale,
                    height: pageSize.height * scale,
                }}
                onClick={() => onSelectField(null)}
                onDragOver={(e) => e.preventDefault()}
            >
                {/* Page image */}
                <img
                    src={pageImage}
                    alt={`Page ${pageNumber}`}
                    className="w-full h-full object-contain pointer-events-none select-none"
                    draggable={false}
                    onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        const newSize = { width: img.naturalWidth || 612, height: img.naturalHeight || 792 };
                        console.log('[PDFViewer] Image loaded:', {
                            naturalWidth: img.naturalWidth,
                            naturalHeight: img.naturalHeight,
                            displayWidth: img.width,
                            displayHeight: img.height,
                            newPageSize: newSize
                        });
                        setPageSize(newSize);
                    }}
                />

                {/* Signature fields overlay */}
                {pageFields.map((field) => (
                    <PlacedField
                        key={field.id}
                        field={field}
                        isSelected={selectedFieldId === field.id}
                        onSelect={() => onSelectField(field.id)}
                        onDelete={() => onDeleteField(field.id)}
                        onMove={(x, y) => onMoveField(field.id, x, y)}
                        onResize={(w, h) => onResizeField(field.id, w, h)}
                        scale={scale}
                        pageWidth={pageSize.width}
                        pageHeight={pageSize.height}
                        signers={signers}
                        mode={mode}
                        onSignField={() => onSignField?.(field)}
                    />
                ))}
            </div>
        </div>
    );
}

// Main PDF Viewer component
interface PDFViewerProps {
    documentUrl: string;
    pages: { pageNumber: number; imageUrl: string }[];
    fields: SignatureField[];
    signers: Signer[];
    selectedSigner: Signer | null;
    mode: 'prepare' | 'sign';
    onFieldsChange: (fields: SignatureField[]) => void;
    onSignField?: (field: SignatureField) => void;
}

export function PDFViewer({
    documentUrl,
    pages,
    fields,
    signers,
    selectedSigner,
    mode,
    onFieldsChange,
    onSignField
}: PDFViewerProps) {
    const [scale, setScale] = useState(1);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // Add field (x, y are in pixels)
    const handleAddField = (type: SignatureFieldType, x: number, y: number) => {
        if (!selectedSigner) return;

        const template = FIELD_TEMPLATES.find(t => t.type === type);
        const fieldWidth = template?.defaultWidth || 120;
        const fieldHeight = template?.defaultHeight || 24;
        
        const newField: SignatureField = {
            id: `field-${Date.now()}`,
            type,
            signerId: selectedSigner.id,
            signerRole: selectedSigner.role,
            page: currentPage,
            x: Math.max(0, x - fieldWidth / 2),
            y: Math.max(0, y - fieldHeight / 2),
            width: fieldWidth,
            height: fieldHeight,
            required: true,
        };

        onFieldsChange([...fields, newField]);
        setSelectedFieldId(newField.id);
    };

    // Delete field
    const handleDeleteField = (id: string) => {
        onFieldsChange(fields.filter(f => f.id !== id));
        if (selectedFieldId === id) setSelectedFieldId(null);
    };

    // Move field
    const handleMoveField = (id: string, x: number, y: number) => {
        onFieldsChange(fields.map(f => f.id === id ? { ...f, x, y } : f));
    };

    // Resize field
    const handleResizeField = (id: string, width: number, height: number) => {
        onFieldsChange(fields.map(f => f.id === id ? { ...f, width, height } : f));
    };

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="flex h-full">
                {/* Sidebar - Field Templates */}
                {mode === 'prepare' && (
                    <div className="w-48 border-r border-zinc-800 p-3 space-y-4">
                        <div>
                            <h3 className="text-[10px] font-mono uppercase text-zinc-500 mb-2">
                                Drag fields to document
                            </h3>
                            {selectedSigner ? (
                                <div className="space-y-2">
                                    {FIELD_TEMPLATES.map((template) => (
                                        <FieldTemplateItem
                                            key={template.type}
                                            type={template.type}
                                            label={template.label}
                                            selectedSigner={selectedSigner}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs font-mono text-zinc-600">
                                    Select a signer first
                                </p>
                            )}
                        </div>

                        {/* Signers list */}
                        <div>
                            <h3 className="text-[10px] font-mono uppercase text-zinc-500 mb-2">
                                Signers
                            </h3>
                            <div className="space-y-1">
                                {signers.map((signer) => (
                                    <div
                                        key={signer.id}
                                        className="flex items-center gap-2 p-1.5 rounded text-xs font-mono"
                                        style={{ backgroundColor: `${SIGNER_COLORS[signer.role]}20` }}
                                    >
                                        <div 
                                            className="w-2 h-2 rounded-full" 
                                            style={{ backgroundColor: SIGNER_COLORS[signer.role] }}
                                        />
                                        <span className="text-zinc-300 truncate">{signer.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Main document area */}
                <div className="flex-1 flex flex-col">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-900">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setScale(Math.max(0.5, scale - 0.1))}
                                className="text-zinc-400 hover:text-white h-7 w-7 p-0"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <span className="text-xs font-mono text-zinc-400 w-12 text-center">
                                {Math.round(scale * 100)}%
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setScale(Math.min(2, scale + 0.1))}
                                className="text-zinc-400 hover:text-white h-7 w-7 p-0"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setScale(1)}
                                className="text-zinc-400 hover:text-white h-7 px-2"
                            >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Reset
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                disabled={currentPage <= 1}
                                className="text-zinc-400 hover:text-white h-7 w-7 p-0"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-xs font-mono text-zinc-400">
                                Page {currentPage} of {pages.length}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(Math.min(pages.length, currentPage + 1))}
                                disabled={currentPage >= pages.length}
                                className="text-zinc-400 hover:text-white h-7 w-7 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Document scroll area */}
                    <div className="flex-1 overflow-auto bg-zinc-800 p-4 select-none">
                        <div className="flex flex-col items-center">
                            {pages.map((page) => (
                                <DocumentPage
                                    key={page.pageNumber}
                                    pageNumber={page.pageNumber}
                                    pageImage={page.imageUrl}
                                    fields={fields}
                                    selectedFieldId={selectedFieldId}
                                    onSelectField={setSelectedFieldId}
                                    onAddField={handleAddField}
                                    onDeleteField={handleDeleteField}
                                    onMoveField={handleMoveField}
                                    onResizeField={handleResizeField}
                                    scale={scale}
                                    signers={signers}
                                    mode={mode}
                                    onSignField={onSignField}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </DndProvider>
    );
}
