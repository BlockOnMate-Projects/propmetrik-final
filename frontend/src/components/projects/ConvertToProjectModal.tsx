'use client'

import React, { useState } from 'react'
import {
  X,
  Rocket,
  Calendar,
  MapPin,
  Building2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════
//  T Y P E S
// ═══════════════════════════════════════════════════════════════════

interface EstimateSummary {
  id: string
  name: string
  project_type: string
  region: string
  gfa_sqm: number
  floors: number
  spec_tier: string
  currency: string
  total_cost: number
  cost_per_sqm: number
}

interface ConvertToProjectModalProps {
  estimate: EstimateSummary
  onClose: () => void
  onSuccess: (projectId: string, projectName: string) => void
  onConvert: (estimateId: string, payload: ConvertPayload) => Promise<ConvertResult>
}

export interface ConvertPayload {
  startDate?: string
  endDate?: string
  landTenure?: string
  city?: string
  addressLine1?: string
  ghanaPostGps?: string
  description?: string
}

export interface ConvertResult {
  success: boolean
  project?: {
    id: string
    name: string
    project_number: string
    project_type: string
    status: string
    total_budget: number
    planned_start_date: string
    planned_completion_date: string
  }
  error?: string
  projectId?: string // already-converted case
}

// ═══════════════════════════════════════════════════════════════════
//  C O N S T A N T S
// ═══════════════════════════════════════════════════════════════════

const PROJECT_TYPE_LABELS: Record<string, string> = {
  residential_single: 'Residential (Single Family)',
  residential_multi: 'Residential (Multi-Unit)',
  commercial_office: 'Commercial Office',
  retail: 'Retail',
  mixed_use: 'Mixed-Use',
  industrial: 'Industrial',
}

const REGION_LABELS: Record<string, string> = {
  greater_accra: 'Greater Accra',
  kumasi_metro: 'Kumasi Metro',
  ashanti: 'Ashanti',
  western: 'Western',
  central: 'Central',
  eastern: 'Eastern',
  volta: 'Volta',
  northern: 'Northern',
  upper_east: 'Upper East',
  upper_west: 'Upper West',
  bono: 'Bono',
  bono_east: 'Bono East',
  ahafo: 'Ahafo',
  savannah: 'Savannah',
  north_east: 'North East',
  oti: 'Oti',
  western_north: 'Western North',
}

const TIER_LABELS: Record<string, string> = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
}

const LAND_TENURE_OPTIONS = [
  { value: 'leasehold', label: 'Leasehold' },
  { value: 'freehold', label: 'Freehold' },
  { value: 'government_lease', label: 'Government Lease' },
  { value: 'stool_land_lease', label: 'Stool Land Lease' },
  { value: 'family_land', label: 'Family Land' },
  { value: 'government_allocation', label: 'Government Allocation' },
]

function fmtCurrency(amount: number, ccy: string = 'GHS'): string {
  const symbols: Record<string, string> = { GHS: 'GH₵', USD: '$', GBP: '£', EUR: '€' }
  const sym = symbols[ccy] || ccy
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ═══════════════════════════════════════════════════════════════════
//  M O D A L   C O M P O N E N T
// ═══════════════════════════════════════════════════════════════════

export function ConvertToProjectModal({ estimate, onClose, onSuccess, onConvert }: ConvertToProjectModalProps) {
  // Form state — only fields the user needs to provide
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [landTenure, setLandTenure] = useState('leasehold')
  const [city, setCity] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [ghanaPostGps, setGhanaPostGps] = useState('')
  const [description, setDescription] = useState('')

  // Status
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConvertResult | null>(null)

  const handleConvert = async () => {
    setConverting(true)
    setError(null)
    try {
      const res = await onConvert(estimate.id, {
        startDate: startDate || undefined,
        landTenure,
        city: city || undefined,
        addressLine1: addressLine1 || undefined,
        ghanaPostGps: ghanaPostGps || undefined,
        description: description || undefined,
      })
      if (res.success && res.project) {
        setResult(res)
      } else {
        setError(res.error || 'Conversion failed')
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setConverting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: '#0D1117',
    border: '1px solid #30363D',
    color: '#C9D1D9',
    fontSize: 13,
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#484F58',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    marginBottom: 6,
    display: 'block',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#161B22', border: '1px solid #30363D',
          width: 560, maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ──── HEADER ──── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid #21262D',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#C9A84C22', border: '1px solid #C9A84C44',
            }}>
              <Rocket size={18} style={{ color: '#C9A84C' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#C9D1D9', margin: 0, fontFamily: '"DM Serif Display", serif' }}>
                Convert to Project
              </h2>
              <p style={{ fontSize: 10, color: '#484F58', margin: 0, marginTop: 2 }}>
                Create a development project from this estimate
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', color: '#484F58', cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ──── SUCCESS STATE ──── */}
        {result?.success && result.project ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
              background: '#3FB95022', border: '2px solid #3FB950',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle2 size={32} style={{ color: '#3FB950' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#C9D1D9', marginBottom: 8 }}>
              Project Created!
            </h3>
            <p style={{ fontSize: 12, color: '#8B949E', marginBottom: 4 }}>
              {result.project.name}
            </p>
            <p style={{
              fontSize: 13, color: '#C9A84C', fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace', marginBottom: 24,
            }}>
              {result.project.project_number}
            </p>

            {/* Quick Stats */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              marginBottom: 24, textAlign: 'left',
            }}>
              <div style={{ background: '#0D1117', border: '1px solid #21262D', padding: 12 }}>
                <div style={{ fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: '"JetBrains Mono", monospace' }}>
                  Budget
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#C9A84C', fontFamily: '"JetBrains Mono", monospace', marginTop: 4 }}>
                  {fmtCurrency(result.project.total_budget, estimate.currency)}
                </div>
              </div>
              <div style={{ background: '#0D1117', border: '1px solid #21262D', padding: 12 }}>
                <div style={{ fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: '"JetBrains Mono", monospace' }}>
                  Status
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3FB950', fontFamily: '"JetBrains Mono", monospace', marginTop: 4, textTransform: 'uppercase' }}>
                  {result.project.status}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => {
                  onSuccess(result.project!.id, result.project!.name)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px', background: '#C9A84C', color: '#0D1117',
                  border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                <ExternalLink size={14} />
                VIEW PROJECT
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 24px', background: '#21262D', color: '#C9D1D9',
                  border: '1px solid #30363D', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                DONE
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ──── ESTIMATE SUMMARY ──── */}
            <div style={{ padding: '16px 24px', background: '#0D111766', borderBottom: '1px solid #21262D' }}>
              <div style={{ fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: '"JetBrains Mono", monospace', marginBottom: 10, fontWeight: 600 }}>
                Pre-filled from Estimate
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={12} style={{ color: '#484F58' }} />
                  <span style={{ fontSize: 11, color: '#8B949E' }}>
                    {PROJECT_TYPE_LABELS[estimate.project_type] || estimate.project_type}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={12} style={{ color: '#484F58' }} />
                  <span style={{ fontSize: 11, color: '#8B949E' }}>
                    {REGION_LABELS[estimate.region] || estimate.region}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#8B949E' }}>
                  <span style={{ color: '#484F58' }}>GFA:</span> {Number(estimate.gfa_sqm).toLocaleString()} sqm · {estimate.floors} {estimate.floors === 1 ? 'floor' : 'floors'}
                </div>
                <div style={{ fontSize: 11, color: '#8B949E' }}>
                  <span style={{ color: '#484F58' }}>Tier:</span> {TIER_LABELS[estimate.spec_tier] || estimate.spec_tier}
                </div>
              </div>
              <div style={{
                marginTop: 10, fontSize: 16, fontWeight: 700, color: '#C9A84C',
                fontFamily: '"JetBrains Mono", monospace',
              }}>
                {fmtCurrency(Number(estimate.total_cost), estimate.currency)}
                <span style={{ fontSize: 10, color: '#484F58', fontWeight: 400, marginLeft: 8 }}>
                  @ {fmtCurrency(Number(estimate.cost_per_sqm), estimate.currency)}/sqm
                </span>
              </div>
            </div>

            {/* ──── FORM FIELDS ──── */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Start Date (required) */}
              <div>
                <label style={labelStyle}>
                  <Calendar size={10} style={{ display: 'inline', marginRight: 4 }} />
                  Planned Start Date *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Land Tenure */}
              <div>
                <label style={labelStyle}>Land Tenure Type</label>
                <select
                  value={landTenure}
                  onChange={e => setLandTenure(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {LAND_TENURE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Location Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>City / Locality</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="e.g. East Legon"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Ghana Post GPS</label>
                  <input
                    type="text"
                    value={ghanaPostGps}
                    onChange={e => setGhanaPostGps(e.target.value)}
                    placeholder="e.g. GA-123-4567"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label style={labelStyle}>Street Address</label>
                <input
                  type="text"
                  value={addressLine1}
                  onChange={e => setAddressLine1(e.target.value)}
                  placeholder="Optional street address"
                  style={inputStyle}
                />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Project Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of the project..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' as const }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', background: '#F8514922', border: '1px solid #F8514944',
                }}>
                  <AlertTriangle size={14} style={{ color: '#F85149' }} />
                  <span style={{ fontSize: 12, color: '#F85149' }}>{error}</span>
                </div>
              )}
            </div>

            {/* ──── ACTIONS ──── */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 12,
              padding: '16px 24px', borderTop: '1px solid #21262D',
            }}>
              <button
                onClick={onClose}
                disabled={converting}
                style={{
                  padding: '10px 20px', background: '#21262D', color: '#C9D1D9',
                  border: '1px solid #30363D', fontWeight: 600, fontSize: 12,
                  cursor: converting ? 'not-allowed' : 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleConvert}
                disabled={converting || !startDate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px',
                  background: converting ? '#21262D' : '#C9A84C',
                  color: converting ? '#484F58' : '#0D1117',
                  border: 'none', fontWeight: 700, fontSize: 12,
                  cursor: converting || !startDate ? 'not-allowed' : 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                  transition: 'all 0.15s',
                }}
              >
                {converting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    CONVERTING...
                  </>
                ) : (
                  <>
                    <Rocket size={14} />
                    CREATE PROJECT
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
