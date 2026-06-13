'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { documentsApi, ProjectFolder } from '@/lib/projects-api';

// System folder icons mapping
const SYSTEM_FOLDER_ICONS: Record<string, string> = {
  'Pre-Development': '📋',
  'Design & Planning': '📐',
  'Permits & Approvals': '📝',
  'Construction': '🏗️',
  'Financial': '💰',
  'Legal': '⚖️',
  'Marketing & Sales': '📊',
  'Handover': '🏠',
  'General': '📁'
};

interface FolderTreeProps {
  projectId: string;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onDocumentUpload?: (folderId: string) => void;
}

interface FolderNodeProps {
  folder: ProjectFolder;
  level: number;
  projectId: string;
  selectedFolderId: string | null;
  expandedFolders: Set<string>;
  onFolderSelect: (folderId: string | null) => void;
  onToggleExpand: (folderId: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onEdit: (folder: ProjectFolder) => void;
  onDelete: (folder: ProjectFolder) => void;
  onDocumentUpload?: (folderId: string) => void;
}

function FolderNode({
  folder,
  level,
  projectId,
  selectedFolderId,
  expandedFolders,
  onFolderSelect,
  onToggleExpand,
  onCreateSubfolder,
  onEdit,
  onDelete,
  onDocumentUpload
}: FolderNodeProps) {
  const isExpanded = expandedFolders.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const hasChildren = folder.children && folder.children.length > 0;
  const systemIcon = SYSTEM_FOLDER_ICONS[folder.name];

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors',
          isSelected
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'hover:bg-muted dark:hover:bg-gray-800'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onFolderSelect(folder.id)}
      >
        {/* Expand/collapse toggle */}
        <button
          className={cn(
            'p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
            !hasChildren && 'invisible'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(folder.id);
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Folder icon */}
        {systemIcon ? (
          <span className="text-base">{systemIcon}</span>
        ) : isExpanded ? (
          <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
        )}

        {/* Folder name */}
        <span className="flex-1 truncate text-sm font-medium">{folder.name}</span>

        {/* Document count badge */}
        {folder.document_count !== undefined && folder.document_count > 0 && (
          <span className="text-xs text-muted-foreground bg-muted dark:bg-gray-700 px-1.5 py-0.5 rounded">
            {folder.document_count}
          </span>
        )}

        {/* Context menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onDocumentUpload && (
              <DropdownMenuItem onClick={() => onDocumentUpload(folder.id)}>
                <Plus className="mr-2 h-4 w-4" />
                Upload Document
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onCreateSubfolder(folder.id)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              New Subfolder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!folder.is_system_folder && (
              <>
                <DropdownMenuItem onClick={() => onEdit(folder)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(folder)}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Render children recursively */}
      {isExpanded && folder.children && folder.children.length > 0 && (
        <div>
          {folder.children.map((child: ProjectFolder) => (
            <FolderNode
              key={child.id}
              folder={child}
              level={level + 1}
              projectId={projectId}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              onFolderSelect={onFolderSelect}
              onToggleExpand={onToggleExpand}
              onCreateSubfolder={onCreateSubfolder}
              onEdit={onEdit}
              onDelete={onDelete}
              onDocumentUpload={onDocumentUpload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  projectId,
  selectedFolderId,
  onFolderSelect,
  onDocumentUpload
}: FolderTreeProps) {
  const queryClient = useQueryClient();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<ProjectFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDescription, setFolderDescription] = useState('');

  // Fetch folder tree
  const { data: folderTree, isLoading, error } = useQuery({
    queryKey: ['project-folders', projectId],
    queryFn: () => documentsApi.getFolderTree(projectId)
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; parentId?: string }) =>
      documentsApi.createFolder(projectId, {
        name: data.name,
        description: data.description,
        parent_id: data.parentId
      }),
    onSuccess: (newFolder) => {
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      toast.success('Folder created successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      // Expand parent folder to show new folder
      if (parentFolderId) {
        setExpandedFolders((prev) => new Set(Array.from(prev).concat(parentFolderId)));
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to create folder: ${error.message}`);
    }
  });

  // Update folder mutation
  const updateFolderMutation = useMutation({
    mutationFn: (data: { folderId: string; name: string; description?: string }) =>
      documentsApi.updateFolder(projectId, data.folderId, {
        name: data.name,
        description: data.description
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      toast.success('Folder updated successfully');
      setIsEditDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Failed to update folder: ${error.message}`);
    }
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => documentsApi.deleteFolder(projectId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
      toast.success('Folder deleted successfully');
      setIsDeleteDialogOpen(false);
      // If deleted folder was selected, deselect
      if (selectedFolder && selectedFolderId === selectedFolder.id) {
        onFolderSelect(null);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete folder: ${error.message}`);
    }
  });

  const resetForm = () => {
    setFolderName('');
    setFolderDescription('');
    setParentFolderId(null);
    setSelectedFolder(null);
  };

  const handleToggleExpand = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleCreateSubfolder = (parentId: string) => {
    setParentFolderId(parentId);
    setFolderName('');
    setFolderDescription('');
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (folder: ProjectFolder) => {
    setSelectedFolder(folder);
    setFolderName(folder.name);
    setFolderDescription(folder.description || '');
    setIsEditDialogOpen(true);
  };

  const handleDelete = (folder: ProjectFolder) => {
    setSelectedFolder(folder);
    setIsDeleteDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!folderName.trim()) {
      toast.error('Folder name is required');
      return;
    }
    createFolderMutation.mutate({
      name: folderName.trim(),
      description: folderDescription.trim() || undefined,
      parentId: parentFolderId || undefined
    });
  };

  const handleEditSubmit = () => {
    if (!selectedFolder || !folderName.trim()) {
      toast.error('Folder name is required');
      return;
    }
    updateFolderMutation.mutate({
      folderId: selectedFolder.id,
      name: folderName.trim(),
      description: folderDescription.trim() || undefined
    });
  };

  const handleDeleteConfirm = () => {
    if (selectedFolder) {
      deleteFolderMutation.mutate(selectedFolder.id);
    }
  };

  // Expand all root folders on initial load
  React.useEffect(() => {
    if (folderTree && expandedFolders.size === 0) {
      const rootIds = new Set<string>(folderTree.map((f: ProjectFolder) => f.id));
      setExpandedFolders(rootIds);
    }
  }, [folderTree]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-muted dark:bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        <p>Failed to load folders</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] })}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Folders</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            setParentFolderId(null);
            setFolderName('');
            setFolderDescription('');
            setIsCreateDialogOpen(true);
          }}
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* All Documents option */}
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-4 cursor-pointer transition-colors border-b',
          selectedFolderId === null
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'hover:bg-muted dark:hover:bg-gray-800'
        )}
        onClick={() => onFolderSelect(null)}
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">All Documents</span>
      </div>

      {/* Folder tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {folderTree && folderTree.length > 0 ? (
          folderTree.map((folder: ProjectFolder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              level={0}
              projectId={projectId}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              onFolderSelect={onFolderSelect}
              onToggleExpand={handleToggleExpand}
              onCreateSubfolder={handleCreateSubfolder}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDocumentUpload={onDocumentUpload}
            />
          ))
        ) : (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <Folder className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p>No folders yet</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setParentFolderId(null);
                setIsCreateDialogOpen(true);
              }}
            >
              Create your first folder
            </Button>
          </div>
        )}
      </div>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              {parentFolderId
                ? 'Create a new subfolder inside the selected folder.'
                : 'Create a new root-level folder for your project documents.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name *</Label>
              <Input
                id="folder-name"
                placeholder="Enter folder name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-description">Description</Label>
              <Textarea
                id="folder-description"
                placeholder="Optional description"
                value={folderDescription}
                onChange={(e) => setFolderDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createFolderMutation.isPending || !folderName.trim()}
            >
              {createFolderMutation.isPending ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>Update the folder name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-folder-name">Folder Name *</Label>
              <Input
                id="edit-folder-name"
                placeholder="Enter folder name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-folder-description">Description</Label>
              <Textarea
                id="edit-folder-description"
                placeholder="Optional description"
                value={folderDescription}
                onChange={(e) => setFolderDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={updateFolderMutation.isPending || !folderName.trim()}
            >
              {updateFolderMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedFolder?.name}"? This will also delete all
              documents and subfolders inside it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteFolderMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
