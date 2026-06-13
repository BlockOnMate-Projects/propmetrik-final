'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  Grid3X3,
  List,
  Search,
  Filter,
  MoreHorizontal,
  Download,
  Trash2,
  Share2,
  Eye,
  History,
  FolderOpen,
  Plus,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  Clock,
  User,
  Copy,
  ExternalLink,
  X,
  AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  documentsApi,
  ProjectDocument,
  DocumentType,
  AccessLevel,
  DocumentVersion,
  DocumentShare
} from '@/lib/projects-api';
import { FolderTree } from './FolderTree';
import { VersionHistory } from './VersionHistory';
import { DocumentPreview } from './DocumentPreview';

interface DocumentManagerProps {
  projectId: string;
}

// Document type options
const DOCUMENT_TYPES: { value: DocumentType; label: string; category: string }[] = [
  // Pre-Development
  { value: 'title_search', label: 'Title Search', category: 'Pre-Development' },
  { value: 'deed', label: 'Deed', category: 'Pre-Development' },
  { value: 'survey_plan', label: 'Survey Plan', category: 'Pre-Development' },
  { value: 'site_investigation', label: 'Site Investigation', category: 'Pre-Development' },
  { value: 'feasibility_study', label: 'Feasibility Study', category: 'Pre-Development' },
  // Design
  { value: 'architectural_drawing', label: 'Architectural Drawing', category: 'Design' },
  { value: 'structural_drawing', label: 'Structural Drawing', category: 'Design' },
  { value: 'mep_drawing', label: 'MEP Drawing', category: 'Design' },
  { value: 'landscape_plan', label: 'Landscape Plan', category: 'Design' },
  { value: 'specification', label: 'Specification', category: 'Design' },
  // Construction
  { value: 'contract', label: 'Contract', category: 'Construction' },
  { value: 'variation_order', label: 'Variation Order', category: 'Construction' },
  { value: 'progress_report', label: 'Progress Report', category: 'Construction' },
  { value: 'site_photo', label: 'Site Photo', category: 'Construction' },
  { value: 'inspection_report', label: 'Inspection Report', category: 'Construction' },
  // Financial
  { value: 'budget', label: 'Budget', category: 'Financial' },
  { value: 'invoice', label: 'Invoice', category: 'Financial' },
  { value: 'payment_certificate', label: 'Payment Certificate', category: 'Financial' },
  { value: 'bank_guarantee', label: 'Bank Guarantee', category: 'Financial' },
  // Legal
  { value: 'agreement', label: 'Agreement', category: 'Legal' },
  { value: 'insurance', label: 'Insurance', category: 'Legal' },
  { value: 'legal_opinion', label: 'Legal Opinion', category: 'Legal' },
  // Marketing
  { value: 'brochure', label: 'Brochure', category: 'Marketing' },
  { value: 'floor_plan_marketing', label: 'Floor Plan (Marketing)', category: 'Marketing' },
  { value: 'price_list', label: 'Price List', category: 'Marketing' },
  // Other
  { value: 'meeting_minutes', label: 'Meeting Minutes', category: 'Other' },
  { value: 'correspondence', label: 'Correspondence', category: 'Other' },
  { value: 'other', label: 'Other', category: 'Other' }
];

// Access level options
const ACCESS_LEVELS: { value: AccessLevel; label: string; description: string }[] = [
  { value: 'private', label: 'Private', description: 'Only you can access' },
  { value: 'team', label: 'Team', description: 'Project team members' },
  { value: 'stakeholder', label: 'Stakeholder', description: 'Team + stakeholders' },
  { value: 'public', label: 'Public', description: 'Anyone with link' }
];

// File type icons
function getFileIcon(mimeType: string | undefined) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType.includes('pdf')) return FileText;
  return File;
}

// Format file size
function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function DocumentManager({ projectId }: DocumentManagerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'all'>('all');
  
  // Dialog states
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  // Selected document
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null);
  const [previewVersion, setPreviewVersion] = useState<DocumentVersion | null>(null);
  
  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadData, setUploadData] = useState({
    name: '',
    document_type: 'other' as DocumentType,
    description: '',
    access_level: 'team' as AccessLevel,
    change_notes: ''
  });

  // Share state
  const [shareData, setShareData] = useState({
    access_level: 'view' as 'view' | 'download' | 'edit',
    expires_in_days: 7,
    max_downloads: undefined as number | undefined
  });
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Fetch documents
  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['project-documents', projectId, selectedFolderId, typeFilter, searchQuery],
    queryFn: () =>
      documentsApi.getDocuments(projectId, {
        folder: selectedFolderId || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: searchQuery || undefined
      })
  });

  // Fetch document stats
  const { data: stats } = useQuery({
    queryKey: ['document-stats', projectId],
    queryFn: () => documentsApi.getDocumentStats(projectId)
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error('No file selected');
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      try {
        // Note: In a real app, you'd upload the file to storage first, then create the document
        // with the returned file_url. This is a placeholder implementation.
        const result = await documentsApi.createDocument(projectId, {
          folder_id: selectedFolderId || undefined,
          name: uploadData.name || uploadFile.name.replace(/\.[^/.]+$/, ''),
          document_type: uploadData.document_type,
          description: uploadData.description || undefined,
          access_level: uploadData.access_level,
          file_url: URL.createObjectURL(uploadFile), // Placeholder - should be actual storage URL
          file_size: uploadFile.size,
          mime_type: uploadFile.type,
          file_extension: uploadFile.name.split('.').pop(),
          version_notes: uploadData.change_notes || 'Initial upload'
        });
        
        clearInterval(progressInterval);
        setUploadProgress(100);
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      queryClient.invalidateQueries({ queryKey: ['document-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      toast.success('Document uploaded successfully');
      resetUploadDialog();
    },
    onError: (error: Error) => {
      toast.error(`Upload failed: ${error.message}`);
      setUploadProgress(0);
    }
  });

  // Upload new version mutation
  const uploadVersionMutation = useMutation({
    mutationFn: async ({ documentId, file, changeNotes }: { documentId: string; file: File; changeNotes: string }) => {
      // Note: In a real app, you'd upload the file first, then call uploadVersion with the file_url
      // For now, we use uploadVersion with a placeholder (API should handle file upload separately)
      return documentsApi.uploadVersion(projectId, documentId, {
        file_url: URL.createObjectURL(file), // This should be the actual uploaded file URL
        file_size: file.size,
        version_notes: changeNotes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      queryClient.invalidateQueries({ queryKey: ['document-versions', projectId] });
      toast.success('New version uploaded');
    },
    onError: (error: Error) => {
      toast.error(`Version upload failed: ${error.message}`);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => documentsApi.deleteDocument(projectId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      queryClient.invalidateQueries({ queryKey: ['document-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      toast.success('Document deleted');
      setIsDeleteDialogOpen(false);
      setSelectedDocument(null);
    },
    onError: (error: Error) => {
      toast.error(`Delete failed: ${error.message}`);
    }
  });

  // Create share mutation
  const createShareMutation = useMutation({
    mutationFn: () => {
      if (!selectedDocument) throw new Error('No document selected');
      return documentsApi.createShare(projectId, selectedDocument.id, shareData);
    },
    onSuccess: (share: DocumentShare) => {
      const url = `${window.location.origin}/shared/${share.share_token}`;
      setShareUrl(url);
      toast.success('Share link created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create share link: ${error.message}`);
    }
  });

  const resetUploadDialog = () => {
    setIsUploadDialogOpen(false);
    setUploadFile(null);
    setUploadProgress(0);
    setUploadData({
      name: '',
      document_type: 'other',
      description: '',
      access_level: 'team',
      change_notes: ''
    });
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadData((prev) => ({
        ...prev,
        name: file.name.replace(/\.[^/.]+$/, '')
      }));
      setIsUploadDialogOpen(true);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadFile(file);
      setUploadData((prev) => ({
        ...prev,
        name: file.name.replace(/\.[^/.]+$/, '')
      }));
      setIsUploadDialogOpen(true);
    }
  }, []);

  const handleDownload = async (doc: ProjectDocument) => {
    try {
      const blob = await documentsApi.downloadDocument(projectId, doc.id);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${doc.name}${doc.file_extension || ''}`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (error) {
      toast.error('Failed to download file');
    }
  };

  const handleCopyShareUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard');
    }
  };

  const handleVersionPreview = (version: DocumentVersion) => {
    setPreviewVersion(version);
    setIsVersionHistoryOpen(false);
    setIsPreviewOpen(true);
  };

  const renderDocumentCard = (doc: ProjectDocument) => {
    const FileIcon = getFileIcon(doc.mime_type);
    
    return (
      <Card
        key={doc.id}
        className={cn(
          'group cursor-pointer hover:shadow-md transition-shadow',
          viewMode === 'list' && 'flex items-center'
        )}
        onClick={() => {
          setSelectedDocument(doc);
          setPreviewVersion(null);
          setIsPreviewOpen(true);
        }}
      >
        <CardContent className={cn(
          'p-4',
          viewMode === 'list' && 'flex items-center gap-4 flex-1'
        )}>
          {viewMode === 'grid' ? (
            <>
              {/* Grid view */}
              <div className="flex items-start justify-between mb-3">
                <div className="h-12 w-12 rounded-lg bg-muted dark:bg-gray-800 flex items-center justify-center">
                  <FileIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDocument(doc);
                      setPreviewVersion(null);
                      setIsPreviewOpen(true);
                    }}>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(doc);
                    }}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDocument(doc);
                      setIsVersionHistoryOpen(true);
                    }}>
                      <History className="mr-2 h-4 w-4" />
                      Version History
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDocument(doc);
                      setShareUrl(null);
                      setIsShareDialogOpen(true);
                    }}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDocument(doc);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <h4 className="font-medium text-sm truncate mb-1">
                {doc.name}{doc.file_extension}
              </h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span>{formatFileSize(doc.file_size)}</span>
                <span>•</span>
                <span>v{doc.current_version}</span>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {doc.document_type?.replace(/_/g, ' ') || 'Other'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}
                </span>
              </div>
            </>
          ) : (
            <>
              {/* List view */}
              <div className="h-10 w-10 rounded-lg bg-muted dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <FileIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm truncate">
                  {doc.name}{doc.file_extension}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {doc.document_type?.replace(/_/g, ' ') || 'Other'}
                  </Badge>
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>•</span>
                  <span>v{doc.current_version}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <User className="h-3 w-3" />
                  {doc.created_by_name || 'Unknown'}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDocument(doc);
                    setPreviewVersion(null);
                    setIsPreviewOpen(true);
                  }}>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(doc);
                  }}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDocument(doc);
                    setIsVersionHistoryOpen(true);
                  }}>
                    <History className="mr-2 h-4 w-4" />
                    Version History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDocument(doc);
                    setShareUrl(null);
                    setIsShareDialogOpen(true);
                  }}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDocument(doc);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="h-full flex">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Sidebar - Folder Tree */}
      <div className="w-64 border-r bg-card dark:bg-gray-950 flex-shrink-0">
        <FolderTree
          projectId={projectId}
          selectedFolderId={selectedFolderId}
          onFolderSelect={setSelectedFolderId}
          onDocumentUpload={(folderId) => {
            setSelectedFolderId(folderId);
            fileInputRef.current?.click();
          }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">
              {selectedFolderId ? 'Folder' : 'All Documents'}
            </h2>
            {stats && (
              <Badge variant="secondary">
                {stats.total_documents} documents • {formatFileSize(stats.total_size)}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>

            {/* Type filter */}
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as DocumentType | 'all')}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* View mode toggle */}
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {/* Upload button */}
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>

        {/* Documents Grid/List */}
        <div
          className="flex-1 overflow-auto p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {isLoading ? (
            <div className={cn(
              'gap-4',
              viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'space-y-2'
            )}>
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'bg-muted dark:bg-gray-800 rounded-lg animate-pulse',
                    viewMode === 'grid' ? 'h-40' : 'h-16'
                  )}
                />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                Failed to load documents
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] })
                }
              >
                Retry
              </Button>
            </div>
          ) : documents && documents.length > 0 ? (
            <div className={cn(
              'gap-4',
              viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'space-y-2'
            )}>
              {documents.map(renderDocumentCard)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-full bg-muted dark:bg-gray-800 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                No documents yet
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                Upload your first document or drag and drop files here.
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Plus className="mr-2 h-4 w-4" />
                Upload Document
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => !open && resetUploadDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Add a new document to the project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {uploadFile && (
              <div className="flex items-center gap-3 p-3 bg-muted dark:bg-gray-900 rounded-lg">
                <File className="h-8 w-8 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{uploadFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(uploadFile.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setUploadFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Document Name *</Label>
              <Input
                value={uploadData.name}
                onChange={(e) => setUploadData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Enter document name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Type *</Label>
                <Select
                  value={uploadData.document_type}
                  onValueChange={(v) => setUploadData((prev) => ({ ...prev, document_type: v as DocumentType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Access Level *</Label>
                <Select
                  value={uploadData.access_level}
                  onValueChange={(v) => setUploadData((prev) => ({ ...prev, access_level: v as AccessLevel }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={uploadData.description}
                onChange={(e) => setUploadData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Change Notes</Label>
              <Input
                value={uploadData.change_notes}
                onChange={(e) => setUploadData((prev) => ({ ...prev, change_notes: e.target.value }))}
                placeholder="Initial upload"
              />
            </div>

            {uploadMutation.isPending && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetUploadDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !uploadFile || !uploadData.name}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Document</DialogTitle>
            <DialogDescription>
              Create a shareable link for "{selectedDocument?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!shareUrl ? (
              <>
                <div className="space-y-2">
                  <Label>Access Level</Label>
                  <Select
                    value={shareData.access_level}
                    onValueChange={(v) => setShareData((prev) => ({ ...prev, access_level: v as 'view' | 'download' | 'edit' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View Only</SelectItem>
                      <SelectItem value="download">View & Download</SelectItem>
                      <SelectItem value="edit">Edit Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Link Expires In</Label>
                  <Select
                    value={String(shareData.expires_in_days)}
                    onValueChange={(v) => setShareData((prev) => ({ ...prev, expires_in_days: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly />
                  <Button variant="outline" size="icon" onClick={handleCopyShareUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(shareUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link will expire in {shareData.expires_in_days} days
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            {!shareUrl ? (
              <>
                <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createShareMutation.mutate()}
                  disabled={createShareMutation.isPending}
                >
                  {createShareMutation.isPending ? 'Creating...' : 'Create Link'}
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsShareDialogOpen(false)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Drawer */}
      <Dialog open={isVersionHistoryOpen} onOpenChange={setIsVersionHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          {selectedDocument && (
            <VersionHistory
              projectId={projectId}
              document={selectedDocument}
              onVersionPreview={handleVersionPreview}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Document Preview */}
      <DocumentPreview
        projectId={projectId}
        document={selectedDocument}
        version={previewVersion || undefined}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewVersion(null);
        }}
        onDownload={() => selectedDocument && handleDownload(selectedDocument)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedDocument?.name}"? This will permanently
              delete the document and all its versions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedDocument && deleteMutation.mutate(selectedDocument.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
