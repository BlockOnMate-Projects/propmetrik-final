'use client'

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { authedFetch } from '@/lib/authed-fetch'
import { QRCodeSVG } from 'qrcode.react'
import {
  Calculator,
  Building2,
  Settings,
  Download,
  Copy,
  Save,
  ChevronDown,
  ChevronRight,
  X,
  AlertTriangle,
  Info,
  Landmark,
  Layers,
  Zap,
  Hammer,
  Wrench,
  Shield,
  BarChart3,
  Printer,
  RefreshCw,
  Check,
  Loader2,
  TreePine,
  HardHat,
  Ruler,
  PencilLine,
  RotateCcw,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

// ═══════════════════════════════════════════════════════════════════
//  T Y P E S
// ═══════════════════════════════════════════════════════════════════

interface LineItemDef {
  id: string
  description: string
  unit: string
  getQty: (gfa: number, floors: number) => number
  baseRate: number
  tierAffected: boolean
}

interface CategoryDef {
  id: string
  name: string
  icon: React.ElementType
  items: LineItemDef[]
}

interface ComputedLineItem {
  id: string
  description: string
  unit: string
  quantity: number
  unitRate: number
  total: number
}

interface ComputedCategory {
  id: string
  name: string
  icon: React.ElementType
  items: ComputedLineItem[]
  subtotal: number
  percentOfTotal: number
}

interface FeeItem {
  id: string
  name: string
  percentage: number
}

interface ContingencyItem {
  id: string
  name: string
  percentage: number
}

interface FinancialAssumption {
  id: string
  name: string
  value: number
  unit: string
}

interface ClientInfo {
  clientName: string
  clientCompany: string
  clientEmail: string
  clientPhone: string
  projectName: string
  projectAddress: string
}

const DRAFT_KEY = 'propmetrik_cost_estimator_draft'

interface SavedEstimate {
  id: string
  name: string
  date: string
  totalCost: number
  hardCost: number
  softCost: number
  contingencyTotal: number
  costPerUnit: number
  projectType: string
  region: string
  gfa: number
  specTier: string
  currency: Currency
}

// Export for barrel file compatibility
export interface CostEstimate {
  totalProjectCost: number
  hardCostSubtotal: number
  softCostSubtotal: number
  contingencyTotal: number
  costPerSqm: number
  categories: ComputedCategory[]
}

type Currency = 'GHS' | 'USD' | 'GBP' | 'EUR'
type AreaUnit = 'sqm' | 'sqft'

interface CostEstimatorProps {
  className?: string
  onBack?: () => void
  initialEstimate?: {
    id: string
    name: string
    snapshot: {
      projectType: string
      gfa: number
      areaUnit: AreaUnit
      floors: number
      region: string
      specTier: string
      includeLand: boolean
      landPricePerSqm: number
      currency: Currency
      fees: FeeItem[]
      contingencies: ContingencyItem[]
      financial: FinancialAssumption[]
      rateOverrides: Record<string, number>
      materialPriceOverrides: Record<string, number>
      clientInfo: ClientInfo
      includeLaborCosts: boolean
      includeElectrical: boolean
      includePlumbing: boolean
      includeHvac: boolean
      categories?: any[]
    }
  } | null
}

// ═══════════════════════════════════════════════════════════════════
//  C O N S T A N T S
// ═══════════════════════════════════════════════════════════════════

const SQM_TO_SQFT = 10.7639
const SQFT_TO_SQM = 1 / SQM_TO_SQFT

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  GHS: 'GH₵',
  USD: '$',
  GBP: '£',
  EUR: '€',
}

// ── Data Hub Market Data types ──
interface MarketData {
  fx_rates: Record<string, number>
  fx_sources: Record<string, string>
  fx_timestamp: string
  regional_multipliers: Array<{ region: string; value: number; material_multiplier: number; labor_multiplier: number; source: string; confidence: number }>
  base_costs: Record<string, { cost_ghs: number; source: string; material_pct: number; labor_pct: number }>
  material_prices: Array<{ category: string; name: string; price_ghs: number; previous_price_ghs: number | null; price_change_percent: number | null; unit: string }>
  labor_rates: Array<{ category: string; skill_level: string; daily_rate_ghs: number; rate_change_percent: number | null }>
  construction_index: { value: number; base_value: number; period: string; source: string; material_index: number; labor_index: number; change_yoy: number | null } | null
  generated_at: string
}

// Project type definitions — baseCost is dynamically resolved from Data Hub
const PROJECT_TYPES = [
  { value: 'residential_single', label: 'Residential (Single Family)', baseCostKey: 'residential_standard' },
  { value: 'residential_multi', label: 'Residential (Multi-Unit)', baseCostKey: 'residential_standard' },
  { value: 'commercial_office', label: 'Commercial Office', baseCostKey: 'commercial_standard' },
  { value: 'retail', label: 'Retail', baseCostKey: 'commercial_standard' },
  { value: 'mixed_use', label: 'Mixed-Use', baseCostKey: 'commercial_standard' },
  { value: 'industrial', label: 'Industrial', baseCostKey: 'industrial_standard' },
]

// Spec tier quality keys — multipliers are derived from Data Hub base costs
const SPEC_TIERS = [
  { value: 'basic', label: 'Basic', qualityKey: 'basic', desc: 'Standard blocks, basic finishes, no embellishments' },
  { value: 'standard', label: 'Standard', qualityKey: 'standard', desc: 'Quality materials, ceramic tiles, painted walls' },
  { value: 'premium', label: 'Premium', qualityKey: 'premium', desc: 'Imported finishes, granite, high-end fittings' },
  { value: 'luxury', label: 'Luxury', qualityKey: 'luxury', desc: 'Bespoke design, marble, smart-home, architect-led' },
]

// Regions — multipliers come from Data Hub regional_cost_multipliers table
const REGIONS = [
  { value: 'greater_accra', label: 'Greater Accra' },
  { value: 'kumasi_metro', label: 'Kumasi Metro' },
  { value: 'ashanti', label: 'Ashanti (Other)' },
  { value: 'western', label: 'Western' },
  { value: 'central', label: 'Central' },
  { value: 'eastern', label: 'Eastern' },
  { value: 'volta', label: 'Volta' },
  { value: 'northern', label: 'Northern' },
  { value: 'upper_east', label: 'Upper East' },
  { value: 'upper_west', label: 'Upper West' },
  { value: 'bono', label: 'Bono' },
  { value: 'bono_east', label: 'Bono East' },
  { value: 'ahafo', label: 'Ahafo' },
  { value: 'savannah', label: 'Savannah' },
  { value: 'north_east', label: 'North East' },
  { value: 'oti', label: 'Oti' },
  { value: 'western_north', label: 'Western North' },
]

/**
 * Reference base cost (GHS/sqm) — the sum of all CATEGORY_DEFINITIONS baseRates
 * calibrated for a standard residential project in Greater Accra.
 * Used as denominator in the scaleFactor = realBaseCost / REFERENCE_BASE_COST
 * so that all line item rates scale proportionally to real Data Hub market data.
 */
const REFERENCE_BASE_COST = 5000

function estimateConstructionPeriod(gfa: number, floors: number): number {
  let base: number
  if (gfa < 200) base = 8
  else if (gfa < 500) base = 12
  else if (gfa < 1000) base = 16
  else if (gfa < 3000) base = 20
  else if (gfa < 5000) base = 24
  else base = 30
  return Math.round(base * (1 + (floors - 1) * 0.12))
}

function estimatePerimeter(gfa: number): number {
  return Math.round(Math.sqrt(gfa * 1.3) * 4)
}

// ═══════════════════════════════════════════════════════════════════
//  C A T E G O R Y   D E F I N I T I O N S   (10 categories)
// ═══════════════════════════════════════════════════════════════════

const CATEGORY_DEFINITIONS: CategoryDef[] = [
  {
    id: 'site_acquisition',
    name: 'Site Acquisition & Due Diligence',
    icon: Landmark,
    items: [
      { id: 'land_survey', description: 'Land Survey & Boundary Demarcation', unit: 'LS', getQty: () => 1, baseRate: 6000, tierAffected: false },
      { id: 'legal_dd', description: 'Legal Due Diligence & Title Search', unit: 'LS', getQty: () => 1, baseRate: 8000, tierAffected: false },
      { id: 'env_assess', description: 'Environmental Impact Assessment', unit: 'LS', getQty: () => 1, baseRate: 5500, tierAffected: false },
      { id: 'geotech', description: 'Geotechnical Investigation', unit: 'LS', getQty: () => 1, baseRate: 5000, tierAffected: false },
    ],
  },
  {
    id: 'site_prep',
    name: 'Site Preparation & Demolition',
    icon: HardHat,
    items: [
      { id: 'clearing', description: 'Site Clearing & Grubbing', unit: 'sqm', getQty: (g) => Math.round(g * 1.3), baseRate: 28, tierAffected: false },
      { id: 'earthworks', description: 'Earthworks (Cut & Fill)', unit: 'm³', getQty: (g) => Math.round(g * 0.45), baseRate: 85, tierAffected: false },
      { id: 'hoarding', description: 'Temporary Fencing & Hoarding', unit: 'm', getQty: (g) => estimatePerimeter(g), baseRate: 95, tierAffected: false },
      { id: 'demolition', description: 'Demolition (Provisional)', unit: 'LS', getQty: () => 1, baseRate: 8000, tierAffected: false },
    ],
  },
  {
    id: 'foundation',
    name: 'Foundation & Substructure',
    icon: Layers,
    items: [
      { id: 'excavation', description: 'Excavation to Formation Level', unit: 'm³', getQty: (g) => Math.round(g * 0.45), baseRate: 72, tierAffected: false },
      { id: 'rc_found', description: 'R/C Strip & Pad Foundations', unit: 'm³', getQty: (g) => Math.round(g * 0.06), baseRate: 3200, tierAffected: false },
      { id: 'sub_block', description: 'Substructure Blockwork', unit: 'm²', getQty: (g) => Math.round(g * 0.35), baseRate: 245, tierAffected: false },
      { id: 'dpc', description: 'DPC & Damp Proof Membrane', unit: 'm²', getQty: (g) => Math.round(g), baseRate: 42, tierAffected: false },
      { id: 'ground_slab', description: 'Ground Floor Slab & Hardcore', unit: 'm²', getQty: (g) => Math.round(g), baseRate: 165, tierAffected: false },
    ],
  },
  {
    id: 'structural',
    name: 'Structural Frame',
    icon: Building2,
    items: [
      { id: 'rc_columns', description: 'Reinforced Concrete Columns', unit: 'm³', getQty: (g, f) => Math.max(2, Math.round(g * 0.012 * f)), baseRate: 4800, tierAffected: false },
      { id: 'rc_beams', description: 'Reinforced Concrete Beams', unit: 'm³', getQty: (g, f) => Math.max(2, Math.round(g * 0.015 * f)), baseRate: 4500, tierAffected: false },
      { id: 'floor_slabs', description: 'Suspended Floor Slabs', unit: 'm²', getQty: (g, f) => Math.round(g * Math.max(0, f - 1)), baseRate: 380, tierAffected: false },
      { id: 'rebar', description: 'Reinforcement Steel (Supply & Fix)', unit: 'tonne', getQty: (g, f) => Math.max(1, Math.round(g * 0.025 * f * 10) / 10), baseRate: 14500, tierAffected: false },
      { id: 'blockwork', description: 'Blockwork Walls (150mm–225mm)', unit: 'm²', getQty: (g, f) => Math.round(g * 1.8 * f), baseRate: 175, tierAffected: true },
    ],
  },
  {
    id: 'exterior',
    name: 'Exterior Envelope (Roof, Cladding, Windows, Doors)',
    icon: Shield,
    items: [
      { id: 'roof_struct', description: 'Roof Structure & Trusses', unit: 'm²', getQty: (g, f) => Math.round(g / Math.max(1, f)), baseRate: 265, tierAffected: true },
      { id: 'roof_cover', description: 'Roof Covering (Aluminium / Tiles)', unit: 'm²', getQty: (g, f) => Math.round((g / Math.max(1, f)) * 1.15), baseRate: 185, tierAffected: true },
      { id: 'ext_render', description: 'External Rendering & Finishes', unit: 'm²', getQty: (g) => Math.round(g * 1.4), baseRate: 78, tierAffected: true },
      { id: 'windows', description: 'Windows (Aluminium / uPVC)', unit: 'm²', getQty: (g) => Math.round(g * 0.12), baseRate: 1350, tierAffected: true },
      { id: 'ext_doors', description: 'External Doors', unit: 'nr', getQty: (_, f) => f * 2 + 1, baseRate: 4200, tierAffected: true },
    ],
  },
  {
    id: 'mep',
    name: 'Mechanical, Electrical & Plumbing (MEP)',
    icon: Zap,
    items: [
      { id: 'electrical', description: 'Electrical Installation', unit: 'sqm', getQty: (g) => Math.round(g), baseRate: 155, tierAffected: true },
      { id: 'plumbing', description: 'Plumbing & Sanitary Installation', unit: 'sqm', getQty: (g) => Math.round(g), baseRate: 135, tierAffected: true },
      { id: 'hvac', description: 'HVAC / Ventilation', unit: 'sqm', getQty: (g) => Math.round(g), baseRate: 95, tierAffected: true },
      { id: 'fire_safety', description: 'Fire Detection & Safety Systems', unit: 'sqm', getQty: (g) => Math.round(g), baseRate: 48, tierAffected: false },
      { id: 'data_telecom', description: 'Data, Telecoms & Security', unit: 'sqm', getQty: (g) => Math.round(g), baseRate: 58, tierAffected: true },
    ],
  },
  {
    id: 'interior',
    name: 'Interior Finishes',
    icon: Hammer,
    items: [
      { id: 'flooring', description: 'Floor Finishes (Tile / Vinyl / Timber)', unit: 'm²', getQty: (g) => Math.round(g), baseRate: 175, tierAffected: true },
      { id: 'wall_finish', description: 'Wall Finishes & Painting', unit: 'm²', getQty: (g) => Math.round(g * 2.8), baseRate: 45, tierAffected: true },
      { id: 'ceiling', description: 'Ceiling Finishes (Gypsum / POP)', unit: 'm²', getQty: (g) => Math.round(g), baseRate: 105, tierAffected: true },
      { id: 'int_doors', description: 'Internal Doors & Ironmongery', unit: 'nr', getQty: (g) => Math.max(3, Math.round(g / 22)), baseRate: 2600, tierAffected: true },
      { id: 'skirting', description: 'Skirting, Architraves & Trims', unit: 'm', getQty: (g) => Math.round(g * 0.85), baseRate: 32, tierAffected: true },
    ],
  },
  {
    id: 'ffe',
    name: 'Fittings, Fixtures & Equipment (FF&E)',
    icon: Wrench,
    items: [
      { id: 'kitchen', description: 'Kitchen Fittings & Cabinetry', unit: 'nr', getQty: (g) => Math.max(1, Math.round(g / 180)), baseRate: 38000, tierAffected: true },
      { id: 'bathroom', description: 'Bathroom Fixtures & Accessories', unit: 'set', getQty: (g) => Math.max(1, Math.round(g / 50)), baseRate: 16500, tierAffected: true },
      { id: 'wardrobes', description: 'Built-in Wardrobes & Storage', unit: 'nr', getQty: (g) => Math.max(2, Math.round(g / 45)), baseRate: 7200, tierAffected: true },
      { id: 'appliances', description: 'Appliances & White Goods', unit: 'set', getQty: (g) => Math.max(1, Math.round(g / 180)), baseRate: 22000, tierAffected: true },
    ],
  },
  {
    id: 'external_works',
    name: 'External Works & Landscaping',
    icon: TreePine,
    items: [
      { id: 'perimeter', description: 'Perimeter Walls & Gates', unit: 'm', getQty: (g) => estimatePerimeter(g), baseRate: 950, tierAffected: true },
      { id: 'driveways', description: 'Driveways & Hard Landscaping', unit: 'm²', getQty: (g) => Math.round(g * 0.25), baseRate: 175, tierAffected: true },
      { id: 'soft_landscape', description: 'Soft Landscaping & Planting', unit: 'm²', getQty: (g) => Math.round(g * 0.3), baseRate: 52, tierAffected: true },
      { id: 'ext_drainage', description: 'External Drainage & Utilities', unit: 'm', getQty: (g) => Math.round(estimatePerimeter(g) * 1.5), baseRate: 145, tierAffected: false },
    ],
  },
  {
    id: 'prelims',
    name: 'Preliminaries & Site Overheads',
    icon: Ruler,
    items: [
      { id: 'site_mgmt', description: 'Site Management & Supervision', unit: 'month', getQty: (g, f) => estimateConstructionPeriod(g, f), baseRate: 25000, tierAffected: false },
      { id: 'temp_facilities', description: 'Temporary Facilities & Services', unit: 'LS', getQty: () => 1, baseRate: 30000, tierAffected: false },
      { id: 'health_safety', description: 'Health & Safety Compliance', unit: 'month', getQty: (g, f) => estimateConstructionPeriod(g, f), baseRate: 7500, tierAffected: false },
      { id: 'site_power', description: 'Site Power & Water Supply', unit: 'month', getQty: (g, f) => estimateConstructionPeriod(g, f), baseRate: 5500, tierAffected: false },
    ],
  },
]

// ═══════════════════════════════════════════════════════════════════
//  D E F A U L T   A S S U M P T I O N S
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_PROFESSIONAL_FEES: FeeItem[] = [
  { id: 'arch', name: 'Architectural Fees', percentage: 6 },
  { id: 'struct_eng', name: 'Structural Engineering', percentage: 3 },
  { id: 'mep_eng', name: 'MEP Engineering', percentage: 2.5 },
  { id: 'qs', name: 'Quantity Surveyor / Cost Consultant', percentage: 2.5 },
  { id: 'pm', name: 'Project Management Fee', percentage: 4 },
  { id: 'legal', name: 'Legal & Conveyancing', percentage: 1.5 },
  { id: 'planning', name: 'Planning / Permitting Fees', percentage: 1 },
  { id: 'env_geo', name: 'Environmental & Geotechnical Studies', percentage: 1 },
  { id: 'other_fees', name: 'Other Professional Fees', percentage: 0.5 },
]

const DEFAULT_CONTINGENCY: ContingencyItem[] = [
  { id: 'design_cont', name: 'Design Contingency', percentage: 3 },
  { id: 'construction_cont', name: 'Construction Contingency', percentage: 5 },
  { id: 'escalation', name: 'Escalation / Inflation Reserve', percentage: 3 },
  { id: 'owner_cont', name: "Owner's Contingency", percentage: 2 },
]

const DEFAULT_FINANCIAL: FinancialAssumption[] = [
  { id: 'financing_cost', name: 'Financing Cost', value: 3, unit: '% of total' },
  { id: 'ltc', name: 'Loan-to-Cost Ratio', value: 70, unit: '%' },
  { id: 'interest', name: 'Interest Rate', value: 28, unit: '% p.a.' },
  { id: 'period', name: 'Construction Period', value: 18, unit: 'months' },
]

// ═══════════════════════════════════════════════════════════════════
//  F O R M A T   H E L P E R S
// ═══════════════════════════════════════════════════════════════════

function fmt(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Module-level live FX rates — updated by the component when Data Hub market data loads.
// All fmtCurrency / fmtCompact calls use these automatically (zero call-site changes needed).
let _liveFxRates: Record<string, number> = { GHS: 1 }

function fmtCurrency(amount: number, currency: Currency): string {
  const rate = _liveFxRates[currency] ?? 1
  const converted = amount * rate
  return `${CURRENCY_SYMBOLS[currency]}${fmt(converted)}`
}

function fmtCompact(amount: number, currency: Currency): string {
  const rate = _liveFxRates[currency] ?? 1
  const converted = amount * rate
  if (converted >= 1_000_000) return `${CURRENCY_SYMBOLS[currency]}${(converted / 1_000_000).toFixed(2)}M`
  if (converted >= 1_000) return `${CURRENCY_SYMBOLS[currency]}${(converted / 1_000).toFixed(1)}K`
  return `${CURRENCY_SYMBOLS[currency]}${fmt(converted)}`
}

/**
 * Derive the real spec-tier multiplier from Data Hub base costs.
 * Ratio of the tier's base cost vs the standard-tier base cost for the same property type.
 */
function deriveSpecMultiplier(
  baseCosts: Record<string, { cost_ghs: number }>,
  propertyTypePrefix: string,
  qualityKey: string,
): number {
  const standardCost = baseCosts[`${propertyTypePrefix}_standard`]?.cost_ghs
  const tierCost = baseCosts[`${propertyTypePrefix}_${qualityKey}`]?.cost_ghs
  if (!standardCost || !tierCost || standardCost === 0) return 1
  return tierCost / standardCost
}

/**
 * Derive the real regional multiplier from Data Hub regional_cost_multipliers.
 */
function deriveRegionMultiplier(
  regionalMultipliers: MarketData['regional_multipliers'],
  regionValue: string,
): number {
  const entry = regionalMultipliers.find(r => r.region === regionValue)
  return entry?.value ?? 1
}

/**
 * Get the real base cost per sqm from Data Hub for a project type + standard quality in Greater Accra.
 * Used to compute the scaleFactor = realBaseCost / REFERENCE_BASE_COST.
 */
function getBaseCostPerSqm(
  baseCosts: Record<string, { cost_ghs: number }>,
  projectType: string,
): number {
  const def = PROJECT_TYPES.find(p => p.value === projectType)
  if (!def) return REFERENCE_BASE_COST
  return baseCosts[def.baseCostKey]?.cost_ghs ?? REFERENCE_BASE_COST
}

// ═══════════════════════════════════════════════════════════════════
//  C A L C U L A T I O N   E N G I N E
// ═══════════════════════════════════════════════════════════════════

function computeCategories(
  gfa: number,
  floors: number,
  specMult: number,
  regionMult: number,
  rateOverrides: Record<string, number>,
  scaleFactor: number = 1,
): ComputedCategory[] {
  const categories: ComputedCategory[] = CATEGORY_DEFINITIONS.map((cat) => {
    const items: ComputedLineItem[] = cat.items.map((item) => {
      // No floor area → no estimate. Several line items use Math.max(min, …) floors
      // and a fixed minimum construction period, so they'd otherwise produce a large
      // (and misleading) cost even with GFA = 0 — and cost/sqm would divide by zero.
      const quantity = gfa > 0 ? item.getQty(gfa, floors) : 0
      // Scale the reference baseRate by the Data Hub scale factor, then apply region + tier multipliers
      const scaledRate = item.baseRate * scaleFactor
      const defaultRate = scaledRate * regionMult * (item.tierAffected ? specMult : 1)
      const unitRate = rateOverrides[item.id] !== undefined ? rateOverrides[item.id] : Math.round(defaultRate * 100) / 100
      const total = quantity * unitRate
      return { id: item.id, description: item.description, unit: item.unit, quantity, unitRate, total }
    })
    const subtotal = items.reduce((s, i) => s + i.total, 0)
    return { id: cat.id, name: cat.name, icon: cat.icon, items, subtotal, percentOfTotal: 0 }
  })

  const totalHard = categories.reduce((s, c) => s + c.subtotal, 0)
  categories.forEach((c) => {
    c.percentOfTotal = totalHard > 0 ? (c.subtotal / totalHard) * 100 : 0
  })

  return categories
}

function computeSoftCosts(hardCost: number, fees: FeeItem[]): { items: { name: string; amount: number }[]; total: number } {
  const items = fees.map((f) => ({ name: f.name, amount: hardCost * (f.percentage / 100) }))
  const total = items.reduce((s, i) => s + i.amount, 0)
  return { items, total }
}

function computeContingency(hardCost: number, contingencies: ContingencyItem[]): { items: { name: string; amount: number }[]; total: number } {
  const items = contingencies.map((c) => ({ name: c.name, amount: hardCost * (c.percentage / 100) }))
  const total = items.reduce((s, i) => s + i.amount, 0)
  return { items, total }
}

// ═══════════════════════════════════════════════════════════════════
//  L A B O R   C A T E G O R Y   C O M P U T A T I O N
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute labor costs as a separate category using real Data Hub labor rates.
 * Maps trades to construction phases with Ghana-standard crew sizing.
 * Standard working day: 8 hours. Working days per month: 22.
 */
function computeLaborCategory(
  gfa: number,
  floors: number,
  laborRates: MarketData['labor_rates'],
  regionMult: number,
): ComputedCategory {
  const constructionMonths = estimateConstructionPeriod(gfa, floors)
  const workingDaysPerMonth = 22
  const totalWorkingDays = constructionMonths * workingDaysPerMonth

  // Phase durations as fraction of total construction period
  const phases = {
    foundation: 0.15,   // 15% — excavation, foundations, ground slab
    structural: 0.25,   // 25% — columns, beams, slabs, blockwork
    exterior: 0.12,     // 12% — roofing, cladding, rendering
    mep: 0.18,          // 18% — electrical, plumbing, HVAC, fire
    interior: 0.18,     // 18% — finishes, painting, tiling, joinery
    landscaping: 0.07,  // 7%  — external works, perimeter walls
    supervision: 1.0,   // entire project duration
  }

  // Crew sizes scale with GFA using sqrt (base crew for ~200 sqm)
  const crewScale = Math.max(1, Math.sqrt(gfa / 200))

  // Get daily rate for a trade category + preferred skill level from Data Hub
  const getRate = (category: string, preferredSkill: string = 'skilled'): number => {
    if (!laborRates?.length) return 0
    const exact = laborRates.find(r => r.category === category && r.skill_level === preferredSkill)
    if (exact) return exact.daily_rate_ghs
    const fallback = laborRates.find(r => r.category === category)
    return fallback?.daily_rate_ghs ?? 0
  }

  // Labor line items: trade → construction phases, base crew size, skill level
  const laborItems: Array<{
    id: string; description: string; tradeCategory: string;
    skillLevel: string; baseCrewSize: number;
    phaseKeys: (keyof typeof phases)[]
  }> = [
    { id: 'labor_mason',       description: 'Masons (Foundation & Structural)',  tradeCategory: 'mason',       skillLevel: 'skilled',    baseCrewSize: 4, phaseKeys: ['foundation', 'structural'] },
    { id: 'labor_carpenter',   description: 'Carpenters (Formwork & Joinery)',   tradeCategory: 'carpenter',   skillLevel: 'skilled',    baseCrewSize: 3, phaseKeys: ['structural', 'interior'] },
    { id: 'labor_electrician', description: 'Electricians (MEP Installation)',   tradeCategory: 'electrician', skillLevel: 'skilled',    baseCrewSize: 3, phaseKeys: ['mep'] },
    { id: 'labor_plumber',     description: 'Plumbers (Sanitary & Water)',       tradeCategory: 'plumber',     skillLevel: 'skilled',    baseCrewSize: 2, phaseKeys: ['mep'] },
    { id: 'labor_painter',     description: 'Painters (Interior & Exterior)',    tradeCategory: 'painter',     skillLevel: 'skilled',    baseCrewSize: 3, phaseKeys: ['interior', 'exterior'] },
    { id: 'labor_roofer',      description: 'Roofers (Roof Installation)',       tradeCategory: 'roofer',      skillLevel: 'skilled',    baseCrewSize: 3, phaseKeys: ['exterior'] },
    { id: 'labor_tiler',       description: 'Tilers (Floor & Wall Finishes)',    tradeCategory: 'tiler',       skillLevel: 'skilled',    baseCrewSize: 3, phaseKeys: ['interior'] },
    { id: 'labor_welder',      description: 'Welders (Steel & Gates)',           tradeCategory: 'welder',      skillLevel: 'skilled',    baseCrewSize: 2, phaseKeys: ['structural', 'exterior', 'landscaping'] },
    { id: 'labor_laborer',     description: 'General Laborers (All Phases)',     tradeCategory: 'laborer',     skillLevel: 'unskilled',  baseCrewSize: 6, phaseKeys: ['foundation', 'structural', 'exterior', 'mep', 'interior', 'landscaping'] },
    { id: 'labor_foreman',     description: 'Site Foreman',                     tradeCategory: 'foreman',     skillLevel: 'master',     baseCrewSize: 1, phaseKeys: ['supervision'] },
    { id: 'labor_supervisor',  description: 'Project Supervisor',               tradeCategory: 'supervisor',  skillLevel: 'master',     baseCrewSize: 1, phaseKeys: ['supervision'] },
  ]

  const items: ComputedLineItem[] = laborItems.map(item => {
    const dailyRate = getRate(item.tradeCategory, item.skillLevel) * regionMult
    // Working days = sum of phase duration fractions × total working days
    const phaseFraction = item.phaseKeys.reduce((s, k) => s + phases[k], 0)
    const workingDays = Math.round(totalWorkingDays * phaseFraction)
    // Supervision stays fixed; other trades scale with GFA
    const crewSize = item.phaseKeys.includes('supervision')
      ? item.baseCrewSize
      : Math.max(1, Math.round(item.baseCrewSize * crewScale))
    // No floor area → no labor (estimateConstructionPeriod returns a fixed 8-month
    // minimum and crewScale floors at 1, so this would otherwise bill full crews for
    // 8 months with GFA = 0).
    const quantity = gfa > 0 ? crewSize * workingDays : 0 // man-days
    const total = quantity * dailyRate
    return {
      id: item.id,
      description: item.description,
      unit: 'm-day',
      quantity,
      unitRate: Math.round(dailyRate * 100) / 100,
      total,
    }
  })

  const subtotal = items.reduce((s, i) => s + i.total, 0)
  return {
    id: 'labor',
    name: 'Labor & Workforce',
    icon: Users,
    items,
    subtotal,
    percentOfTotal: 0,
  }
}

// ═══════════════════════════════════════════════════════════════════
//  K P I   C A R D
// ═══════════════════════════════════════════════════════════════════

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#161B22', border: '1px solid #21262D' }} className="p-4">
      <div style={{ fontFamily: 'Inter, sans-serif', color: '#8B949E', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', color: '#C9A84C', fontSize: 20, marginTop: 4, fontWeight: 600 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: '"JetBrains Mono", monospace', color: '#484F58', fontSize: 11, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  A S S U M P T I O N S   P A N E L   (Sheet overlay)
// ═══════════════════════════════════════════════════════════════════

function AssumptionsPanel({
  fees,
  contingencies,
  financial,
  hardCost,
  marketData,
  projectType,
  specTier,
  region,
  onFeesChange,
  onContingencyChange,
  onFinancialChange,
  onReset,
  currency,
}: {
  fees: FeeItem[]
  contingencies: ContingencyItem[]
  financial: FinancialAssumption[]
  hardCost: number
  marketData: MarketData | null
  projectType: string
  specTier: string
  region: string
  onFeesChange: (fees: FeeItem[]) => void
  onContingencyChange: (c: ContingencyItem[]) => void
  onFinancialChange: (f: FinancialAssumption[]) => void
  onReset: () => void
  currency: Currency
}) {
  const updateFee = (id: string, pct: number) => {
    onFeesChange(fees.map((f) => (f.id === id ? { ...f, percentage: pct } : f)))
  }
  const updateContingency = (id: string, pct: number) => {
    onContingencyChange(contingencies.map((c) => (c.id === id ? { ...c, percentage: pct } : c)))
  }
  const updateFinancial = (id: string, val: number) => {
    onFinancialChange(financial.map((f) => (f.id === id ? { ...f, value: val } : f)))
  }

  const totalFeePct = fees.reduce((s, f) => s + f.percentage, 0)
  const totalContPct = contingencies.reduce((s, c) => s + c.percentage, 0)

  // ── Derive market data summaries ──
  const ptDef = PROJECT_TYPES.find(p => p.value === projectType)
  const baseCost = ptDef && marketData?.base_costs?.[ptDef.baseCostKey] ? marketData.base_costs[ptDef.baseCostKey] : null
  const constructionIdx = marketData?.construction_index
  const regionMult = marketData?.regional_multipliers?.find(r => r.region === region || r.region === REGIONS.find(rr => rr.value === region)?.value)

  // Group material prices by category for index display
  const materialsByCategory = useMemo(() => {
    if (!marketData?.material_prices?.length) return []
    const grouped: Record<string, { name: string; price_ghs: number; change: number | null; unit: string }[]> = {}
    for (const m of marketData.material_prices) {
      if (!grouped[m.category]) grouped[m.category] = []
      grouped[m.category].push({ name: m.name, price_ghs: m.price_ghs, change: m.price_change_percent, unit: m.unit })
    }
    return Object.entries(grouped).map(([cat, items]) => {
      const avgChange = items.filter(i => i.change !== null).reduce((s, i) => s + (i.change ?? 0), 0) / Math.max(1, items.filter(i => i.change !== null).length)
      return { category: cat, items, avgChange }
    }).sort((a, b) => a.category.localeCompare(b.category))
  }, [marketData?.material_prices])

  // Group labor rates by skill level
  const laborBySkill = useMemo(() => {
    if (!marketData?.labor_rates?.length) return { skilled: 0, unskilled: 0, skilledChange: 0, unskilledChange: 0 }
    const skilled = marketData.labor_rates.filter(r => ['master', 'skilled'].includes(r.skill_level?.toLowerCase()))
    const unskilled = marketData.labor_rates.filter(r => ['semi_skilled', 'unskilled', 'apprentice'].includes(r.skill_level?.toLowerCase()) || r.category === 'general_laborer')
    const avgRate = (arr: typeof skilled) => arr.length ? arr.reduce((s, r) => s + r.daily_rate_ghs, 0) / arr.length : 0
    const avgChange = (arr: typeof skilled) => {
      const withChange = arr.filter(r => r.rate_change_percent !== null)
      return withChange.length ? withChange.reduce((s, r) => s + (r.rate_change_percent ?? 0), 0) / withChange.length : 0
    }
    return { skilled: Math.round(avgRate(skilled)), unskilled: Math.round(avgRate(unskilled)), skilledChange: avgChange(skilled), unskilledChange: avgChange(unskilled) }
  }, [marketData?.labor_rates])

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0D1117', color: '#C9D1D9' }}>
      <div className="p-6 space-y-8">
        {/* Reset */}
        <div className="flex justify-end">
          <button
            onClick={onReset}
            style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#C9A84C', display: 'flex', alignItems: 'center', gap: 4 }}
            className="hover:opacity-80 transition-opacity"
          >
            <RotateCcw size={12} /> Reset to Defaults
          </button>
        </div>

        {/* ═══ Construction Cost Index ═══ */}
        {constructionIdx && (
          <div>
            <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 16, color: '#C9A84C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} /> Construction Cost Index
            </div>
            <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', padding: 16, marginBottom: 12 }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 28, color: '#C9A84C', fontWeight: 700 }}>
                    {constructionIdx.value.toFixed(1)}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
                    BASE: {constructionIdx.base_value} ({new Date(constructionIdx.period).getFullYear()})
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {constructionIdx.change_yoy !== null && constructionIdx.change_yoy !== 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      {constructionIdx.change_yoy > 0 ? <TrendingUp size={12} style={{ color: '#f87171' }} /> : <TrendingDown size={12} style={{ color: '#4ade80' }} />}
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: constructionIdx.change_yoy > 0 ? '#f87171' : '#4ade80' }}>
                        {constructionIdx.change_yoy > 0 ? '+' : ''}{constructionIdx.change_yoy.toFixed(1)}% YoY
                      </span>
                    </div>
                  )}
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', marginTop: 4 }}>
                    {constructionIdx.source}
                  </div>
                </div>
              </div>

              {/* Sub-indices: Material & Labor */}
              <div className="grid grid-cols-2 gap-3" style={{ borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: 12 }}>
                <div style={{ background: '#161B22', padding: '10px 12px', border: '1px solid #21262D' }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    Material Index
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, color: '#C9D1D9', fontWeight: 700 }}>
                    {constructionIdx.material_index.toFixed(1)}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>55% weight</div>
                </div>
                <div style={{ background: '#161B22', padding: '10px 12px', border: '1px solid #21262D' }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    Labor Index
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, color: '#C9D1D9', fontWeight: 700 }}>
                    {constructionIdx.labor_index.toFixed(1)}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>30% weight</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Base Cost Breakdown ═══ */}
        {baseCost && (
          <div>
            <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 16, color: '#C9A84C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={16} /> Base Cost Breakdown
            </div>
            <div style={{ background: '#161B22', border: '1px solid #21262D', padding: 16 }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8B949E' }}>
                  {ptDef?.label} — {SPEC_TIERS.find(s => s.value === specTier)?.label ?? specTier}
                </span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, color: '#C9A84C', fontWeight: 700 }}>
                  GH₵{fmt(baseCost.cost_ghs, 0)}/sqm
                </span>
              </div>

              {/* Cost composition bar */}
              <div style={{ height: 8, display: 'flex', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${baseCost.material_pct}%`, background: '#3b82f6' }} title={`Materials: ${baseCost.material_pct}%`} />
                <div style={{ width: `${baseCost.labor_pct}%`, background: '#f59e0b' }} title={`Labor: ${baseCost.labor_pct}%`} />
                <div style={{ width: `${100 - baseCost.material_pct - baseCost.labor_pct}%`, background: '#6b7280' }} title={`Overhead: ${100 - baseCost.material_pct - baseCost.labor_pct}%`} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materials</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, color: '#C9D1D9', fontWeight: 600 }}>{baseCost.material_pct}%</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58' }}>GH₵{fmt(baseCost.cost_ghs * baseCost.material_pct / 100, 0)}/sqm</div>
                </div>
                <div className="text-center">
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Labor</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, color: '#C9D1D9', fontWeight: 600 }}>{baseCost.labor_pct}%</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58' }}>GH₵{fmt(baseCost.cost_ghs * baseCost.labor_pct / 100, 0)}/sqm</div>
                </div>
                <div className="text-center">
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overhead</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, color: '#C9D1D9', fontWeight: 600 }}>{100 - baseCost.material_pct - baseCost.labor_pct}%</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58' }}>GH₵{fmt(baseCost.cost_ghs * (100 - baseCost.material_pct - baseCost.labor_pct) / 100, 0)}/sqm</div>
                </div>
              </div>

              {regionMult && (
                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #21262D' }}>
                  <Layers size={12} style={{ color: '#C9A84C' }} />
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#8B949E' }}>
                    Region Multiplier: <span style={{ color: '#C9D1D9', fontWeight: 600 }}>×{regionMult.value?.toFixed(3)}</span>
                    {' '}(Mat: ×{regionMult.material_multiplier?.toFixed(2)} | Lab: ×{regionMult.labor_multiplier?.toFixed(2)})
                  </span>
                </div>
              )}

              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', marginTop: 8 }}>
                Source: {baseCost.source} • PROPMETRIK Data Hub
              </div>
            </div>
          </div>
        )}

        {/* ═══ Material Price Benchmarks ═══ */}
        {materialsByCategory.length > 0 && (
          <div>
            <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 16, color: '#C9A84C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} /> Material Price Benchmarks
            </div>
            <div style={{ background: '#161B22', border: '1px solid #21262D', padding: 12 }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Greater Accra Reference Prices
              </div>
              <div className="space-y-1">
                {materialsByCategory.map(({ category, items, avgChange }) => (
                  <div key={category}>
                    <div className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid #0D1117' }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#C9D1D9', fontWeight: 600, textTransform: 'capitalize' }}>
                        {category.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-2">
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#8B949E' }}>
                          {items.length} item{items.length !== 1 ? 's' : ''}
                        </span>
                        {avgChange !== 0 && (
                          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: avgChange > 0 ? '#f87171' : '#4ade80', display: 'flex', alignItems: 'center', gap: 2 }}>
                            {avgChange > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                            {avgChange > 0 ? '+' : ''}{avgChange.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {items.slice(0, 2).map((item, j) => (
                      <div key={j} className="flex items-center justify-between" style={{ padding: '2px 0 2px 12px' }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#8B949E' }}>{item.name}</span>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#C9D1D9' }}>
                          GH₵{fmt(item.price_ghs, 0)}/{item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Labor Rate Benchmarks ═══ */}
        {(laborBySkill.skilled > 0 || laborBySkill.unskilled > 0) && (
          <div>
            <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 16, color: '#C9A84C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Hammer size={16} /> Labor Rate Index
            </div>
            <div style={{ background: '#161B22', border: '1px solid #21262D', padding: 16 }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center" style={{ background: '#0D1117', padding: '12px 8px', border: '1px solid #21262D' }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Skilled Labor
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 20, color: '#C9D1D9', fontWeight: 700, margin: '4px 0' }}>
                    GH₵{laborBySkill.skilled}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58' }}>per day</div>
                  {laborBySkill.skilledChange !== 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 4 }}>
                      {laborBySkill.skilledChange > 0 ? <TrendingUp size={10} style={{ color: '#f87171' }} /> : <TrendingDown size={10} style={{ color: '#4ade80' }} />}
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: laborBySkill.skilledChange > 0 ? '#f87171' : '#4ade80' }}>
                        {laborBySkill.skilledChange > 0 ? '+' : ''}{laborBySkill.skilledChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-center" style={{ background: '#0D1117', padding: '12px 8px', border: '1px solid #21262D' }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Unskilled Labor
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 20, color: '#C9D1D9', fontWeight: 700, margin: '4px 0' }}>
                    GH₵{laborBySkill.unskilled}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58' }}>per day</div>
                  {laborBySkill.unskilledChange !== 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 4 }}>
                      {laborBySkill.unskilledChange > 0 ? <TrendingUp size={10} style={{ color: '#f87171' }} /> : <TrendingDown size={10} style={{ color: '#4ade80' }} />}
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: laborBySkill.unskilledChange > 0 ? '#f87171' : '#4ade80' }}>
                        {laborBySkill.unskilledChange > 0 ? '+' : ''}{laborBySkill.unskilledChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed labor rates by trade */}
              {marketData?.labor_rates && marketData.labor_rates.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid #21262D' }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    Rates by Trade (Greater Accra)
                  </div>
                  <div className="grid grid-cols-2 gap-x-6">
                    {marketData.labor_rates.slice(0, 12).map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid #0D1117' }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#8B949E', textTransform: 'capitalize' }}>
                          {r.category.replace(/_/g, ' ')}
                          <span style={{ fontSize: 8, color: '#484F58', marginLeft: 4 }}>({r.skill_level})</span>
                        </span>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#C9D1D9' }}>
                          GH₵{fmt(r.daily_rate_ghs, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', marginTop: 8 }}>
                Source: PROPMETRIK Data Hub • labor_rates table
              </div>
            </div>
          </div>
        )}

        {/* Professional Fees */}
        <div>
          <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 16, color: '#C9A84C', marginBottom: 16 }}>
            Professional Fees
          </div>
          <div className="space-y-3">
            {fees.map((f) => {
              const amount = hardCost * (f.percentage / 100)
              return (
                <div key={f.id} className="flex items-center justify-between gap-3">
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8B949E', flex: 1 }}>{f.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={25}
                      value={f.percentage}
                      onChange={(e) => updateFee(f.id, parseFloat(e.target.value) || 0)}
                      style={{
                        width: 60, background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 12, padding: '4px 8px', textAlign: 'right',
                      }}
                    />
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#484F58', width: 16 }}>%</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#58A6FF', width: 100, textAlign: 'right' }}>
                      {fmtCurrency(amount, currency)}
                    </span>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #21262D' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#C9D1D9', fontWeight: 600 }}>Total Professional Fees</span>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9A84C', fontWeight: 600 }}>
                  {totalFeePct.toFixed(1)}%
                </span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9A84C', fontWeight: 600, width: 100, textAlign: 'right' }}>
                  {fmtCurrency(hardCost * (totalFeePct / 100), currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Contingency */}
        <div>
          <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 16, color: '#C9A84C', marginBottom: 16 }}>
            Contingency Settings
          </div>
          <div className="space-y-3">
            {contingencies.map((c) => {
              const amount = hardCost * (c.percentage / 100)
              return (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8B949E', flex: 1 }}>{c.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={25}
                      value={c.percentage}
                      onChange={(e) => updateContingency(c.id, parseFloat(e.target.value) || 0)}
                      style={{
                        width: 60, background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 12, padding: '4px 8px', textAlign: 'right',
                      }}
                    />
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#484F58', width: 16 }}>%</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#58A6FF', width: 100, textAlign: 'right' }}>
                      {fmtCurrency(amount, currency)}
                    </span>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #21262D' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#C9D1D9', fontWeight: 600 }}>Total Contingency</span>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9A84C', fontWeight: 600 }}>
                  {totalContPct.toFixed(1)}%
                </span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9A84C', fontWeight: 600, width: 100, textAlign: 'right' }}>
                  {fmtCurrency(hardCost * (totalContPct / 100), currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Assumptions */}
        <div>
          <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 16, color: '#C9A84C', marginBottom: 16 }}>
            Financial Assumptions
          </div>
          <div className="space-y-3">
            {financial.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3">
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8B949E', flex: 1 }}>{f.name}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={f.unit === 'months' ? 1 : 0.5}
                    min={0}
                    value={f.value}
                    onChange={(e) => updateFinancial(f.id, parseFloat(e.target.value) || 0)}
                    style={{
                      width: 70, background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                      fontFamily: '"JetBrains Mono", monospace', fontSize: 12, padding: '4px 8px', textAlign: 'right',
                    }}
                  />
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#484F58', width: 60 }}>
                    {f.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  C O N S T R U C T I O N   C O S T S   P A N E L
// ═══════════════════════════════════════════════════════════════════

function ConstructionCostsPanel({
  categories,
  rateOverrides,
  onRateChange,
  onResetRates,
  currency,
  marketData,
  materialPriceOverrides,
  onMaterialPriceChange,
  onResetMaterialPrices,
  projectType,
  region,
  specTier,
}: {
  categories: ComputedCategory[]
  rateOverrides: Record<string, number>
  onRateChange: (itemId: string, rate: number) => void
  onResetRates: () => void
  currency: Currency
  marketData: MarketData | null
  materialPriceOverrides: Record<string, number>
  onMaterialPriceChange: (key: string, price: number) => void
  onResetMaterialPrices: () => void
  projectType: string
  region: string
  specTier: string
}) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [showAllMaterials, setShowAllMaterials] = useState(false)

  const totalHardCost = categories.reduce((s, c) => s + c.subtotal, 0)

  // All material prices from Data Hub, sorted by priority
  const allMaterials = useMemo(() => {
    if (!marketData?.material_prices?.length) return []
    const priority = ['cement', 'steel', 'blocks', 'roofing', 'timber', 'sand', 'gravel', 'paint', 'plumbing', 'glass', 'tiles', 'electrical']
    return [...marketData.material_prices].sort((a, b) => {
      const ai = priority.indexOf(a.category); const bi = priority.indexOf(b.category)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [marketData?.material_prices])

  // How many overrides exist
  const materialOverrideCount = Object.keys(materialPriceOverrides).length

  // Effective cost/sqm from Data Hub
  const effectiveCost = useMemo(() => {
    if (!marketData?.base_costs) return null
    const ptDef = PROJECT_TYPES.find(p => p.value === projectType)
    if (!ptDef) return null
    const bKey = ptDef.baseCostKey
    const baseCostEntry = marketData.base_costs[bKey]
    if (!baseCostEntry) return null

    const regionEntry = marketData.regional_multipliers?.find(r => r.region === region)
    const regionFactor = regionEntry?.value ?? 1

    // Compute adjusted base cost from material price overrides
    let adjustedCost = baseCostEntry.cost_ghs
    if (materialOverrideCount > 0 && allMaterials.length > 0) {
      const materialPct = (baseCostEntry.material_pct ?? 55) / 100
      const laborPct = (baseCostEntry.labor_pct ?? 30) / 100
      const otherPct = 1 - materialPct - laborPct
      let originalSum = 0; let adjustedSum = 0
      for (const m of allMaterials) {
        const key = `${m.category}__${m.name}`
        originalSum += m.price_ghs
        adjustedSum += materialPriceOverrides[key] ?? m.price_ghs
      }
      const materialChangeFactor = originalSum > 0 ? adjustedSum / originalSum : 1
      adjustedCost = baseCostEntry.cost_ghs * (materialPct * materialChangeFactor + laborPct + otherPct)
    }

    return {
      baseCost: baseCostEntry.cost_ghs,
      adjustedCost: Math.round(adjustedCost),
      effectiveCost: Math.round(adjustedCost * regionFactor),
      regionFactor,
      materialPct: baseCostEntry.material_pct ?? 55,
      laborPct: baseCostEntry.labor_pct ?? 30,
      otherPct: 100 - (baseCostEntry.material_pct ?? 55) - (baseCostEntry.labor_pct ?? 30),
      source: baseCostEntry.source,
    }
  }, [marketData, projectType, region, materialPriceOverrides, materialOverrideCount, allMaterials])

  // Tier costs for display
  const tierCosts = useMemo(() => {
    if (!marketData?.base_costs) return null
    const ptDef = PROJECT_TYPES.find(p => p.value === projectType)
    if (!ptDef) return null
    const prefix = ptDef.baseCostKey.replace(/_standard$/, '')
    const tiers = ['basic', 'standard', 'premium', 'luxury']
    const regionFactor = marketData.regional_multipliers?.find(r => r.region === region)?.value ?? 1
    return tiers.map(t => {
      const entry = marketData.base_costs[`${prefix}_${t}`]
      return {
        tier: t,
        baseCost: entry?.cost_ghs ?? 0,
        adjustedCost: Math.round((entry?.cost_ghs ?? 0) * regionFactor),
        isActive: specTier === t,
      }
    }).filter(t => t.baseCost > 0)
  }, [marketData, projectType, region, specTier])

  const regionLabel = REGIONS.find(r => r.value === region)?.label ?? region
  const visibleMaterials = showAllMaterials ? allMaterials : allMaterials.slice(0, 8)

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0D1117', color: '#C9D1D9' }}>
      <div className="p-6 space-y-4">
        {/* Header with reset actions */}
        <div className="flex items-center justify-between">
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#484F58' }}>
            Adjust base material prices to recalculate construction costs.
          </p>
          <div className="flex items-center gap-3">
            {materialOverrideCount > 0 && (
              <button
                onClick={onResetMaterialPrices}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4 }}
                className="hover:opacity-80 transition-opacity flex-shrink-0"
              >
                <RotateCcw size={10} /> Reset Prices
              </button>
            )}
            <button
              onClick={onResetRates}
              style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#C9A84C', display: 'flex', alignItems: 'center', gap: 4 }}
              className="hover:opacity-80 transition-opacity flex-shrink-0"
            >
              <RotateCcw size={12} /> Reset Rates
            </button>
          </div>
        </div>

        {/* ═══ Effective Cost / sqm ═══ */}
        {effectiveCost && (
          <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', padding: 16 }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Effective Cost / sqm
                </div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 28, color: '#C9D1D9', fontWeight: 700 }}>
                  GH₵{fmt(effectiveCost.effectiveCost, 0)}
                </div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
                  {SPEC_TIERS.find(s => s.value === specTier)?.label ?? specTier} tier × {regionLabel} factor ({effectiveCost.regionFactor.toFixed(2)})
                </div>
                {materialOverrideCount > 0 && (
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#3b82f6', marginTop: 2 }}>
                    <PencilLine size={9} style={{ display: 'inline', marginRight: 3 }} />
                    {materialOverrideCount} material price{materialOverrideCount !== 1 ? 's' : ''} adjusted (base: GH₵{fmt(effectiveCost.baseCost, 0)} → GH₵{fmt(effectiveCost.adjustedCost, 0)}/sqm)
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Source: {effectiveCost.source === 'database' ? 'Data Hub' : effectiveCost.source}
                </div>
              </div>
            </div>

            {/* Composition bar */}
            <div style={{ display: 'flex', height: 6, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{ width: `${effectiveCost.materialPct}%`, background: '#3b82f6' }} title={`Material: ${effectiveCost.materialPct}%`} />
              <div style={{ width: `${effectiveCost.laborPct}%`, background: '#f59e0b' }} title={`Labor: ${effectiveCost.laborPct}%`} />
              <div style={{ width: `${effectiveCost.otherPct}%`, background: '#484F58' }} title={`Other: ${effectiveCost.otherPct}%`} />
            </div>
            <div className="flex items-center gap-4" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#8B949E' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#3b82f6', marginRight: 4, verticalAlign: 'middle' }} />Material {effectiveCost.materialPct}%</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#f59e0b', marginRight: 4, verticalAlign: 'middle' }} />Labor {effectiveCost.laborPct}%</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#484F58', marginRight: 4, verticalAlign: 'middle' }} />Other {effectiveCost.otherPct}%</span>
            </div>
          </div>
        )}

        {/* ═══ Quality Tier Cards ═══ */}
        {tierCosts && tierCosts.length > 0 && (
          <div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Base Cost by Quality Tier ({regionLabel})
            </div>
            <div className="grid grid-cols-4 gap-2">
              {tierCosts.map(t => (
                <div
                  key={t.tier}
                  className="text-center"
                  style={{
                    padding: '8px 4px',
                    background: t.isActive ? 'rgba(201,168,76,0.1)' : '#161B22',
                    border: `1px solid ${t.isActive ? '#C9A84C' : '#21262D'}`,
                  }}
                >
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: t.isActive ? '#C9A84C' : '#484F58', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t.tier}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, color: t.isActive ? '#C9A84C' : '#C9D1D9', fontWeight: 700 }}>
                    ₵{fmt(t.adjustedCost, 0)}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#484F58' }}>
                    /sqm
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Editable Material Prices (Data Hub) ═══ */}
        {allMaterials.length > 0 && (
          <div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={12} style={{ color: '#3b82f6' }} />
              Material Prices — {regionLabel}
              {materialOverrideCount > 0 && (
                <span style={{ background: '#3b82f6', color: '#0D1117', padding: '1px 6px', fontWeight: 700, fontSize: 9 }}>
                  {materialOverrideCount} EDITED
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0">
              {visibleMaterials.map((m) => {
                const key = `${m.category}__${m.name}`
                const isOverridden = materialPriceOverrides[key] !== undefined
                const displayPrice = materialPriceOverrides[key] ?? m.price_ghs
                return (
                  <div key={key} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #161B22' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 0', minWidth: 0 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: isOverridden ? '#C9D1D9' : '#8B949E', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name.replace(/_/g, ' ')}
                        {isOverridden && <PencilLine size={9} style={{ marginLeft: 3, display: 'inline', color: '#3b82f6' }} />}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58', marginRight: 2 }}>₵</span>
                        <input
                          type="number"
                          step={1}
                          min={0}
                          value={Math.round(displayPrice)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value)
                            if (!isNaN(val)) onMaterialPriceChange(key, val)
                          }}
                          style={{
                            width: 64, background: isOverridden ? 'rgba(59,130,246,0.08)' : '#161B22',
                            border: `1px solid ${isOverridden ? '#3b82f6' : '#21262D'}`, color: isOverridden ? '#3b82f6' : '#C9D1D9',
                            fontFamily: '"JetBrains Mono", monospace', fontSize: 10, padding: '2px 4px', textAlign: 'right',
                          }}
                        />
                      </div>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', width: 38, textAlign: 'left' }}>
                        /{m.unit}
                      </span>
                      {m.price_change_percent !== null && m.price_change_percent !== 0 && (
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: (m.price_change_percent ?? 0) > 0 ? '#f87171' : '#4ade80', width: 36, textAlign: 'right' }}>
                          {(m.price_change_percent ?? 0) > 0 ? '+' : ''}{m.price_change_percent?.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {allMaterials.length > 8 && (
              <button
                onClick={() => setShowAllMaterials(!showAllMaterials)}
                style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#3b82f6', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}
                className="hover:opacity-80 transition-opacity"
              >
                {showAllMaterials ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {showAllMaterials ? 'Show less' : `Show all ${allMaterials.length} materials`}
              </button>
            )}
          </div>
        )}

        {/* ═══ Total hard cost summary ═══ */}
        <div style={{ background: '#161B22', border: '1px solid #21262D', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8B949E' }}>Total Hard Construction Cost</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 16, color: '#C9A84C', fontWeight: 700 }}>
            {fmtCurrency(totalHardCost, currency)}
          </span>
        </div>

        {/* ═══ Category accordion ═══ */}
        <div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Itemized Breakdown (editable unit rates)
          </div>
        {categories.map((cat) => {
          const isExpanded = expandedCat === cat.id
          const overrideCount = cat.items.filter((i) => rateOverrides[i.id] !== undefined).length
          return (
            <div key={cat.id} style={{ border: '1px solid #21262D', background: '#0D1117', marginBottom: 4 }}>
              {/* Category row */}
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                style={{
                  width: '100%', padding: '10px 16px', background: isExpanded ? '#161B22' : 'transparent',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', color: '#C9D1D9',
                }}
                className="hover:bg-[#161B22] transition-colors"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isExpanded ? <ChevronDown size={14} style={{ color: '#C9A84C' }} /> : <ChevronRight size={14} style={{ color: '#484F58' }} />}
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>{cat.name}</span>
                  {overrideCount > 0 && (
                    <span style={{ fontSize: 9, background: '#C9A84C', color: '#0D1117', padding: '1px 6px', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                      {overrideCount} EDITED
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9A84C', fontWeight: 600 }}>
                  {fmtCurrency(cat.subtotal, currency)}
                </span>
              </button>

              {/* Expanded line items */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #21262D' }}>
                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 100px', padding: '6px 16px', background: '#0A0E14' }}>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Description</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Unit</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Qty</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Unit Rate</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Total</span>
                  </div>

                  {cat.items.map((item) => {
                    const isOverridden = rateOverrides[item.id] !== undefined
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 100px',
                          padding: '8px 16px', borderTop: '1px solid #161B22', alignItems: 'center',
                        }}
                      >
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: isOverridden ? '#C9D1D9' : '#8B949E' }}>
                          {item.description}
                          {isOverridden && <PencilLine size={10} style={{ marginLeft: 4, display: 'inline', color: '#C9A84C' }} />}
                        </span>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#484F58', textAlign: 'center' }}>{item.unit}</span>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#8B949E', textAlign: 'right' }}>{fmt(item.quantity, item.quantity % 1 === 0 ? 0 : 1)}</span>
                        <div style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            step={10}
                            min={0}
                            value={Math.round(item.unitRate)}
                            onChange={(e) => onRateChange(item.id, parseFloat(e.target.value) || 0)}
                            style={{
                              width: 72, background: isOverridden ? 'rgba(201,168,76,0.08)' : '#161B22',
                              border: `1px solid ${isOverridden ? '#C9A84C' : '#21262D'}`, color: isOverridden ? '#C9A84C' : '#C9D1D9',
                              fontFamily: '"JetBrains Mono", monospace', fontSize: 11, padding: '3px 6px', textAlign: 'right',
                            }}
                          />
                        </div>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#C9D1D9', textAlign: 'right' }}>
                          {fmtCurrency(item.total, currency)}
                        </span>
                      </div>
                    )
                  })}

                  {/* Category subtotal */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', padding: '8px 16px',
                    borderTop: '1px solid #21262D', background: '#161B22',
                  }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#8B949E', fontWeight: 600 }}>Subtotal</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9A84C', fontWeight: 700 }}>
                      {fmtCurrency(cat.subtotal, currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        </div>

        {/* Source footer */}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #21262D' }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
            Source: PROPMETRIK Data Hub • material_prices, base_costs_per_sqm
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
            {marketData?.generated_at ? new Date(marketData.generated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  L A B O R   R A T E S   P A N E L
// ═══════════════════════════════════════════════════════════════════

function LaborRatesPanel({
  marketData,
  currency,
}: {
  marketData: MarketData | null
  currency: Currency
}) {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)

  // Group labor rates by category (trade)
  const byTrade = useMemo(() => {
    if (!marketData?.labor_rates?.length) return []
    const grouped: Record<string, typeof marketData.labor_rates> = {}
    for (const r of marketData.labor_rates) {
      if (!grouped[r.category]) grouped[r.category] = []
      grouped[r.category].push(r)
    }
    return Object.entries(grouped).map(([trade, rates]) => {
      const avgRate = rates.reduce((s, r) => s + r.daily_rate_ghs, 0) / rates.length
      const avgChange = rates.filter(r => r.rate_change_percent !== null).length > 0
        ? rates.filter(r => r.rate_change_percent !== null).reduce((s, r) => s + (r.rate_change_percent ?? 0), 0) / rates.filter(r => r.rate_change_percent !== null).length
        : null
      return { trade, rates, avgRate, avgChange }
    }).sort((a, b) => b.avgRate - a.avgRate)
  }, [marketData?.labor_rates])

  // Summary stats
  const stats = useMemo(() => {
    if (!marketData?.labor_rates?.length) return null
    const skilled = marketData.labor_rates.filter(r => ['master', 'skilled'].includes(r.skill_level?.toLowerCase()))
    const unskilled = marketData.labor_rates.filter(r => ['semi_skilled', 'unskilled', 'apprentice'].includes(r.skill_level?.toLowerCase()) || r.category === 'general_laborer')
    const avgS = skilled.length ? skilled.reduce((s, r) => s + r.daily_rate_ghs, 0) / skilled.length : 0
    const avgU = unskilled.length ? unskilled.reduce((s, r) => s + r.daily_rate_ghs, 0) / unskilled.length : 0
    const allChanges = marketData.labor_rates.filter(r => r.rate_change_percent !== null)
    const avgChange = allChanges.length ? allChanges.reduce((s, r) => s + (r.rate_change_percent ?? 0), 0) / allChanges.length : 0
    return { skilled: Math.round(avgS), unskilled: Math.round(avgU), avgChange, totalTrades: byTrade.length, totalRates: marketData.labor_rates.length }
  }, [marketData?.labor_rates, byTrade])

  // Labor index from construction index
  const laborIndex = marketData?.construction_index?.labor_index
  const laborIndexChange = marketData?.construction_index?.change_yoy

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#0D1117', color: '#C9D1D9' }}>
      <div className="p-6 space-y-4">
        {/* Labor Index summary */}
        {laborIndex !== undefined && (
          <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', padding: 16 }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Labor Cost Index
                </div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 28, color: '#C9D1D9', fontWeight: 700 }}>
                  {laborIndex.toFixed(1)}
                </div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
                  Base: 100 ({marketData?.construction_index?.source ?? 'Data Hub'})
                </div>
              </div>
              <div className="text-right">
                {laborIndexChange !== null && laborIndexChange !== undefined && laborIndexChange !== 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    {laborIndexChange > 0 ? <TrendingUp size={12} style={{ color: '#f87171' }} /> : <TrendingDown size={12} style={{ color: '#4ade80' }} />}
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: laborIndexChange > 0 ? '#f87171' : '#4ade80' }}>
                      {laborIndexChange > 0 ? '+' : ''}{laborIndexChange.toFixed(1)}% YoY
                    </span>
                  </div>
                )}
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', marginTop: 4 }}>
                  30% weight in composite index
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center" style={{ background: '#161B22', padding: '12px 8px', border: '1px solid #21262D' }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Skilled
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, color: '#C9D1D9', fontWeight: 700 }}>
                GH₵{stats.skilled}
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>per day</div>
            </div>
            <div className="text-center" style={{ background: '#161B22', padding: '12px 8px', border: '1px solid #21262D' }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Unskilled
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, color: '#C9D1D9', fontWeight: 700 }}>
                GH₵{stats.unskilled}
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>per day</div>
            </div>
            <div className="text-center" style={{ background: '#161B22', padding: '12px 8px', border: '1px solid #21262D' }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Avg Change
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, color: stats.avgChange > 0 ? '#f87171' : stats.avgChange < 0 ? '#4ade80' : '#C9D1D9', fontWeight: 700 }}>
                {stats.avgChange > 0 ? '+' : ''}{stats.avgChange.toFixed(1)}%
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>YoY</div>
            </div>
          </div>
        )}

        {/* Rates by Trade */}
        <div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Daily Rates by Trade — Greater Accra
          </div>
          {byTrade.map(({ trade, rates, avgRate, avgChange }) => {
            const isExpanded = expandedSkill === trade
            return (
              <div key={trade} style={{ border: '1px solid #21262D', background: '#0D1117', marginBottom: 4 }}>
                <button
                  onClick={() => setExpandedSkill(isExpanded ? null : trade)}
                  style={{
                    width: '100%', padding: '8px 14px', background: isExpanded ? '#161B22' : 'transparent',
                    border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', color: '#C9D1D9',
                  }}
                  className="hover:bg-[#161B22] transition-colors"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isExpanded ? <ChevronDown size={12} style={{ color: '#f59e0b' }} /> : <ChevronRight size={12} style={{ color: '#484F58' }} />}
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                      {trade.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58' }}>
                      ({rates.length} level{rates.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                      GH₵{fmt(avgRate, 0)}/day
                    </span>
                    {avgChange !== null && avgChange !== 0 && (
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: avgChange > 0 ? '#f87171' : '#4ade80', display: 'flex', alignItems: 'center', gap: 2 }}>
                        {avgChange > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                        {avgChange > 0 ? '+' : ''}{avgChange.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #21262D', padding: '4px 14px 8px' }}>
                    {rates.map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-1" style={{ borderBottom: i < rates.length - 1 ? '1px solid #161B22' : 'none' }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#8B949E', textTransform: 'capitalize' }}>
                          {r.skill_level.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-3">
                          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#C9D1D9' }}>
                            GH₵{fmt(r.daily_rate_ghs, 0)}/day
                          </span>
                          {r.rate_change_percent !== null && r.rate_change_percent !== 0 && (
                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: (r.rate_change_percent ?? 0) > 0 ? '#f87171' : '#4ade80' }}>
                              {(r.rate_change_percent ?? 0) > 0 ? '+' : ''}{r.rate_change_percent?.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Source footer */}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #21262D' }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
            Source: PROPMETRIK Data Hub • labor_rates table
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
            {marketData?.generated_at ? new Date(marketData.generated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </span>
        </div>

        {/* No data state */}
        {(!marketData?.labor_rates || marketData.labor_rates.length === 0) && (
          <div className="text-center py-8">
            <Hammer size={24} style={{ color: '#484F58', margin: '0 auto 8px' }} />
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#484F58' }}>
              No labor rate data available from Data Hub
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  M A I N   C O M P O N E N T
// ═══════════════════════════════════════════════════════════════════

export function CostEstimator({ className, onBack, initialEstimate }: CostEstimatorProps) {
  // ─── Authenticated user profile ───
  const { data: session } = useSession()
  const [userProfile, setUserProfile] = useState<{
    firstName: string; lastName: string; displayName: string;
    email: string; phone: string; role: string;
    organization: { name: string; type: string } | null;
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      try {
        const res = await authedFetch('/api/user/profile')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.success) setUserProfile(data.profile)
      } catch { /* silent */ }
    }
    if (session?.user) loadProfile()
    return () => { cancelled = true }
  }, [session?.user])

  // ─── Form inputs ───
  const [projectType, setProjectType] = useState('residential_single')
  const [gfa, setGfa] = useState<number>(0)
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sqm')
  const [floors, setFloors] = useState(1)
  const [region, setRegion] = useState('greater_accra')
  const [specTier, setSpecTier] = useState('standard')
  const [includeLand, setIncludeLand] = useState(false)
  const [landPricePerSqm, setLandPricePerSqm] = useState<number>(0)

  // ─── Assumptions state ───
  const [fees, setFees] = useState<FeeItem[]>(DEFAULT_PROFESSIONAL_FEES)
  const [contingencies, setContingencies] = useState<ContingencyItem[]>(DEFAULT_CONTINGENCY)
  const [financial, setFinancial] = useState<FinancialAssumption[]>(DEFAULT_FINANCIAL)

  // ─── Rate overrides (user-edited unit rates) ───
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})

  // ─── Material price overrides (user-edited Data Hub material prices) ───
  const [materialPriceOverrides, setMaterialPriceOverrides] = useState<Record<string, number>>({})

  // ─── UI state ───
  const [currency, setCurrency] = useState<Currency>('GHS')
  const [isGenerated, setIsGenerated] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [editingRate, setEditingRate] = useState<string | null>(null)
  const [savedEstimates, setSavedEstimates] = useState<SavedEstimate[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showClientInfo, setShowClientInfo] = useState(false)
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    clientName: '', clientCompany: '', clientEmail: '', clientPhone: '',
    projectName: '', projectAddress: '',
  })

  // ─── Labor & MEP inclusion toggles ───
  const [includeLaborCosts, setIncludeLaborCosts] = useState(true)
  const [includeElectrical, setIncludeElectrical] = useState(true)
  const [includePlumbing, setIncludePlumbing] = useState(true)
  const [includeHvac, setIncludeHvac] = useState(true)

  // ─── Data Hub market data (replaces all hardcoded rates) ───
  const [marketData, setMarketData] = useState<MarketData | null>(null)
  const [marketDataLoading, setMarketDataLoading] = useState(true)
  const [marketDataError, setMarketDataError] = useState<string | null>(null)

  const printRef = useRef<HTMLDivElement>(null)
  const qrRef = useRef<HTMLDivElement>(null)
  const [autoPrint, setAutoPrint] = useState<false | 'print' | 'download'>(false)

  // ─── Load saved estimate snapshot ───
  useEffect(() => {
    if (!initialEstimate?.snapshot) return
    const s = initialEstimate.snapshot
    setProjectType(s.projectType || 'residential_single')
    setGfa(s.gfa || 0)
    setAreaUnit(s.areaUnit || 'sqm')
    setFloors(s.floors || 1)
    setRegion(s.region || 'greater_accra')
    setSpecTier(s.specTier || 'standard')
    setIncludeLand(s.includeLand || false)
    setLandPricePerSqm(s.landPricePerSqm || 0)
    setCurrency(s.currency || 'GHS')
    if (s.fees?.length) setFees(s.fees)
    if (s.contingencies?.length) setContingencies(s.contingencies)
    if (s.financial?.length) setFinancial(s.financial)
    if (s.rateOverrides) setRateOverrides(s.rateOverrides)
    if (s.materialPriceOverrides) setMaterialPriceOverrides(s.materialPriceOverrides)
    if (s.clientInfo) setClientInfo(s.clientInfo)
    if (typeof s.includeLaborCosts === 'boolean') setIncludeLaborCosts(s.includeLaborCosts)
    if (typeof s.includeElectrical === 'boolean') setIncludeElectrical(s.includeElectrical)
    if (typeof s.includePlumbing === 'boolean') setIncludePlumbing(s.includePlumbing)
    if (typeof s.includeHvac === 'boolean') setIncludeHvac(s.includeHvac)
    // Auto-generate results
    setIsGenerated(true)
  }, [initialEstimate])

  // ─── Listen for external print/download trigger (from dashboard) ───
  useEffect(() => {
    const handlePrintEvent = () => setAutoPrint('print')
    const handleDownloadEvent = () => setAutoPrint('download')
    window.addEventListener('cost-estimator:print', handlePrintEvent)
    window.addEventListener('cost-estimator:download', handleDownloadEvent)
    return () => {
      window.removeEventListener('cost-estimator:print', handlePrintEvent)
      window.removeEventListener('cost-estimator:download', handleDownloadEvent)
    }
  }, [])

  // ─── Fetch real market data from Data Hub on mount ───
  useEffect(() => {
    let cancelled = false
    async function fetchMarketData() {
      setMarketDataLoading(true)
      setMarketDataError(null)
      try {
        const res = await authedFetch('/api/projects/cost-estimator/market-data')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: MarketData = await res.json()
        if (!cancelled) setMarketData(data)
      } catch (err: any) {
        if (!cancelled) setMarketDataError(err.message || 'Failed to load market data')
      } finally {
        if (!cancelled) setMarketDataLoading(false)
      }
    }
    fetchMarketData()
    return () => { cancelled = true }
  }, [])

  // ─── Detect a saved draft on mount (do NOT auto-apply) ───
  // "New Estimate" should start blank; the user can resume an in-progress draft
  // explicitly via the banner. Skip entirely when opening an existing estimate to edit.
  const [pendingDraft, setPendingDraft] = useState<any | null>(null)
  useEffect(() => {
    if (initialEstimate) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) setPendingDraft(JSON.parse(raw))
    } catch { /* ignore corrupt draft */ }
  }, [initialEstimate])

  const resumeDraft = useCallback(() => {
    const draft = pendingDraft
    if (!draft) return
    if (draft.projectType) setProjectType(draft.projectType)
    if (draft.gfa) setGfa(draft.gfa)
    if (draft.areaUnit) setAreaUnit(draft.areaUnit)
    if (draft.floors) setFloors(draft.floors)
    if (draft.region) setRegion(draft.region)
    if (draft.specTier) setSpecTier(draft.specTier)
    if (draft.includeLand !== undefined) setIncludeLand(draft.includeLand)
    if (draft.landPricePerSqm) setLandPricePerSqm(draft.landPricePerSqm)
    if (draft.currency) setCurrency(draft.currency)
    if (draft.fees) setFees(draft.fees)
    if (draft.contingencies) setContingencies(draft.contingencies)
    if (draft.financial) setFinancial(draft.financial)
    if (draft.rateOverrides) setRateOverrides(draft.rateOverrides)
    if (draft.materialPriceOverrides) setMaterialPriceOverrides(draft.materialPriceOverrides)
    if (draft.clientInfo) setClientInfo(draft.clientInfo)
    if (draft.includeLaborCosts !== undefined) setIncludeLaborCosts(draft.includeLaborCosts)
    if (draft.includeElectrical !== undefined) setIncludeElectrical(draft.includeElectrical)
    if (draft.includePlumbing !== undefined) setIncludePlumbing(draft.includePlumbing)
    if (draft.includeHvac !== undefined) setIncludeHvac(draft.includeHvac)
    if (draft.isGenerated) setIsGenerated(true)
    setPendingDraft(null)
  }, [pendingDraft])

  const dismissDraft = useCallback(() => {
    setPendingDraft(null)
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
  }, [])

  // ─── Live FX rates from Data Hub ───
  const fxRates: Record<string, number> = useMemo(() => {
    if (marketData?.fx_rates) return marketData.fx_rates
    return { GHS: 1 }
  }, [marketData])

  // Keep the module-level _liveFxRates in sync so fmtCurrency / fmtCompact use real rates.
  // This MUST run synchronously during render (not in a useEffect): those formatters are
  // called while rendering THIS pass, so an effect (which runs afterwards) leaves the very
  // first render after rates load showing unconverted values — raw GHS with a foreign symbol.
  _liveFxRates = fxRates

  // ─── Derived from Data Hub ───
  const gfaSqm = areaUnit === 'sqft' ? gfa * SQFT_TO_SQM : gfa

  // Resolve the property-type prefix for base cost lookups (e.g. 'residential_single' → 'residential')
  const propertyTypePrefix = useMemo(() => {
    if (projectType.startsWith('residential')) return 'residential'
    if (projectType === 'commercial_office' || projectType === 'retail' || projectType === 'mixed_use') return 'commercial'
    if (projectType === 'industrial') return 'industrial'
    return 'residential'
  }, [projectType])

  // Real spec-tier multiplier from Data Hub base costs
  const specMult = useMemo(() => {
    if (!marketData?.base_costs) return 1
    return deriveSpecMultiplier(marketData.base_costs, propertyTypePrefix, SPEC_TIERS.find(s => s.value === specTier)?.qualityKey || 'standard')
  }, [marketData, propertyTypePrefix, specTier])

  // Real regional multiplier from Data Hub
  const regionMult = useMemo(() => {
    if (!marketData?.regional_multipliers) return 1
    return deriveRegionMultiplier(marketData.regional_multipliers, region)
  }, [marketData, region])

  // Scale factor: ratio of real Data Hub base cost to the reference base cost used in CATEGORY_DEFINITIONS
  // If user has material price overrides, adjust the material component proportionally
  const scaleFactor = useMemo(() => {
    if (!marketData?.base_costs) return 1
    const realBaseCost = getBaseCostPerSqm(marketData.base_costs, projectType)
    let adjustedBaseCost = realBaseCost

    // If user adjusted material prices, proportionally adjust the material component
    if (Object.keys(materialPriceOverrides).length > 0 && marketData?.material_prices?.length) {
      const ptDef = PROJECT_TYPES.find(p => p.value === projectType)
      const bKey = ptDef?.baseCostKey ?? 'residential_standard'
      const materialPct = (marketData.base_costs[bKey]?.material_pct ?? 55) / 100
      const laborPct = (marketData.base_costs[bKey]?.labor_pct ?? 30) / 100
      const otherPct = 1 - materialPct - laborPct

      let originalSum = 0
      let adjustedSum = 0
      for (const m of marketData.material_prices) {
        const key = `${m.category}__${m.name}`
        originalSum += m.price_ghs
        adjustedSum += materialPriceOverrides[key] ?? m.price_ghs
      }
      const materialChangeFactor = originalSum > 0 ? adjustedSum / originalSum : 1
      adjustedBaseCost = realBaseCost * (materialPct * materialChangeFactor + laborPct + otherPct)
    }

    return adjustedBaseCost / REFERENCE_BASE_COST
  }, [marketData, projectType, materialPriceOverrides])

  const projectLabel = PROJECT_TYPES.find((p) => p.value === projectType)?.label ?? projectType
  const regionLabel = REGIONS.find((r) => r.value === region)?.label ?? region
  const tierLabel = SPEC_TIERS.find((s) => s.value === specTier)?.label ?? specTier

  // ─── Compute all costs (now using live Data Hub scale factor) ───
  const rawCategories = useMemo(
    () => (isGenerated ? computeCategories(gfaSqm, floors, specMult, regionMult, rateOverrides, scaleFactor) : []),
    [isGenerated, gfaSqm, floors, specMult, regionMult, rateOverrides, scaleFactor],
  )

  // ─── Labor category from Data Hub rates ───
  const laborCategory = useMemo(() => {
    if (!isGenerated || !includeLaborCosts) return null
    return computeLaborCategory(gfaSqm, floors, marketData?.labor_rates || [], regionMult)
  }, [isGenerated, includeLaborCosts, gfaSqm, floors, marketData?.labor_rates, regionMult])

  // ─── Effective categories (filtered by MEP toggles + labor) ───
  const categories = useMemo(() => {
    let cats = rawCategories.map(c => {
      if (c.id !== 'mep') return c
      // Filter MEP sub-items based on owner toggles
      const items = c.items.filter(item => {
        if (item.id === 'electrical' && !includeElectrical) return false
        if (item.id === 'plumbing' && !includePlumbing) return false
        if (item.id === 'hvac' && !includeHvac) return false
        return true
      })
      const subtotal = items.reduce((s, i) => s + i.total, 0)
      return { ...c, items, subtotal }
    })

    // Append labor category, also filtering out electricians/plumbers if MEP toggles are off
    if (laborCategory) {
      const filteredLabor = {
        ...laborCategory,
        items: laborCategory.items.filter(item => {
          if (item.id === 'labor_electrician' && !includeElectrical) return false
          if (item.id === 'labor_plumber' && !includePlumbing) return false
          return true
        }),
      }
      filteredLabor.subtotal = filteredLabor.items.reduce((s, i) => s + i.total, 0)
      cats = [...cats, filteredLabor]
    }

    // Recalculate percentOfTotal
    const total = cats.reduce((s, c) => s + c.subtotal, 0)
    cats.forEach(c => { c.percentOfTotal = total > 0 ? (c.subtotal / total) * 100 : 0 })
    return cats
  }, [rawCategories, laborCategory, includeElectrical, includePlumbing, includeHvac])

  const hardCost = useMemo(() => categories.reduce((s, c) => s + c.subtotal, 0), [categories])
  const softCosts = useMemo(() => computeSoftCosts(hardCost, fees), [hardCost, fees])
  const contingencyResult = useMemo(() => computeContingency(hardCost, contingencies), [hardCost, contingencies])

  const financingCostPct = financial.find((f) => f.id === 'financing_cost')?.value ?? 0
  const financingCost = hardCost * (financingCostPct / 100)

  const landCost = includeLand ? gfaSqm * landPricePerSqm : 0
  const totalProjectCost = landCost + hardCost + softCosts.total + contingencyResult.total + financingCost
  const costPerSqm = gfaSqm > 0 ? totalProjectCost / gfaSqm : 0
  const costPerSqft = costPerSqm / SQM_TO_SQFT

  const isFormValid = gfa > 0 && region && projectType && !marketDataLoading

  // ─── Generate estimate with animation ───
  const handleGenerate = useCallback(() => {
    if (!isFormValid) return
    setIsGenerating(true)
    setRateOverrides({})
    setMaterialPriceOverrides({})

    // Update construction period in financial assumptions
    const period = estimateConstructionPeriod(gfaSqm, floors)
    setFinancial((prev) =>
      prev.map((f) => (f.id === 'period' ? { ...f, value: period } : f)),
    )

    setTimeout(() => {
      setIsGenerated(true)
      setIsGenerating(false)
      setExpandedCats(new Set())

      // Auto-save draft to localStorage
      try {
        const draft = {
          projectType, gfa, areaUnit, floors, region, specTier,
          includeLand, landPricePerSqm, currency, fees, contingencies,
          financial, rateOverrides, materialPriceOverrides, clientInfo,
          includeLaborCosts, includeElectrical, includePlumbing, includeHvac,
          isGenerated: true,
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      } catch { /* quota exceeded */ }
    }, 1200)
  }, [isFormValid, gfaSqm, floors])

  // ─── Toggle category ───
  const toggleCat = (id: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Auto-print/download when triggered from dashboard ───
  useEffect(() => {
    if (autoPrint && isGenerated) {
      const mode = autoPrint
      setAutoPrint(false)
      handlePrint(mode === 'download')
    }
  })

  // ─── Update a single unit rate ───
  const updateRate = (itemId: string, rate: number) => {
    setRateOverrides((prev) => ({ ...prev, [itemId]: rate }))
  }

  // ─── Reset assumptions to defaults ───
  const resetAssumptions = () => {
    setFees(DEFAULT_PROFESSIONAL_FEES)
    setContingencies(DEFAULT_CONTINGENCY)
    setFinancial(DEFAULT_FINANCIAL)
  }

  // ─── Copy summary to clipboard ───
  const copySummary = useCallback(() => {
    const lines = [
      `COST ESTIMATE SUMMARY`,
      `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      ``,
      `Project: ${projectLabel}`,
      `Location: ${regionLabel}`,
      `GFA: ${fmt(gfaSqm, 0)} sqm | Floors: ${floors} | Spec: ${tierLabel}`,
      ``,
      `Hard Costs:      ${fmtCurrency(hardCost, currency)}`,
      `Soft Costs:      ${fmtCurrency(softCosts.total, currency)}`,
      `Contingency:     ${fmtCurrency(contingencyResult.total, currency)}`,
      `Financing:       ${fmtCurrency(financingCost, currency)}`,
      ...(includeLand ? [`Land Acquisition: ${fmtCurrency(landCost, currency)}`] : []),
      `─────────────────────────────`,
      `TOTAL:           ${fmtCurrency(totalProjectCost, currency)}`,
      `Cost/sqm:        ${fmtCurrency(costPerSqm, currency)}`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [projectLabel, regionLabel, gfaSqm, floors, tierLabel, hardCost, softCosts.total, contingencyResult.total, financingCost, includeLand, landCost, totalProjectCost, costPerSqm, currency])

  // ─── Auto-save draft when key inputs change ───
  useEffect(() => {
    if (!isGenerated) return
    try {
      const draft = {
        projectType, gfa, areaUnit, floors, region, specTier,
        includeLand, landPricePerSqm, currency, fees, contingencies,
        financial, rateOverrides, materialPriceOverrides, clientInfo,
        includeLaborCosts, includeElectrical, includePlumbing, includeHvac,
        isGenerated: true,
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch { /* quota exceeded */ }
  }, [isGenerated, rateOverrides, materialPriceOverrides, clientInfo, fees, contingencies, financial, currency, includeLand, landPricePerSqm, includeLaborCosts, includeElectrical, includePlumbing, includeHvac])

  // ─── Save estimate (to API + local state) ───
  const [isSavingToApi, setIsSavingToApi] = useState(false)
  const [savedToastVisible, setSavedToastVisible] = useState(false)
  const saveEstimate = async () => {
    // A cost estimate is meaningless without a floor area — block saving a GFA-less
    // estimate (which would persist gfa_sqm = 0 and cost/sqm = 0, the bug users hit).
    if (gfa <= 0) {
      alert('Enter a Gross Floor Area (GFA) before saving — the estimate needs a floor area to compute cost per sqm.')
      return
    }
    const name = saveName.trim() || `Estimate ${savedEstimates.length + 1}`
    const saved: SavedEstimate = {
      id: Date.now().toString(),
      name,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      totalCost: totalProjectCost,
      hardCost,
      softCost: softCosts.total,
      contingencyTotal: contingencyResult.total,
      costPerUnit: costPerSqm,
      projectType: projectLabel,
      region: regionLabel,
      gfa: gfaSqm,
      specTier: tierLabel,
      currency,
    }
    setSavedEstimates((prev) => [...prev, saved])
    setShowSaveInput(false)
    setSaveName('')

    // Persist to API
    try {
      setIsSavingToApi(true)
      await authedFetch('/api/projects/cost-estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          projectType,
          region,
          gfaSqm,
          floors,
          specTier,
          currency,
          totalCost: totalProjectCost,
          hardCost,
          softCost: softCosts.total,
          contingency: contingencyResult.total,
          costPerSqm,
          snapshot: {
            projectType, gfa, areaUnit, floors, region, specTier,
            includeLand, landPricePerSqm, currency, fees, contingencies,
            financial, rateOverrides, materialPriceOverrides, clientInfo,
            includeLaborCosts, includeElectrical, includePlumbing, includeHvac,
            categories: categories.map(c => ({
              id: c.id, name: c.name, subtotal: c.subtotal,
              percentOfTotal: c.percentOfTotal,
              items: c.items.map(i => ({
                id: i.id, description: i.description, unit: i.unit,
                quantity: i.quantity, unitRate: i.unitRate, total: i.total,
              })),
            })),
          },
          notes: null,
        }),
      })
      // Show success toast
      setSavedToastVisible(true)
      setTimeout(() => setSavedToastVisible(false), 3000)
    } catch {
      // Still show toast — local save succeeded
      setSavedToastVisible(true)
      setTimeout(() => setSavedToastVisible(false), 3000)
    } finally {
      setIsSavingToApi(false)
    }
  }

  // ─── Print report ───
  const handlePrint = (directDownload = false) => {
    // Grab the rendered QR code SVG from the hidden element
    const qrSvg = qrRef.current?.innerHTML ?? ''

    const refId = `PMK-CE-${Date.now().toString(36).toUpperCase()}`
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    const currentQuarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`
    const constructionPeriod = financial.find((f) => f.id === 'period')?.value ?? 18
    const totalFeePct = fees.reduce((s, f) => s + f.percentage, 0)
    const totalContPct = contingencies.reduce((s, c) => s + c.percentage, 0)

    // ── FX rates for dual-currency display ──
    const ghsToUsd = fxRates['USD'] ?? 0
    const usdRate = ghsToUsd > 0 ? ghsToUsd : null
    const ghsPerUsd = usdRate ? (1 / usdRate) : null
    const fxSource = marketData?.fx_sources?.['USD'] ?? 'Data Hub'
    const fxTimestamp = marketData?.fx_timestamp ? new Date(marketData.fx_timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : dateStr
    const fmtUsd = (amount: number) => usdRate ? `$${(amount * usdRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'
    const dualCurrency = (amount: number) => `${fmtCurrency(amount, 'GHS')}${usdRate ? ` <span style="color:var(--muted);font-size:0.85em">(${fmtUsd(amount)})</span>` : ''}`

    // ── User profile for Prepared By / Certification ──
    const preparerName = userProfile?.displayName
      || `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim()
      || session?.user?.name || '—'
    const preparerEmail = userProfile?.email || session?.user?.email || ''
    const preparerRole = userProfile?.role || session?.user?.role || ''
    const preparerOrg = userProfile?.organization?.name || session?.user?.organizationName || ''
    const preparerTitle = preparerRole
      ? preparerRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : ''

    // ── Hard Costs Table (Section 2.1 from DOCX template)
    let itemNum = 1
    const hardCostRows = categories
      .map((cat) => {
        const catNum = String(itemNum++).padStart(2, '0')
        const scope = cat.items.map((i) => i.description).join(', ')
        const mainUnit = cat.items.length > 0 ? cat.items[0].unit : 'LS'
        const mainQty = cat.items.reduce((s, i) => s + i.quantity, 0)
        const catRow = `<tr class="cat-row">
          <td>${catNum}</td>
          <td><strong>${cat.name}</strong><br><span class="scope">${scope}</span></td>
          <td class="r">${fmtCurrency(mainQty > 0 ? cat.subtotal / mainQty : cat.subtotal, currency)}</td>
          <td class="c">${mainUnit}</td>
          <td class="r">${fmt(mainQty, 0)}</td>
          <td class="r"><strong>${fmtCurrency(cat.subtotal, currency)}</strong></td>
        </tr>`

        const subRows = cat.items
          .map(
            (item) =>
              `<tr class="sub-row">
              <td></td>
              <td class="indent">${item.description}</td>
              <td class="r muted">${fmtCurrency(item.unitRate, currency)}</td>
              <td class="c muted">${item.unit}</td>
              <td class="r muted">${fmt(item.quantity, item.quantity % 1 === 0 ? 0 : 1)}</td>
              <td class="r">${fmtCurrency(item.total, currency)}</td>
            </tr>`,
          )
          .join('')

        return catRow + subRows
      })
      .join('')

    // ── Soft Costs Table (Section 2.2)
    const softRows = fees
      .map(
        (f, i) =>
          `<tr>
          <td>${String.fromCharCode(65 + i)}</td>
          <td>${f.name}</td>
          <td class="r">${f.percentage}%</td>
          <td class="r">${fmtCurrency(hardCost * (f.percentage / 100), currency)}</td>
        </tr>`,
      )
      .join('')

    // ── Contingency Table (Section 3)
    const contRows = contingencies
      .map(
        (c) =>
          `<tr>
          <td>${c.name}</td>
          <td class="r">${c.percentage}%</td>
          <td class="r">${fmtCurrency(hardCost * (c.percentage / 100), currency)}</td>
        </tr>`,
      )
      .join('')

    const html = `<!DOCTYPE html>
<html><head><title>PROPMETRIK Cost Estimate Report — ${refId}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --brand: #d97706;
    --brand-light: #fef3c7;
    --heading: #111827;
    --body: #374151;
    --muted: #6b7280;
    --border: #d1d5db;
    --light-bg: #f9fafb;
    --white: #ffffff;
    --table-head: #1f2937;
    --table-head-fg: #ffffff;
    --table-band: #f3f4f6;
    --footer-bar: #1a2332;
  }

  body { font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; color: var(--body); font-size: 10px; line-height: 1.5; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  @page { size: A4; margin: 0; }

  /* ─── COVER PAGE (matches portfolio brochure) ─── */
  .cover {
    min-height: 100vh; color: var(--white); padding: 64px;
    display: flex; flex-direction: column; position: relative; overflow: hidden;
    page-break-after: always;
    background: linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%);
  }
  /* SVG cross-pattern overlay — same as brochure */
  .cover .pattern-overlay {
    position: absolute; inset: 0; opacity: 0.1;
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  }

  .cover .cover-inner { position: relative; z-index: 10; display: flex; flex-direction: column; min-height: calc(100vh - 128px); }

  .cover .top-bar { display: flex; justify-content: space-between; align-items: flex-start; }
  .cover .logo-block { display: flex; align-items: center; gap: 12px; }
  .cover .logo-icon {
    width: 48px; height: 48px; background: var(--brand); border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
  }
  .cover .logo-icon svg { width: 28px; height: 28px; }
  .cover .logo-text { font-size: 20px; font-weight: 900; letter-spacing: -0.3px; }
  .cover .logo-sub { font-size: 10px; font-family: monospace; color: #a1a1aa; text-transform: uppercase; letter-spacing: 3px; }
  .cover .meta-right { text-align: right; font-size: 10px; color: #71717a; }
  .cover .meta-right strong { color: var(--white); font-weight: 700; display: block; font-size: 14px; }

  .cover .divider { height: 1px; background: #374151; margin: 20px 0; }

  .cover .title-block {
    flex: 1; display: flex; flex-direction: column; justify-content: center; margin-top: -16px;
    border-left: 4px solid var(--brand); padding-left: 32px;
  }
  .cover .report-type { color: var(--brand); font-family: monospace; font-size: 14px; text-transform: uppercase; letter-spacing: 5px; margin-bottom: 16px; }
  .cover .title { font-size: 56px; font-weight: 900; line-height: 1.0; margin-bottom: 0; }
  .cover .title-sub { font-size: 20px; color: #a1a1aa; font-weight: 300; margin-top: 24px; }
  .cover .title-sub .highlight { color: var(--brand); font-weight: 600; }

  .cover .stat-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 48px; }
  .cover .stat-card {
    background: rgba(255,255,255,0.05); backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px;
  }
  .cover .stat-card .label { font-size: 10px; font-family: monospace; color: #71717a; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
  .cover .stat-card .value { font-size: 28px; font-weight: 900; }

  .cover .bottom-bar {
    display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 32px;
  }
  .cover .prep-block .prep-label { font-size: 9px; font-family: monospace; color: #52525b; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
  .cover .prep-block .prep-name { font-size: 9px; font-family: monospace; color: #71717a; }
  .cover .qr-box { padding: 12px; background: white; border-radius: 8px; }

  /* ─── CONTENT PAGES ─── */
  .page {
    padding: 40px 50px 60px; page-break-before: always; position: relative;
  }
  .page-header {
    background: var(--heading); height: 50px; margin: -40px -50px 24px;
    padding: 0 50px; display: flex; align-items: center; justify-content: space-between;
    border-bottom: 3px solid var(--brand);
  }
  .page-header .ph-brand { font-size: 9px; font-weight: 800; color: var(--brand); }
  .page-header .ph-title { font-size: 11px; color: var(--white); font-weight: 600; }
  .page-header .ph-ref { font-size: 8px; color: var(--muted); }

  h2 {
    font-size: 14px; font-weight: 700; color: var(--heading); text-transform: uppercase;
    letter-spacing: 0.08em; margin: 28px 0 12px; padding-left: 16px;
    border-left: 4px solid var(--brand); line-height: 1.3;
  }
  h2:first-of-type { margin-top: 8px; }
  h3 { font-size: 11px; font-weight: 700; color: var(--heading); margin: 16px 0 8px; }

  p { font-size: 10px; color: var(--body); line-height: 1.7; margin-bottom: 10px; }

  /* ─── PROJECT SUMMARY TABLE ─── */
  .summary-grid {
    display: grid; grid-template-columns: 180px 1fr 180px 1fr; gap: 0;
    border: 1px solid var(--border); margin-bottom: 20px;
  }
  .summary-grid .sg-label {
    background: var(--light-bg); padding: 7px 12px; font-size: 9px; font-weight: 600;
    color: var(--heading); border-bottom: 1px solid var(--border);
  }
  .summary-grid .sg-value {
    padding: 7px 12px; font-size: 9px; color: var(--body);
    border-bottom: 1px solid var(--border);
  }

  /* ─── TABLES ─── */
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 16px; border: 1.5px solid var(--border); }
  table th {
    background: var(--table-head); color: var(--table-head-fg); padding: 8px 10px;
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
    text-align: left; border-bottom: 2.5px solid var(--brand); border-right: 1px solid rgba(255,255,255,0.12);
  }
  table th:last-child { border-right: none; }
  table th.r { text-align: right; }
  table th.c { text-align: center; }
  table td { padding: 7px 10px; border-bottom: 1px solid var(--border); border-right: 1px solid #e5e7eb; color: var(--body); vertical-align: top; }
  table td:last-child { border-right: none; }
  table td.r { text-align: right; }
  table td.c { text-align: center; }
  table td.indent { padding-left: 28px; }
  table td.muted { color: var(--muted); font-size: 8px; }

  tr.cat-row td { background: var(--light-bg); font-weight: 600; color: var(--heading); border-bottom: 1.5px solid var(--border); border-top: 1.5px solid var(--border); }
  tr.cat-row td .scope { font-weight: 400; font-size: 8px; color: var(--muted); }
  tr.sub-row td { font-size: 8.5px; border-bottom: 1px solid #e5e7eb; }
  tr.sub-row:nth-child(even) td { background: #fafafa; }

  tr.total-row td { background: var(--light-bg); font-weight: 700; color: var(--heading); border-top: 2px solid var(--heading); border-bottom: 2px solid var(--heading); font-size: 10px; }
  tr.grand-total td { background: var(--heading); color: var(--white); font-weight: 800; font-size: 12px; border: none; padding: 12px 10px; }

  /* ─── BUDGET KPI ─── */
  .budget-summary { border: 2px solid var(--heading); margin: 12px 0 20px; }
  .budget-summary th { font-size: 9px; }
  .budget-summary tr:last-child td { background: var(--heading); color: var(--white); font-weight: 800; font-size: 11px; border: none; }

  /* ─── ASSUMPTIONS LIST ─── */
  .assumptions-list { list-style: none; padding: 0; margin: 0 0 16px; }
  .assumptions-list li {
    padding: 5px 0 5px 16px; border-bottom: 1px solid #f3f4f6; font-size: 9px; color: var(--body);
    position: relative;
  }
  .assumptions-list li::before { content: '—'; position: absolute; left: 0; color: var(--brand); font-weight: 700; }

  /* ─── SCHEDULE TABLE ─── */
  .schedule td:first-child { font-weight: 600; color: var(--heading); }

  /* ─── SIGNATURE BLOCK ─── */
  .signatures {
    display: grid; grid-template-columns: 1fr 1fr; gap: 48px;
    margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border);
  }
  .sig-block { margin-top: 48px; }
  .sig-line { border-top: 1px solid var(--heading); padding-top: 8px; }
  .sig-item { font-size: 9px; color: var(--body); margin-bottom: 2px; }
  .sig-item strong { color: var(--heading); }

  /* ─── DISCLAIMER ─── */
  .disclaimer {
    margin-top: 24px; padding: 14px 16px; background: var(--light-bg);
    border: 1px solid var(--border); font-size: 8px; color: var(--muted); line-height: 1.7;
  }
  .confidential {
    text-align: center; margin-top: 16px; font-size: 7px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.15em;
  }

  /* ─── FOOTER ─── */
  .page-footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 6px 50px; font-size: 7px; color: var(--muted);
    display: flex; justify-content: space-between;
    border-top: 1px solid #e5e7eb;
  }

  @media print {
    .cover { min-height: 100vh; }
    .page { page-break-before: always; }
  }
</style></head><body>

<!-- ═══════════ COVER PAGE (matches brochure design) ═══════════ -->
<div class="cover">
  <div class="pattern-overlay"></div>
  <div class="cover-inner">
    <!-- Header -->
    <div class="top-bar">
      <div class="logo-block">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
        </div>
        <div>
          <div class="logo-text">PROPMETRIK</div>
          <div class="logo-sub">Real Estate Intelligence</div>
        </div>
      </div>
      <div class="meta-right">
        <span>Document Date</span>
        <strong>${dateStr}</strong>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Main Title -->
    <div class="title-block">
      <div class="report-type">Cost Estimate Report</div>
      <div class="title">${clientInfo.projectName || 'COST ESTIMATE'}<br>${clientInfo.projectName ? 'COST ESTIMATE' : 'REPORT'}</div>
      <div class="title-sub">
        ${clientInfo.projectAddress ? `${clientInfo.projectAddress}<br>` : ''}${projectLabel} — ${regionLabel}<br>
        <span class="highlight">${currentQuarter}</span>
      </div>
    </div>

    <!-- Key Stats Preview -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">Total Project Cost</div>
        <div class="value">${fmtCurrency(totalProjectCost, currency)}</div>
        ${usdRate ? `<div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:2px">${fmtUsd(totalProjectCost)}</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="label">Gross Floor Area</div>
        <div class="value">${fmt(gfaSqm, 0)} sqm</div>
      </div>
      <div class="stat-card">
        <div class="label">Cost / sqm</div>
        <div class="value">${fmtCurrency(costPerSqm, currency)}</div>
        ${usdRate ? `<div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:2px">${fmtUsd(costPerSqm)}/sqm</div>` : ''}
      </div>
    </div>
    ${ghsPerUsd ? `<div style="text-align:center;font-size:9px;color:rgba(255,255,255,0.55);margin-top:8px">Exchange Rate: 1 USD = GHS ${ghsPerUsd.toFixed(2)} · Source: ${fxSource} · As of ${fxTimestamp}</div>` : ''}

    <!-- Footer -->
    <div class="bottom-bar">
      <div style="flex:1">
        <div style="display:flex;gap:32px">
          <div class="prep-block">
            <div class="prep-label">Prepared For</div>
            <div class="prep-name" style="font-size:13px;font-weight:700;color:white">${clientInfo.clientName || '—'}</div>
            ${clientInfo.clientCompany ? `<div class="prep-name">${clientInfo.clientCompany}</div>` : ''}
            ${clientInfo.clientEmail ? `<div class="prep-name">${clientInfo.clientEmail}</div>` : ''}
          </div>
          <div class="prep-block">
            <div class="prep-label">Prepared By</div>
            <div class="prep-name" style="font-size:13px;font-weight:700;color:white">${preparerName}</div>
            ${preparerOrg ? `<div class="prep-name">${preparerOrg}</div>` : ''}
            ${preparerEmail ? `<div class="prep-name">${preparerEmail}</div>` : ''}
          </div>
        </div>
        <div class="prep-block" style="margin-top:16px">
          <div class="prep-label">Generated via PROPMETRIK</div>
          <div class="prep-name">Professional cost estimate report · Ref: ${refId}</div>
        </div>
      </div>
      <div class="qr-box">
        ${qrSvg || '<span style="font-size:9px;color:#666">QR</span>'}
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ PAGE 1: PROJECT SUMMARY & EXECUTIVE SUMMARY ═══════════ -->
<div class="page">
  <div class="page-header">
    <span class="ph-brand">PROPMETRIK</span>
    <span class="ph-title">Cost Estimate Report</span>
    <span class="ph-ref">${refId}</span>
  </div>

  <h2>Project Summary</h2>
  <div class="summary-grid">
    ${clientInfo.clientName ? `<div class="sg-label">Client</div><div class="sg-value" style="font-weight:600;color:var(--heading)">${clientInfo.clientName}${clientInfo.clientCompany ? ` — ${clientInfo.clientCompany}` : ''}</div>` : ''}
    ${clientInfo.projectName ? `<div class="sg-label">Project Name</div><div class="sg-value" style="font-weight:600;color:var(--heading)">${clientInfo.projectName}</div>` : ''}
    ${clientInfo.projectAddress ? `<div class="sg-label">Project Address</div><div class="sg-value">${clientInfo.projectAddress}</div><div class="sg-label"></div><div class="sg-value"></div>` : ''}

    <div class="sg-label">Prepared By</div>
    <div class="sg-value" style="font-weight:600;color:var(--heading)">${preparerName}${preparerOrg ? ` — ${preparerOrg}` : ''}</div>

    <div class="sg-label">Project Type</div>
    <div class="sg-value">${projectLabel}</div>
    <div class="sg-label">Estimate Date</div>
    <div class="sg-value">${dateStr}</div>

    <div class="sg-label">Location / Region</div>
    <div class="sg-value">${regionLabel}</div>
    <div class="sg-label">Revision No.</div>
    <div class="sg-value">00</div>

    <div class="sg-label">Gross Floor Area</div>
    <div class="sg-value">${fmt(gfaSqm, 0)} sqm (${fmt(gfaSqm * SQM_TO_SQFT, 0)} sqft)</div>
    <div class="sg-label">Specification Tier</div>
    <div class="sg-value">${tierLabel} (×${specMult.toFixed(2)})</div>

    <div class="sg-label">Number of Floors</div>
    <div class="sg-value">${floors}</div>
    <div class="sg-label">Regional Multiplier</div>
    <div class="sg-value">×${regionMult.toFixed(2)}</div>

    <div class="sg-label">Est. Construction Period</div>
    <div class="sg-value">${constructionPeriod} months</div>
    <div class="sg-label">Estimated Total Budget</div>
    <div class="sg-value" style="font-weight:800;color:var(--heading);font-size:11px">${fmtCurrency(totalProjectCost, currency)}${usdRate ? ` <span style="font-weight:600;color:var(--muted);font-size:10px">(${fmtUsd(totalProjectCost)})</span>` : ''}</div>
  </div>

  <h2>1. Executive Summary</h2>
  <p>
    This Cost Estimate Report has been prepared for a <strong>${projectLabel}</strong> development located in
    <strong>${regionLabel}, Ghana</strong>. The purpose of this document is to provide a comprehensive, itemised projection
    of all anticipated costs associated with the development, construction, and completion of the project.
  </p>
  <p>
    The estimate is based on current market pricing for the ${regionLabel} area as of ${dateStr}. All figures are in
    ${currency}${usdRate ? ` with USD equivalents shown at an exchange rate of 1 USD = GHS ${ghsPerUsd!.toFixed(2)} (source: ${fxSource}, as of ${fxTimestamp})` : ''}. Regional cost multiplier of ×${regionMult.toFixed(2)} and ${tierLabel} specification
    tier multiplier of ×${specMult.toFixed(2)} have been applied throughout.
  </p>

  <!-- Budget Category Summary Table -->
  <table class="budget-summary">
    <thead>
      <tr><th>Budget Category</th><th class="r">% of Total</th><th class="r">Estimated Cost (GHS)</th>${usdRate ? '<th class="r">USD Equivalent</th>' : ''}</tr>
    </thead>
    <tbody>
      <tr>
        <td>Hard Construction Costs</td>
        <td class="r">${(hardCost / totalProjectCost * 100).toFixed(1)}%</td>
        <td class="r">${fmtCurrency(hardCost, currency)}</td>
        ${usdRate ? `<td class="r">${fmtUsd(hardCost)}</td>` : ''}
      </tr>
      <tr>
        <td>Soft Costs (Professional Fees)</td>
        <td class="r">${(softCosts.total / totalProjectCost * 100).toFixed(1)}%</td>
        <td class="r">${fmtCurrency(softCosts.total, currency)}</td>
        ${usdRate ? `<td class="r">${fmtUsd(softCosts.total)}</td>` : ''}
      </tr>
      ${includeLand && landCost > 0 ? `<tr>
        <td>Land / Acquisition Costs</td>
        <td class="r">${(landCost / totalProjectCost * 100).toFixed(1)}%</td>
        <td class="r">${fmtCurrency(landCost, currency)}</td>
        ${usdRate ? `<td class="r">${fmtUsd(landCost)}</td>` : ''}
      </tr>` : ''}
      <tr>
        <td>Financing Costs</td>
        <td class="r">${(financingCost / totalProjectCost * 100).toFixed(1)}%</td>
        <td class="r">${fmtCurrency(financingCost, currency)}</td>
        ${usdRate ? `<td class="r">${fmtUsd(financingCost)}</td>` : ''}
      </tr>
      <tr>
        <td>Contingency Reserve</td>
        <td class="r">${(contingencyResult.total / totalProjectCost * 100).toFixed(1)}%</td>
        <td class="r">${fmtCurrency(contingencyResult.total, currency)}</td>
        ${usdRate ? `<td class="r">${fmtUsd(contingencyResult.total)}</td>` : ''}
      </tr>
      <tr>
        <td><strong>TOTAL PROJECT COST ESTIMATE</strong></td>
        <td class="r"><strong>100%</strong></td>
        <td class="r"><strong>${fmtCurrency(totalProjectCost, currency)}</strong></td>
        ${usdRate ? `<td class="r"><strong>${fmtUsd(totalProjectCost)}</strong></td>` : ''}
      </tr>
    </tbody>
  </table>
</div>

<!-- ═══════════ PAGE 2: DETAILED COST BREAKDOWN ═══════════ -->
<div class="page">
  <div class="page-header">
    <span class="ph-brand">PROPMETRIK</span>
    <span class="ph-title">Detailed Cost Breakdown</span>
    <span class="ph-ref">${refId}</span>
  </div>

  <h2>2. Detailed Cost Breakdown</h2>
  ${(() => {
    const excluded: string[] = []
    if (!includeLaborCosts) excluded.push('Labor & Workforce')
    if (!includeElectrical) excluded.push('Electrical')
    if (!includePlumbing) excluded.push('Plumbing')
    if (!includeHvac) excluded.push('HVAC')
    if (excluded.length > 0) {
      return `<div style="background:#fef3c7;border:1px solid #d97706;border-radius:4px;padding:8px 14px;margin-bottom:14px;font-size:9px;color:#92400e;">
        <strong>Owner-Supplied Items Excluded:</strong> ${excluded.join(', ')} — costs not included in this estimate as these will be sourced independently by the property owner.
      </div>`
    }
    return ''
  })()}
  <h3>2.1 Hard Construction Costs${includeLaborCosts ? ' (incl. Labor & Workforce)' : ''}</h3>

  <table>
    <thead>
      <tr>
        <th style="width:36px">Item #</th>
        <th>Category / Description</th>
        <th class="r" style="width:100px">Unit Rate</th>
        <th class="c" style="width:50px">Unit</th>
        <th class="r" style="width:60px">Qty</th>
        <th class="r" style="width:110px">Total</th>
      </tr>
    </thead>
    <tbody>
      ${hardCostRows}
      <tr class="total-row">
        <td colspan="5"><strong>SUBTOTAL — HARD COSTS</strong></td>
        <td class="r"><strong>${fmtCurrency(hardCost, currency)}</strong></td>
      </tr>
    </tbody>
  </table>

  <h3>2.2 Soft Costs (Professional Fees)</h3>
  <table>
    <thead>
      <tr>
        <th style="width:36px">Item #</th>
        <th>Description</th>
        <th class="r" style="width:70px">Rate</th>
        <th class="r" style="width:120px">Estimated Cost</th>
      </tr>
    </thead>
    <tbody>
      ${softRows}
      <tr class="total-row">
        <td colspan="3"><strong>SUBTOTAL — SOFT COSTS</strong></td>
        <td class="r"><strong>${fmtCurrency(softCosts.total, currency)}</strong></td>
      </tr>
    </tbody>
  </table>

  <!-- ──── Grand Totals ──── -->
  <table style="margin-top:10px">
    <tbody>
      <tr><td style="padding:6px 10px"><strong>Subtotal: Hard Costs</strong></td><td class="r">${fmtCurrency(hardCost, currency)}</td></tr>
      <tr><td style="padding:6px 10px">Professional Fees (${totalFeePct.toFixed(1)}%)</td><td class="r">${fmtCurrency(softCosts.total, currency)}</td></tr>
      <tr><td style="padding:6px 10px">Contingency (${totalContPct.toFixed(1)}%)</td><td class="r">${fmtCurrency(contingencyResult.total, currency)}</td></tr>
      <tr><td style="padding:6px 10px">Financing Costs (${financingCostPct}%)</td><td class="r">${fmtCurrency(financingCost, currency)}</td></tr>
      ${includeLand && landCost > 0 ? `<tr><td style="padding:6px 10px">Land Acquisition (${fmt(gfaSqm, 0)} sqm × ${fmtCurrency(landPricePerSqm, currency)}/sqm)</td><td class="r">${fmtCurrency(landCost, currency)}</td></tr>` : ''}
      <tr class="grand-total"><td style="padding:12px 10px"><strong>TOTAL PROJECT COST</strong></td><td class="r" style="font-size:13px"><strong>${fmtCurrency(totalProjectCost, currency)}</strong>${usdRate ? `<br><span style="font-size:11px;font-weight:700;color:var(--muted)">${fmtUsd(totalProjectCost)}</span>` : ''}</td></tr>
      <tr><td style="padding:6px 10px;color:var(--muted);font-size:9px">Cost per sqm</td><td class="r" style="color:var(--heading);font-weight:600">${fmtCurrency(costPerSqm, currency)} / sqm${usdRate ? ` <span style="color:var(--muted);font-size:9px">(${fmtUsd(costPerSqm)})</span>` : ''}</td></tr>
      <tr><td style="padding:6px 10px;color:var(--muted);font-size:9px">Cost per sqft</td><td class="r" style="color:var(--heading);font-weight:600">${fmtCurrency(costPerSqft, currency)} / sqft${usdRate ? ` <span style="color:var(--muted);font-size:9px">(${fmtUsd(costPerSqft)})</span>` : ''}</td></tr>
      ${ghsPerUsd ? `<tr><td colspan="2" style="padding:8px 10px;font-size:8.5px;color:var(--muted);border-top:1px solid #e5e5e5">Exchange Rate: 1 USD = GHS ${ghsPerUsd.toFixed(2)} · Source: ${fxSource} · As of ${fxTimestamp}</td></tr>` : ''}
    </tbody>
  </table>
</div>

<!-- ═══════════ PAGE 3: CONTINGENCY, ASSUMPTIONS & SCHEDULE ═══════════ -->
<div class="page">
  <div class="page-header">
    <span class="ph-brand">PROPMETRIK</span>
    <span class="ph-title">Contingency &amp; Assumptions</span>
    <span class="ph-ref">${refId}</span>
  </div>

  <h2>3. Contingency &amp; Assumptions</h2>

  <table>
    <thead>
      <tr><th>Contingency Item</th><th class="r" style="width:70px">Rate</th><th class="r" style="width:130px">Estimated Reserve</th></tr>
    </thead>
    <tbody>
      ${contRows}
      <tr class="total-row">
        <td><strong>TOTAL CONTINGENCY RESERVE</strong></td>
        <td class="r"><strong>${totalContPct.toFixed(1)}%</strong></td>
        <td class="r"><strong>${fmtCurrency(contingencyResult.total, currency)}</strong></td>
      </tr>
    </tbody>
  </table>

  <h3>3.1 Key Assumptions &amp; Exclusions</h3>
  <ul class="assumptions-list">
    <li>Pricing is based on <strong>live PROPMETRIK Data Hub</strong> market rates for the ${regionLabel} area as of ${dateStr}.</li>
    <li>FX rates sourced from ${marketData?.fx_sources ? Object.values(marketData.fx_sources).filter(s => s !== 'base').join(', ') : 'Data Hub'} as of ${fxTimestamp}. ${ghsPerUsd ? `USD equivalents shown at 1 USD = GHS ${ghsPerUsd.toFixed(2)}.` : `Base currency: ${currency}.`}</li>
    <li>Regional cost multiplier of ×${regionMult.toFixed(3)} applied from Data Hub regional_cost_multipliers (${regionLabel}).</li>
    <li>${tierLabel} specification tier (×${specMult.toFixed(2)}) derived from Data Hub base_costs_per_sqm table.</li>
    <li>Base construction cost: GH₵${fmt(getBaseCostPerSqm(marketData?.base_costs || {}, projectType), 0)}/sqm (Data Hub, ${propertyTypePrefix} standard, Greater Accra). Cost composition: Materials ${(() => { const bc = marketData?.base_costs?.[PROJECT_TYPES.find(p => p.value === projectType)?.baseCostKey || '']; return bc ? `${bc.material_pct}%` : '—'; })()}, Labor ${(() => { const bc = marketData?.base_costs?.[PROJECT_TYPES.find(p => p.value === projectType)?.baseCostKey || '']; return bc ? `${bc.labor_pct}%` : '—'; })()}, Overhead ${(() => { const bc = marketData?.base_costs?.[PROJECT_TYPES.find(p => p.value === projectType)?.baseCostKey || '']; return bc ? `${100 - bc.material_pct - bc.labor_pct}%` : '—'; })()}.</li>
    <li>Construction Cost Index: ${marketData?.construction_index ? `${marketData.construction_index.value.toFixed(1)} (Material: ${marketData.construction_index.material_index.toFixed(1)}, Labor: ${marketData.construction_index.labor_index.toFixed(1)})` : 'Not available'} — base 100.</li>
    <li>Standard foundation requirements assumed — piling or deep excavation not included.</li>
    <li>Municipal water and electricity connections assumed available on site.</li>
    <li>No abnormal site conditions assumed. Any unforeseen conditions excluded.</li>
    <li>Estimate does not include tenant improvement allowances unless explicitly noted.</li>
    <li>Value engineering savings are not reflected in this estimate.</li>
    <li>Estimate is valid for 30 days from the date of preparation (market data TTL).</li>
    <li>Construction period of ${constructionPeriod} months assumed for preliminaries calculation.</li>
    <li>Ghana construction material prices subject to Cedi/FX and import duty fluctuations — tracked live by Data Hub.</li>
    <li>Rainy season (Apr–Jul, Sep–Nov) may add 5–10% to timelines and logistics costs.</li>
    ${includeLaborCosts ? `<li><strong>Labor & Workforce</strong> costs included — 11 trade categories with daily rates sourced from Data Hub labor_rates (${regionLabel}). Crew sizes scaled to project GFA.</li>` : `<li><strong>Labor & Workforce</strong> costs excluded — owner will source labor independently.</li>`}
    ${!includeElectrical ? `<li><strong>Electrical works</strong> excluded — owner will engage their own electrical contractor.</li>` : ''}
    ${!includePlumbing ? `<li><strong>Plumbing works</strong> excluded — owner will engage their own plumbing contractor.</li>` : ''}
    ${!includeHvac ? `<li><strong>HVAC / Mechanical works</strong> excluded — owner will engage their own HVAC contractor.</li>` : ''}
  </ul>

  <h2>4. Financial Assumptions</h2>
  <table>
    <thead><tr><th>Parameter</th><th class="r">Value</th></tr></thead>
    <tbody>
      ${financial.map((f) => `<tr><td>${f.name}</td><td class="r">${f.value} ${f.unit}</td></tr>`).join('')}
    </tbody>
  </table>

  <h2>5. Certification &amp; Approvals</h2>
  <p>
    This Cost Estimate Report has been prepared with due diligence and represents a professional opinion of probable
    project costs based on available information at the time of preparation. Actual costs may vary based on final design,
    market conditions, and contractor bids.
  </p>

  <div class="signatures">
    <div>
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-item"><strong>Name:</strong> ${preparerName}</div>
          <div class="sig-item"><strong>Title:</strong> ${preparerTitle || '—'}</div>
          <div class="sig-item"><strong>Company:</strong> ${preparerOrg || '—'}</div>
          <div class="sig-item"><strong>Email:</strong> ${preparerEmail || '—'}</div>
          <div class="sig-item"><strong>Date:</strong> ${dateStr}</div>
        </div>
      </div>
      <div style="font-size:8px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.1em">Prepared By</div>
    </div>
    <div>
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-item"><strong>Name:</strong> ___________________________________</div>
          <div class="sig-item"><strong>Title:</strong> ___________________________________</div>
          <div class="sig-item"><strong>Company:</strong> ___________________________________</div>
          <div class="sig-item"><strong>Date:</strong> ___________________________________</div>
        </div>
      </div>
      <div style="font-size:8px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.1em">Reviewed &amp; Approved By</div>
    </div>
  </div>

  <div class="disclaimer">
    This estimate has been prepared for planning purposes only and should not be relied upon as a definitive cost
    for the project. Final costs will be subject to detailed design, tender returns, site conditions, and market
    fluctuations. A detailed Bill of Quantities (BoQ) prepared by a qualified Quantity Surveyor is recommended
    before committing to construction. All figures are in ${currency} unless otherwise stated.
    Generated by PROPMETRIK Cost Estimation Engine — propmetrik.com
  </div>
  <div class="confidential">
    Confidential — This document contains proprietary information. Distribution without written consent is prohibited.
  </div>
</div>

</body></html>`

    if (directDownload) {
      // Direct PDF download using html2canvas + jsPDF
      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.left = '-9999px'
      container.style.top = '0'
      container.style.width = '794px' // A4 width in px at 96 DPI
      container.style.background = '#fff'
      container.style.zIndex = '-1'
      document.body.appendChild(container)

      const iframe = document.createElement('iframe')
      iframe.style.width = '794px'
      iframe.style.height = '1123px'
      iframe.style.border = 'none'
      container.appendChild(iframe)

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iframeDoc) { document.body.removeChild(container); return }
      iframeDoc.open()
      iframeDoc.write(html)
      iframeDoc.close()

      // Wait for fonts/images to load, then capture
      setTimeout(async () => {
        try {
          const { default: html2canvas } = await import('html2canvas')
          const { jsPDF } = await import('jspdf')

          const body = iframeDoc.body
          const canvas = await html2canvas(body, {
            scale: 2,
            useCORS: true,
            logging: false,
            width: 794,
            windowWidth: 794,
          })

          const imgData = canvas.toDataURL('image/jpeg', 0.92)
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
          const pdfWidth = pdf.internal.pageSize.getWidth()
          const pdfHeight = pdf.internal.pageSize.getHeight()
          const imgWidth = pdfWidth
          const imgHeight = (canvas.height * pdfWidth) / canvas.width

          let yOffset = 0
          let page = 0
          while (yOffset < imgHeight) {
            if (page > 0) pdf.addPage()
            pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgWidth, imgHeight)
            yOffset += pdfHeight
            page++
          }

          const fileName = `Cost_Estimate_${(clientInfo.projectName || projectLabel).replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
          pdf.save(fileName)
        } catch (err) {
          console.error('PDF generation failed, falling back to print:', err)
          // Fallback: open in new window for manual save
          const pw = window.open('', '_blank')
          if (pw) {
            pw.document.write(html)
            pw.document.close()
            pw.onload = () => setTimeout(() => pw.print(), 400)
          }
        } finally {
          document.body.removeChild(container)
        }
      }, 800)
    } else {
      const printWindow = window.open('', '_blank')
      if (!printWindow) return
      printWindow.document.write(html)
      printWindow.document.close()
      // Ensure styles/fonts load before printing
      printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 400)
      }
    }
  }

  // ─── Max category subtotal for bars ───
  const maxSubtotal = useMemo(() => Math.max(...categories.map((c) => c.subtotal), 1), [categories])

  // ═══════════════════════════════════════════════════════════════════
  //  R E N D E R
  // ═══════════════════════════════════════════════════════════════════

  return (
    <>
      {/* Google Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div
        className={className}
        style={{
          background: '#0D1117',
          color: '#C9D1D9',
          minHeight: '100vh',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* ════════════ HEADER ════════════ */}
        <div style={{ borderBottom: '1px solid #21262D', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, background: '#161B22', border: '1px solid #21262D',
                  color: '#8B949E', cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C'; }}
                onMouseOut={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = '#21262D'; }}
                title="Back to dashboard"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
            <h1 style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 28, color: '#C9A84C', margin: 0, letterSpacing: '-0.02em' }}>
              Cost Estimator
            </h1>
            <p style={{ fontSize: 12, color: '#484F58', marginTop: 4 }}>
              Professional quantity surveyor-grade project cost estimation
            </p>
            {/* Data Hub freshness indicator */}
            {marketData && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3FB950' }} />
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#3FB950', letterSpacing: '0.05em' }}>
                  LIVE DATA HUB
                </span>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#484F58' }}>
                  FX: {Object.entries(fxRates).filter(([k]) => k !== 'GHS').map(([k, v]) => `${k} ${(1/v).toFixed(2)}`).join(' · ')}
                </span>
                {marketData.fx_timestamp && (
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#30363D' }}>
                    {new Date(marketData.fx_timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
            {marketDataLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Loader2 size={10} className="animate-spin" style={{ color: '#C9A84C' }} />
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#C9A84C' }}>
                  Loading market data from Data Hub...
                </span>
              </div>
            )}
            {marketDataError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <AlertTriangle size={10} style={{ color: '#F85149' }} />
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#F85149' }}>
                  Market data unavailable: {marketDataError}
                </span>
              </div>
            )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Action CTAs */}
            <button
              onClick={() => handlePrint(true)}
              style={{
                padding: '6px 14px', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              className="hover:border-[#C9A84C] transition-colors"
            >
              <Download size={13} /> PDF
            </button>

            <button
              onClick={() => handlePrint(false)}
              style={{
                padding: '6px 14px', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              className="hover:border-[#C9A84C] transition-colors"
            >
              <Printer size={13} /> Print
            </button>

            <button
              onClick={copySummary}
              style={{
                padding: '6px 14px', background: '#161B22', border: '1px solid #21262D',
                color: copied ? '#3FB950' : '#C9D1D9',
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              className="hover:border-[#C9A84C] transition-colors"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {!showSaveInput ? (
              <button
                onClick={() => setShowSaveInput(true)}
                disabled={isSavingToApi}
                style={{
                  padding: '6px 14px', background: isSavingToApi ? '#1C2128' : '#161B22', border: '1px solid #21262D',
                  color: isSavingToApi ? '#484F58' : '#C9D1D9',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
                  cursor: isSavingToApi ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                className="hover:border-[#C9A84C] transition-colors"
              >
                {isSavingToApi
                  ? <><Loader2 size={13} className="animate-spin" /> Saving...</>
                  : <><Save size={13} /> Save</>
                }
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="text"
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEstimate() }}
                  placeholder="Estimate name..."
                  style={{
                    background: '#161B22', border: '1px solid #C9A84C', color: '#C9D1D9',
                    padding: '5px 10px', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, width: 160,
                  }}
                />
                <button onClick={saveEstimate} style={{ padding: '5px 8px', background: '#C9A84C', border: 'none', color: '#0D1117', cursor: 'pointer' }}>
                  <Check size={13} />
                </button>
                <button onClick={() => setShowSaveInput(false)} style={{ padding: '5px 8px', background: '#161B22', border: '1px solid #21262D', color: '#484F58', cursor: 'pointer' }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {savedEstimates.length >= 2 && (
              <button
                onClick={() => setShowComparison(!showComparison)}
                style={{
                  padding: '6px 14px', background: showComparison ? 'rgba(201,168,76,0.1)' : '#161B22',
                  border: `1px solid ${showComparison ? '#C9A84C' : '#21262D'}`, color: showComparison ? '#C9A84C' : '#C9D1D9',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 11, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <BarChart3 size={13} /> Compare ({savedEstimates.length})
              </button>
            )}

            {savedToastVisible && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', background: 'rgba(63,185,80,0.12)',
                border: '1px solid rgba(63,185,80,0.3)', color: '#3FB950',
                fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                animation: 'fadeIn 0.2s ease-out',
              }}>
                <Check size={12} /> Saved
              </div>
            )}

            <div style={{ width: 1, height: 24, background: '#21262D' }} />

            {/* Currency Toggle */}
            <div style={{ display: 'flex', background: '#161B22', border: '1px solid #21262D' }}>
              {(['GHS', 'USD', 'GBP', 'EUR'] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  style={{
                    padding: '6px 12px',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 11,
                    fontWeight: 500,
                    color: currency === c ? '#0D1117' : '#484F58',
                    background: currency === c ? '#C9A84C' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            {/* Area Unit Toggle */}
            <div style={{ display: 'flex', background: '#161B22', border: '1px solid #21262D' }}>
              {(['sqm', 'sqft'] as AreaUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setAreaUnit(u)}
                  style={{
                    padding: '6px 12px',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 11,
                    fontWeight: 500,
                    color: areaUnit === u ? '#0D1117' : '#484F58',
                    background: areaUnit === u ? '#C9A84C' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resume-draft banner — "New Estimate" starts blank; offer explicit resume */}
        {pendingDraft && !initialEstimate && (
          <div style={{ margin: '12px 32px 0', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)' }}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#C9A84C' }}>
              You have an unsaved draft from a previous session.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={resumeDraft} style={{ padding: '5px 12px', background: '#C9A84C', border: 'none', color: '#0D1117', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600 }}>
                Resume draft
              </button>
              <button onClick={dismissDraft} style={{ padding: '5px 12px', background: '#161B22', border: '1px solid #21262D', color: '#8B949E', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
                Discard
              </button>
            </div>
          </div>
        )}

        {/* ════════════ INPUTS ════════════ */}
        <div style={{ padding: '28px 32px', borderBottom: '1px solid #21262D' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
            {/* Project Type */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>
                Project Type
              </label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger style={{ background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', borderRadius: 0, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: '#161B22', border: '1px solid #21262D', borderRadius: 0 }}>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} style={{ color: '#C9D1D9', fontSize: 13 }}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Region */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>
                Region / Location
              </label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger style={{ background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', borderRadius: 0, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: '#161B22', border: '1px solid #21262D', borderRadius: 0 }}>
                  {REGIONS.map((r) => {
                    const mult = marketData?.regional_multipliers ? deriveRegionMultiplier(marketData.regional_multipliers, r.value) : 1
                    return (
                      <SelectItem key={r.value} value={r.value} style={{ color: '#C9D1D9', fontSize: 13 }}>
                        {r.label}
                        <span style={{ marginLeft: 8, color: '#484F58', fontFamily: '"JetBrains Mono", monospace', fontSize: 10 }}>×{mult.toFixed(2)}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* GFA */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>
                Gross Floor Area ({areaUnit})
              </label>
              <input
                type="number"
                min={1}
                value={gfa || ''}
                onChange={(e) => setGfa(parseFloat(e.target.value) || 0)}
                placeholder="e.g. 500"
                style={{
                  width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                  padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 20, alignItems: 'end' }}>
            {/* Floors */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>
                Floors
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={floors}
                onChange={(e) => setFloors(parseInt(e.target.value) || 1)}
                style={{
                  width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                  padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, outline: 'none',
                }}
              />
            </div>

            {/* Spec Tier */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>
                Specification Tier
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {SPEC_TIERS.map((tier) => {
                  const tierMult = marketData?.base_costs
                    ? deriveSpecMultiplier(marketData.base_costs, propertyTypePrefix, tier.qualityKey)
                    : 1
                  return (
                    <button
                      key={tier.value}
                      onClick={() => setSpecTier(tier.value)}
                      style={{
                        padding: '10px 12px',
                        background: specTier === tier.value ? 'rgba(201,168,76,0.12)' : '#161B22',
                        border: `1px solid ${specTier === tier.value ? '#C9A84C' : '#21262D'}`,
                        color: specTier === tier.value ? '#C9A84C' : '#8B949E',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600 }}>{tier.label}</span>
                        <span style={{
                          fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 600,
                          background: specTier === tier.value ? 'rgba(201,168,76,0.2)' : '#21262D',
                          padding: '2px 6px',
                          color: specTier === tier.value ? '#C9A84C' : '#484F58',
                        }}>
                          ×{tierMult.toFixed(tierMult === 1 ? 1 : 2)}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#484F58', marginTop: 4, lineHeight: 1.3 }}>{tier.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Include Land */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#161B22', border: '1px solid #21262D' }}>
                <Switch checked={includeLand} onCheckedChange={setIncludeLand} />
                <div>
                  <div style={{ fontSize: 12, color: '#C9D1D9', fontWeight: 500 }}>Include Land</div>
                  <div style={{ fontSize: 10, color: '#484F58' }}>Add acquisition cost</div>
                </div>
              </div>
              {includeLand && (
                <input
                  type="number"
                  min={0}
                  value={landPricePerSqm || ''}
                  onChange={(e) => setLandPricePerSqm(parseFloat(e.target.value) || 0)}
                  placeholder="GHS/sqm"
                  style={{
                    width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9',
                    padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, outline: 'none',
                  }}
                />
              )}
            </div>
          </div>

          {/* Client Information */}
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                padding: '10px 14px', background: '#161B22', border: '1px solid #21262D',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
              }}
              onClick={() => setShowClientInfo(!showClientInfo)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Briefcase size={14} style={{ color: '#C9A84C' }} />
                <div>
                  <div style={{ fontSize: 12, color: '#C9D1D9', fontWeight: 500 }}>Client Information</div>
                  <div style={{ fontSize: 10, color: '#484F58' }}>
                    {clientInfo.clientName ? `${clientInfo.clientName}${clientInfo.clientCompany ? ` — ${clientInfo.clientCompany}` : ''}` : 'Add client details for the report'}
                  </div>
                </div>
              </div>
              {showClientInfo ? <ChevronDown size={14} style={{ color: '#484F58' }} /> : <ChevronRight size={14} style={{ color: '#484F58' }} />}
            </div>
            {showClientInfo && (
              <div style={{ background: '#0A0E14', border: '1px solid #21262D', borderTop: 'none', padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Client Name</label>
                    <input
                      type="text"
                      value={clientInfo.clientName}
                      onChange={(e) => setClientInfo((p) => ({ ...p, clientName: e.target.value }))}
                      placeholder="e.g. John Mensah"
                      style={{ width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Company / Organisation</label>
                    <input
                      type="text"
                      value={clientInfo.clientCompany}
                      onChange={(e) => setClientInfo((p) => ({ ...p, clientCompany: e.target.value }))}
                      placeholder="e.g. Accra Properties Ltd"
                      style={{ width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Email Address</label>
                    <input
                      type="email"
                      value={clientInfo.clientEmail}
                      onChange={(e) => setClientInfo((p) => ({ ...p, clientEmail: e.target.value }))}
                      placeholder="e.g. john@cedynhq.com"
                      style={{ width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Phone Number</label>
                    <input
                      type="tel"
                      value={clientInfo.clientPhone}
                      onChange={(e) => setClientInfo((p) => ({ ...p, clientPhone: e.target.value }))}
                      placeholder="e.g. +233 20 000 0000"
                      style={{ width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Project Name</label>
                    <input
                      type="text"
                      value={clientInfo.projectName}
                      onChange={(e) => setClientInfo((p) => ({ ...p, projectName: e.target.value }))}
                      placeholder="e.g. East Legon Residence"
                      style={{ width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Project Address</label>
                    <input
                      type="text"
                      value={clientInfo.projectAddress}
                      onChange={(e) => setClientInfo((p) => ({ ...p, projectAddress: e.target.value }))}
                      placeholder="e.g. Plot 12, East Legon, Accra"
                      style={{ width: '100%', background: '#161B22', border: '1px solid #21262D', color: '#C9D1D9', padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, outline: 'none' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleGenerate}
              disabled={!isFormValid || isGenerating}
              style={{
                padding: '12px 36px',
                background: isFormValid ? '#C9A84C' : '#21262D',
                color: isFormValid ? '#0D1117' : '#484F58',
                border: 'none',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.05em',
                cursor: isFormValid ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s',
                opacity: isGenerating ? 0.7 : 1,
              }}
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
              {isGenerating ? 'GENERATING...' : isGenerated ? 'RECALCULATE' : 'GENERATE ESTIMATE'}
            </button>

            {isGenerated && (
              <>
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      border: '1px solid #21262D',
                      color: '#8B949E',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    className="hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors"
                  >
                    <Settings size={14} />
                    Assumptions, Indices &amp; Fees
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[720px] p-0 border-l" style={{ background: '#0D1117', borderColor: '#21262D' }}>
                  <SheetHeader className="px-6 pt-6 pb-0">
                    <SheetTitle style={{ fontFamily: '"DM Serif Display", Georgia, serif', color: '#C9A84C', fontSize: 20 }}>
                      Assumptions, Indices &amp; Fees
                    </SheetTitle>
                    <SheetDescription className="sr-only">Construction cost indices, material benchmarks, labor rates, professional fees, contingency and financial assumptions</SheetDescription>
                  </SheetHeader>
                  <AssumptionsPanel
                    fees={fees}
                    contingencies={contingencies}
                    financial={financial}
                    hardCost={hardCost}
                    marketData={marketData}
                    projectType={projectType}
                    specTier={specTier}
                    region={region}
                    onFeesChange={setFees}
                    onContingencyChange={setContingencies}
                    onFinancialChange={setFinancial}
                    onReset={resetAssumptions}
                    currency={currency}
                  />
                </SheetContent>
              </Sheet>

              {/* Construction Costs Sheet */}
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      border: '1px solid #21262D',
                      color: '#8B949E',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    className="hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors"
                  >
                    <HardHat size={14} />
                    Construction Costs
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[720px] p-0 border-l" style={{ background: '#0D1117', borderColor: '#21262D' }}>
                  <SheetHeader className="px-6 pt-6 pb-0">
                    <SheetTitle style={{ fontFamily: '"DM Serif Display", Georgia, serif', color: '#C9A84C', fontSize: 20 }}>
                      Construction Costs
                    </SheetTitle>
                    <SheetDescription className="sr-only">Editable construction cost breakdown by category with Data Hub material prices</SheetDescription>
                  </SheetHeader>
                  <ConstructionCostsPanel
                    categories={categories}
                    rateOverrides={rateOverrides}
                    onRateChange={updateRate}
                    onResetRates={() => setRateOverrides({})}
                    currency={currency}
                    marketData={marketData}
                    materialPriceOverrides={materialPriceOverrides}
                    onMaterialPriceChange={(key, price) => setMaterialPriceOverrides(prev => ({ ...prev, [key]: price }))}
                    onResetMaterialPrices={() => setMaterialPriceOverrides({})}
                    projectType={projectType}
                    region={region}
                    specTier={specTier}
                  />
                </SheetContent>
              </Sheet>

              {/* Labor Rates Sheet */}
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      border: '1px solid #21262D',
                      color: '#8B949E',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    className="hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors"
                  >
                    <Hammer size={14} />
                    Labor Rates
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[720px] p-0 border-l" style={{ background: '#0D1117', borderColor: '#21262D' }}>
                  <SheetHeader className="px-6 pt-6 pb-0">
                    <SheetTitle style={{ fontFamily: '"DM Serif Display", Georgia, serif', color: '#C9A84C', fontSize: 20 }}>
                      Labor Rates
                    </SheetTitle>
                    <SheetDescription className="sr-only">Labor rate index and daily rates by trade from PROPMETRIK Data Hub</SheetDescription>
                  </SheetHeader>
                  <LaborRatesPanel
                    marketData={marketData}
                    currency={currency}
                  />
                </SheetContent>
              </Sheet>
              </>
            )}
          </div>
        </div>

        {/* ════════════ LABOR & MEP TOGGLES ════════════ */}
        {isGenerated && !isGenerating && (
          <div style={{ padding: '16px 32px', borderBottom: '1px solid #21262D', background: '#0A0E14' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 8 }}>
                Include in Estimate:
              </div>

              {/* Labor Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <button
                  onClick={() => setIncludeLaborCosts(!includeLaborCosts)}
                  style={{
                    width: 18, height: 18, border: `1px solid ${includeLaborCosts ? '#C9A84C' : '#30363D'}`,
                    background: includeLaborCosts ? '#C9A84C' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {includeLaborCosts && <Check size={12} style={{ color: '#0D1117' }} />}
                </button>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: includeLaborCosts ? '#C9D1D9' : '#484F58' }}>
                  <Users size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: '#f59e0b' }} />
                  Labor &amp; Workforce
                </span>
              </label>

              <div style={{ width: 1, height: 20, background: '#21262D' }} />

              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                MEP:
              </div>

              {/* Electrical Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <button
                  onClick={() => setIncludeElectrical(!includeElectrical)}
                  style={{
                    width: 18, height: 18, border: `1px solid ${includeElectrical ? '#C9A84C' : '#30363D'}`,
                    background: includeElectrical ? '#C9A84C' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {includeElectrical && <Check size={12} style={{ color: '#0D1117' }} />}
                </button>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: includeElectrical ? '#C9D1D9' : '#484F58' }}>
                  <Zap size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: '#3b82f6' }} />
                  Electrical
                </span>
              </label>

              {/* Plumbing Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <button
                  onClick={() => setIncludePlumbing(!includePlumbing)}
                  style={{
                    width: 18, height: 18, border: `1px solid ${includePlumbing ? '#C9A84C' : '#30363D'}`,
                    background: includePlumbing ? '#C9A84C' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {includePlumbing && <Check size={12} style={{ color: '#0D1117' }} />}
                </button>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: includePlumbing ? '#C9D1D9' : '#484F58' }}>
                  <Wrench size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: '#22c55e' }} />
                  Plumbing
                </span>
              </label>

              {/* HVAC Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <button
                  onClick={() => setIncludeHvac(!includeHvac)}
                  style={{
                    width: 18, height: 18, border: `1px solid ${includeHvac ? '#C9A84C' : '#30363D'}`,
                    background: includeHvac ? '#C9A84C' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {includeHvac && <Check size={12} style={{ color: '#0D1117' }} />}
                </button>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: includeHvac ? '#C9D1D9' : '#484F58' }}>
                  HVAC
                </span>
              </label>

              {(!includeElectrical || !includePlumbing || !includeHvac || !includeLaborCosts) && (
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                  <AlertTriangle size={10} />
                  Owner-supplied items excluded from estimate
                </span>
              )}
            </div>
          </div>
        )}

        {/* ════════════ GENERATING ANIMATION ════════════ */}
        {isGenerating && (
          <div style={{ padding: '60px 32px', textAlign: 'center' }}>
            <Loader2 size={32} style={{ color: '#C9A84C' }} className="animate-spin mx-auto" />
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#484F58', marginTop: 16 }}>
              Computing cost breakdown across {includeLaborCosts ? '11' : '10'} categories...
            </p>
          </div>
        )}

        {/* ════════════ RESULTS ════════════ */}
        {isGenerated && !isGenerating && (
          <div ref={printRef}>
            {/* ──── KPI Dashboard ──── */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #21262D' }}>
              <div style={{ fontSize: 11, color: '#484F58', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontWeight: 500 }}>
                Summary Dashboard
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${includeLaborCosts ? 7 : 6}, 1fr)`, gap: 12 }}>
                <KPICard label="Total Project Cost" value={fmtCompact(totalProjectCost, currency)} sub={fmtCurrency(totalProjectCost, currency)} />
                <KPICard label="Hard Costs" value={fmtCompact(hardCost, currency)} sub={`${((hardCost / totalProjectCost) * 100).toFixed(1)}% of total`} />
                {includeLaborCosts && (
                  <KPICard
                    label="Labor & Workforce"
                    value={fmtCompact(categories.find(c => c.id === 'labor')?.subtotal ?? 0, currency)}
                    sub={`${categories.length > 0 ? ((categories.find(c => c.id === 'labor')?.subtotal ?? 0) / hardCost * 100).toFixed(1) : '0'}% of hard`}
                  />
                )}
                <KPICard label="Soft Costs" value={fmtCompact(softCosts.total, currency)} sub={`${fees.reduce((s, f) => s + f.percentage, 0).toFixed(1)}% of hard`} />
                <KPICard
                  label={`Cost per ${areaUnit}`}
                  value={fmtCurrency(areaUnit === 'sqm' ? costPerSqm : costPerSqft, currency)}
                />
                <KPICard label="Contingency" value={fmtCompact(contingencyResult.total, currency)} sub={`${contingencies.reduce((s, c) => s + c.percentage, 0).toFixed(1)}% of hard`} />
                <KPICard label="Professional Fees" value={fmtCompact(softCosts.total, currency)} sub={`${fees.length} fee categories`} />
              </div>
            </div>

            {/* ──── Cost Breakdown Table ──── */}
            <div style={{ padding: '24px 32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 20, color: '#C9A84C', margin: 0 }}>
                  Itemised Cost Breakdown
                </h2>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setExpandedCats(new Set(categories.map((c) => c.id)))}
                    style={{ padding: '4px 10px', background: '#161B22', border: '1px solid #21262D', color: '#484F58', fontSize: 10, fontFamily: '"JetBrains Mono", monospace', cursor: 'pointer' }}
                  >
                    Expand All
                  </button>
                  <button
                    onClick={() => setExpandedCats(new Set())}
                    style={{ padding: '4px 10px', background: '#161B22', border: '1px solid #21262D', color: '#484F58', fontSize: 10, fontFamily: '"JetBrains Mono", monospace', cursor: 'pointer' }}
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Table Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px 120px 120px 60px', gap: 0, borderBottom: '1px solid #21262D', paddingBottom: 8 }}>
                {['Description', 'Unit', 'Qty', 'Unit Rate', 'Amount', '% Total'].map((h, i) => (
                  <div
                    key={h}
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 10,
                      color: '#484F58',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      textAlign: i >= 2 ? 'right' : 'left',
                      paddingRight: i >= 2 ? 12 : 0,
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* Categories + Line Items */}
              {categories.map((cat) => {
                const Icon = cat.icon
                const isExpanded = expandedCats.has(cat.id)
                const barWidth = (cat.subtotal / maxSubtotal) * 100

                return (
                  <div key={cat.id} style={{ borderBottom: '1px solid #161B22' }}>
                    {/* Category Header Row */}
                    <button
                      onClick={() => toggleCat(cat.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 70px 90px 120px 120px 60px',
                        width: '100%',
                        padding: '12px 0',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      className="hover:bg-[#161B22]"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isExpanded ? <ChevronDown size={14} style={{ color: '#C9A84C' }} /> : <ChevronRight size={14} style={{ color: '#484F58' }} />}
                        <Icon size={14} style={{ color: '#C9A84C' }} />
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#C9D1D9', fontWeight: 600 }}>
                          {cat.name}
                        </span>
                      </div>
                      <div />
                      <div />
                      <div />
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: '#C9D1D9', fontWeight: 600, textAlign: 'right', paddingRight: 12 }}>
                        {fmtCurrency(cat.subtotal, currency)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingRight: 4 }}>
                        <div style={{ width: 32, height: 4, background: '#21262D', overflow: 'hidden' }}>
                          <div style={{ width: `${barWidth}%`, height: '100%', background: '#C9A84C', transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58', width: 36, textAlign: 'right' }}>
                          {cat.percentOfTotal.toFixed(1)}%
                        </span>
                      </div>
                    </button>

                    {/* Line Items */}
                    {isExpanded && (
                      <div style={{ background: '#0A0E14' }}>
                        {cat.items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '2fr 70px 90px 120px 120px 60px',
                              padding: '8px 0 8px 36px',
                              borderTop: '1px solid #0D1117',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8B949E' }}>
                              {item.description}
                            </span>
                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#484F58', textAlign: 'center' }}>
                              {item.unit}
                            </span>
                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#8B949E', textAlign: 'right', paddingRight: 12 }}>
                              {fmt(item.quantity, item.quantity % 1 === 0 ? 0 : 1)}
                            </span>
                            {/* Editable Unit Rate */}
                            <div style={{ textAlign: 'right', paddingRight: 12 }}>
                              {editingRate === item.id ? (
                                <input
                                  type="number"
                                  autoFocus
                                  defaultValue={item.unitRate}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value)
                                    if (!isNaN(val) && val >= 0) updateRate(item.id, val)
                                    setEditingRate(null)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                    if (e.key === 'Escape') setEditingRate(null)
                                  }}
                                  style={{
                                    width: 90, background: '#161B22', border: '1px solid #C9A84C', color: '#C9D1D9',
                                    fontFamily: '"JetBrains Mono", monospace', fontSize: 12, padding: '2px 6px', textAlign: 'right',
                                  }}
                                />
                              ) : (
                                <span
                                  onClick={() => setEditingRate(item.id)}
                                  style={{
                                    fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#8B949E',
                                    cursor: 'pointer', borderBottom: '1px dashed #21262D',
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                  }}
                                  title="Click to edit"
                                >
                                  {fmtCurrency(item.unitRate, currency)}
                                  <PencilLine size={10} style={{ color: '#21262D' }} />
                                </span>
                              )}
                            </div>
                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9D1D9', textAlign: 'right', paddingRight: 12 }}>
                              {fmtCurrency(item.total, currency)}
                            </span>
                            <span />
                          </div>
                        ))}
                        {/* Category Subtotal */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 70px 90px 120px 120px 60px',
                            padding: '8px 0 8px 36px',
                            borderTop: '1px solid #21262D',
                            background: '#0D1117',
                          }}
                        >
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#484F58', fontStyle: 'italic' }}>
                            Subtotal — {cat.name}
                          </span>
                          <span />
                          <span />
                          <span />
                          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#C9D1D9', fontWeight: 600, textAlign: 'right', paddingRight: 12 }}>
                            {fmtCurrency(cat.subtotal, currency)}
                          </span>
                          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#484F58', textAlign: 'right', paddingRight: 4 }}>
                            {cat.percentOfTotal.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* ──── Totals Section ──── */}
              <div style={{ marginTop: 24, borderTop: '2px solid #21262D', paddingTop: 16 }}>
                {/* Hard Costs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#C9D1D9', fontWeight: 600 }}>
                    Subtotal: Hard Costs
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, color: '#C9D1D9', fontWeight: 600 }}>
                    {fmtCurrency(hardCost, currency)}
                  </span>
                </div>

                {/* Soft Costs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #161B22' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8B949E' }}>
                    Professional Fees ({fees.reduce((s, f) => s + f.percentage, 0).toFixed(1)}% of hard costs)
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: '#8B949E' }}>
                    {fmtCurrency(softCosts.total, currency)}
                  </span>
                </div>

                {/* Contingency */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #161B22' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8B949E' }}>
                    Contingency ({contingencies.reduce((s, c) => s + c.percentage, 0).toFixed(1)}%)
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: '#8B949E' }}>
                    {fmtCurrency(contingencyResult.total, currency)}
                  </span>
                </div>

                {/* Financing */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #161B22' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8B949E' }}>
                    Financing Costs ({financingCostPct}%)
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: '#8B949E' }}>
                    {fmtCurrency(financingCost, currency)}
                  </span>
                </div>

                {/* Land (conditional) */}
                {includeLand && landCost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #161B22' }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8B949E' }}>
                      Land Acquisition ({fmt(gfaSqm, 0)} sqm × {fmtCurrency(landPricePerSqm, currency)}/sqm)
                    </span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: '#8B949E' }}>
                      {fmtCurrency(landCost, currency)}
                    </span>
                  </div>
                )}

                {/* GRAND TOTAL */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', padding: '16px 0', marginTop: 12,
                  borderTop: '2px solid #C9A84C',
                }}>
                  <span style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 22, color: '#C9A84C' }}>
                    TOTAL PROJECT COST
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 24, color: '#C9A84C', fontWeight: 700 }}>
                    {fmtCurrency(totalProjectCost, currency)}
                  </span>
                </div>

                {/* Cost per unit */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#484F58' }}>
                    Cost per {areaUnit}
                  </span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, color: '#8B949E' }}>
                    {fmtCurrency(areaUnit === 'sqm' ? costPerSqm : costPerSqft, currency)} / {areaUnit}
                  </span>
                </div>
              </div>
            </div>



            {/* ──── Saved Estimates Comparison ──── */}
            {showComparison && savedEstimates.length >= 2 && (
              <div style={{ padding: '20px 32px', borderTop: '1px solid #21262D' }}>
                <h3 style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 18, color: '#C9A84C', marginBottom: 16 }}>
                  Estimate Comparison
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"JetBrains Mono", monospace' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #21262D', color: '#484F58', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          Metric
                        </th>
                        {savedEstimates.map((est) => (
                          <th key={est.id} style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid #21262D', color: '#C9A84C', fontSize: 11 }}>
                            {est.name}
                            <button
                              onClick={() => setSavedEstimates((prev) => prev.filter((e) => e.id !== est.id))}
                              style={{ marginLeft: 8, background: 'none', border: 'none', color: '#484F58', cursor: 'pointer', fontSize: 10 }}
                            >
                              ✕
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Project Type', key: 'projectType' },
                        { label: 'Region', key: 'region' },
                        { label: 'GFA (sqm)', key: 'gfa', fmt: true },
                        { label: 'Spec Tier', key: 'specTier' },
                        { label: 'Total Cost', key: 'totalCost', currency: true },
                        { label: 'Hard Costs', key: 'hardCost', currency: true },
                        { label: 'Soft Costs', key: 'softCost', currency: true },
                        { label: 'Contingency', key: 'contingencyTotal', currency: true },
                        { label: 'Cost / sqm', key: 'costPerUnit', currency: true },
                      ].map((row) => (
                        <tr key={row.label}>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid #161B22', color: '#8B949E', fontSize: 12 }}>
                            {row.label}
                          </td>
                          {savedEstimates.map((est) => {
                            const val = (est as unknown as Record<string, unknown>)[row.key]
                            let display: string
                            if (row.currency && typeof val === 'number') display = fmtCurrency(val, est.currency)
                            else if (row.fmt && typeof val === 'number') display = fmt(val, 0)
                            else display = String(val ?? '')
                            return (
                              <td key={est.id} style={{ padding: '6px 12px', borderBottom: '1px solid #161B22', color: '#C9D1D9', fontSize: 12, textAlign: 'right' }}>
                                {display}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ──── Disclaimer ──── */}
            <div style={{ padding: '20px 32px', borderTop: '1px solid #21262D' }}>
              <div style={{
                padding: 16,
                border: '1px solid #21262D',
                background: '#0A0E14',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Info size={14} style={{ color: '#484F58', marginTop: 2, flexShrink: 0 }} />
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#484F58', lineHeight: 1.7, margin: 0 }}>
                    This estimate has been prepared for planning purposes only and should not be relied upon as a definitive
                    cost for the project. All unit rates are indicative and based on prevailing Ghanaian construction market
                    conditions. Final costs will be subject to detailed design, tender returns, site conditions, and market
                    fluctuations. A detailed Bill of Quantities (BoQ) prepared by a qualified Quantity Surveyor is recommended
                    before committing to construction. All figures are in {currency} unless otherwise stated. Rates can be
                    edited inline by clicking on any unit rate value.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Hidden QR code for print template */}
      <div ref={qrRef} style={{ position: 'absolute', left: -9999, top: -9999, pointerEvents: 'none' }}>
        <QRCodeSVG value="https://propmetrik.com" size={64} bgColor="#ffffff" fgColor="#000000" level="M" />
      </div>
    </>
  )
}

export default CostEstimator
