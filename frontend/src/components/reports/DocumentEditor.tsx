/**
 * Document Editor Component
 * 
 * Integrates OnlyOffice Document Server for in-browser DOCX editing.
 * Supports auto-save, force-save, and real-time editing.
 * 
 * Phase 3: Document Editor Integration
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Save, 
  Download, 
  AlertCircle, 
  Loader2, 
  RefreshCw,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

// =====================================================
// TYPES
// =====================================================

interface EditorConfig {
  documentType: 'word' | 'cell' | 'slide';
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: {
      comment: boolean;
      download: boolean;
      edit: boolean;
      print: boolean;
      review: boolean;
    };
  };
  editorConfig: {
    callbackUrl: string;
    lang: string;
    mode: 'edit' | 'view';
    user: {
      id: string;
      name: string;
    };
    customization: any;
  };
  token?: string;
}

interface DocumentEditorProps {
  reportId: string;
  mode?: 'edit' | 'view';
  onSave?: () => void;
  onError?: (error: string) => void;
  className?: string;
}

interface EditorStatus {
  connected: boolean;
  lastSaved: Date | null;
  hasChanges: boolean;
  saving: boolean;
}

// =====================================================
// API FUNCTIONS
// =====================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

async function fetchEditorConfig(reportId: string, mode: 'edit' | 'view' = 'edit'): Promise<{
  documentServerUrl: string;
  config: EditorConfig;
}> {
  const response = await authedFetch(`${API_BASE}/reports/${reportId}/editor-config?mode=${mode}`, {
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get editor configuration');
  }
  
  return response.json();
}

async function checkEditorStatus(): Promise<{ available: boolean; serverUrl: string }> {
  const response = await authedFetch(`${API_BASE}/reports/editor-status`, {
    credentials: 'include',
  });
  return response.json();
}

async function forceSaveDocument(reportId: string): Promise<void> {
  const response = await authedFetch(`${API_BASE}/reports/${reportId}/force-save`, {
    method: 'POST',
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new Error('Failed to force save document');
  }
}

// =====================================================
// COMPONENT
// =====================================================

export function DocumentEditor({
  reportId,
  mode = 'edit',
  onSave,
  onError,
  className = '',
}: DocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const [editorStatus, setEditorStatus] = useState<EditorStatus>({
    connected: false,
    lastSaved: null,
    hasChanges: false,
    saving: false,
  });
  const [config, setConfig] = useState<{ documentServerUrl: string; config: EditorConfig } | null>(null);

  // Check OnlyOffice server availability
  useEffect(() => {
    checkEditorStatus()
      .then((status) => setServerAvailable(status.available))
      .catch(() => setServerAvailable(false));
  }, []);

  // Load editor configuration
  useEffect(() => {
    if (serverAvailable === false) {
      setError('Document editor server is not available. Please contact support.');
      setLoading(false);
      return;
    }

    if (serverAvailable === null) {
      return; // Still checking
    }

    fetchEditorConfig(reportId, mode)
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        onError?.(err.message);
      });
  }, [reportId, mode, serverAvailable]); // Removed onError from deps to prevent loops

  // Initialize OnlyOffice editor
  useEffect(() => {
    if (!config || !containerRef.current) return;

    // Load OnlyOffice API script
    const script = document.createElement('script');
    script.src = `${config.documentServerUrl}/web-apps/apps/api/documents/api.js`;
    script.async = true;
    
    script.onload = () => {
      if (!window.DocsAPI || !containerRef.current) return;

      // Create editor instance with explicit dimensions
      editorRef.current = new window.DocsAPI.DocEditor('onlyoffice-editor', {
        ...config.config,
        width: '100%',
        height: '100%',
        type: 'desktop',
        events: {
          onReady: () => {
            setEditorStatus((prev) => ({ ...prev, connected: true }));
          },
          onDocumentStateChange: (event: any) => {
            setEditorStatus((prev) => ({ 
              ...prev, 
              hasChanges: event.data 
            }));
          },
          onError: (event: any) => {
            console.error('OnlyOffice error:', event);
            setError(`Editor error: ${event.data?.errorDescription || 'Unknown error'}`);
            onError?.(event.data?.errorDescription || 'Unknown error');
          },
          onRequestSave: () => {
            setEditorStatus((prev) => ({ ...prev, saving: true }));
          },
          onDocumentSave: () => {
            setEditorStatus((prev) => ({ 
              ...prev, 
              saving: false, 
              hasChanges: false,
              lastSaved: new Date() 
            }));
            onSave?.();
          },
          onDownloadAs: (event: any) => {
            // Handle download
            if (event.data) {
              window.open(event.data.url, '_blank');
            }
          },
        },
      });
    };

    script.onerror = () => {
      setError('Failed to load document editor. Please check your connection.');
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup
      if (editorRef.current) {
        editorRef.current.destroyEditor?.();
      }
      document.body.removeChild(script);
    };
  }, [config, onError, onSave]);

  // Handle force save
  const handleForceSave = useCallback(async () => {
    if (!reportId) return;
    
    setEditorStatus((prev) => ({ ...prev, saving: true }));
    
    try {
      await forceSaveDocument(reportId);
      setEditorStatus((prev) => ({ 
        ...prev, 
        saving: false, 
        lastSaved: new Date() 
      }));
    } catch (err) {
      setEditorStatus((prev) => ({ ...prev, saving: false }));
      setError('Failed to save document');
    }
  }, [reportId]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.downloadAs?.('docx');
    }
  }, []);

  // Render loading state
  if (loading || serverAvailable === null) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center min-h-[600px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Loading document editor...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center min-h-[600px]">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-4"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Render server unavailable state
  if (serverAvailable === false) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center min-h-[600px]">
          <div className="text-center space-y-4 max-w-md">
            <AlertCircle className="h-16 w-16 mx-auto text-yellow-500" />
            <h3 className="text-lg font-semibold">Document Editor Unavailable</h3>
            <p className="text-muted-foreground">
              The document editing server is currently offline. You can still download 
              the report and edit it in Microsoft Word or LibreOffice.
            </p>
            <Button variant="outline" asChild>
              <a 
                href={`${API_BASE}/reports/${reportId}/download?redirect=true`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Report
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className} flex flex-col h-full`}>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b flex-shrink-0">
        <div className="flex items-center gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {config?.config.document.title || 'Valuation Report'}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {editorStatus.connected ? (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-yellow-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </span>
            )}
            {editorStatus.hasChanges && (
              <span className="text-yellow-600">• Unsaved changes</span>
            )}
            {editorStatus.lastSaved && (
              <span className="text-muted-foreground">
                Last saved: {editorStatus.lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {mode === 'edit' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleForceSave}
              disabled={editorStatus.saving || !editorStatus.hasChanges}
            >
              {editorStatus.saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a 
              href={`${API_BASE}/reports/${reportId}/download?redirect=true`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        <style jsx global>{`
          #onlyoffice-editor {
            width: 100% !important;
            height: 100% !important;
          }
          #onlyoffice-editor iframe {
            width: 100% !important;
            height: 100% !important;
            border: none !important;
          }
        `}</style>
        <div 
          ref={containerRef}
          id="onlyoffice-editor"
          className="w-full"
          style={{ height: '100%', minHeight: '700px' }}
        />
      </CardContent>
    </Card>
  );
}

// Type declaration for OnlyOffice API
declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: any) => any;
    };
  }
}

export default DocumentEditor;
