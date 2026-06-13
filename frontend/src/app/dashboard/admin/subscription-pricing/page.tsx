'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  DollarSign,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

// ─── Types ──────────────────────────────────────────────────────
type PlanCategory = 'full_platform' | 'valuation_services' | 'property_management' | 'crm' | 'data_intelligence' | 'project_management'
type PlanTier = 'starter' | 'professional' | 'enterprise'
type PlanSegment = 'b2c' | 'b2b' | 'any'

interface SubscriptionPlan {
  id: string
  slug: string
  name: string
  description?: string
  category: PlanCategory
  tier: PlanTier
  segment: PlanSegment
  price_monthly_ghs: number
  price_annual_ghs?: number
  price_monthly_usd?: number
  price_annual_usd?: number
  currency: string
  max_users?: number
  max_properties?: number
  max_api_calls_monthly?: number
  max_valuations_monthly?: number
  max_projects?: number
  storage_gb?: number
  target_audience?: string
  features: string[]
  cta_text: string
  is_featured: boolean
  sort_order: number
  is_active: boolean
  is_public: boolean
  trial_days: number
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

interface PlanFormData {
  slug: string
  name: string
  description: string
  category: PlanCategory
  tier: PlanTier
  segment: PlanSegment
  price_monthly_ghs: string
  price_annual_ghs: string
  price_monthly_usd: string
  price_annual_usd: string
  max_users: string
  max_properties: string
  max_api_calls_monthly: string
  max_valuations_monthly: string
  max_projects: string
  storage_gb: string
  target_audience: string
  features: string
  cta_text: string
  is_featured: boolean
  sort_order: string
  is_active: boolean
  is_public: boolean
  trial_days: string
}

// ─── Constants ──────────────────────────────────────────────────
const CATEGORIES: { value: PlanCategory; label: string }[] = [
  { value: 'full_platform', label: 'Full Platform' },
  { value: 'valuation_services', label: 'Valuation Services' },
  { value: 'property_management', label: 'Property Management' },
  { value: 'crm', label: 'CRM' },
  { value: 'data_intelligence', label: 'Data Intelligence' },
  { value: 'project_management', label: 'Project Management' },
]

const TIERS: { value: PlanTier; label: string; color: string }[] = [
  { value: 'starter', label: 'Starter', color: 'zinc' },
  { value: 'professional', label: 'Professional', color: 'blue' },
  { value: 'enterprise', label: 'Enterprise', color: 'amber' },
]

const SEGMENTS: { value: PlanSegment; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'b2c', label: 'B2C' },
  { value: 'b2b', label: 'B2B' },
]

const emptyForm: PlanFormData = {
  slug: '',
  name: '',
  description: '',
  category: 'full_platform',
  tier: 'starter',
  segment: 'any',
  price_monthly_ghs: '',
  price_annual_ghs: '',
  price_monthly_usd: '',
  price_annual_usd: '',
  max_users: '',
  max_properties: '',
  max_api_calls_monthly: '',
  max_valuations_monthly: '',
  max_projects: '',
  storage_gb: '',
  target_audience: '',
  features: '',
  cta_text: 'Get Started',
  is_featured: false,
  sort_order: '0',
  is_active: true,
  is_public: true,
  trial_days: '14',
}

function planToForm(plan: SubscriptionPlan): PlanFormData {
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description || '',
    category: plan.category,
    tier: plan.tier,
    segment: plan.segment,
    price_monthly_ghs: String(plan.price_monthly_ghs ?? ''),
    price_annual_ghs: String(plan.price_annual_ghs ?? ''),
    price_monthly_usd: String(plan.price_monthly_usd ?? ''),
    price_annual_usd: String(plan.price_annual_usd ?? ''),
    max_users: String(plan.max_users ?? ''),
    max_properties: String(plan.max_properties ?? ''),
    max_api_calls_monthly: String(plan.max_api_calls_monthly ?? ''),
    max_valuations_monthly: String(plan.max_valuations_monthly ?? ''),
    max_projects: String(plan.max_projects ?? ''),
    storage_gb: String(plan.storage_gb ?? ''),
    target_audience: plan.target_audience || '',
    features: Array.isArray(plan.features) ? plan.features.join('\n') : '',
    cta_text: plan.cta_text || 'Get Started',
    is_featured: plan.is_featured,
    sort_order: String(plan.sort_order ?? 0),
    is_active: plan.is_active,
    is_public: plan.is_public,
    trial_days: String(plan.trial_days ?? 14),
  }
}

function formToPayload(form: PlanFormData) {
  const num = (v: string) => v ? Number(v) : null
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    category: form.category,
    tier: form.tier,
    segment: form.segment,
    price_monthly_ghs: Number(form.price_monthly_ghs) || 0,
    price_annual_ghs: num(form.price_annual_ghs),
    price_monthly_usd: num(form.price_monthly_usd),
    price_annual_usd: num(form.price_annual_usd),
    max_users: num(form.max_users),
    max_properties: num(form.max_properties),
    max_api_calls_monthly: num(form.max_api_calls_monthly),
    max_valuations_monthly: num(form.max_valuations_monthly),
    max_projects: num(form.max_projects),
    storage_gb: num(form.storage_gb),
    target_audience: form.target_audience.trim() || null,
    features: form.features.split('\n').map(f => f.trim()).filter(Boolean),
    cta_text: form.cta_text.trim() || 'Get Started',
    is_featured: form.is_featured,
    sort_order: Number(form.sort_order) || 0,
    is_active: form.is_active,
    is_public: form.is_public,
    trial_days: Number(form.trial_days) || 14,
  }
}

// ─── Tier badge color helper ────────────────────────────────────
function tierBadge(tier: PlanTier) {
  switch (tier) {
    case 'starter':
      return 'border-border text-muted-foreground'
    case 'professional':
      return 'border-blue-800 text-blue-600 dark:text-blue-400'
    case 'enterprise':
      return 'border-amber-800 text-amber-600 dark:text-amber-400'
  }
}

// ─── Page Component ─────────────────────────────────────────────
export default function SubscriptionCostsPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')

  // Edit / create state
  const [editingId, setEditingId] = useState<string | null>(null) // plan id or '__new__'
  const [form, setForm] = useState<PlanFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const url = `${API_BASE}/subscriptions/admin/plans`
      const res = await authedFetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`Failed to load plans: ${res.status}`)
      const json = await res.json()
      setPlans(json.plans || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlans() }, [loadPlans])

  // ── Handlers ────────────────────────────────────────────────
  const startEdit = (plan: SubscriptionPlan) => {
    setEditingId(plan.id)
    setForm(planToForm(plan))
    setSaveSuccess(null)
  }

  const startCreate = () => {
    setEditingId('__new__')
    setForm({ ...emptyForm })
    setSaveSuccess(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDeleteConfirm(null)
  }

  const updateField = <K extends keyof PlanFormData>(key: K, value: PlanFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.slug || !form.name || !form.price_monthly_ghs) {
      setError('Slug, name, and monthly GHS price are required')
      return
    }

    try {
      setSaving(true)
      setError(null)
      const payload = formToPayload(form)
      const isNew = editingId === '__new__'
      const url = isNew
        ? `${API_BASE}/subscriptions/admin/plans`
        : `${API_BASE}/subscriptions/admin/plans/${editingId}`
      const method = isNew ? 'POST' : 'PUT'

      const res = await authedFetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Failed to save: ${res.status}`)
      }

      const saved = await res.json()
      setSaveSuccess(saved.id || editingId || 'saved')
      setEditingId(null)
      await loadPlans()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (planId: string) => {
    try {
      setError(null)
      const res = await authedFetch(`${API_BASE}/subscriptions/admin/plans/${planId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Failed to deactivate: ${res.status}`)
      setDeleteConfirm(null)
      await loadPlans()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ── Filter ──────────────────────────────────────────────────
  const filtered = filterCategory === 'all'
    ? plans
    : plans.filter(p => p.category === filterCategory)

  // ── Group by category ───────────────────────────────────────
  const grouped = filtered.reduce<Record<string, SubscriptionPlan[]>>((acc, plan) => {
    const cat = plan.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(plan)
    return acc
  }, {})

  const categoryLabel = (cat: string) =>
    CATEGORIES.find(c => c.value === cat)?.label || cat.replace(/_/g, ' ')

  const formatCurrency = (val: number | null | undefined, currency = 'GHS') =>
    val != null ? `${currency} ${Number(val).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : '—'

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">SUBSCRIPTION PRICING</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Manage subscription plans and pricing — changes take effect immediately
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPlans}
            disabled={loading}
            className="border-border text-muted-foreground hover:text-red-400 hover:border-red-900 bg-background font-mono text-xs uppercase"
          >
            <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={startCreate}
            disabled={editingId !== null}
            className="bg-red-600 hover:bg-red-700 text-foreground font-mono text-xs uppercase"
          >
            <Plus className="h-3 w-3 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-950/20 border border-blue-900/30 rounded-lg">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-600 dark:text-blue-300 font-mono space-y-1">
          <p className="font-bold">How subscription pricing works</p>
          <p>Plans are stored in the database and served to the public pricing page and checkout flow. Changes here update the database directly — no code deploy needed.</p>
          <p><strong>Deactivating</strong> a plan hides it from new signups but does not affect existing subscribers.</p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono uppercase">Filter:</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilterCategory('all')}
            className={`font-mono text-xs uppercase ${filterCategory === 'all' ? 'text-red-600 dark:text-red-400 bg-red-950/30' : 'text-muted-foreground hover:text-muted-foreground'}`}
          >
            All
          </Button>
          {CATEGORIES.map(cat => (
            <Button
              key={cat.value}
              variant="ghost"
              size="sm"
              onClick={() => setFilterCategory(cat.value)}
              className={`font-mono text-xs uppercase ${filterCategory === cat.value ? 'text-red-600 dark:text-red-400 bg-red-950/30' : 'text-muted-foreground hover:text-muted-foreground'}`}
            >
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-800 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-600 dark:text-red-400 font-mono">{error}</p>
          <Button variant="link" onClick={() => setError(null)} className="text-muted-foreground ml-auto text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        </div>
      )}

      {/* Create / Edit Modal Inline */}
      {editingId && (
        <Card className="bg-card border-red-900/50 border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-mono uppercase text-foreground">
                {editingId === '__new__' ? 'Create New Plan' : `Edit: ${form.name}`}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Row 1: Identity */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground font-mono uppercase">Slug *</Label>
                <Input
                  value={form.slug}
                  onChange={e => updateField('slug', e.target.value)}
                  placeholder="e.g. full-starter"
                  disabled={editingId !== '__new__'}
                  className="bg-background border-border text-foreground font-mono text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-mono uppercase">Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="e.g. Starter"
                  className="bg-background border-border text-foreground font-mono text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-mono uppercase">Category</Label>
                <Select value={form.category} onValueChange={v => updateField('category', v as PlanCategory)}>
                  <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value} className="font-mono text-sm">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-mono uppercase">Tier</Label>
                <Select value={form.tier} onValueChange={v => updateField('tier', v as PlanTier)}>
                  <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {TIERS.map(t => (
                      <SelectItem key={t.value} value={t.value} className="font-mono text-sm">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Description & Segment */}
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground font-mono uppercase">Description</Label>
                <Input
                  value={form.description}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder="Brief plan description"
                  className="bg-background border-border text-foreground font-mono text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-mono uppercase">Segment</Label>
                <Select value={form.segment} onValueChange={v => updateField('segment', v as PlanSegment)}>
                  <SelectTrigger className="bg-background border-border text-foreground font-mono text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {SEGMENTS.map(s => (
                      <SelectItem key={s.value} value={s.value} className="font-mono text-sm">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-mono uppercase">Target Audience</Label>
                <Input
                  value={form.target_audience}
                  onChange={e => updateField('target_audience', e.target.value)}
                  placeholder="e.g. Small firms"
                  className="bg-background border-border text-foreground font-mono text-sm mt-1"
                />
              </div>
            </div>

            {/* Row 3: Pricing */}
            <div>
              <p className="text-xs text-muted-foreground font-mono uppercase mb-2 flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Pricing
              </p>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Monthly GHS *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price_monthly_ghs}
                    onChange={e => updateField('price_monthly_ghs', e.target.value)}
                    placeholder="0.00"
                    className="bg-background border-border text-foreground font-mono text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Annual GHS</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price_annual_ghs}
                    onChange={e => updateField('price_annual_ghs', e.target.value)}
                    placeholder="0.00"
                    className="bg-background border-border text-foreground font-mono text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Monthly USD</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price_monthly_usd}
                    onChange={e => updateField('price_monthly_usd', e.target.value)}
                    placeholder="0.00"
                    className="bg-background border-border text-foreground font-mono text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Annual USD</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price_annual_usd}
                    onChange={e => updateField('price_annual_usd', e.target.value)}
                    placeholder="0.00"
                    className="bg-background border-border text-foreground font-mono text-sm mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Limits */}
            <div>
              <p className="text-xs text-muted-foreground font-mono uppercase mb-2">Limits</p>
              <div className="grid grid-cols-6 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Max Users</Label>
                  <Input type="number" value={form.max_users} onChange={e => updateField('max_users', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Max Properties</Label>
                  <Input type="number" value={form.max_properties} onChange={e => updateField('max_properties', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">API Calls/mo</Label>
                  <Input type="number" value={form.max_api_calls_monthly} onChange={e => updateField('max_api_calls_monthly', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Valuations/mo</Label>
                  <Input type="number" value={form.max_valuations_monthly} onChange={e => updateField('max_valuations_monthly', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Max Projects</Label>
                  <Input type="number" value={form.max_projects} onChange={e => updateField('max_projects', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-mono">Storage GB</Label>
                  <Input type="number" step="0.01" value={form.storage_gb} onChange={e => updateField('storage_gb', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                </div>
              </div>
            </div>

            {/* Row 5: Features & display */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground font-mono uppercase">Features (one per line)</Label>
                <textarea
                  value={form.features}
                  onChange={e => updateField('features', e.target.value)}
                  rows={4}
                  placeholder="Unlimited property listings&#10;Market analytics&#10;API access"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground font-mono">CTA Text</Label>
                    <Input value={form.cta_text} onChange={e => updateField('cta_text', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground font-mono">Sort Order</Label>
                    <Input type="number" value={form.sort_order} onChange={e => updateField('sort_order', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground font-mono">Trial Days</Label>
                    <Input type="number" value={form.trial_days} onChange={e => updateField('trial_days', e.target.value)} className="bg-background border-border text-foreground font-mono text-sm mt-1" />
                  </div>
                </div>
                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={form.is_active} onCheckedChange={v => updateField('is_active', v)} />
                    <span className="text-xs text-muted-foreground font-mono">Active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={form.is_public} onCheckedChange={v => updateField('is_public', v)} />
                    <span className="text-xs text-muted-foreground font-mono">Public</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={form.is_featured} onCheckedChange={v => updateField('is_featured', v)} />
                    <span className="text-xs text-muted-foreground font-mono">Featured</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-foreground font-mono text-xs uppercase"
              >
                {saving ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Save className="h-3 w-3 mr-2" />}
                {editingId === '__new__' ? 'Create Plan' : 'Save Changes'}
              </Button>
              <Button variant="ghost" onClick={cancelEdit} disabled={saving} className="text-muted-foreground font-mono text-xs uppercase">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan List */}
      {!loading && Object.keys(grouped).length === 0 && !editingId && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground font-mono">
            <DollarSign className="h-10 w-10 mb-3 opacity-30" />
            <p>No subscription plans found.</p>
            <p className="text-xs mt-1">Click &quot;New Plan&quot; to create your first pricing plan.</p>
          </CardContent>
        </Card>
      )}

      {!loading && Object.entries(grouped).map(([category, catPlans]) => (
        <div key={category} className="space-y-3">
          <h2 className="text-xs font-mono uppercase text-muted-foreground tracking-wider border-b border-border pb-1">
            {categoryLabel(category)}
            <Badge variant="outline" className="ml-2 border-border text-muted-foreground font-mono text-[10px]">
              {catPlans.length} plan{catPlans.length !== 1 ? 's' : ''}
            </Badge>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catPlans.map(plan => {
              const justSaved = saveSuccess === plan.id
              return (
                <Card
                  key={plan.id}
                  className={`bg-card border-border hover:border-border transition-colors ${!plan.is_active ? 'opacity-50' : ''}`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Plan header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono font-bold text-sm">{plan.name}</span>
                        <Badge variant="outline" className={`${tierBadge(plan.tier)} font-mono text-[10px] uppercase`}>
                          {plan.tier}
                        </Badge>
                        {plan.is_featured && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        {justSaved && (
                          <Badge className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-800 font-mono text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-1" /> Saved
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {plan.is_active ? (
                          <Eye className="h-3 w-3 text-green-500" />
                        ) : (
                          <EyeOff className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-mono font-bold text-red-600 dark:text-red-400">
                          GHS {Number(plan.price_monthly_ghs).toLocaleString('en-GH')}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">/mo</span>
                      </div>
                      {plan.price_annual_ghs && (
                        <p className="text-xs text-muted-foreground font-mono">
                          Annual: {formatCurrency(plan.price_annual_ghs)}
                        </p>
                      )}
                      {plan.price_monthly_usd && (
                        <p className="text-xs text-muted-foreground font-mono">
                          USD: {formatCurrency(plan.price_monthly_usd, 'USD')}/mo
                          {plan.price_annual_usd ? ` · ${formatCurrency(plan.price_annual_usd, 'USD')}/yr` : ''}
                        </p>
                      )}
                    </div>

                    {/* Metadata badges */}
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px]">
                        {plan.segment}
                      </Badge>
                      {plan.max_users && (
                        <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px]">
                          {plan.max_users} users
                        </Badge>
                      )}
                      {plan.max_valuations_monthly && (
                        <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px]">
                          {plan.max_valuations_monthly} val/mo
                        </Badge>
                      )}
                      {plan.trial_days > 0 && (
                        <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px]">
                          {plan.trial_days}d trial
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px]">
                        slug: {plan.slug}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(plan)}
                        disabled={editingId !== null}
                        className="text-muted-foreground hover:text-foreground font-mono text-xs uppercase"
                      >
                        Edit
                      </Button>
                      {deleteConfirm === plan.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(plan.id)}
                            className="text-red-600 dark:text-red-400 hover:text-red-300 font-mono text-xs uppercase"
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(null)}
                            className="text-muted-foreground font-mono text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(plan.id)}
                          disabled={editingId !== null || !plan.is_active}
                          className="text-muted-foreground hover:text-red-400 font-mono text-xs uppercase"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}

      {/* Summary */}
      {!loading && plans.length > 0 && (
        <div className="text-xs text-muted-foreground font-mono text-right pt-4 border-t border-border">
          {plans.length} total plan{plans.length !== 1 ? 's' : ''} · {plans.filter(p => p.is_active).length} active · {plans.filter(p => !p.is_active).length} inactive
        </div>
      )}
    </div>
  )
}
