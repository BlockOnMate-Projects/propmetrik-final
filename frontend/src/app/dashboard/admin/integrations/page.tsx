'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Globe,
  Check,
  AlertTriangle,
  XCircle,
  CreditCard,
  MessageSquare,
  Shield,
  Database,
  Brain,
  MapPin,
  BarChart3,
  FileSignature,
  Smartphone,
  Search,
  RefreshCw,
  ExternalLink,
  Settings,
  Loader2,
  Wifi,
  WifiOff,
  ChevronRight,
  Zap,
} from 'lucide-react'

/* ────────────── Types ────────────── */
type IntStatus = 'connected' | 'configured' | 'degraded' | 'disconnected'

interface Integration {
  id: string
  name: string
  description: string
  provider: string
  category: string
  status: IntStatus
  configuredVia: string
  docsUrl?: string
  details?: string
}

/* ────────────── Status helpers ────────────── */
const STATUS_MAP: Record<IntStatus, { color: string; bg: string; border: string; icon: typeof Check; label: string }> = {
  connected:    { color: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-800', icon: Check, label: 'Connected' },
  configured:   { color: 'text-cyan-400',  bg: 'bg-cyan-900/30',  border: 'border-cyan-800',  icon: Wifi, label: 'Configured' },
  degraded:     { color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-800', icon: AlertTriangle, label: 'Degraded' },
  disconnected: { color: 'text-zinc-500',  bg: 'bg-zinc-800/30',  border: 'border-zinc-700',  icon: WifiOff, label: 'Not Configured' },
}

const CATEGORY_ICONS: Record<string, typeof Globe> = {
  'Payments':       CreditCard,
  'Authentication': Shield,
  'Messaging':      MessageSquare,
  'Infrastructure': Database,
  'AI & ML':        Brain,
  'Maps & Geocoding': MapPin,
  'Data Feeds':     BarChart3,
  'Documents':      FileSignature,
  'Verification':   Smartphone,
}

/* ────────────── Integration catalog ────────────── */
const INTEGRATIONS: Integration[] = [
  // ── Payments ──
  { id: 'paystack',          name: 'Paystack',            description: 'Card payments, mobile money, bank transfers for Ghana & Africa', provider: 'Paystack (Stripe)', category: 'Payments', status: 'connected', configuredVia: 'Environment (PAYSTACK_SECRET_KEY)', details: 'Webhooks, split payments, bank verification' },
  { id: 'nowpayments',       name: 'NOWPayments',         description: 'Cryptocurrency payment gateway supporting 200+ coins', provider: 'NOWPayments', category: 'Payments', status: 'connected', configuredVia: 'Environment (NOWPAYMENTS_API_KEY)', details: 'IPN webhook, auto-conversion, settlement' },
  { id: 'onchain-crypto',    name: 'On-Chain Crypto',     description: 'Direct ERC-20 multi-token payments via PROPMETRIK smart contract', provider: 'Ethereum / Polygon', category: 'Payments', status: 'connected', configuredVia: 'Smart Contract (PROPMETRIKPayments.sol)', details: 'USDT/USDC/WETH, escrow, blockchain listener' },
  { id: 'mobile-money',      name: 'Mobile Money',        description: 'MTN MoMo, Vodafone Cash, AirtelTigo Money', provider: 'Ghana Telecos', category: 'Payments', status: 'connected', configuredVia: 'Environment (via Paystack)', details: 'Payment initiation, status check, webhooks' },

  // ── Authentication ──
  { id: 'keycloak',          name: 'Keycloak SSO',        description: 'Enterprise identity management & single sign-on', provider: 'Red Hat Keycloak', category: 'Authentication', status: 'connected', configuredVia: 'Environment (KEYCLOAK_URL, REALM)', docsUrl: '/dashboard/admin/system', details: 'OIDC, user provisioning, admin API' },
  { id: 'google-oauth',      name: 'Google OAuth 2.0',    description: 'Calendar sync, Gmail integration, user authentication', provider: 'Google Cloud', category: 'Authentication', status: 'connected', configuredVia: 'Environment (GOOGLE_CLIENT_ID)', details: 'OAuth flow, token refresh, calendar access' },

  // ── Messaging ──
  { id: 'whatsapp',          name: 'WhatsApp Business',   description: 'Automated messaging bot for tenant/owner notifications', provider: 'Meta (Cloud API)', category: 'Messaging', status: 'connected', configuredVia: 'Environment (WHATSAPP_TOKEN)', details: 'PM Bot, expense alerts, webhook processing' },
  { id: 'twilio',            name: 'Twilio SMS',          description: 'SMS notifications and OTP verification', provider: 'Twilio', category: 'Messaging', status: 'connected', configuredVia: 'Environment (TWILIO_ACCOUNT_SID)', details: 'Test & Live modes, OTP, alerts' },
  { id: 'gmail-smtp',        name: 'Google SMTP',         description: 'Transactional emails via Gmail SMTP relay', provider: 'Google', category: 'Messaging', status: 'connected', configuredVia: 'Environment (GOOGLE_EMAIL_USER)', details: 'Invoice emails, digest notifications' },
  { id: 'sse',               name: 'Realtime (SSE)',      description: 'Server-sent events for live notifications and presence', provider: 'Self-hosted', category: 'Messaging', status: 'connected', configuredVia: 'Built-in', details: 'User presence, entity updates, in-app alerts' },

  // ── Infrastructure ──
  { id: 'postgres',          name: 'PostgreSQL + PostGIS', description: 'Primary relational database with spatial support', provider: 'PostgreSQL', category: 'Infrastructure', status: 'connected', configuredVia: 'Environment (DATABASE_URL)', details: 'Spatial queries, property data, migrations' },
  { id: 'redis',             name: 'Redis',               description: 'In-memory cache, session store, Bull job queues, pub/sub', provider: 'Redis', category: 'Infrastructure', status: 'connected', configuredVia: 'Environment (REDIS_URL)', docsUrl: '/dashboard/admin/system', details: 'Auth sessions, data cache, pub/sub, queues' },
  { id: 'minio',             name: 'MinIO (S3)',          description: 'S3-compatible object storage for documents and media', provider: 'MinIO', category: 'Infrastructure', status: 'connected', configuredVia: 'Environment (MINIO_ENDPOINT)', details: '4 buckets: docs, floor-plans, signatures, media' },
  { id: 'opensearch',        name: 'OpenSearch',          description: 'Full-text search and analytics engine', provider: 'OpenSearch', category: 'Infrastructure', status: 'configured', configuredVia: 'Environment (OPENSEARCH_URL)', details: 'Property search indexing, log analytics' },
  { id: 'clickhouse',        name: 'ClickHouse',          description: 'Columnar analytics database for high-volume queries', provider: 'ClickHouse', category: 'Infrastructure', status: 'configured', configuredVia: 'Environment (CLICKHOUSE_URL)', details: 'Analytics workloads, time-series data' },

  // ── AI & ML ──
  { id: 'deepseek',          name: 'DeepSeek LLM',       description: 'Primary AI model for property analysis and NL queries', provider: 'DeepSeek (OpenAI-compatible)', category: 'AI & ML', status: 'connected', configuredVia: 'Environment (DEEPSEEK_API_KEY)', details: 'AI assistant, NER, market reports' },
  { id: 'anthropic',         name: 'Anthropic Claude',    description: 'Fallback LLM when DeepSeek is unavailable', provider: 'Anthropic', category: 'AI & ML', status: 'connected', configuredVia: 'Environment (ANTHROPIC_API_KEY)', details: 'Automatic failover, Claude 3.5 Sonnet' },
  { id: 'ml-serving',        name: 'ML Serving (PyTorch)', description: 'Self-hosted AVM model serving via FastAPI', provider: 'Self-hosted', category: 'AI & ML', status: 'connected', configuredVia: 'Service (localhost:8000)', details: 'RF + XGBoost + MLP ensemble, SHAP explanations' },

  // ── Maps & Geocoding ──
  { id: 'mapbox',            name: 'Mapbox',              description: 'Map tiles, geocoding, and directions', provider: 'Mapbox', category: 'Maps & Geocoding', status: 'connected', configuredVia: 'Environment (MAPBOX_TOKEN)', details: 'Forward/reverse geocoding, map rendering' },
  { id: 'google-maps',       name: 'Google Maps',         description: 'Address validation, place details, distance matrix', provider: 'Google Cloud', category: 'Maps & Geocoding', status: 'connected', configuredVia: 'Environment (GOOGLE_MAPS_API_KEY)', details: 'Geocoding, address autocomplete' },
  { id: 'ghanapost',         name: 'GhanaPost GPS',       description: 'Ghana Digital Address System (self-hosted Docker)', provider: 'Ghana Post', category: 'Maps & Geocoding', status: 'connected', configuredVia: 'Docker (GHANAPOST_GPS_URL)', details: 'GPS code lookup, reverse geocoding' },

  // ── Data Feeds ──
  { id: 'bog',               name: 'Bank of Ghana',       description: 'Exchange rates, interest rates, monetary policy indicators', provider: 'BOG', category: 'Data Feeds', status: 'connected', configuredVia: 'Scraper (automated)', details: 'FX rates, T-bill rates, inflation data' },
  { id: 'worldbank',         name: 'World Bank WDI',      description: 'GDP, population, and development indicators', provider: 'World Bank', category: 'Data Feeds', status: 'connected', configuredVia: 'API (public)', details: 'Economic indicators for HAI/CCI models' },
  { id: 'gss',               name: 'Ghana Statistical Service', description: 'Labor market data, construction wages', provider: 'GSS', category: 'Data Feeds', status: 'connected', configuredVia: 'Scraper (automated)', details: 'Labor rates feeding CCI calculation' },
  { id: 'npa',               name: 'NPA Fuel Prices',     description: 'National Petroleum Authority fuel price tracking', provider: 'NPA', category: 'Data Feeds', status: 'connected', configuredVia: 'Scraper (automated)', details: 'Diesel/petrol prices → construction costs' },
  { id: 'fx-feed',           name: 'FX Feed',             description: 'Live exchange rates (Yahoo Finance fallback)', provider: 'Multi-source', category: 'Data Feeds', status: 'connected', configuredVia: 'API chain', details: 'GHS/USD for valuations and crypto pricing' },
  { id: 'booking',           name: 'Booking.com',         description: 'Short-stay rental price comparables', provider: 'Booking.com', category: 'Data Feeds', status: 'connected', configuredVia: 'Scraper (automated)', details: 'Hotel/rental comparables for STR analysis' },
  { id: 'nadmo',             name: 'NADMO Flood Risk',    description: 'National Disaster Management flood incident data', provider: 'NADMO', category: 'Data Feeds', status: 'connected', configuredVia: 'CSV ingestion + API', details: 'Flood risk scoring, incident history' },
  { id: 'partner-pull',      name: 'Partner API Pulls',   description: 'Configurable data ingestion from partner endpoints', provider: 'Custom', category: 'Data Feeds', status: 'connected', configuredVia: 'Admin UI', docsUrl: '/dashboard/admin/data-hub/pull-integrations', details: 'Scheduled pulls, ETL pipelines, job monitoring' },
  { id: 'scrapy',            name: 'Scrapy Pipelines',    description: 'Web scraping orchestration for market data', provider: 'Scrapy', category: 'Data Feeds', status: 'connected', configuredVia: 'Scheduler service', docsUrl: '/dashboard/admin/data-hub/spiders', details: 'Spider management, scheduled scraping' },

  // ── Documents ──
  { id: 'esign',             name: 'E-Sign Service',      description: 'Digital signature workflows for valuation reports', provider: 'Self-hosted', category: 'Documents', status: 'connected', configuredVia: 'Service (internal)', details: 'PDF signing, envelopes, magic links' },
  { id: 'google-calendar',   name: 'Google Calendar',     description: 'Calendar synchronization for inspection scheduling', provider: 'Google Cloud', category: 'Documents', status: 'connected', configuredVia: 'OAuth 2.0', details: 'Event sync, availability checks' },

  // ── Verification ──
  { id: 'tin-gra',           name: 'TIN Verification',    description: 'Ghana Revenue Authority tax ID verification', provider: 'GRA', category: 'Verification', status: 'connected', configuredVia: 'API', details: 'Tax Identification Number lookup' },
  { id: 'ssnit',             name: 'SSNIT Verification',  description: 'Social Security & National Insurance Trust verification', provider: 'SSNIT', category: 'Verification', status: 'connected', configuredVia: 'API', details: 'SSN & employer verification' },
]

const CATEGORIES = [...new Set(INTEGRATIONS.map((i) => i.category))]

/* ────────────── Status Badge ────────────── */
function StatusBadge({ status }: { status: IntStatus }) {
  const s = STATUS_MAP[status]
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono border rounded ${s.bg} ${s.color} ${s.border}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  )
}

/* ────────────── Integration Card ────────────── */
function IntegrationCard({ int }: { int: Integration }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-700 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
          int.status === 'connected' ? 'bg-green-900/40' :
          int.status === 'configured' ? 'bg-cyan-900/40' :
          int.status === 'degraded' ? 'bg-amber-900/40' : 'bg-zinc-800'
        }`}>
          {(() => {
            const CatIcon = CATEGORY_ICONS[int.category] || Globe
            return <CatIcon className={`w-4 h-4 ${
              int.status === 'connected' ? 'text-green-400' :
              int.status === 'configured' ? 'text-cyan-400' :
              int.status === 'degraded' ? 'text-amber-400' : 'text-zinc-500'
            }`} />
          })()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white truncate">{int.name}</h3>
            <StatusBadge status={int.status} />
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{int.description}</p>
        </div>
        <ChevronRight className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-11 space-y-2 border-t border-zinc-800/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            <div>
              <p className="text-[10px] font-mono text-zinc-600 uppercase mb-0.5">Provider</p>
              <p className="text-xs text-zinc-300">{int.provider}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-zinc-600 uppercase mb-0.5">Configuration</p>
              <p className="text-xs text-zinc-300">{int.configuredVia}</p>
            </div>
          </div>
          {int.details && (
            <div>
              <p className="text-[10px] font-mono text-zinc-600 uppercase mb-0.5">Capabilities</p>
              <p className="text-xs text-zinc-400">{int.details}</p>
            </div>
          )}
          {int.docsUrl && (
            <a
              href={int.docsUrl}
              className="inline-flex items-center gap-1.5 text-[11px] text-red-400 hover:text-red-300 mt-1"
            >
              <ExternalLink className="w-3 h-3" /> Manage Integration
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function IntegrationsPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [health, setHealth] = useState<Record<string, string>>({})
  const [healthLoading, setHealthLoading] = useState(true)

  /* ── Fetch health from backend ── */
  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const data = await res.json()
        const h: Record<string, string> = {}
        if (data.services) {
          for (const [k, v] of Object.entries(data.services)) {
            h[k] = (v as { status?: string })?.status || 'unknown'
          }
        }
        // Also check top-level keys
        if (data.database) h['postgres'] = data.database === 'ok' ? 'connected' : 'degraded'
        if (data.redis) h['redis'] = data.redis === 'ok' ? 'connected' : 'degraded'
        if (data.minio) h['minio'] = data.minio === 'ok' ? 'connected' : 'degraded'
        setHealth(h)
      }
    } catch { /* ignore */ } finally { setHealthLoading(false) }
  }, [])

  useEffect(() => { loadHealth() }, [loadHealth])

  /* ── Apply health status overrides ── */
  const integrations = INTEGRATIONS.map((int) => {
    if (health[int.id]) {
      const s = health[int.id]
      if (s === 'ok' || s === 'connected' || s === 'healthy') return { ...int, status: 'connected' as IntStatus }
      if (s === 'degraded' || s === 'warning') return { ...int, status: 'degraded' as IntStatus }
      if (s === 'down' || s === 'error') return { ...int, status: 'disconnected' as IntStatus }
    }
    return int
  })

  /* ── Filter ── */
  const filtered = integrations
    .filter((i) => !activeCategory || i.category === activeCategory)
    .filter((i) =>
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      i.provider.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase())
    )

  /* ── Group by category ── */
  const grouped = CATEGORIES
    .map((cat) => ({
      category: cat,
      items: filtered.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0)

  /* ── Stats ── */
  const connected  = integrations.filter((i) => i.status === 'connected').length
  const configured = integrations.filter((i) => i.status === 'configured').length
  const degraded   = integrations.filter((i) => i.status === 'degraded').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-bold text-white font-mono">INTEGRATIONS</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1 ml-9">
            Third-party services, data feeds, and infrastructure connections
          </p>
        </div>
        <button
          onClick={loadHealth}
          disabled={healthLoading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs font-mono rounded transition-colors"
        >
          {healthLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Check Health
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Integrations', value: String(integrations.length), color: 'text-white', icon: Globe },
          { label: 'Connected', value: String(connected), color: 'text-green-400', icon: Check },
          { label: 'Configured', value: String(configured), color: 'text-cyan-400', icon: Settings },
          { label: 'Degraded', value: String(degraded), color: degraded > 0 ? 'text-amber-400' : 'text-green-400', icon: degraded > 0 ? AlertTriangle : Zap },
        ].map((c) => (
          <div key={c.label} className="bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{c.label}</span>
            </div>
            <p className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Category filter */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 text-xs font-mono text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none rounded"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 text-[10px] font-mono whitespace-nowrap rounded transition-colors ${
              !activeCategory ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >ALL ({integrations.length})</button>
          {CATEGORIES.map((cat) => {
            const count = integrations.filter((i) => i.category === cat).length
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                className={`px-3 py-1.5 text-[10px] font-mono whitespace-nowrap rounded transition-colors ${
                  activeCategory === cat ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >{cat.split(' ')[0].toUpperCase()} ({count})</button>
            )
          })}
        </div>
      </div>

      {/* Integration groups */}
      <div className="space-y-6">
        {grouped.map((group) => {
          const CatIcon = CATEGORY_ICONS[group.category] || Globe
          return (
            <div key={group.category}>
              <div className="flex items-center gap-2 mb-3">
                <CatIcon className="w-4 h-4 text-red-500" />
                <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider font-bold">
                  {group.category}
                </h2>
                <span className="text-[10px] font-mono text-zinc-600">{group.items.length}</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {group.items.map((int) => (
                  <IntegrationCard key={int.id} int={int} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded">
          <Search className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 font-mono">No integrations match &quot;{search}&quot;</p>
        </div>
      )}
    </div>
  )
}
