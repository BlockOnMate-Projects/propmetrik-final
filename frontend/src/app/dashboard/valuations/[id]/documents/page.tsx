'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authedFetch } from '@/lib/authed-fetch'
import {
  ArrowLeft, ArrowRight, Upload, Trash2, Image as ImageIcon, FileText, MapPin, Loader2, RefreshCw,
  Download, FileType, CheckCircle2,
} from 'lucide-react'

interface DocRow {
  id: string
  doc_type: 'photo' | 'title_document' | 'location_map'
  filename: string | null
  caption: string | null
  mime_type: string | null
  url?: string | null
}

interface ReportRow {
  id: string
  status?: string
  created_at?: string
  template?: string | null
}

const REPORT_FINAL = ['approved', 'completed']
const isReportFinalized = (s?: string) => REPORT_FINAL.includes(String(s || ''))

export default function DocumentsPhotosPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [docs, setDocs] = useState<DocRow[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [dlBusy, setDlBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [docRes, repRes] = await Promise.all([
        authedFetch(`/api/valuations/${valuationId}/documents`),
        authedFetch(`/api/reports/valuation/${valuationId}`).catch(() => null),
      ])
      const j = await docRes.json()
      setDocs(j.data || [])
      if (repRes && repRes.ok) {
        const rj = await repRes.json()
        setReports(rj.reports || [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [valuationId])

  const downloadReport = async (reportId: string, kind: 'pdf' | 'docx') => {
    setDlBusy(`${reportId}:${kind}`)
    setError(null)
    try {
      const path = kind === 'pdf' ? `/api/reports/${reportId}/download/pdf` : `/api/reports/${reportId}/download`
      const res = await authedFetch(path)
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.download_url) throw new Error(j.message || j.error || 'Download unavailable')
      const a = document.createElement('a')
      a.href = j.download_url
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e: any) {
      setError(e?.message || 'Download failed')
    } finally {
      setDlBusy(null)
    }
  }

  useEffect(() => { load() }, [load])

  const upload = async (files: FileList | null, docType: 'photo' | 'title_document') => {
    if (!files || files.length === 0) return
    setBusy(docType)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        // Stream the file as multipart/form-data — NOT base64-in-JSON. Base64 inflates a file
        // ~33% and a scanned title deed then blows the backend's 10MB JSON body limit (→ 500).
        // Multipart avoids both. Let the browser set the multipart Content-Type + boundary.
        const form = new FormData()
        form.append('file', file, file.name)
        form.append('docType', docType)
        form.append('filename', file.name)
        form.append('caption', file.name.replace(/\.[^.]+$/, ''))
        const res = await authedFetch(`/api/valuations/${valuationId}/documents`, {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          let msg = `Upload failed (${res.status})`
          try { const j = await res.json(); if (j?.message) msg = j.message } catch { /* non-JSON */ }
          throw new Error(msg)
        }
      }
      await load()
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    setBusy(id)
    try {
      await authedFetch(`/api/valuations/${valuationId}/documents/${id}`, { method: 'DELETE' })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const generateMap = async () => {
    setBusy('map')
    setError(null)
    try {
      const res = await authedFetch(`/api/valuations/${valuationId}/documents/location-map`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message || `Map generation failed (${res.status})`)
      }
      await load()
    } catch (e: any) {
      setError(e?.message || 'Map generation failed')
    } finally {
      setBusy(null)
    }
  }

  const photos = docs.filter((d) => d.doc_type === 'photo')
  const titleDocs = docs.filter((d) => d.doc_type === 'title_document')
  const map = docs.find((d) => d.doc_type === 'location_map')

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-28 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push(`/dashboard/valuations/${valuationId}/subject`)}
          className="p-2 hover:bg-muted transition-colors"
          title="Back to Subject Property"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div>
          <h1 className="font-mono text-xl text-foreground">DOCUMENTS &amp; STORAGE</h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Finalized reports, subject pictures (Appendix D), title documents (Appendix E) &amp; the location map (Appendix C)
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-red-500/40 bg-red-500/5 px-3 py-2 font-mono text-[11px] text-red-600 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Reports & Deliverables */}
          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-amber-500" />
              <span className="font-mono text-sm text-amber-600 dark:text-amber-300">REPORTS &amp; DELIVERABLES</span>
            </div>
            {reports.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">No report generated yet. Build and seal the report from the Report step.</p>
            ) : (
              <div className="space-y-2">
                {reports.map((r) => {
                  const finalized = isReportFinalized(r.status)
                  return (
                    <div key={r.id} className="flex items-center gap-3 border border-border px-3 py-2">
                      {finalized ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[11px] text-foreground truncate">Valuation Report</div>
                        <div className="font-mono text-[9px] text-muted-foreground">
                          {finalized ? 'Finalized — sealed/signed' : (r.status || 'draft')}{r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadReport(r.id, 'pdf')}
                        disabled={!finalized || dlBusy === `${r.id}:pdf`}
                        title={finalized ? 'Download signed PDF' : 'Available once the report is finalized'}
                        className={`flex items-center gap-1.5 px-2.5 py-1 border font-mono text-[10px] uppercase tracking-wider ${finalized ? 'border-green-500/40 text-green-600 dark:text-green-300 hover:bg-green-500/10' : 'border-border text-muted-foreground/40 cursor-not-allowed'}`}
                      >
                        {dlBusy === `${r.id}:pdf` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
                      </button>
                      <button
                        onClick={() => downloadReport(r.id, 'docx')}
                        disabled={dlBusy === `${r.id}:docx`}
                        title="Download editable DOCX"
                        className="flex items-center gap-1.5 px-2.5 py-1 border border-border text-muted-foreground hover:bg-muted font-mono text-[10px] uppercase tracking-wider"
                      >
                        {dlBusy === `${r.id}:docx` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileType className="h-3.5 w-3.5" />} DOCX
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Location / Satellite Map */}
          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-amber-500" />
              <span className="font-mono text-sm text-amber-600 dark:text-amber-300">SATELLITE / LOCATION MAP — Appendix C</span>
              <button
                onClick={generateMap}
                disabled={busy === 'map'}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 font-mono text-[10px] uppercase tracking-wider disabled:opacity-50"
              >
                {busy === 'map' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {map ? 'Regenerate' : 'Generate'} from coordinates
              </button>
            </div>
            {map?.url ? (
              <img src={map.url} alt="Location map" className="max-h-72 border border-border" />
            ) : (
              <p className="font-mono text-[11px] text-muted-foreground">Auto-generated from the subject's GPS coordinates. Click Generate (also auto-created when the report is built).</p>
            )}
          </section>

          {/* Subject Photos */}
          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon className="w-4 h-4 text-amber-500" />
              <span className="font-mono text-sm text-amber-600 dark:text-amber-300">SUBJECT PROPERTY PHOTOS — Appendix D</span>
              <label className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 font-mono text-[10px] uppercase tracking-wider cursor-pointer disabled:opacity-50">
                {busy === 'photo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload photos
                <input type="file" accept="image/*" multiple className="hidden" disabled={busy === 'photo'}
                  onChange={(e) => { upload(e.target.files, 'photo'); e.currentTarget.value = '' }} />
              </label>
            </div>
            {photos.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">No photos yet. Upload elevation, interior and surrounding shots — they appear as captioned plates in Appendix D.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {photos.map((p) => (
                  <div key={p.id} className="relative group border border-border">
                    {p.url && <img src={p.url} alt={p.caption || ''} className="w-full h-32 object-cover" />}
                    <div className="px-2 py-1 font-mono text-[9px] text-muted-foreground truncate">{p.caption || p.filename}</div>
                    <button onClick={() => remove(p.id)} disabled={busy === p.id}
                      className="absolute top-1 right-1 p-1 bg-black/60 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Title Documents */}
          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-amber-500" />
              <span className="font-mono text-sm text-amber-600 dark:text-amber-300">TITLE DOCUMENTS / INDENTURE — Appendix E</span>
              <label className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 font-mono text-[10px] uppercase tracking-wider cursor-pointer">
                {busy === 'title_document' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload documents
                <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={busy === 'title_document'}
                  onChange={(e) => { upload(e.target.files, 'title_document'); e.currentTarget.value = '' }} />
              </label>
            </div>
            {titleDocs.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">No title documents yet. Upload indenture / title scans (images embed directly into Appendix E).</p>
            ) : (
              <div className="space-y-2">
                {titleDocs.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 border border-border px-3 py-2">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-mono text-[11px] text-foreground truncate flex-1">{t.caption || t.filename}</span>
                    {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-amber-500 hover:underline">view</a>}
                    <button onClick={() => remove(t.id)} disabled={busy === t.id} className="text-red-500 hover:text-red-400">
                      {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push(`/dashboard/valuations/${valuationId}/subject`)}
          className="flex items-center gap-2 px-4 py-2 border border-border font-mono text-xs hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> BACK TO SUBJECT
        </button>
        <button
          onClick={() => router.push(`/dashboard/valuations/${valuationId}/property`)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
        >
          CONTINUE TO PROPERTY SETUP <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
