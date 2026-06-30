'use client'

import { useEffect, useState, useCallback } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { valuationsApi } from '@/lib/valuation-api'
import {
  Upload, Trash2, Image as ImageIcon, FileText, MapPin, Loader2, RefreshCw,
  Download, FileType, CheckCircle2, FolderOpen, Search,
} from 'lucide-react'

interface DocRow {
  id: string
  doc_type: 'photo' | 'title_document' | 'location_map'
  filename: string | null
  caption: string | null
  mime_type: string | null
  url?: string | null
}
interface ReportRow { id: string; status?: string; created_at?: string; version?: number }
interface ValItem { id: string; address: string; status?: string; digital?: string }

const REPORT_FINAL = ['approved', 'completed']
const isReportFinalized = (s?: string) => REPORT_FINAL.includes(String(s || ''))
// A superseded version is a prior sealed copy — still downloadable for the audit trail.
const SEALED = ['approved', 'completed', 'superseded']
const isSealed = (s?: string) => SEALED.includes(String(s || ''))
const statusBadge = (s?: string): { label: string; cls: string } => {
  const v = String(s || 'draft')
  if (v === 'approved' || v === 'completed') return { label: 'Current', cls: 'bg-green-500/10 border-green-500/40 text-green-600 dark:text-green-300' }
  if (v === 'superseded') return { label: 'Superseded', cls: 'bg-zinc-500/10 border-zinc-500/40 text-zinc-500 dark:text-zinc-400' }
  return { label: 'Draft', cls: 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-300' }
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })

export default function CentralDocumentsPage() {
  const [vals, setVals] = useState<ValItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loadingVals, setLoadingVals] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dlBusy, setDlBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await valuationsApi.getAll({ limit: 200 })
        const list: ValItem[] = (res.data || []).map((v: any) => ({
          id: v.id,
          address: v.property?.address || v.property?.address_street || v.address || v.property_address || 'Untitled property',
          status: v.status,
          digital: v.property?.digital_address || v.digital_address || v.gps_address || '',
        }))
        setVals(list)
        if (list.length) setSelectedId(list[0].id)
      } catch (e: any) {
        setError(e?.message || 'Failed to load valuations')
      } finally {
        setLoadingVals(false)
      }
    })()
  }, [])

  const loadDocs = useCallback(async (valuationId: string) => {
    setLoadingDocs(true)
    setError(null)
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
      } else setReports([])
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents')
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => { if (selectedId) loadDocs(selectedId) }, [selectedId, loadDocs])

  const upload = async (files: FileList | null, docType: 'photo' | 'title_document') => {
    if (!files || files.length === 0 || !selectedId) return
    setBusy(docType)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file)
        const res = await authedFetch(`/api/valuations/${selectedId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, filename: file.name, docType, caption: file.name.replace(/\.[^.]+$/, '') }),
        })
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      }
      await loadDocs(selectedId)
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    if (!selectedId) return
    setBusy(id)
    try {
      await authedFetch(`/api/valuations/${selectedId}/documents/${id}`, { method: 'DELETE' })
      await loadDocs(selectedId)
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const generateMap = async () => {
    if (!selectedId) return
    setBusy('map')
    setError(null)
    try {
      const res = await authedFetch(`/api/valuations/${selectedId}/documents/location-map`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message || `Map generation failed (${res.status})`)
      }
      await loadDocs(selectedId)
    } catch (e: any) {
      setError(e?.message || 'Map generation failed')
    } finally {
      setBusy(null)
    }
  }

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

  const photos = docs.filter((d) => d.doc_type === 'photo')
  const titleDocs = docs.filter((d) => d.doc_type === 'title_document')
  const map = docs.find((d) => d.doc_type === 'location_map')
  const selected = vals.find((v) => v.id === selectedId)
  const filteredVals = vals.filter(
    (v) => !q || v.address.toLowerCase().includes(q.toLowerCase()) || (v.digital || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <FolderOpen className="w-5 h-5 text-amber-500" />
        <div>
          <h1 className="font-mono text-lg text-foreground">DOCUMENT VAULT</h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Finalized reports, subject photos &amp; title documents across all valuations — view, download, upload &amp; replace
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-red-500/40 bg-red-500/5 px-3 py-2 font-mono text-[11px] text-red-600 dark:text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Valuation picker */}
        <div className="border border-border bg-card">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 border border-border bg-background">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search valuations…"
                className="bg-transparent font-mono text-[11px] text-foreground placeholder-muted-foreground focus:outline-none w-full"
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loadingVals ? (
              <div className="flex items-center gap-2 p-3 text-muted-foreground font-mono text-[11px]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : filteredVals.length === 0 ? (
              <p className="p-3 font-mono text-[11px] text-muted-foreground">No valuations found.</p>
            ) : (
              filteredVals.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`w-full text-left px-3 py-2 border-b border-border/60 transition-colors ${selectedId === v.id ? 'bg-amber-500/10' : 'hover:bg-muted/50'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-foreground truncate flex-1">{v.address}</span>
                    {isReportFinalized(v.status) && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground">{(v.status || '').toUpperCase()}{v.digital ? ` · ${v.digital}` : ''}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Selected valuation's documents */}
        <div className="space-y-4">
          {!selected ? (
            <div className="border border-border bg-card p-6 font-mono text-[11px] text-muted-foreground">Select a valuation to view its documents.</div>
          ) : loadingDocs ? (
            <div className="flex items-center gap-2 p-3 text-muted-foreground font-mono text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading documents…</div>
          ) : (
            <>
              <div className="font-mono text-xs text-muted-foreground">{selected.address}</div>

              {/* Reports & Deliverables */}
              <section className="border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-amber-500" />
                  <span className="font-mono text-sm text-amber-600 dark:text-amber-300">REPORTS &amp; DELIVERABLES</span>
                </div>
                {reports.length === 0 ? (
                  <p className="font-mono text-[11px] text-muted-foreground">No report generated yet.</p>
                ) : (
                  <div className="space-y-2">
                    {[...reports].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0)).map((r) => {
                      const sealed = isSealed(r.status)
                      const badge = statusBadge(r.status)
                      return (
                        <div key={r.id} className="flex items-center gap-3 border border-border px-3 py-2">
                          {sealed ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[11px] text-foreground truncate">Valuation Report <span className="text-muted-foreground">v{r.version || 1}</span></div>
                            <div className="font-mono text-[9px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <span className={`px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                              {r.created_at ? <span>{new Date(r.created_at).toLocaleDateString()}</span> : null}
                            </div>
                          </div>
                          <button
                            onClick={() => downloadReport(r.id, 'pdf')}
                            disabled={!sealed || dlBusy === `${r.id}:pdf`}
                            title={sealed ? 'Download sealed PDF' : 'Available once sealed'}
                            className={`flex items-center gap-1.5 px-2.5 py-1 border font-mono text-[10px] uppercase tracking-wider ${sealed ? 'border-green-500/40 text-green-600 dark:text-green-300 hover:bg-green-500/10' : 'border-border text-muted-foreground/40 cursor-not-allowed'}`}
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
                    {map ? 'Regenerate' : 'Generate'}
                  </button>
                </div>
                {map?.url ? (
                  <img src={map.url} alt="Location map" className="max-h-72 border border-border" />
                ) : (
                  <p className="font-mono text-[11px] text-muted-foreground">Auto-generated from the subject's GPS coordinates.</p>
                )}
              </section>

              {/* Subject Photos */}
              <section className="border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ImageIcon className="w-4 h-4 text-amber-500" />
                  <span className="font-mono text-sm text-amber-600 dark:text-amber-300">SUBJECT PROPERTY PHOTOS — Appendix D</span>
                  <label className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 font-mono text-[10px] uppercase tracking-wider cursor-pointer">
                    {busy === 'photo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload photos
                    <input type="file" accept="image/*" multiple className="hidden" disabled={busy === 'photo'}
                      onChange={(e) => { upload(e.target.files, 'photo'); e.currentTarget.value = '' }} />
                  </label>
                </div>
                {photos.length === 0 ? (
                  <p className="font-mono text-[11px] text-muted-foreground">No photos yet.</p>
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
                  <p className="font-mono text-[11px] text-muted-foreground">No title documents yet.</p>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
