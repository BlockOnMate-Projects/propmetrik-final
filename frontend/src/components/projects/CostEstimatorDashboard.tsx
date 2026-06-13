'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import {
  Calculator,
  Plus,
  Building2,
  MapPin,
  Calendar,
  TrendingUp,
  Trash2,
  Eye,
  Search,
  BarChart3,
  Loader2,
  Archive,
  ArrowUpDown,
  ChevronDown,
  AlertTriangle,
  Layers,
  Pencil,
  Download,
  Rocket,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════
//  T Y P E S
// ═══════════════════════════════════════════════════════════════════

interface EstimateRow {
  id: string
  name: string
  project_type: string
  region: string
  gfa_sqm: number
  floors: number
  spec_tier: string
  currency: string
  total_cost: number
  hard_cost: number
  soft_cost: number
  contingency: number
  cost_per_sqm: number
  status: string
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface DashboardStats {
  total_estimates: string
  total_value: string
  avg_cost: string
  avg_cost_per_sqm: string
  avg_gfa: string
}

interface CostEstimatorDashboardProps {
  onNewEstimate: () => void
  onViewEstimate?: (id: string) => void
  onEditEstimate?: (id: string) => void
  onDownloadReport?: (id: string) => void
  onConvertToProject?: (estimate: EstimateRow) => void
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

const TIER_COLORS: Record<string, string> = {
  basic: '#6B7280',
  standard: '#3B82F6',
  premium: '#C9A84C',
  luxury: '#A855F7',
}

const TYPE_ICONS: Record<string, string> = {
  residential_single: '🏠',
  residential_multi: '🏢',
  commercial_office: '🏛️',
  retail: '🏪',
  mixed_use: '🏗️',
  industrial: '🏭',
}

// ═══════════════════════════════════════════════════════════════════
//  H E L P E R S
// ═══════════════════════════════════════════════════════════════════

function fmtCurrency(amount: number, ccy: string = 'GHS'): string {
  const symbols: Record<string, string> = { GHS: 'GH₵', USD: '$', GBP: '£', EUR: '€' }
  const sym = symbols[ccy] || ccy
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ═══════════════════════════════════════════════════════════════════
//  D A S H B O A R D   C O M P O N E N T
// ═══════════════════════════════════════════════════════════════════

export function CostEstimatorDashboard({ onNewEstimate, onViewEstimate, onEditEstimate, onDownloadReport, onConvertToProject }: CostEstimatorDashboardProps) {
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchEstimates = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await authedFetch(
        `/api/projects/cost-estimates?status=active&sort=${sortField}&order=${sortOrder}`
      )
      if (!res.ok) throw new Error('Failed to load estimates')
      const data = await res.json()
      if (data.success) {
        setEstimates(data.estimates || [])
        setStats(data.stats || null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load estimates')
    } finally {
      setLoading(false)
    }
  }, [sortField, sortOrder])

  useEffect(() => {
    fetchEstimates()
  }, [fetchEstimates])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this estimate? This action cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await authedFetch(`/api/projects/cost-estimates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setEstimates(prev => prev.filter(e => e.id !== id))
      }
    } finally {
      setDeletingId(null)
    }
  }

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC')
    } else {
      setSortField(field)
      setSortOrder('DESC')
    }
  }

  // Filtered estimates
  const filtered = searchQuery
    ? estimates.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (PROJECT_TYPE_LABELS[e.project_type] || e.project_type).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (REGION_LABELS[e.region] || e.region).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : estimates

  // Distribution by project type
  const typeDistribution = estimates.reduce((acc, e) => {
    acc[e.project_type] = (acc[e.project_type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Distribution by region
  const regionDistribution = estimates.reduce((acc, e) => {
    acc[e.region] = (acc[e.region] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalValue = parseFloat(stats?.total_value || '0')
  const avgCost = parseFloat(stats?.avg_cost || '0')
  const avgCostPerSqm = parseFloat(stats?.avg_cost_per_sqm || '0')
  const totalEstimates = parseInt(stats?.total_estimates || '0')

  return (
    <div style={{ background: '#0D1117', color: '#C9D1D9', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* ════════════ HEADER ════════════ */}
      <div style={{ borderBottom: '1px solid #21262D', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 28, color: '#C9A84C', margin: 0, letterSpacing: '-0.02em' }}>
            Cost Estimator
          </h1>
          <p style={{ fontSize: 12, color: '#484F58', marginTop: 4 }}>
            Historical project estimates &amp; cost intelligence dashboard
          </p>
        </div>
        <button
          onClick={onNewEstimate}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 24px', background: '#C9A84C', color: '#0D1117',
            border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.02em',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#D4B85C')}
          onMouseOut={e => (e.currentTarget.style.background = '#C9A84C')}
        >
          <Plus size={16} strokeWidth={2.5} />
          NEW ESTIMATE
        </button>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* ════════════ KPI CARDS ════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {/* Total Estimates */}
          <div style={{ background: '#161B22', border: '1px solid #21262D', padding: '20px 24px' }}>
            <div style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: '"JetBrains Mono", monospace' }}>
              Total Estimates
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#C9D1D9', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.02em' }}>
              {loading ? '—' : totalEstimates}
            </div>
            <div style={{ fontSize: 10, color: '#484F58', marginTop: 4 }}>
              <Calculator size={10} style={{ display: 'inline', marginRight: 4 }} />
              saved estimates
            </div>
          </div>

          {/* Total Value */}
          <div style={{ background: '#161B22', border: '1px solid #21262D', padding: '20px 24px' }}>
            <div style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: '"JetBrains Mono", monospace' }}>
              Total Est. Value
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#C9A84C', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.02em' }}>
              {loading ? '—' : `GH₵${fmtCompact(totalValue)}`}
            </div>
            <div style={{ fontSize: 10, color: '#484F58', marginTop: 4 }}>
              <TrendingUp size={10} style={{ display: 'inline', marginRight: 4 }} />
              combined project cost
            </div>
          </div>

          {/* Avg Cost */}
          <div style={{ background: '#161B22', border: '1px solid #21262D', padding: '20px 24px' }}>
            <div style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: '"JetBrains Mono", monospace' }}>
              Avg. Estimate
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#C9D1D9', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.02em' }}>
              {loading ? '—' : fmtCurrency(avgCost)}
            </div>
            <div style={{ fontSize: 10, color: '#484F58', marginTop: 4 }}>
              <BarChart3 size={10} style={{ display: 'inline', marginRight: 4 }} />
              average project cost
            </div>
          </div>

          {/* Avg Cost/sqm */}
          <div style={{ background: '#161B22', border: '1px solid #21262D', padding: '20px 24px' }}>
            <div style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: '"JetBrains Mono", monospace' }}>
              Avg. Cost / sqm
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#3FB950', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.02em' }}>
              {loading ? '—' : fmtCurrency(avgCostPerSqm)}
            </div>
            <div style={{ fontSize: 10, color: '#484F58', marginTop: 4 }}>
              <Layers size={10} style={{ display: 'inline', marginRight: 4 }} />
              per square metre
            </div>
          </div>
        </div>

        {/* ════════════ SEARCH & SORT BAR ════════════ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#484F58' }} />
              <input
                type="text"
                placeholder="Search estimates..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                  padding: '8px 12px 8px 32px', fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 12, outline: 'none', width: 280,
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: '#484F58', fontFamily: '"JetBrains Mono", monospace' }}>
              {filtered.length} {filtered.length === 1 ? 'estimate' : 'estimates'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* Sort buttons */}
            {[
              { field: 'created_at', label: 'Date' },
              { field: 'total_cost', label: 'Cost' },
              { field: 'gfa_sqm', label: 'GFA' },
              { field: 'name', label: 'Name' },
            ].map(s => (
              <button
                key={s.field}
                onClick={() => toggleSort(s.field)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', background: sortField === s.field ? '#21262D' : 'transparent',
                  border: `1px solid ${sortField === s.field ? '#30363D' : '#21262D'}`,
                  color: sortField === s.field ? '#C9A84C' : '#484F58',
                  fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
              >
                {s.label}
                {sortField === s.field && (
                  <ArrowUpDown size={10} style={{ transform: sortOrder === 'ASC' ? 'scaleY(-1)' : 'none' }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════ ESTIMATES TABLE ════════════ */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 12 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#C9A84C' }} />
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#484F58' }}>
              Loading estimates...
            </span>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 12 }}>
            <AlertTriangle size={24} style={{ color: '#F85149' }} />
            <span style={{ fontSize: 13, color: '#F85149' }}>{error}</span>
            <button
              onClick={fetchEstimates}
              style={{ padding: '6px 16px', background: '#21262D', border: '1px solid #30363D', color: '#C9D1D9', fontSize: 11, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          /* ──── Empty State ──── */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '80px 40px', border: '1px dashed #21262D', marginTop: 16,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', background: '#161B22',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              border: '1px solid #21262D',
            }}>
              <Calculator size={32} style={{ color: '#30363D' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#C9D1D9', marginBottom: 8 }}>
              {searchQuery ? 'No matching estimates' : 'No estimates yet'}
            </h3>
            <p style={{ fontSize: 12, color: '#484F58', maxWidth: 400, textAlign: 'center', lineHeight: 1.6, marginBottom: 24 }}>
              {searchQuery
                ? `No estimates match "${searchQuery}". Try a different search term.`
                : 'Create your first cost estimate to start building your historical project database. All estimates are automatically saved with full snapshots for future reference.'}
            </p>
            {!searchQuery && (
              <button
                onClick={onNewEstimate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 28px', background: '#C9A84C', color: '#0D1117',
                  border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                <Plus size={16} strokeWidth={2.5} />
                CREATE FIRST ESTIMATE
              </button>
            )}
          </div>
        ) : (
          /* ──── Estimates Table ──── */
          <div style={{ border: '1px solid #21262D', background: '#0D1117' }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 192px',
              padding: '10px 20px', background: '#161B22', borderBottom: '1px solid #21262D',
              fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: '#484F58',
              textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
            }}>
              <span>Project / Name</span>
              <span>Region</span>
              <span style={{ textAlign: 'right' }}>GFA</span>
              <span style={{ textAlign: 'right' }}>Total Cost</span>
              <span style={{ textAlign: 'right' }}>Cost/sqm</span>
              <span style={{ textAlign: 'center' }}>Actions</span>
            </div>

            {/* Table rows */}
            {filtered.map((est, idx) => (
              <div
                key={est.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 192px',
                  padding: '14px 20px', alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? '1px solid #161B22' : 'none',
                  background: idx % 2 === 0 ? '#0D1117' : '#0F1318',
                  transition: 'background 0.1s',
                  cursor: 'pointer',
                }}
                onMouseOver={e => (e.currentTarget.style.background = '#161B22')}
                onMouseOut={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#0D1117' : '#0F1318')}
                onClick={() => onViewEstimate?.(est.id)}
              >
                {/* Name + type + tier */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 18 }}>{TYPE_ICONS[est.project_type] || '🏗️'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#C9D1D9', marginBottom: 2 }}>
                      {est.name}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#484F58' }}>
                        {PROJECT_TYPE_LABELS[est.project_type] || est.project_type}
                      </span>
                      <span style={{
                        fontSize: 8, padding: '1px 6px', fontWeight: 600,
                        background: `${TIER_COLORS[est.spec_tier] || '#6B7280'}22`,
                        color: TIER_COLORS[est.spec_tier] || '#6B7280',
                        border: `1px solid ${TIER_COLORS[est.spec_tier] || '#6B7280'}44`,
                        fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {TIER_LABELS[est.spec_tier] || est.spec_tier}
                      </span>
                      <span style={{ fontSize: 9, color: '#30363D' }}>{timeAgo(est.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Region */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={10} style={{ color: '#484F58' }} />
                  <span style={{ fontSize: 11, color: '#8B949E' }}>
                    {REGION_LABELS[est.region] || est.region}
                  </span>
                </div>

                {/* GFA */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#C9D1D9', fontFamily: '"JetBrains Mono", monospace' }}>
                    {fmtNumber(Number(est.gfa_sqm))}
                  </span>
                  <span style={{ fontSize: 9, color: '#484F58', marginLeft: 4 }}>sqm</span>
                  <div style={{ fontSize: 9, color: '#30363D', fontFamily: '"JetBrains Mono", monospace' }}>
                    {est.floors} {est.floors === 1 ? 'floor' : 'floors'}
                  </div>
                </div>

                {/* Total cost */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', fontFamily: '"JetBrains Mono", monospace' }}>
                    {/* Stored values are canonical GHS (the BoQ base); the dashboard's fmtCurrency
                        does NOT convert, so always show GH₵ — never the per-estimate display
                        currency, which would slap a $/€ on the raw GHS number. */}
                    {fmtCurrency(Number(est.total_cost), 'GHS')}
                  </span>
                  <div style={{ fontSize: 9, color: '#30363D', fontFamily: '"JetBrains Mono", monospace' }}>
                    H:{fmtCompact(Number(est.hard_cost))}  S:{fmtCompact(Number(est.soft_cost))}
                  </div>
                </div>

                {/* Cost/sqm */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#3FB950', fontFamily: '"JetBrains Mono", monospace' }}>
                    {fmtCurrency(Number(est.cost_per_sqm), 'GHS')}
                  </span>
                  <span style={{ fontSize: 9, color: '#484F58' }}>/sqm</span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onViewEstimate?.(est.id)}
                    title="View estimate"
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#21262D', border: '1px solid #30363D', color: '#8B949E',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C'; }}
                    onMouseOut={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = '#30363D'; }}
                  >
                    <Eye size={12} />
                  </button>
                  <button
                    onClick={() => onEditEstimate?.(est.id)}
                    title="Edit estimate"
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#21262D', border: '1px solid #30363D', color: '#8B949E',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.color = '#58A6FF'; e.currentTarget.style.borderColor = '#58A6FF'; }}
                    onMouseOut={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = '#30363D'; }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => onDownloadReport?.(est.id)}
                    title="Download report"
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#21262D', border: '1px solid #30363D', color: '#8B949E',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.color = '#3FB950'; e.currentTarget.style.borderColor = '#3FB950'; }}
                    onMouseOut={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = '#30363D'; }}
                  >
                    <Download size={12} />
                  </button>
                  <button
                    onClick={() => onConvertToProject?.(est)}
                    title="Convert to project"
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#21262D', border: '1px solid #30363D', color: '#8B949E',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C'; }}
                    onMouseOut={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = '#30363D'; }}
                  >
                    <Rocket size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(est.id)}
                    title="Delete estimate"
                    disabled={deletingId === est.id}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#21262D', border: '1px solid #30363D',
                      color: deletingId === est.id ? '#484F58' : '#8B949E',
                      cursor: deletingId === est.id ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { if (deletingId !== est.id) { e.currentTarget.style.color = '#F85149'; e.currentTarget.style.borderColor = '#F85149'; } }}
                    onMouseOut={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = '#30363D'; }}
                  >
                    {deletingId === est.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════════════ DISTRIBUTION CARDS ════════════ */}
        {estimates.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
            {/* By Project Type */}
            <div style={{ background: '#161B22', border: '1px solid #21262D', padding: '20px 24px' }}>
              <div style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                By Project Type
              </div>
              {Object.entries(typeDistribution).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #21262D' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{TYPE_ICONS[type] || '🏗️'}</span>
                    <span style={{ fontSize: 11, color: '#8B949E' }}>{PROJECT_TYPE_LABELS[type] || type}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: Math.max(20, (count / totalEstimates) * 80), height: 6,
                      background: '#C9A84C', borderRadius: 1, transition: 'width 0.3s',
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#C9D1D9', fontFamily: '"JetBrains Mono", monospace', minWidth: 24, textAlign: 'right' }}>
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* By Region */}
            <div style={{ background: '#161B22', border: '1px solid #21262D', padding: '20px 24px' }}>
              <div style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                By Region
              </div>
              {Object.entries(regionDistribution).map(([region, count]) => (
                <div key={region} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #21262D' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={12} style={{ color: '#3FB950' }} />
                    <span style={{ fontSize: 11, color: '#8B949E' }}>{REGION_LABELS[region] || region}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: Math.max(20, (count / totalEstimates) * 80), height: 6,
                      background: '#3FB950', borderRadius: 1, transition: 'width 0.3s',
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#C9D1D9', fontFamily: '"JetBrains Mono", monospace', minWidth: 24, textAlign: 'right' }}>
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
