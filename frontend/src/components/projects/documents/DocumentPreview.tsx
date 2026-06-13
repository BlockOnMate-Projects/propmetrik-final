'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { documentsApi, ProjectDocument, DocumentVersion } from '@/lib/projects-api';

interface DocumentPreviewProps {
  projectId: string;
  document: ProjectDocument | null;
  version?: DocumentVersion;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: () => void;
}

// File type categories for preview support
const PREVIEWABLE_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  pdf: ['application/pdf'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'],
  text: [
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'text/markdown',
    'text/csv'
  ]
};

// Get file type category
function getFileCategory(mimeType: string): 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other' {
  for (const [category, types] of Object.entries(PREVIEWABLE_TYPES)) {
    if (types.includes(mimeType)) {
      return category as 'image' | 'pdf' | 'video' | 'audio' | 'text';
    }
  }
  return 'other';
}

// Get file icon based on category
function getFileIcon(category: string) {
  switch (category) {
    case 'image':
      return FileImage;
    case 'pdf':
    case 'text':
      return FileText;
    case 'video':
      return FileVideo;
    case 'audio':
      return FileAudio;
    default:
      return File;
  }
}

// Format file size
function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function DocumentPreview({
  projectId,
  document,
  version,
  isOpen,
  onClose,
  onDownload
}: DocumentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [textContent, setTextContent] = useState<string | null>(null);

  const mimeType = document?.mime_type || 'application/octet-stream';
  const fileCategory = getFileCategory(mimeType);
  const FileIcon = getFileIcon(fileCategory);
  const isPreviewable = fileCategory !== 'other';
  const versionNumber = version?.version_number || document?.current_version || 1;

  // Load preview when dialog opens
  useEffect(() => {
    if (isOpen && document && isPreviewable) {
      loadPreview();
    }
    return () => {
      // Cleanup URL on unmount
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, document?.id, version?.id]);

  // Reset state when document changes
  useEffect(() => {
    setZoom(100);
    setRotation(0);
    setError(null);
    setTextContent(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [document?.id, version?.id]);

  const loadPreview = async () => {
    if (!document) return;

    setIsLoading(true);
    setError(null);

    try {
      const blob = await documentsApi.downloadDocument(
        projectId,
        document.id,
        versionNumber
      );

      if (fileCategory === 'text') {
        // For text files, read as text
        const text = await blob.text();
        setTextContent(text);
      } else {
        // For other files, create object URL
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } catch (err) {
      setError('Failed to load preview');
      console.error('Preview error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!document) return;

    if (onDownload) {
      onDownload();
    } else {
      try {
        const blob = await documentsApi.downloadDocument(
          projectId,
          document.id,
          versionNumber
        );
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${document.name}${document.file_extension || ''}`;
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Download started');
      } catch (error) {
        toast.error('Failed to download file');
      }
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 25));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">{error}</p>
          <Button variant="outline" size="sm" onClick={loadPreview}>
            Retry
          </Button>
        </div>
      );
    }

    if (!isPreviewable) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <FileIcon className="h-20 w-20 text-muted-foreground mb-4" />
          <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
            Preview not available
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            This file type cannot be previewed in the browser.
          </p>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download File
          </Button>
        </div>
      );
    }

    switch (fileCategory) {
      case 'image':
        return (
          <div className="flex items-center justify-center h-full p-4 overflow-auto">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={document?.name}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`
                }}
              />
            )}
          </div>
        );

      case 'pdf':
        return (
          <div className="h-full w-full">
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title={document?.name}
              />
            )}
          </div>
        );

      case 'video':
        return (
          <div className="flex items-center justify-center h-full p-4">
            {previewUrl && (
              <video
                src={previewUrl}
                controls
                className="max-w-full max-h-full"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <FileAudio className="h-24 w-24 text-muted-foreground mb-6" />
            {previewUrl && (
              <audio src={previewUrl} controls className="w-full max-w-md">
                Your browser does not support the audio tag.
              </audio>
            )}
          </div>
        );

      case 'text':
        return (
          <div className="h-full w-full overflow-auto p-4">
            <pre
              className="text-sm font-mono whitespace-pre-wrap bg-muted dark:bg-gray-900 p-4 rounded-lg"
              style={{ fontSize: `${zoom}%` }}
            >
              {textContent}
            </pre>
          </div>
        );

      default:
        return null;
    }
  };

  if (!document) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileIcon className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <DialogTitle className="truncate">
                  {document.name}
                  {document.file_extension}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    v{versionNumber}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(version?.file_size || document.file_size)}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{mimeType}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Zoom controls for images and text */}
              {(fileCategory === 'image' || fileCategory === 'text') && !isLoading && !error && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={handleZoomOut}
                          disabled={zoom <= 25}
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Zoom Out</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-xs text-muted-foreground w-12 text-center">{zoom}%</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={handleZoomIn}
                          disabled={zoom >= 200}
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Zoom In</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}

              {/* Rotate for images */}
              {fileCategory === 'image' && !isLoading && !error && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={handleRotate}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rotate</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

              {/* Download */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={handleDownload}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Open in new tab */}
              {previewUrl && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => window.open(previewUrl, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open in New Tab</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Close */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden bg-muted dark:bg-gray-900">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
