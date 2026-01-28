'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Camera,
  Upload,
  Grid,
  List,
  Search,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  X,
  RefreshCw,
  Loader2,
  ArrowLeft,
  MoreHorizontal,
  Check,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import ProjectSubnav from '@/components/pm-portal/ProjectSubnav';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type PhotoCategory = 
  | 'progress' | 'issue' | 'safety' | 'quality' | 'delivery'
  | 'inspection' | 'before_after' | 'equipment' | 'materials'
  | 'weather' | 'milestone' | 'documentation' | 'other';

type PhotoStatus = 'pending' | 'approved' | 'rejected' | 'archived';

interface Photo {
  id: string;
  projectId: string;
  projectName?: string;
  title: string;
  description?: string;
  category: PhotoCategory;
  status: PhotoStatus;
  filePath: string;
  fileName: string;
  fileSize: number;
  thumbnailPath?: string;
  locationName?: string;
  takenAt?: string;
  manualTags: string[];
  uploadedByName?: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

type ViewMode = 'grid' | 'list';

const categoryConfig: Record<PhotoCategory, { label: string; color: string; icon: string }> = {
  progress: { label: 'Progress', color: 'bg-blue-900/50 text-blue-400', icon: '🔨' },
  issue: { label: 'Issue', color: 'bg-red-900/50 text-red-400', icon: '⚠️' },
  safety: { label: 'Safety', color: 'bg-orange-900/50 text-orange-400', icon: '🦺' },
  quality: { label: 'Quality', color: 'bg-emerald-900/50 text-emerald-400', icon: '✅' },
  delivery: { label: 'Delivery', color: 'bg-purple-900/50 text-purple-400', icon: '📦' },
  inspection: { label: 'Inspection', color: 'bg-indigo-900/50 text-indigo-400', icon: '🔍' },
  before_after: { label: 'Before/After', color: 'bg-pink-900/50 text-pink-400', icon: '📷' },
  equipment: { label: 'Equipment', color: 'bg-zinc-700 text-zinc-300', icon: '🏗️' },
  materials: { label: 'Materials', color: 'bg-amber-900/50 text-amber-400', icon: '🧱' },
  weather: { label: 'Weather', color: 'bg-cyan-900/50 text-cyan-400', icon: '🌤️' },
  milestone: { label: 'Milestone', color: 'bg-emerald-900/50 text-emerald-400', icon: '🎯' },
  documentation: { label: 'Documentation', color: 'bg-zinc-700 text-zinc-400', icon: '📄' },
  other: { label: 'Other', color: 'bg-zinc-800 text-zinc-400', icon: '📌' }
};

const statusConfig: Record<PhotoStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-yellow-900/50 text-yellow-400', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-900/50 text-emerald-400', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-900/50 text-red-400', icon: XCircle },
  archived: { label: 'Archived', color: 'bg-zinc-700 text-zinc-400', icon: Camera }
};

export default function ProjectPhotosPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Dialog states
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  
  const { toast } = useToast();

  // Stats
  const stats = {
    total: photos.length,
    progress: photos.filter(p => p.category === 'progress').length,
    pending: photos.filter(p => p.status === 'pending').length,
    approved: photos.filter(p => p.status === 'approved').length,
  };

  // Fetch project
  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`);
      const result = await response.json();
      if (result.success) {
        setProject(result.data);
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  }, [projectId]);

  // Fetch photos
  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('projectId', projectId);
      if (categoryFilter && categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('pageSize', '100');

      const response = await fetch(`${API_BASE}/api/photos?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setPhotos(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to fetch photos');
      }
    } catch (error: any) {
      console.error('Error fetching photos:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch photos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, categoryFilter, statusFilter, toast]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Status actions
  const handleApprove = async (photo: Photo) => {
    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/photos/${photo.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Photo approved' });
        fetchPhotos();
      } else {
        throw new Error(result.error || 'Failed to approve photo');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (photo: Photo) => {
    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/photos/${photo.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected by PM' }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Photo rejected' });
        fetchPhotos();
      } else {
        throw new Error(result.error || 'Failed to reject photo');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPhoto) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/photos/${selectedPhoto.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: 'Success', description: 'Photo deleted' });
        setShowDeleteDialog(false);
        setSelectedPhoto(null);
        fetchPhotos();
      } else {
        throw new Error(result.error || 'Failed to delete photo');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openLightbox = (photo: Photo) => {
    setSelectedPhoto(photo);
    setShowLightbox(true);
  };

  const openDeleteDialog = (photo: Photo) => {
    setSelectedPhoto(photo);
    setShowDeleteDialog(true);
  };

  const filteredPhotos = photos.filter(photo =>
    photo.title?.toLowerCase().includes(search.toLowerCase()) ||
    photo.description?.toLowerCase().includes(search.toLowerCase()) ||
    photo.locationName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Photos</h1>
            {project && (
              <p className="text-zinc-400 text-sm mt-1">{project.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-zinc-700" onClick={fetchPhotos}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <div className="flex border border-zinc-700 rounded-lg overflow-hidden">
            <Button 
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'bg-zinc-700' : ''}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button 
              variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-zinc-700' : ''}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setShowUploadDialog(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload
          </Button>
        </div>
      </div>

      <ProjectSubnav projectId={projectId} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
              </div>
              <Camera className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Progress</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{stats.progress}</p>
              </div>
              <ImageIcon className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Pending</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.pending}</p>
              </div>
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wider">Approved</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.approved}</p>
              </div>
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search photos..."
            className="pl-9 bg-zinc-900 border-zinc-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px] bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="progress">Progress</SelectItem>
            <SelectItem value="issue">Issue</SelectItem>
            <SelectItem value="safety">Safety</SelectItem>
            <SelectItem value="quality">Quality</SelectItem>
            <SelectItem value="milestone">Milestone</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : filteredPhotos.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Camera className="h-12 w-12 mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Photos</h3>
            <p className="text-zinc-400 mb-4">Upload photos for this project</p>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowUploadDialog(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload Photo
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredPhotos.map((photo) => {
            const category = categoryConfig[photo.category] || categoryConfig['other'];
            const status = statusConfig[photo.status] || statusConfig['pending'];

            return (
              <Card 
                key={photo.id} 
                className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors overflow-hidden cursor-pointer group"
                onClick={() => openLightbox(photo)}
              >
                <div className="aspect-square relative bg-zinc-800">
                  {photo.thumbnailPath || photo.filePath ? (
                    <img 
                      src={photo.thumbnailPath || photo.filePath} 
                      alt={photo.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-12 w-12 text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="h-8 w-8 text-white" />
                  </div>
                  <div className="absolute top-2 left-2">
                    <Badge className={`${category.color} text-xs`}>
                      {category.icon} {category.label}
                    </Badge>
                  </div>
                  <div className="absolute top-2 right-2">
                    <Badge className={`${status.color} text-xs`}>
                      {status.label}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-3">
                  <h3 className="font-medium text-white text-sm line-clamp-1">{photo.title}</h3>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPhotos.map((photo) => {
            const category = categoryConfig[photo.category] || categoryConfig['other'];
            const status = statusConfig[photo.status] || statusConfig['pending'];
            const StatusIcon = status.icon;

            return (
              <Card key={photo.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-16 h-16 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 cursor-pointer"
                      onClick={() => openLightbox(photo)}
                    >
                      {photo.thumbnailPath || photo.filePath ? (
                        <img 
                          src={photo.thumbnailPath || photo.filePath} 
                          alt={photo.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-zinc-700" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white line-clamp-1">{photo.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={`${category.color} text-xs`}>
                          {category.icon} {category.label}
                        </Badge>
                        <Badge className={`${status.color} text-xs gap-1`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500 mt-2">
                        {photo.locationName && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {photo.locationName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {new Date(photo.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                        <DropdownMenuItem onClick={() => openLightbox(photo)}>
                          <Eye className="h-4 w-4 mr-2" /> View
                        </DropdownMenuItem>
                        {photo.status === 'pending' && (
                          <>
                            <DropdownMenuItem className="text-emerald-400" onClick={() => handleApprove(photo)}>
                              <Check className="h-4 w-4 mr-2" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-400" onClick={() => handleReject(photo)}>
                              <X className="h-4 w-4 mr-2" /> Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem className="text-red-400" onClick={() => openDeleteDialog(photo)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl p-0">
          {selectedPhoto && (
            <>
              <div className="relative aspect-video bg-black">
                {selectedPhoto.filePath ? (
                  <img 
                    src={selectedPhoto.filePath} 
                    alt={selectedPhoto.title}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-24 w-24 text-zinc-700" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white">{selectedPhoto.title}</h3>
                {selectedPhoto.description && (
                  <p className="text-zinc-400 text-sm mt-1">{selectedPhoto.description}</p>
                )}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Badge className={categoryConfig[selectedPhoto.category]?.color || 'bg-zinc-800'}>
                    {categoryConfig[selectedPhoto.category]?.icon} {categoryConfig[selectedPhoto.category]?.label}
                  </Badge>
                  <Badge className={statusConfig[selectedPhoto.status]?.color || 'bg-zinc-800'}>
                    {statusConfig[selectedPhoto.status]?.label}
                  </Badge>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Upload Photos</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Upload photos from your device.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 border-2 border-dashed border-zinc-700 rounded-lg p-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-400">Drag and drop photos here</p>
            <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
            <Button className="mt-4 bg-amber-600 hover:bg-amber-700">
              Select Files
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Photo</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this photo? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
