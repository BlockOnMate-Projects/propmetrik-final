'use client'

import React, { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// =====================================================
// TYPES
// =====================================================
interface HeroImageUploadProps {
  value?: string | null
  onChange: (url: string | null, file?: File) => void
  maxSizeMB?: number
  acceptedTypes?: string[]
  className?: string
  error?: string
}

// =====================================================
// CONSTANTS
// =====================================================
const DEFAULT_MAX_SIZE_MB = 5
const DEFAULT_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// =====================================================
// HERO IMAGE UPLOAD COMPONENT
// =====================================================
export function HeroImageUpload({
  value,
  onChange,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  className,
  error,
}: HeroImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Validate file
  const validateFile = (file: File): string | null => {
    // Check type
    if (!acceptedTypes.includes(file.type)) {
      return `Invalid file type. Accepted: ${acceptedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')}`
    }

    // Check size
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > maxSizeMB) {
      return `File too large. Maximum size: ${maxSizeMB}MB`
    }

    return null
  }

  // Handle file selection
  const handleFile = useCallback(async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setUploadError(validationError)
      return
    }

    setUploadError(null)
    setIsUploading(true)

    try {
      // Create local preview URL
      const localUrl = URL.createObjectURL(file)
      setPreviewUrl(localUrl)

      // In a real implementation, you would upload to your server/S3 here
      // For now, we pass the file to the parent component
      // The parent can handle the actual upload

      // Simulate upload delay for UX
      await new Promise(resolve => setTimeout(resolve, 500))

      onChange(localUrl, file)
    } catch (err) {
      setUploadError('Failed to process image. Please try again.')
      setPreviewUrl(null)
    } finally {
      setIsUploading(false)
    }
  }, [maxSizeMB, acceptedTypes, onChange])

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  // Handle remove
  const handleRemove = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    onChange(null)
    setUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [previewUrl, onChange])

  // Open file dialog
  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Label */}
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-amber-500" />
        <span className="font-mono text-xs text-amber-500 tracking-wider">
          HERO IMAGE
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          (max {maxSizeMB}MB, JPG/PNG/WebP)
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Upload area or preview */}
      {previewUrl ? (
        // Preview mode
        <div className="relative group">
          <div className="aspect-video bg-card border border-border overflow-hidden rounded">
            <img
              src={previewUrl}
              alt="Hero preview"
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* Overlay actions */}
          <div className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFileDialog}
              className="border-zinc-600 bg-card/80 hover:bg-muted"
            >
              <Upload className="h-4 w-4 mr-1" />
              Replace
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
              className="border-red-900 bg-red-100 dark:bg-red-900/50 hover:bg-red-900/70 text-red-600 dark:text-red-400"
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>

          {/* Loading overlay */}
          {isUploading && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                <span className="font-mono text-xs text-muted-foreground">Processing...</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Upload mode
        <div
          onClick={openFileDialog}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "aspect-video border-2 border-dashed rounded cursor-pointer transition-colors",
            "flex flex-col items-center justify-center gap-3",
            isDragOver
              ? "border-amber-500 bg-amber-500/10"
              : "border-border bg-card/50 hover:border-zinc-600 hover:bg-card"
          )}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <span className="font-mono text-xs text-muted-foreground">Processing image...</span>
            </>
          ) : (
            <>
              <div className={cn(
                "p-3 rounded-full",
                isDragOver ? "bg-amber-500/20" : "bg-muted"
              )}>
                <Upload className={cn(
                  "h-6 w-6",
                  isDragOver ? "text-amber-500" : "text-muted-foreground"
                )} />
              </div>
              <div className="text-center">
                <p className="font-mono text-xs text-muted-foreground">
                  {isDragOver ? 'Drop image here' : 'Click or drag to upload'}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground mt-1">
                  Recommended: 1920x1080 or 16:9 aspect ratio
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error messages */}
      {(uploadError || error) && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="font-mono text-[10px]">{uploadError || error}</span>
        </div>
      )}

      {/* Tips */}
      <div className="flex flex-wrap gap-2 pt-1">
        {['JPG', 'PNG', 'WebP'].map((format) => (
          <span
            key={format}
            className="font-mono text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
          >
            {format}
          </span>
        ))}
        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
          Max {maxSizeMB}MB
        </span>
      </div>
    </div>
  )
}

export default HeroImageUpload
