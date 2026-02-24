'use client';

/**
 * SignaturePad Component
 * 
 * Captures digital signatures using react-signature-canvas.
 * Provides save, clear, and undo functionality.
 * 
 * Phase 4: Week 7 - Signature Capture
 */

import React, { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import SignatureCanvas from 'react-signature-canvas';

// =====================================================
// TYPES
// =====================================================

export interface SignaturePadProps {
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Pen color */
  penColor?: string;
  /** Background color */
  backgroundColor?: string;
  /** Callback when signature is saved */
  onSave?: (dataUrl: string) => void;
  /** Callback when signature is cleared */
  onClear?: () => void;
  /** Callback when signature changes */
  onChange?: (isEmpty: boolean) => void;
  /** Show toolbar with save/clear buttons */
  showToolbar?: boolean;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Disable the signature pad */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

export interface SignaturePadRef {
  /** Get signature as data URL */
  toDataURL: (type?: string) => string;
  /** Check if signature is empty */
  isEmpty: () => boolean;
  /** Clear the signature */
  clear: () => void;
  /** Get trimmed canvas */
  getTrimmedCanvas: () => HTMLCanvasElement;
}

// =====================================================
// COMPONENT
// =====================================================

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  (
    {
      width = 400,
      height = 150,
      penColor = '#000000',
      backgroundColor = '#ffffff',
      onSave,
      onClear,
      onChange,
      showToolbar = true,
      placeholder = 'Sign here',
      disabled = false,
      className = '',
    },
    ref
  ) => {
    const sigRef = useRef<SignatureCanvas>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Handle signature begin
    const handleBegin = useCallback(() => {
      setIsEmpty(false);
      onChange?.(false);
    }, [onChange]);

    // Handle signature end
    const handleEnd = useCallback(() => {
      const empty = sigRef.current?.isEmpty() ?? true;
      setIsEmpty(empty);
      onChange?.(empty);
    }, [onChange]);

    // Clear signature
    const handleClear = useCallback(() => {
      sigRef.current?.clear();
      setIsEmpty(true);
      onChange?.(true);
      onClear?.();
    }, [onChange, onClear]);

    // Save signature
    const handleSave = useCallback(async () => {
      if (!sigRef.current || isEmpty) return;

      setIsSaving(true);
      try {
        // Get trimmed canvas for cleaner output
        const trimmedCanvas = sigRef.current.getTrimmedCanvas();
        const dataUrl = trimmedCanvas.toDataURL('image/png');
        onSave?.(dataUrl);
      } catch (error) {
        console.error('Failed to save signature:', error);
      } finally {
        setIsSaving(false);
      }
    }, [isEmpty, onSave]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      toDataURL: (type = 'image/png') => {
        return sigRef.current?.getTrimmedCanvas().toDataURL(type) || '';
      },
      isEmpty: () => sigRef.current?.isEmpty() ?? true,
      clear: handleClear,
      getTrimmedCanvas: () => sigRef.current?.getTrimmedCanvas() as HTMLCanvasElement,
    }));

    return (
      <div className={`signature-pad-container ${className}`}>
        {/* Canvas wrapper */}
        <div
          className={`signature-canvas-wrapper ${disabled ? 'disabled' : ''}`}
          style={{
            position: 'relative',
            width: width,
            height: height,
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: backgroundColor,
          }}
        >
          {/* Placeholder text */}
          {isEmpty && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#a0aec0',
                fontSize: '14px',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {placeholder}
            </div>
          )}

          {/* Signature canvas */}
          <SignatureCanvas
            ref={sigRef}
            penColor={penColor}
            canvasProps={{
              width: width,
              height: height,
              className: 'signature-canvas',
              style: {
                cursor: disabled ? 'not-allowed' : 'crosshair',
                opacity: disabled ? 0.5 : 1,
              },
            }}
            onBegin={handleBegin}
            onEnd={handleEnd}
          />

          {/* Signature line */}
          <div
            style={{
              position: 'absolute',
              bottom: '30px',
              left: '20px',
              right: '20px',
              borderBottom: '1px solid #cbd5e0',
              pointerEvents: 'none',
            }}
          />

          {/* X mark */}
          <div
            style={{
              position: 'absolute',
              bottom: '35px',
              left: '10px',
              color: '#718096',
              fontSize: '12px',
              pointerEvents: 'none',
            }}
          >
            ✕
          </div>
        </div>

        {/* Toolbar */}
        {showToolbar && (
          <div
            className="signature-toolbar"
            style={{
              display: 'flex',
              gap: '8px',
              marginTop: '12px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={handleClear}
              disabled={isEmpty || disabled}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#4a5568',
                cursor: isEmpty || disabled ? 'not-allowed' : 'pointer',
                opacity: isEmpty || disabled ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              Clear
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isEmpty || isSaving || disabled}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isEmpty || disabled ? '#a0aec0' : '#3182ce',
                color: '#ffffff',
                cursor: isEmpty || isSaving || disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isSaving ? 'Saving...' : 'Save Signature'}
            </button>
          </div>
        )}

        {/* Inline styles for hover effects */}
        <style jsx>{`
          .signature-canvas-wrapper:hover {
            border-color: ${disabled ? '#e2e8f0' : '#3182ce'};
          }

          .signature-canvas-wrapper.disabled {
            pointer-events: none;
          }

          button:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
        `}</style>
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';

export default SignaturePad;
