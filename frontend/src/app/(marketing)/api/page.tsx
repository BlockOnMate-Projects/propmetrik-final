'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Globe,
  Search,
  Copy,
  Check,
  ChevronRight,
  Server,
  Zap,
  Shield,
  Key,
  BookOpen,
  Code,
  ArrowRight,
  Terminal,
  Layers,
  BarChart3,
  Brain,
  Home as HomeIcon,
  DollarSign,
  Database,
  Activity,
} from 'lucide-react'

/* ────────────── Types ────────────── */
interface Endpoint {
  method: string
  path: string
  description: string
  params: string[]
}
interface Domain {
  name: string
  prefix: string
  endpoints: Endpoint[]
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 border-green-700',
  POST: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-700',
  PUT: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-700',
  DELETE: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-700',
  PATCH: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 border-purple-700',
}

const DOMAIN_ICONS: Record<string, typeof Globe> = {
  'Market Intelligence': BarChart3,
  'Construction Analytics': Layers,
  'Housing Affordability': HomeIcon,
  'Valuation Analytics': DollarSign,
  'ML/AI Analytics': Brain,
  'Properties & Listings': HomeIcon,
  'Valuations': DollarSign,
  'Subscriptions & Billing': DollarSign,
  'Data Hub': Database,
  'Ticker / Live Data': Activity,
}

/* ────────────── Badge ────────────── */
function MethodBadge({ method }: { method: string }) {
  const cls = METHOD_COLORS[method] || 'bg-card text-muted-foreground border-border'
  return (
    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold border rounded ${cls}`}>
      {method}
    </span>
  )
}

/* ────────────── Copy ────────────── */
function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000) }
  return (
    <button onClick={copy} className="p-1 hover:bg-zinc-700 rounded transition-colors" title="Copy">
      {ok ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  )
}

/* ────────────── Endpoint Row ────────────── */
function EndpointRow({ ep, prefix }: { ep: Endpoint; prefix: string }) {
  const [open, setOpen] = useState(false)
  const full = `https://api.propmetrik.com/v1${prefix}${ep.path}`
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
      >
        <MethodBadge method={ep.method} />
        <code className="text-xs font-mono text-muted-foreground flex-1 truncate">{prefix}{ep.path}</code>
        <span className="text-[10px] text-muted-foreground hidden md:block max-w-xs truncate">{ep.description}</span>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 ml-[72px] space-y-3">
          <p className="text-xs text-muted-foreground">{ep.description}</p>
          {/* Full URL */}
          <div className="flex items-center gap-2 bg-card border border-border rounded px-3 py-1.5">
            <code className="text-[11px] font-mono text-amber-600 dark:text-amber-400 flex-1 select-all break-all">{full}</code>
            <CopyBtn text={full} />
          </div>
          {/* Parameters */}
          {ep.params.length > 0 && (
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Parameters</p>
              <div className="flex flex-wrap gap-1.5">
                {ep.params.map((p) => (
                  <span key={p} className="px-2 py-0.5 bg-muted border border-border rounded text-[10px] font-mono text-muted-foreground">{p}</span>
                ))}
              </div>
            </div>
          )}
          {/* cURL example */}
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">cURL</p>
            <div className="bg-background border border-border rounded px-3 py-2">
              <code className="text-[10px] font-mono text-muted-foreground select-all break-all">
                curl -H &quot;Authorization: Bearer pmk_your_api_key&quot; {full}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ────────────── Code Example Block ────────────── */
function CodeExample({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="bg-background border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <span className="text-[10px] font-mono text-muted-foreground uppercase">{lang}</span>
        <CopyBtn text={code} />
      </div>
      <pre className="p-4 overflow-x-auto text-[11px] font-mono leading-relaxed text-muted-foreground">
        <code>{code}</code>
      </pre>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function PublicApiDocsPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [search, setSearch] = useState('')
  const [activeDomain, setActiveDomain] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/platform/api-catalog')
      if (!r.ok) throw new Error()
      const j = await r.json()
      if (j.data?.domains) setDomains(j.data.domains)
    } catch { /* empty state */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = domains
    .map((d) => ({
      ...d,
      endpoints: d.endpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(search.toLowerCase()) ||
          ep.description.toLowerCase().includes(search.toLowerCase()) ||
          ep.method.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((d) => d.endpoints.length > 0)

  const totalEndpoints = domains.reduce((s, d) => s + d.endpoints.length, 0)
  const displayed = activeDomain ? filtered.filter((d) => d.name === activeDomain) : filtered

  return (
    <main className="pt-28 pb-24">
      {/* ──────── Hero ──────── */}
      <section className="relative overflow-hidden pb-20 border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(220,38,38,0.12),transparent)]" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 border border-red-900/60 bg-red-950/30 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-mono text-red-600 dark:text-red-400">v1 STABLE — ALL SYSTEMS OPERATIONAL</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              <span className="text-foreground">PROPMETRIK</span>{' '}
              <span className="text-red-500">API</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
              Programmatic access to PROPMETRIK&apos;s real estate intelligence platform for Ghana.
              Market data, valuations, ML predictions, and construction analytics — all via REST.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-foreground font-semibold text-sm rounded transition-colors"
              >
                Get API Key <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#endpoints"
                className="inline-flex items-center gap-2 px-6 py-2.5 border border-border hover:border-zinc-500 text-muted-foreground text-sm rounded transition-colors"
              >
                <BookOpen className="w-4 h-4" /> Browse Endpoints
              </a>
            </div>
          </div>

          {/* ──── Quick-start stats ──── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { icon: Server, label: 'Base URL', value: 'api.propmetrik.com/v1', color: 'text-green-600 dark:text-green-400' },
              { icon: Shield, label: 'Auth', value: 'Bearer Token', color: 'text-amber-600 dark:text-amber-400' },
              { icon: Zap, label: 'Endpoints', value: String(totalEndpoints || '70+'), color: 'text-cyan-600 dark:text-cyan-400' },
              { icon: Code, label: 'Format', value: 'JSON (UTF-8)', color: 'text-purple-600 dark:text-purple-400' },
            ].map((c) => (
              <div key={c.label} className="bg-card/60 backdrop-blur border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <c.icon className={`w-4 h-4 ${c.color}`} />
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{c.label}</span>
                </div>
                <p className={`text-sm font-bold font-mono ${c.color} truncate`}>{c.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────── Authentication ──────── */}
      <section className="py-16 border-b border-border">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <Key className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-foreground font-mono">AUTHENTICATION</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            All API requests require a valid API key passed as a Bearer token in the <code className="text-amber-600 dark:text-amber-400">Authorization</code> header.
            Keys are scoped to your organization and can be generated from the admin dashboard after signing up.
          </p>
          <div className="bg-card border border-border rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
            <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
            <code className="text-sm font-mono text-amber-600 dark:text-amber-400 select-all flex-1">
              Authorization: Bearer pmk_your_api_key
            </code>
            <CopyBtn text="Authorization: Bearer pmk_your_api_key" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card/60 border border-border rounded-lg p-4">
              <p className="text-[10px] font-mono text-muted-foreground mb-1 uppercase">Rate Limits</p>
              <p className="text-lg text-foreground font-mono font-bold">1,000 <span className="text-xs text-muted-foreground">req/min</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">Enterprise: 10,000 req/min</p>
            </div>
            <div className="bg-card/60 border border-border rounded-lg p-4">
              <p className="text-[10px] font-mono text-muted-foreground mb-1 uppercase">Response Format</p>
              <p className="text-lg text-foreground font-mono font-bold">JSON</p>
              <p className="text-[10px] text-muted-foreground mt-1">All wrapped in {'{'} success, data {'}'}</p>
            </div>
            <div className="bg-card/60 border border-border rounded-lg p-4">
              <p className="text-[10px] font-mono text-muted-foreground mb-1 uppercase">Error Codes</p>
              <p className="text-lg text-foreground font-mono font-bold">Standard HTTP</p>
              <p className="text-[10px] text-muted-foreground mt-1">400 / 401 / 403 / 404 / 429 / 500</p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────── Quick-Start Code Examples ──────── */}
      <section className="py-16 border-b border-border">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <Code className="w-5 h-5 text-purple-500" />
            <h2 className="text-xl font-bold text-foreground font-mono">QUICK START</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CodeExample
              lang="cURL"
              code={`curl -s \\
  -H "Authorization: Bearer pmk_your_key" \\
  https://api.propmetrik.com/v1/analytics/market/price-index \\
  | jq .`}
            />
            <CodeExample
              lang="Python"
              code={`import requests

r = requests.get(
    "https://api.propmetrik.com/v1/analytics/market/price-index",
    headers={"Authorization": "Bearer pmk_your_key"}
)
data = r.json()["data"]
print(f"Property Index: {data['overall_index']}")`}
            />
            <CodeExample
              lang="JavaScript / Node.js"
              code={`const res = await fetch(
  "https://api.propmetrik.com/v1/analytics/market/price-index",
  { headers: { Authorization: "Bearer pmk_your_key" } }
);
const { data } = await res.json();
console.log("Property Index:", data.overall_index);`}
            />
            <CodeExample
              lang="Go"
              code={`req, _ := http.NewRequest("GET",
  "https://api.propmetrik.com/v1/analytics/market/price-index", nil)
req.Header.Set("Authorization", "Bearer pmk_your_key")
resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()
json.NewDecoder(resp.Body).Decode(&result)`}
            />
          </div>
        </div>
      </section>

      {/* ──────── Endpoint Catalog ──────── */}
      <section id="endpoints" className="py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="w-5 h-5 text-red-500" />
            <h2 className="text-xl font-bold text-foreground font-mono">ENDPOINT REFERENCE</h2>
            <span className="ml-auto text-xs font-mono text-muted-foreground">{totalEndpoints} endpoints</span>
          </div>

          {/* Search + domain filter */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search endpoints, methods, descriptions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-xs font-mono text-foreground placeholder-zinc-600 focus:border-red-600 focus:outline-none transition-colors"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setActiveDomain(null)}
                className={`px-3 py-1.5 text-[10px] font-mono whitespace-nowrap rounded transition-colors ${
                  !activeDomain ? 'bg-red-600 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >ALL</button>
              {domains.map((d) => (
                <button
                  key={d.name}
                  onClick={() => setActiveDomain(d.name === activeDomain ? null : d.name)}
                  className={`px-3 py-1.5 text-[10px] font-mono whitespace-nowrap rounded transition-colors ${
                    activeDomain === d.name ? 'bg-red-600 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >{d.name.split(' ')[0].toUpperCase()}</button>
              ))}
            </div>
          </div>

          {/* Endpoint listing */}
          {loading ? (
            <div className="text-center py-16">
              <Globe className="w-8 h-8 text-muted-foreground animate-pulse mx-auto mb-3" />
              <p className="text-xs text-muted-foreground font-mono">Loading API catalog...</p>
            </div>
          ) : (
            <div className="space-y-5">
              {displayed.map((domain) => {
                const DIcon = DOMAIN_ICONS[domain.name] || Globe
                return (
                  <div key={domain.name} className="bg-card/60 border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
                      <div className="flex items-center gap-2.5">
                        <DIcon className="w-4 h-4 text-red-500" />
                        <h3 className="text-sm font-bold text-foreground font-mono">{domain.name.toUpperCase()}</h3>
                        <span className="text-[10px] text-muted-foreground font-mono">{domain.prefix}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{domain.endpoints.length} endpoints</span>
                    </div>
                    <div>
                      {domain.endpoints.map((ep, i) => (
                        <EndpointRow key={`${ep.method}-${ep.path}-${i}`} ep={ep} prefix={domain.prefix} />
                      ))}
                    </div>
                  </div>
                )
              })}
              {displayed.length === 0 && (
                <div className="text-center py-16 bg-card border border-border rounded-lg">
                  <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-mono">No endpoints match &quot;{search}&quot;</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ──────── CTA ──────── */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-foreground mb-3">Ready to build?</h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-lg mx-auto">
            Sign up for PROPMETRIK to get your API key and start integrating real estate intelligence into your apps, models, and workflows.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-500 text-foreground font-semibold rounded transition-colors"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-3 border border-border hover:border-zinc-500 text-muted-foreground rounded transition-colors"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
