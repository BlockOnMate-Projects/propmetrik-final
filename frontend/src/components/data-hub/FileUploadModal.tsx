'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Upload, X, FileText, FileSpreadsheet, File as FileIcon, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'

interface FileUploadModalProps {
    isOpen: boolean
    onClose: () => void
    sourceId: string
    sourceName: string
    onUploadComplete?: (uploadId: string) => void
}

export function FileUploadModal({
    isOpen,
    onClose,
    sourceId,
    sourceName,
    onUploadComplete,
}: FileUploadModalProps) {
    const [uploadedFile, setUploadedFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [previewData, setPreviewData] = useState<any[] | null>(null)
    const [serverUploadStatus, setServerUploadStatus] = useState<string | null>(null)
    const [uploadId, setUploadId] = useState<string | null>(null)
    const [validationReport, setValidationReport] = useState<{ is_valid?: boolean; errors?: string[]; warnings?: string[] } | null>(null)
    const [importing, setImporting] = useState(false)

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

    const pollUpload = async (id: string) => {
        const deadline = Date.now() + 15000

        while (Date.now() < deadline) {
            try {
                const res = await authedFetch(`${API_BASE}/data-hub/uploads/${id}`)
                if (!res.ok) {
                    break
                }
                const json = await res.json().catch(() => null)
                const upload = json?.data
                if (upload?.upload_status) {
                    setServerUploadStatus(upload.upload_status)
                }
                if (upload?.validation_report) {
                    setValidationReport(upload.validation_report)
                }
                if (upload?.preview_data && Array.isArray(upload.preview_data) && upload.preview_data.length > 0) {
                    setPreviewData(upload.preview_data)
                    return
                }
            } catch {
                // ignore transient polling errors
            }

            await new Promise((r) => setTimeout(r, 1000))
        }
    }

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setUploadedFile(acceptedFiles[0])
            setUploadStatus('idle')
            setErrorMessage(null)
            setPreviewData(null)
            setServerUploadStatus(null)
            setUploadId(null)
            setValidationReport(null)
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/pdf': ['.pdf'],
        },
        maxSize: 50 * 1024 * 1024, // 50MB
        multiple: false,
    })

    const handleUpload = async () => {
        if (!uploadedFile) return

        setUploading(true)
        setUploadStatus('uploading')
        setUploadProgress(0)

        try {
            // Simulate progress
            const progressInterval = setInterval(() => {
                setUploadProgress((prev) => Math.min(prev + 10, 90))
            }, 200)

            // 1) Ask backend for a presigned upload URL
            const presignRes = await authedFetch(`${API_BASE}/data-hub/uploads/presign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_id: sourceId,
                    original_name: uploadedFile.name,
                    mime_type: uploadedFile.type || 'application/octet-stream',
                    file_size_bytes: uploadedFile.size,
                    uploaded_by: 'portal',
                }),
            })

            if (!presignRes.ok) {
                const error = await presignRes.json().catch(() => ({}))
                throw new Error(error.message || error.error || 'Failed to request upload URL')
            }

            const presignJson = await presignRes.json()
            const id: string | undefined = presignJson?.data?.upload_id
            const uploadUrl: string | undefined = presignJson?.data?.upload_url
            if (!id || !uploadUrl) {
                throw new Error('Invalid presign response from server')
            }

            setUploadId(id)

            // 2) Upload file directly to MinIO
            const putRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': uploadedFile.type || 'application/octet-stream',
                },
                body: uploadedFile,
            })

            if (!putRes.ok) {
                throw new Error('Direct upload to storage failed')
            }

            // 3) Notify backend upload is complete (kicks off parsing/validation)
            const completeRes = await authedFetch(`${API_BASE}/data-hub/uploads/${id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })

            if (!completeRes.ok) {
                const error = await completeRes.json().catch(() => ({}))
                throw new Error(error.message || error.error || 'Failed to complete upload')
            }

            clearInterval(progressInterval)
            setUploadProgress(100)
            setUploadStatus('success')

            setServerUploadStatus('pending')
            pollUpload(id)

            if (onUploadComplete) {
                onUploadComplete(id)
            }
        } catch (error: any) {
            setUploadStatus('error')
            setErrorMessage(error.message || 'Upload failed')
            setUploadProgress(0)
        } finally {
            setUploading(false)
        }
    }

    const handleImport = async () => {
        if (!uploadId || importing) return

        setImporting(true)
        setErrorMessage(null)

        try {
            const res = await authedFetch(`${API_BASE}/data-hub/uploads/${uploadId}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })

            if (!res.ok) {
                const error = await res.json().catch(() => ({}))
                throw new Error(error.message || error.error || 'Import failed')
            }

            pollUpload(uploadId)
        } catch (error: any) {
            setErrorMessage(error.message || 'Import failed')
        } finally {
            setImporting(false)
        }
    }

    const handleClose = () => {
        setUploadedFile(null)
        setUploadStatus('idle')
        setUploadProgress(0)
        setErrorMessage(null)
        setPreviewData(null)
        setServerUploadStatus(null)
        setUploadId(null)
        setValidationReport(null)
        setImporting(false)
        onClose()
    }

    const getFileIcon = (fileName: string) => {
        const ext = fileName.toLowerCase()
        if (ext.endsWith('.csv')) return <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
        if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) return <FileSpreadsheet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        if (ext.endsWith('.pdf')) return <FileIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
        return <FileIcon className="h-5 w-5 text-muted-foreground" />
    }

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Upload Data File</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Upload file to: <span className="font-medium">{sourceName}</span>
                    </p>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Drag and Drop Zone */}
                    {!uploadedFile && (
                        <div
                            {...getRootProps()}
                            className={cn(
                                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                            )}
                        >
                            <input {...getInputProps()} />
                            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-lg font-medium mb-2">
                                {isDragActive ? 'Drop your file here' : 'Drag and drop your file here'}
                            </p>
                            <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                            <p className="text-xs text-muted-foreground">
                                Supported: .csv, .xlsx, .xls, .pdf (max 50MB)
                            </p>
                        </div>
                    )}

                    {/* File Preview */}
                    {uploadedFile && (
                        <div className="border rounded-lg p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {getFileIcon(uploadedFile.name)}
                                    <div>
                                        <p className="font-medium">{uploadedFile.name}</p>
                                        <p className="text-sm text-muted-foreground">{formatFileSize(uploadedFile.size)}</p>
                                    </div>
                                </div>
                                {uploadStatus === 'idle' && (
                                    <Button variant="ghost" size="sm" onClick={() => setUploadedFile(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            {/* Upload Progress */}
                            {uploadStatus === 'uploading' && (
                                <div className="space-y-2">
                                    <Progress value={uploadProgress} />
                                    <p className="text-sm text-muted-foreground text-center">
                                        Uploading... {uploadProgress}%
                                    </p>
                                </div>
                            )}

                            {/* Success State */}
                            {uploadStatus === 'success' && (
                                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                    <CheckCircle className="h-5 w-5" />
                                    <span className="text-sm font-medium">
                                        Upload received{serverUploadStatus ? ` • ${serverUploadStatus}` : ''}
                                    </span>
                                </div>
                            )}

                            {/* Error State */}
                            {uploadStatus === 'error' && (
                                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                    <AlertCircle className="h-5 w-5" />
                                    <span className="text-sm font-medium">{errorMessage}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Preview Data */}
                    {previewData && previewData.length > 0 && (
                        <div className="border rounded-lg p-4">
                            <h4 className="text-sm font-medium mb-2">Data Preview</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            {Object.keys(previewData[0]).map((key) => (
                                                <th key={key} className="text-left p-2 font-medium">
                                                    {key}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.slice(0, 3).map((row, idx) => (
                                            <tr key={idx} className="border-b">
                                                {Object.values(row).map((value: any, i) => (
                                                    <td key={i} className="p-2 text-muted-foreground">
                                                        {String(value)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Showing first 3 rows of {previewData.length} total
                            </p>
                        </div>
                    )}

                    {/* Validation */}
                    {validationReport && (
                        <div className="border rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Validation</h4>
                                <Badge variant={validationReport.is_valid ? 'success' : 'destructive'}>
                                    {validationReport.is_valid ? 'Valid' : 'Invalid'}
                                </Badge>
                            </div>
                            {Array.isArray(validationReport.errors) && validationReport.errors.length > 0 && (
                                <div className="text-sm text-red-600 dark:text-red-400">
                                    {validationReport.errors.slice(0, 5).map((e, idx) => (
                                        <div key={idx}>{e}</div>
                                    ))}
                                </div>
                            )}
                            {Array.isArray(validationReport.warnings) && validationReport.warnings.length > 0 && (
                                <div className="text-sm text-yellow-600 dark:text-yellow-400">
                                    {validationReport.warnings.slice(0, 5).map((w, idx) => (
                                        <div key={idx}>{w}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={handleClose} disabled={uploading}>
                            Cancel
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleImport}
                            disabled={!uploadId || uploading || importing || uploadStatus !== 'success' || validationReport?.is_valid === false}
                        >
                            {importing ? 'Importing...' : 'Import'}
                        </Button>
                        <Button
                            onClick={handleUpload}
                            disabled={!uploadedFile || uploading || uploadStatus === 'success'}
                        >
                            {uploading ? 'Uploading...' : 'Upload'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
