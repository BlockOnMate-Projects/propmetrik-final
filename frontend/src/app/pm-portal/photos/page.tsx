'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Camera, 
  Plus, 
  Search, 
  Grid,
  List,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Upload,
  Image,
  Download,
  Trash2,
  X,
  Calendar,
  MapPin,
  Tag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  photosApi, 
  projectsApi,
  Photo,
  Project
} from '@/lib/pm-portal-api';

type PhotoCategory = 'site' | 'progress' | 'safety' | 'quality' | 'weather' | 'equipment' | 'material' | 'other';

const categoryConfig: Record<PhotoCategory, { label: string; bg: string; text: string }> = {
  site: { label: 'Site', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  progress: { label: 'Progress', bg: 'bg-green-500/20', text: 'text-green-400' },
  safety: { label: 'Safety', bg: 'bg-red-500/20', text: 'text-red-400' },
  quality: { label: 'Quality', bg: 'bg-purple-500/20', text: 'text-purple-400' },
  weather: { label: 'Weather', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  equipment: { label: 'Equipment', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  material: { label: 'Material', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  other: { label: 'Other', bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
};

export default function PhotosPage() {
  const params = useParams();
  const projectId = params?.id as string | undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PhotoCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  
  // Upload form state
  const [uploadFormData, setUploadFormData] = useState({
    description: '',
    category: 'progress' as PhotoCategory,
    location: '',
    tags: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const photosResponse = await photosApi.getAll({
        projectId,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchQuery || undefined,
      });
      
      setPhotos(photosResponse.data);
      
      if (projectId) {
        try {
          const proj = await projectsApi.getById(projectId);
          setProject(proj);
        } catch {}
      }
    } catch (error) {
      console.error('Failed to fetch photos:', error);
      toast.error('Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [projectId, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(e.target.files);
      setShowUploadDialog(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast.error('Please select files to upload');
      return;
    }
    
    if (!projectId) {
      toast.error('Project ID is required');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(selectedFiles).forEach((file) => {
        formData.append('photos', file);
      });
      formData.append('project_id', projectId);
      formData.append('description', uploadFormData.description);
      formData.append('category', uploadFormData.category);
      formData.append('location', uploadFormData.location);
      formData.append('tags', uploadFormData.tags);
      
      await photosApi.upload(formData);
      
      toast.success(`${selectedFiles.length} photo(s) uploaded successfully`);
      setShowUploadDialog(false);
      setSelectedFiles(null);
      setUploadFormData({ description: '', category: 'progress', location: '', tags: '' });
      fetchData();
    } catch (error) {
      console.error('Failed to upload photos:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;
    
    try {
      await photosApi.delete(photo.id);
      toast.success('Photo deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete photo');
    }
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setLightboxIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
    } else {
      setLightboxIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  const filteredPhotos = photos;
  const currentPhoto = photos[lightboxIndex];

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        multiple
        className="hidden"
      />
      
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          {projectId && (
            <Link href={`/pm-portal/projects/${projectId}`} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-sm mb-2 transition-colors">
              <ArrowLeft className="h-3 w-3" />Back to Project
            </Link>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Camera className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Project Photos</h1>
              <p className="text-zinc-400 text-sm">Document site progress and conditions</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />Upload Photos
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total Photos</p>
            <p className="text-2xl font-bold text-white mt-1">{photos.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Progress</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{photos.filter(p => p.category === 'progress').length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Safety</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{photos.filter(p => p.category === 'safety').length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 pb-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">This Week</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">
              {photos.filter(p => {
                if (!p.created_at) return false;
                const created = new Date(p.created_at);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return created > weekAgo;
              }).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input placeholder="Search photos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500" />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as PhotoCategory | 'all')}>
            <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(categoryConfig).map(([value, config]) => (<SelectItem key={value} value={value}>{config.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-zinc-800">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('grid')}><Grid className="h-4 w-4" /></Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Photo Gallery */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>
      ) : filteredPhotos.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Image className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Photos Yet</h3>
            <p className="text-zinc-400 text-sm mb-4">Upload photos to document project progress</p>
            <Button onClick={() => fileInputRef.current?.click()} className="bg-cyan-600 hover:bg-cyan-700"><Upload className="h-4 w-4 mr-2" />Upload Photos</Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredPhotos.map((photo, index) => {
            const category = categoryConfig[photo.category as PhotoCategory] || categoryConfig.other;
            return (
              <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden bg-zinc-800 cursor-pointer" onClick={() => openLightbox(index)}>
                <img src={photo.thumbnail_url || photo.url} alt={photo.description || 'Project photo'} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <Badge className={`${category.bg} ${category.text} border-0 text-xs`}>{category.label}</Badge>
                    <p className="text-white text-xs mt-1 truncate">{formatDate(photo.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0 divide-y divide-zinc-800">
            {filteredPhotos.map((photo, index) => {
              const category = categoryConfig[photo.category as PhotoCategory] || categoryConfig.other;
              return (
                <div key={photo.id} className="flex items-center gap-4 p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer" onClick={() => openLightbox(index)}>
                  <div className="h-16 w-16 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                    <img src={photo.thumbnail_url || photo.url} alt={photo.description || 'Project photo'} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{photo.description || photo.filename || 'Untitled'}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(photo.created_at)}</span>
                      {photo.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{photo.location}</span>}
                    </div>
                  </div>
                  <Badge className={`${category.bg} ${category.text} border-0`}>{category.label}</Badge>
                  <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-red-400" onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Upload Photos</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {selectedFiles ? `${selectedFiles.length} file(s) selected` : 'Add details for your photos'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Category</Label>
                <Select value={uploadFormData.category} onValueChange={(v) => setUploadFormData({ ...uploadFormData, category: v as PhotoCategory })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryConfig).map(([value, config]) => (<SelectItem key={value} value={value}>{config.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Location</Label>
                <Input placeholder="e.g. Level 3 North" value={uploadFormData.location} onChange={(e) => setUploadFormData({ ...uploadFormData, location: e.target.value })} className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Textarea placeholder="Describe what these photos show..." value={uploadFormData.description} onChange={(e) => setUploadFormData({ ...uploadFormData, description: e.target.value })} className="bg-zinc-800 border-zinc-700 min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Tags</Label>
              <Input placeholder="concrete, rebar, inspection (comma separated)" value={uploadFormData.tags} onChange={(e) => setUploadFormData({ ...uploadFormData, tags: e.target.value })} className="bg-zinc-800 border-zinc-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(false); setSelectedFiles(null); }} className="border-zinc-700">Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading} className="bg-cyan-600 hover:bg-cyan-700">
              {uploading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>) : (<><Upload className="h-4 w-4 mr-2" />Upload</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {showLightbox && currentPhoto && (
        <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
          <DialogContent className="bg-zinc-950 border-zinc-800 max-w-5xl p-0">
            <div className="relative">
              <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10 text-white bg-black/50 hover:bg-black/70" onClick={() => setShowLightbox(false)}>
                <X className="h-5 w-5" />
              </Button>
              <div className="flex items-center">
                <Button variant="ghost" size="icon" className="absolute left-4 z-10 text-white bg-black/50 hover:bg-black/70" onClick={() => navigateLightbox('prev')}>
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <div className="w-full aspect-video flex items-center justify-center bg-black">
                  <img src={currentPhoto.url} alt={currentPhoto.description || 'Photo'} className="max-w-full max-h-[70vh] object-contain" />
                </div>
                <Button variant="ghost" size="icon" className="absolute right-4 z-10 text-white bg-black/50 hover:bg-black/70" onClick={() => navigateLightbox('next')}>
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>
              <div className="p-4 bg-zinc-900/90 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{currentPhoto.description || 'No description'}</p>
                    <p className="text-zinc-400 text-sm">{formatDate(currentPhoto.created_at)} • {currentPhoto.location || 'No location'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${categoryConfig[currentPhoto.category as PhotoCategory]?.bg} ${categoryConfig[currentPhoto.category as PhotoCategory]?.text} border-0`}>
                      {categoryConfig[currentPhoto.category as PhotoCategory]?.label || currentPhoto.category}
                    </Badge>
                    <span className="text-zinc-500 text-sm">{lightboxIndex + 1} / {photos.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
