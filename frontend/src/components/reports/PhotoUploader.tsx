/**
 * Photo Uploader Component
 * 
 * Drag-and-drop photo upload with compression, preview, and reordering.
 * Supports multiple photos with category selection and captions.
 * 
 * Phase 3: Photo Upload & Management
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Camera,
  Upload,
  X,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';

// =====================================================
// TYPES
// =====================================================

type PhotoCategory = 'exterior' | 'interior' | 'amenities' | 'neighbourhood' | 'damage' | 'other';

interface Photo {
  id: string;
  file?: File;
  preview: string;
  caption: string;
  category: PhotoCategory;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  error?: string;
  serverData?: {
    id: string;
    storage_url: string;
    thumbnail_url: string;
    original_url?: string;
  };
}

interface PhotoUploaderProps {
  reportId: string;
  existingPhotos?: Photo[];
  maxPhotos?: number;
  onPhotosChange?: (photos: Photo[]) => void;
  onUploadComplete?: (photos: Photo[]) => void;
  className?: string;
}

interface SortablePhotoProps {
  photo: Photo;
  onRemove: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
  onCategoryChange: (id: string, category: PhotoCategory) => void;
}

// =====================================================
// CONSTANTS
// =====================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const CATEGORY_OPTIONS: { value: PhotoCategory; label: string }[] = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'amenities', label: 'Amenities' },
  { value: 'neighbourhood', label: 'Neighbourhood' },
  { value: 'damage', label: 'Damage/Defects' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS: Record<PhotoCategory, string> = {
  exterior: 'bg-blue-100 text-blue-800',
  interior: 'bg-green-100 text-green-800',
  amenities: 'bg-purple-100 text-purple-800',
  neighbourhood: 'bg-orange-100 text-orange-800',
  damage: 'bg-red-100 text-red-800',
  other: 'bg-gray-100 text-gray-800',
};

// =====================================================
// IMAGE COMPRESSION
// =====================================================

async function compressImage(file: File, maxWidth = 2000, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Resize if needed
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================
// SORTABLE PHOTO COMPONENT
// =====================================================

function SortablePhoto({ photo, onRemove, onCaptionChange, onCategoryChange }: SortablePhotoProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group bg-white rounded-lg border shadow-sm overflow-hidden ${
        isDragging ? 'ring-2 ring-primary' : ''
      }`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 p-1 bg-black/50 rounded cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-white" />
      </div>

      {/* Remove Button */}
      <button
        onClick={() => onRemove(photo.id)}
        className="absolute top-2 right-2 z-10 p-1 bg-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4 text-white" />
      </button>

      {/* Status Badge */}
      <div className="absolute top-2 right-10 z-10">
        {photo.status === 'uploading' && (
          <Badge variant="secondary" className="bg-blue-100">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Uploading
          </Badge>
        )}
        {photo.status === 'uploaded' && (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Uploaded
          </Badge>
        )}
        {photo.status === 'error' && (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )}
      </div>

      {/* Image Preview */}
      <div className="aspect-video relative bg-gray-100">
        <img
          src={photo.preview}
          alt={photo.caption || 'Photo'}
          className="w-full h-full object-cover"
        />
        {photo.status === 'uploading' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Progress value={photo.progress} className="w-2/3" />
          </div>
        )}
      </div>

      {/* Photo Details */}
      <div className="p-3 space-y-2">
        <Input
          placeholder="Add caption..."
          value={photo.caption}
          onChange={(e) => onCaptionChange(photo.id, e.target.value)}
          className="text-sm"
        />
        <Select
          value={photo.category}
          onValueChange={(value) => onCategoryChange(photo.id, value as PhotoCategory)}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function PhotoUploader({
  reportId,
  existingPhotos = [],
  maxPhotos = 50,
  onPhotosChange,
  onUploadComplete,
  className = '',
}: PhotoUploaderProps) {
  const [photos, setPhotos] = useState<Photo[]>(existingPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultCategory, setDefaultCategory] = useState<PhotoCategory>('exterior');

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Generate unique ID
  const generateId = () => `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Handle file drop
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (photos.length + acceptedFiles.length > maxPhotos) {
        setError(`Maximum ${maxPhotos} photos allowed`);
        return;
      }

      const newPhotos: Photo[] = await Promise.all(
        acceptedFiles.map(async (file) => {
          // Create preview
          const preview = URL.createObjectURL(file);

          return {
            id: generateId(),
            file,
            preview,
            caption: file.name.replace(/\.[^/.]+$/, ''),
            category: defaultCategory,
            status: 'pending' as const,
            progress: 0,
          };
        })
      );

      setPhotos((prev) => {
        const updated = [...prev, ...newPhotos];
        onPhotosChange?.(updated);
        return updated;
      });
    },
    [photos.length, maxPhotos, defaultCategory, onPhotosChange]
  );

  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: true,
  });

  // Handle drag end for reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPhotos((prev) => {
        const oldIndex = prev.findIndex((p) => p.id === active.id);
        const newIndex = prev.findIndex((p) => p.id === over.id);

        const reordered = arrayMove(prev, oldIndex, newIndex);
        onPhotosChange?.(reordered);
        return reordered;
      });
    }
  };

  // Handle photo removal
  const handleRemove = useCallback((id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo?.preview) {
        URL.revokeObjectURL(photo.preview);
      }
      const updated = prev.filter((p) => p.id !== id);
      onPhotosChange?.(updated);
      return updated;
    });
  }, [onPhotosChange]);

  // Handle caption change
  const handleCaptionChange = useCallback((id: string, caption: string) => {
    setPhotos((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, caption } : p));
      onPhotosChange?.(updated);
      return updated;
    });
  }, [onPhotosChange]);

  // Handle category change
  const handleCategoryChange = useCallback((id: string, category: PhotoCategory) => {
    setPhotos((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, category } : p));
      onPhotosChange?.(updated);
      return updated;
    });
  }, [onPhotosChange]);

  // Upload all pending photos
  const handleUploadAll = async () => {
    const pendingPhotos = photos.filter((p) => p.status === 'pending' && p.file);
    if (pendingPhotos.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      // Upload photos by category
      const categoryGroups = pendingPhotos.reduce((acc, photo) => {
        if (!acc[photo.category]) acc[photo.category] = [];
        acc[photo.category].push(photo);
        return acc;
      }, {} as Record<PhotoCategory, Photo[]>);

      for (const [category, categoryPhotos] of Object.entries(categoryGroups)) {
        const formData = new FormData();
        formData.append('category', category);

        for (let i = 0; i < categoryPhotos.length; i++) {
          const photo = categoryPhotos[i];
          if (!photo.file) continue;

          // Compress image before upload
          const compressed = await compressImage(photo.file);
          formData.append('photos', compressed, photo.file.name);
          formData.append(`caption_${i}`, photo.caption);

          // Update status to uploading
          setPhotos((prev) =>
            prev.map((p) => (p.id === photo.id ? { ...p, status: 'uploading' as const } : p))
          );
        }

        // Upload batch
        const response = await fetch(`${API_BASE}/api/reports/${reportId}/photos/upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Upload failed');
        }

        const result = await response.json();

        // Update photos with server data
        setPhotos((prev) =>
          prev.map((p) => {
            const uploaded = result.photos.find(
              (up: any) => up.caption === p.caption && p.category === category
            );
            if (uploaded) {
              return {
                ...p,
                status: 'uploaded' as const,
                progress: 100,
                serverData: uploaded,
                preview: uploaded.thumbnail_url || p.preview,
              };
            }
            return p;
          })
        );
      }

      onUploadComplete?.(photos);
    } catch (err: any) {
      setError(err.message);

      // Mark failed photos as error
      setPhotos((prev) =>
        prev.map((p) =>
          p.status === 'uploading' ? { ...p, status: 'error' as const, error: err.message } : p
        )
      );
    } finally {
      setUploading(false);
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    return {
      total: photos.length,
      pending: photos.filter((p) => p.status === 'pending').length,
      uploading: photos.filter((p) => p.status === 'uploading').length,
      uploaded: photos.filter((p) => p.status === 'uploaded').length,
      error: photos.filter((p) => p.status === 'error').length,
    };
  }, [photos]);

  // Group by category for display
  const groupedPhotos = useMemo(() => {
    return CATEGORY_OPTIONS.reduce((acc, { value }) => {
      acc[value] = photos.filter((p) => p.category === value);
      return acc;
    }, {} as Record<PhotoCategory, Photo[]>);
  }, [photos]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Report Photos
        </CardTitle>
        <CardDescription>
          Upload photos for the valuation report. Drag to reorder.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1">
            <ImageIcon className="h-4 w-4" />
            {stats.total} photos
          </span>
          {stats.pending > 0 && (
            <Badge variant="outline">{stats.pending} pending</Badge>
          )}
          {stats.uploading > 0 && (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              {stats.uploading} uploading
            </Badge>
          )}
          {stats.uploaded > 0 && (
            <Badge className="bg-green-100 text-green-800">{stats.uploaded} uploaded</Badge>
          )}
          {stats.error > 0 && (
            <Badge variant="destructive">{stats.error} failed</Badge>
          )}
        </div>

        {/* Default Category Selection */}
        <div className="flex items-center gap-4">
          <Label>Default category for new uploads:</Label>
          <Select value={defaultCategory} onValueChange={(v) => setDefaultCategory(v as PhotoCategory)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-gray-300 hover:border-primary/50 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          {isDragActive ? (
            <p className="text-primary">Drop photos here...</p>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-600">
                Drag and drop photos here, or click to select
              </p>
              <p className="text-sm text-gray-400">
                JPEG, PNG, WebP up to 10MB each • Max {maxPhotos} photos
              </p>
            </div>
          )}
        </div>

        {/* Photo Grid */}
        {photos.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {CATEGORY_OPTIONS.map(({ value, label }) => {
                const categoryPhotos = groupedPhotos[value];
                if (categoryPhotos.length === 0) return null;

                return (
                  <div key={value}>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Badge className={CATEGORY_COLORS[value]}>{label}</Badge>
                      <span className="text-sm text-muted-foreground">
                        ({categoryPhotos.length})
                      </span>
                    </h4>
                    <SortableContext
                      items={categoryPhotos.map((p) => p.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {categoryPhotos.map((photo) => (
                          <SortablePhoto
                            key={photo.id}
                            photo={photo}
                            onRemove={handleRemove}
                            onCaptionChange={handleCaptionChange}
                            onCategoryChange={handleCategoryChange}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>
          </DndContext>
        )}

        {/* Action Buttons */}
        {photos.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                photos.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
                setPhotos([]);
                onPhotosChange?.([]);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>

            <Button
              onClick={handleUploadAll}
              disabled={uploading || stats.pending === 0}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {stats.pending} Photo{stats.pending !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PhotoUploader;
