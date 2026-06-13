'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  History,
  Download,
  RotateCcw,
  User,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { documentsApi, DocumentVersion, ProjectDocument } from '@/lib/projects-api';

interface VersionHistoryProps {
  projectId: string;
  document: ProjectDocument;
  onVersionPreview?: (version: DocumentVersion) => void;
  onVersionDownload?: (version: DocumentVersion) => void;
  className?: string;
}

// Format file size
function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function VersionHistory({
  projectId,
  document,
  onVersionPreview,
  onVersionDownload,
  className
}: VersionHistoryProps) {
  const queryClient = useQueryClient();
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set([1]));
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);

  // Fetch version history
  const { data: versions, isLoading, error } = useQuery({
    queryKey: ['document-versions', projectId, document.id],
    queryFn: () => documentsApi.getDocumentVersions(projectId, document.id)
  });

  // Revert to version mutation
  const revertMutation = useMutation({
    mutationFn: (versionNumber: number) =>
      documentsApi.revertToVersion(projectId, document.id, String(versionNumber)),
    onSuccess: (newVersion) => {
      queryClient.invalidateQueries({ queryKey: ['document-versions', projectId, document.id] });
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      toast.success(`Reverted to version ${selectedVersion?.version_number}`);
      setRevertDialogOpen(false);
      setSelectedVersion(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to revert: ${error.message}`);
    }
  });

  const handleToggleExpand = (versionNumber: number) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionNumber)) {
        next.delete(versionNumber);
      } else {
        next.add(versionNumber);
      }
      return next;
    });
  };

  const handleRevert = (version: DocumentVersion) => {
    setSelectedVersion(version);
    setRevertDialogOpen(true);
  };

  const handleRevertConfirm = () => {
    if (selectedVersion) {
      revertMutation.mutate(selectedVersion.version_number);
    }
  };

  const handleDownload = async (version: DocumentVersion) => {
    if (onVersionDownload) {
      onVersionDownload(version);
    } else {
      // Default download behavior
      try {
        const blob = await documentsApi.downloadDocument(projectId, document.id, version.version_number);
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${document.name}_v${version.version_number}${document.file_extension || ''}`;
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

  const handlePreview = (version: DocumentVersion) => {
    if (onVersionPreview) {
      onVersionPreview(version);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 bg-muted dark:bg-gray-800 rounded animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-500 py-4">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load version history</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ['document-versions', projectId, document.id]
                })
              }
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentVersion = versions?.[0];
  const olderVersions = versions?.slice(1) || [];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Version History
        </CardTitle>
        <CardDescription>
          {versions?.length || 0} version{(versions?.length || 0) !== 1 ? 's' : ''} • Last updated{' '}
          {currentVersion?.created_at
            ? formatDistanceToNow(new Date(currentVersion.created_at), { addSuffix: true })
            : 'never'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {/* Current Version */}
            {currentVersion && (
              <div className="border rounded-lg overflow-hidden">
                <div
                  className={cn(
                    'flex items-center justify-between p-3 cursor-pointer hover:bg-muted dark:hover:bg-gray-800/50',
                    expandedVersions.has(currentVersion.version_number) &&
                      'bg-muted dark:bg-gray-800/50'
                  )}
                  onClick={() => handleToggleExpand(currentVersion.version_number)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          Version {currentVersion.version_number}
                        </span>
                        <Badge variant="default" className="text-xs">
                          Current
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {format(new Date(currentVersion.created_at), 'MMM d, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreview(currentVersion);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(currentVersion);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {expandedVersions.has(currentVersion.version_number) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {expandedVersions.has(currentVersion.version_number) && (
                  <div className="border-t p-3 bg-muted dark:bg-gray-800/30 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">File Size:</span>
                        <span className="ml-2 font-medium">
                          {formatFileSize(currentVersion.file_size)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Uploaded by:</span>
                        <span className="ml-2 font-medium flex items-center gap-1 inline-flex">
                          <User className="h-3 w-3" />
                          {currentVersion.created_by_name || 'Unknown'}
                        </span>
                      </div>
                    </div>
                    {currentVersion.change_notes && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Change Notes:</span>
                        <p className="mt-1 text-gray-700 dark:text-gray-300">
                          {currentVersion.change_notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Older Versions */}
            {olderVersions.length > 0 && (
              <>
                <Separator className="my-4" />
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Previous Versions</h4>
                {olderVersions.map((version: DocumentVersion) => (
                  <div key={version.id} className="border rounded-lg overflow-hidden">
                    <div
                      className={cn(
                        'flex items-center justify-between p-3 cursor-pointer hover:bg-muted dark:hover:bg-gray-800/50',
                        expandedVersions.has(version.version_number) &&
                          'bg-muted dark:bg-gray-800/50'
                      )}
                      onClick={() => handleToggleExpand(version.version_number)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted dark:bg-gray-800 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              Version {version.version_number}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {format(new Date(version.created_at), 'MMM d, yyyy HH:mm')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreview(version);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Preview</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(version);
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-amber-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRevert(version);
                                }}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Revert to this version</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {expandedVersions.has(version.version_number) ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {expandedVersions.has(version.version_number) && (
                      <div className="border-t p-3 bg-muted dark:bg-gray-800/30 space-y-2">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">File Size:</span>
                            <span className="ml-2 font-medium">
                              {formatFileSize(version.file_size)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Uploaded by:</span>
                            <span className="ml-2 font-medium flex items-center gap-1 inline-flex">
                              <User className="h-3 w-3" />
                              {version.created_by_name || 'Unknown'}
                            </span>
                          </div>
                        </div>
                        {version.change_notes && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Change Notes:</span>
                            <p className="mt-1 text-gray-700 dark:text-gray-300">
                              {version.change_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Empty state */}
            {(!versions || versions.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p>No version history available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Revert Confirmation Dialog */}
      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Previous Version</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revert to Version {selectedVersion?.version_number}? This
              will create a new version with the contents of the selected version. The current
              version will be preserved in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevertConfirm}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {revertMutation.isPending ? 'Reverting...' : 'Revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
