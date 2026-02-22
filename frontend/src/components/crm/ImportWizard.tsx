'use client'

import React, { useState, useCallback, useMemo, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertCircle,
  Loader2,
  Download,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { CONTACT_IMPORT_FIELDS } from '@/types/crm-filters'
import type { CsvColumnMapping, ImportError } from '@/types/crm-filters'
import { contactsApi } from '@/lib/crm-api'
import { useQueryClient } from '@tanstack/react-query'

// =====================================================
// STEPS
// =====================================================
type ImportStep = 'upload' | 'map' | 'preview' | 'importing' | 'complete'

interface ImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<ImportStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [mappings, setMappings] = useState<CsvColumnMapping[]>([])
  const [errors, setErrors] = useState<ImportError[]>([])
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{
    created: number
    skipped: number
    errors: ImportError[]
  } | null>(null)

  // Reset state
  const reset = useCallback(() => {
    setStep('upload')
    setFile(null)
    setCsvHeaders([])
    setCsvData([])
    setMappings([])
    setErrors([])
    setImportProgress(0)
    setImportResult(null)
  }, [])

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!selected.name.endsWith('.csv') && !selected.type.includes('csv')) {
      toast.error('Please upload a CSV file')
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)')
      return
    }

    setFile(selected)

    Papa.parse(selected, {
      header: true,
      skipEmptyLines: true,
      preview: 200, // Only parse first 200 rows for preview
      complete: (results) => {
        const headers = results.meta.fields || []
        const data = results.data as Record<string, string>[]

        setCsvHeaders(headers)
        setCsvData(data)

        // Auto-map columns based on name similarity
        const autoMappings: CsvColumnMapping[] = headers.map((header) => {
          const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '_')
          const matchedField = CONTACT_IMPORT_FIELDS.find((f) => {
            const fieldNorm = f.key.toLowerCase()
            const labelNorm = f.label.toLowerCase().replace(/[^a-z0-9]/g, '_')
            return (
              fieldNorm === normalized ||
              labelNorm === normalized ||
              header.toLowerCase() === f.label.toLowerCase() ||
              normalized.includes(fieldNorm) ||
              fieldNorm.includes(normalized)
            )
          })
          return {
            csvColumn: header,
            targetField: matchedField?.key || null,
            sampleValues: data.slice(0, 3).map((row) => row[header] || ''),
          }
        })

        setMappings(autoMappings)
        setStep('map')
      },
      error: (err) => {
        toast.error(`Failed to parse CSV: ${err.message}`)
      },
    })
  }, [])

  // Handle drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) {
        // Simulate file input change
        const dt = new DataTransfer()
        dt.items.add(droppedFile)
        if (fileInputRef.current) {
          fileInputRef.current.files = dt.files
          handleFileSelect({ target: { files: dt.files } } as any)
        }
      }
    },
    [handleFileSelect]
  )

  // Update column mapping
  const updateMapping = useCallback((csvColumn: string, targetField: string | null) => {
    setMappings((prev) =>
      prev.map((m) => (m.csvColumn === csvColumn ? { ...m, targetField } : m))
    )
  }, [])

  // Validate mappings
  const validationErrors = useMemo(() => {
    const errs: string[] = []
    const requiredFields = CONTACT_IMPORT_FIELDS.filter((f) => f.required)
    for (const rf of requiredFields) {
      const mapped = mappings.find((m) => m.targetField === rf.key)
      if (!mapped) {
        errs.push(`Required field "${rf.label}" is not mapped`)
      }
    }
    // Check for duplicate mappings
    const targets = mappings.filter((m) => m.targetField).map((m) => m.targetField)
    const dupes = targets.filter((t, i) => targets.indexOf(t) !== i)
    if (dupes.length > 0) {
      errs.push(`Duplicate mapping: ${dupes.join(', ')}`)
    }
    return errs
  }, [mappings])

  // Preview validation
  const previewStats = useMemo(() => {
    const mapped = mappings.filter((m) => m.targetField)
    const totalRows = csvData.length
    let validRows = 0
    const rowErrors: ImportError[] = []

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i]
      let isValid = true

      for (const m of mapped) {
        const required = CONTACT_IMPORT_FIELDS.find((f) => f.key === m.targetField)?.required
        const value = row[m.csvColumn]
        if (required && (!value || !value.trim())) {
          isValid = false
          rowErrors.push({
            row: i + 2, // 1-indexed + header row
            column: m.csvColumn,
            message: `Required field "${m.targetField}" is empty`,
            value: value || '',
          })
        }
      }

      if (isValid) validRows++
    }

    return { totalRows, validRows, invalidRows: totalRows - validRows, errors: rowErrors }
  }, [csvData, mappings])

  // Run import
  const runImport = useCallback(async () => {
    setStep('importing')
    setImportProgress(0)

    const mapped = mappings.filter((m) => m.targetField)
    const importErrors: ImportError[] = []
    let created = 0
    let skipped = 0
    const batchSize = 5

    for (let i = 0; i < csvData.length; i += batchSize) {
      const batch = csvData.slice(i, i + batchSize)

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j]
        const rowIdx = i + j
        const contact: Record<string, any> = {}

        for (const m of mapped) {
          if (!m.targetField) continue
          let value: any = row[m.csvColumn]?.trim()
          if (!value) continue

          // Convert types
          if (m.targetField === 'budget_min' || m.targetField === 'budget_max') {
            value = parseFloat(value.replace(/[^0-9.-]/g, ''))
            if (isNaN(value)) continue
          }
          if (m.targetField === 'tags') {
            value = value.split(',').map((t: string) => t.trim()).filter(Boolean)
          }
          contact[m.targetField] = value
        }

        // Skip rows missing required fields
        const firstNameField = mapped.find((m) => m.targetField === 'first_name')
        const lastNameField = mapped.find((m) => m.targetField === 'last_name')
        if (!contact.first_name || !contact.last_name) {
          skipped++
          importErrors.push({
            row: rowIdx + 2,
            column: 'first_name/last_name',
            message: 'Missing required name fields',
            value: `${contact.first_name || ''} ${contact.last_name || ''}`,
          })
          continue
        }

        try {
          await contactsApi.create(contact)
          created++
        } catch (err: any) {
          skipped++
          importErrors.push({
            row: rowIdx + 2,
            column: '',
            message: err.message || 'Failed to create contact',
            value: `${contact.first_name} ${contact.last_name}`,
          })
        }
      }

      setImportProgress(Math.round(((i + batch.length) / csvData.length) * 100))
    }

    setImportResult({ created, skipped, errors: importErrors })
    setStep('complete')
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
  }, [csvData, mappings, queryClient])

  // Download sample CSV
  const downloadSample = useCallback(() => {
    const headers = CONTACT_IMPORT_FIELDS.map((f) => f.label)
    const sampleRow = ['Kofi', 'Mensah', 'kofi@email.com', '+233241234567', '', '', 'investor', 'new', 'Mensah Properties', 'Director', 'Osu Oxford Street', 'Accra', 'Greater Accra', 'GA-123-4567', 'Real Estate', '100000', '500000', 'referral', 'vip,investor', 'Met at property expo']
    const csv = [headers.join(','), sampleRow.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const mappedFieldCount = mappings.filter((m) => m.targetField).length

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        {/* Step indicator */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Contacts
          </DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            {(['upload', 'map', 'preview', 'complete'] as const).map((s, idx) => (
              <React.Fragment key={s}>
                {idx > 0 && <div className="h-px w-8 bg-border" />}
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium',
                    step === s || (step === 'importing' && s === 'preview')
                      ? 'text-primary'
                      : (['upload', 'map', 'preview'].indexOf(s) < ['upload', 'map', 'preview', 'importing', 'complete'].indexOf(step)
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/50')
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border',
                      step === s || (step === 'importing' && s === 'preview')
                        ? 'bg-primary text-primary-foreground border-primary'
                        : ['upload', 'map', 'preview'].indexOf(s) < ['upload', 'map', 'preview', 'importing', 'complete'].indexOf(step)
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'border-border text-muted-foreground'
                    )}
                  >
                    {['upload', 'map', 'preview'].indexOf(s) < ['upload', 'map', 'preview', 'importing', 'complete'].indexOf(step) ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  {s === 'upload' ? 'Upload' : s === 'map' ? 'Map Fields' : s === 'preview' ? 'Review' : 'Done'}
                </div>
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">
                  Drop your CSV file here or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum file size: 10MB. Must be a .csv file.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={downloadSample}>
                  <Download className="h-3.5 w-3.5" />
                  Download Template
                </Button>
                <span className="text-xs text-muted-foreground">
                  Download a sample CSV to see the expected format
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Map Columns */}
          {step === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Map CSV columns to contact fields
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {file?.name} — {csvData.length} rows found, {mappedFieldCount} fields mapped
                  </p>
                </div>
              </div>

              {validationErrors.length > 0 && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3">
                  {validationErrors.map((err, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {err}
                    </div>
                  ))}
                </div>
              )}

              <ScrollArea className="h-[340px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-4 w-40">CSV Column</th>
                      <th className="text-left py-2 px-4 w-52">Maps To</th>
                      <th className="text-left py-2 pl-4">Sample Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m) => (
                      <tr key={m.csvColumn} className="border-b border-border/50">
                        <td className="py-2 pr-4">
                          <span className="text-xs font-medium text-foreground">{m.csvColumn}</span>
                        </td>
                        <td className="py-2 px-4">
                          <Select
                            value={m.targetField || '_skip'}
                            onValueChange={(v) => updateMapping(m.csvColumn, v === '_skip' ? null : v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_skip" className="text-xs text-muted-foreground">
                                — Skip this column —
                              </SelectItem>
                              {CONTACT_IMPORT_FIELDS.map((f) => (
                                <SelectItem key={f.key} value={f.key} className="text-xs">
                                  {f.label} {f.required && <span className="text-destructive">*</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pl-4">
                          <div className="flex items-center gap-1.5">
                            {m.sampleValues.filter(Boolean).slice(0, 3).map((v, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] font-normal max-w-[100px] truncate">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {/* STEP 3: Preview/Review */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{previewStats.totalRows}</p>
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                </div>
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{previewStats.validRows}</p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{previewStats.invalidRows}</p>
                  <p className="text-xs text-muted-foreground">Invalid</p>
                </div>
              </div>

              {previewStats.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Validation Issues</h4>
                  <ScrollArea className="h-40 border border-border rounded-md">
                    <div className="p-2 space-y-1">
                      {previewStats.errors.slice(0, 50).map((err, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                          <span>Row {err.row}: {err.message}</span>
                        </div>
                      ))}
                      {previewStats.errors.length > 50 && (
                        <p className="text-xs text-muted-foreground italic">
                          ...and {previewStats.errors.length - 50} more
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-500" />
                {mappedFieldCount} fields mapped. {previewStats.validRows} contacts will be created.
              </div>
            </div>
          )}

          {/* STEP 3.5: Importing progress */}
          {step === 'importing' && (
            <div className="space-y-6 py-8">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
                <p className="text-sm font-medium text-foreground">Importing contacts...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Please don&apos;t close this window
                </p>
              </div>
              <Progress value={importProgress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">{importProgress}%</p>
            </div>
          )}

          {/* STEP 4: Complete */}
          {step === 'complete' && importResult && (
            <div className="space-y-4 py-4">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-lg font-semibold text-foreground">Import Complete</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.created}</p>
                  <p className="text-xs text-muted-foreground">Created</p>
                </div>
                <div className="bg-muted border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{importResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Errors</h4>
                  <ScrollArea className="h-32 border border-border rounded-md">
                    <div className="p-2 space-y-1">
                      {importResult.errors.map((err, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                          Row {err.row}: {err.message} ({err.value})
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <DialogFooter className="flex items-center justify-between sm:justify-between pt-4 border-t border-border">
          <div>
            {step !== 'upload' && step !== 'importing' && step !== 'complete' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setStep(step === 'map' ? 'upload' : step === 'preview' ? 'map' : 'upload')
                }
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'upload' && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            {step === 'map' && (
              <Button
                onClick={() => setStep('preview')}
                disabled={validationErrors.length > 0 || mappedFieldCount === 0}
              >
                Review
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 'preview' && (
              <Button onClick={runImport} disabled={previewStats.validRows === 0}>
                Import {previewStats.validRows} contacts
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 'complete' && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Import More
                </Button>
                <Button onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
