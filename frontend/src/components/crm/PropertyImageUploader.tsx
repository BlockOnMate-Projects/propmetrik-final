'use client'

import React, { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
    Upload, X, ImageIcon, Loader2, GripVertical, Camera, AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

export interface PropertyImage {
    id: string
    key: string
    bucket: string
    url: string
    original_name: string
    content_type: string
    size: number
    category: string
    caption: string
    uploaded_at: string
}

interface PropertyImageUploaderProps {
    propertyId?: string // If set, uploads go directly to this property
    images: PropertyImage[]
    onImagesChange: (images: PropertyImage[]) => void
    maxImages?: number
    className?: string
    /** If true, holds files locally until parent calls getFiles() */
    deferUpload?: boolean
}

interface PendingFile {
    id: string
    file: File
    preview: string
    uploading: boolean
    error?: string
}

export function PropertyImageUploader({
    propertyId,
    images,
    onImagesChange,
    maxImages = 20,
    className,
    deferUpload = false,
}: PropertyImageUploaderProps) {
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const totalCount = images.length + pendingFiles.length

    const handleFiles = useCallback((files: FileList | File[]) => {
        setError(null)
        const fileArray = Array.from(files)
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

        const valid = fileArray.filter(f => {
            if (!allowed.includes(f.type)) {
                setError(`${f.name}: unsupported format. Use JPEG, PNG, or WebP.`)
                return false
            }
            if (f.size > 10 * 1024 * 1024) {
                setError(`${f.name}: exceeds 10MB limit.`)
                return false
            }
            return true
        })

        if (totalCount + valid.length > maxImages) {
            setError(`Maximum ${maxImages} images allowed. You have ${totalCount}.`)
            valid.splice(maxImages - totalCount)
        }

        const newPending: PendingFile[] = valid.map(file => ({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file),
            uploading: false,
        }))

        setPendingFiles(prev => [...prev, ...newPending])

        // If we have a propertyId and are not deferring, upload immediately
        if (propertyId && !deferUpload) {
            uploadFiles(newPending)
        }
    }, [propertyId, deferUpload, totalCount, maxImages])

    const uploadFiles = async (files: PendingFile[]) => {
        if (!propertyId || files.length === 0) return

        setIsUploading(true)

        // Mark files as uploading
        setPendingFiles(prev =>
            prev.map(pf => files.find(f => f.id === pf.id) ? { ...pf, uploading: true } : pf)
        )

        const formData = new FormData()
        files.forEach(pf => formData.append('images', pf.file))

        try {
            const response = await authedFetch(`${API_BASE}/crm/properties/${propertyId}/images`, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Upload failed')
            }

            const data = await response.json()

            // Remove uploaded files from pending
            const uploadedIds = new Set(files.map(f => f.id))
            setPendingFiles(prev => prev.filter(pf => !uploadedIds.has(pf.id)))

            // Revoke object URLs
            files.forEach(pf => URL.revokeObjectURL(pf.preview))

            // Update parent with new images
            onImagesChange(data.images)
        } catch (err: any) {
            setError(err.message)
            setPendingFiles(prev =>
                prev.map(pf => files.find(f => f.id === pf.id) ? { ...pf, uploading: false, error: err.message } : pf)
            )
        } finally {
            setIsUploading(false)
        }
    }

    /** Upload all pending files — called by parent when deferUpload is true */
    const uploadAllPending = async (targetPropertyId: string) => {
        if (pendingFiles.length === 0) return []

        const formData = new FormData()
        pendingFiles.forEach(pf => formData.append('images', pf.file))

        const response = await authedFetch(`${API_BASE}/crm/properties/${targetPropertyId}/images`, {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Upload failed')
        }

        const data = await response.json()

        // Cleanup previews
        pendingFiles.forEach(pf => URL.revokeObjectURL(pf.preview))
        setPendingFiles([])

        return data.images as PropertyImage[]
    }

    // Expose uploadAllPending via ref for parent
    ;(PropertyImageUploader as any).__uploadAllPending = uploadAllPending

    const removeImage = async (imageId: string) => {
        // Check if it's a pending file
        const pending = pendingFiles.find(pf => pf.id === imageId)
        if (pending) {
            URL.revokeObjectURL(pending.preview)
            setPendingFiles(prev => prev.filter(pf => pf.id !== imageId))
            return
        }

        // It's an uploaded image — delete from server
        if (!propertyId) return

        try {
            const response = await authedFetch(`${API_BASE}/crm/properties/${propertyId}/images/${imageId}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                const data = await response.json()
                onImagesChange(data.images)
            }
        } catch (err) {
            console.error('Failed to delete image:', err)
        }
    }

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files)
        }
    }, [handleFiles])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
    }, [])

    return (
        <div className={cn('space-y-4', className)}>
            {/* Drop zone */}
            <div
                className={cn(
                    'relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
                    dragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    totalCount >= maxImages && 'opacity-50 pointer-events-none'
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Camera className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            Drop images here or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            JPEG, PNG, WebP up to 10MB each • {totalCount}/{maxImages} images
                        </p>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Image grid */}
            {(images.length > 0 || pendingFiles.length > 0) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {/* Uploaded images */}
                    {images.map((image, idx) => (
                        <div
                            key={image.id}
                            className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                        >
                            <img
                                src={image.url}
                                alt={image.original_name}
                                className="w-full h-full object-cover"
                            />
                            {idx === 0 && (
                                <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px]">
                                    Cover
                                </Badge>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    removeImage(image.id)
                                }}
                                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                <p className="text-[10px] text-foreground truncate">
                                    {image.original_name}
                                </p>
                            </div>
                        </div>
                    ))}

                    {/* Pending files (not yet uploaded) */}
                    {pendingFiles.map((pf) => (
                        <div
                            key={pf.id}
                            className="relative group aspect-square rounded-lg overflow-hidden border border-dashed border-border bg-muted"
                        >
                            <img
                                src={pf.preview}
                                alt={pf.file.name}
                                className={cn(
                                    'w-full h-full object-cover',
                                    pf.uploading && 'opacity-50'
                                )}
                            />
                            {pf.uploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-background/30">
                                    <Loader2 className="h-6 w-6 text-foreground animate-spin" />
                                </div>
                            )}
                            {pf.error && (
                                <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
                                    <AlertCircle className="h-6 w-6 text-destructive" />
                                </div>
                            )}
                            {!pf.uploading && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        removeImage(pf.id)
                                    }}
                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                <p className="text-[10px] text-foreground truncate">
                                    {pf.file.name}
                                </p>
                                {deferUpload && !pf.uploading && (
                                    <Badge variant="outline" className="text-[9px] mt-1 border-amber-500/50 text-amber-600 dark:text-amber-400">
                                        Pending upload
                                    </Badge>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload all pending button (for deferred mode) */}
            {deferUpload && pendingFiles.length > 0 && propertyId && (
                <Button
                    type="button"
                    onClick={() => uploadFiles(pendingFiles)}
                    disabled={isUploading}
                    className="w-full"
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading {pendingFiles.length} images...
                        </>
                    ) : (
                        <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload {pendingFiles.length} image{pendingFiles.length !== 1 ? 's' : ''}
                        </>
                    )}
                </Button>
            )}
        </div>
    )
}

export default PropertyImageUploader
