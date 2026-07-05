'use client'

import React, { useRef, useState } from 'react'
import { Loader2, Video, Trash2, Upload, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authedFetch } from '@/lib/authed-fetch'
import { cn } from '@/lib/utils'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

const ACCEPTED = 'video/mp4,video/webm,video/quicktime'
const MAX_BYTES = 150 * 1024 * 1024 // ~150MB client-side guard

interface PropertyVideoUploaderProps {
    /** Which backend to hit: PM or CRM property */
    scope: 'pm' | 'crm'
    propertyId: string
    /** Current marketing video URL, if any */
    videoUrl?: string | null
    /** Called after a successful upload/remove with the new url (or null) */
    onChange?: (videoUrl: string | null) => void
    className?: string
}

export function PropertyVideoUploader({
    scope,
    propertyId,
    videoUrl,
    onChange,
    className,
}: PropertyVideoUploaderProps) {
    const [currentUrl, setCurrentUrl] = useState<string | null>(videoUrl ?? null)
    const [isUploading, setIsUploading] = useState(false)
    const [isRemoving, setIsRemoving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const endpoint = `${API_BASE}/${scope}/properties/${propertyId}/video`

    const handleFile = async (file: File) => {
        setError(null)

        if (file.size > MAX_BYTES) {
            setError('Video exceeds ~150MB. Please compress it before uploading.')
            return
        }

        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await authedFetch(endpoint, {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                let msg = 'Upload failed'
                try {
                    const data = await res.json()
                    msg = data.error || data.message || msg
                } catch {
                    /* ignore */
                }
                throw new Error(msg)
            }

            const data = (await res.json()) as { video_url: string }
            setCurrentUrl(data.video_url)
            onChange?.(data.video_url)
        } catch (err: any) {
            setError(err?.message || 'Upload failed')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleRemove = async () => {
        setError(null)
        setIsRemoving(true)
        try {
            const res = await authedFetch(endpoint, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to remove video')
            setCurrentUrl(null)
            onChange?.(null)
        } catch (err: any) {
            setError(err?.message || 'Failed to remove video')
        } finally {
            setIsRemoving(false)
        }
    }

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Marketing Video</span>
            </div>
            <p className="text-xs text-muted-foreground">
                Shown on your public Marketplace listing. MP4, WebM, or MOV up to ~150MB.
            </p>

            {currentUrl && (
                <video
                    controls
                    src={currentUrl}
                    className="w-full max-h-72 rounded-lg border border-border bg-black"
                >
                    Your browser does not support the video tag.
                </video>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                }}
            />

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isUploading || isRemoving}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                        </>
                    ) : (
                        <>
                            <Upload className="h-4 w-4 mr-2" />
                            {currentUrl ? 'Replace Video' : 'Upload Video'}
                        </>
                    )}
                </Button>

                {currentUrl && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={isUploading || isRemoving}
                        onClick={handleRemove}
                    >
                        {isRemoving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Remove
                    </Button>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 p-2.5 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                </div>
            )}
        </div>
    )
}

export default PropertyVideoUploader
