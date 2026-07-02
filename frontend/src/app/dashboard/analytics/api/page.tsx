'use client'

/**
 * Analytics → API sub-menu.
 * Three tabs: Users · Documentation · API Keys.
 * Documentation is live now (base URL + the analytics resources catalog);
 * Users and API Keys are scaffolds until the API access layer is finalised.
 */

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Users, BookOpen, KeyRound, Search, Copy, Check, ChevronDown, Info, Database } from 'lucide-react'
import {
  ANALYTICS_API_BASE_URL,
  ANALYTICS_API_GROUPS,
  ANALYTICS_RESOURCES,
  type ResourceComponent,
} from '@/lib/analytics-resources'

type Tab = 'documentation' | 'users' | 'api-keys'

function Panel({ title, children, className, actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <div className={cn('border border-border bg-card/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      className="flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground border border-border rounded hover:text-amber-500 hover:border-amber-500/40 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'COPIED' : 'COPY'}
    </button>
  )
}

function ComponentCard({ c }: { c: ResourceComponent }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border/60 rounded bg-background/40">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30 transition-colors">
        <div>
          <div className="font-mono text-[11px] text-foreground">{c.name}</div>
          <div className="font-mono text-[9px] text-muted-foreground mt-0.5">{c.summary}</div>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/60">
          <div>
            <div className="font-mono text-[9px] text-amber-500 tracking-wider mb-0.5">DEFINITION</div>
            <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">{c.definition}</p>
          </div>
          <div>
            <div className="font-mono text-[9px] text-amber-500 tracking-wider mb-0.5">METHODOLOGY</div>
            <ul className="space-y-0.5">
              {c.methodology.map((m, i) => (
                <li key={i} className="font-mono text-[10px] text-muted-foreground leading-relaxed flex gap-1.5">
                  <span className="text-amber-500/60 shrink-0">›</span><span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-mono text-[9px] text-amber-500 tracking-wider mb-0.5">METRICS</div>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px]">
                <tbody>
                  {c.metrics.map((mt, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-1 pr-2 text-foreground align-top whitespace-nowrap">{mt.name}</td>
                      <td className="py-1 pr-2 text-cyan-600 dark:text-cyan-400 align-top whitespace-nowrap">{mt.unit ?? ''}</td>
                      <td className="py-1 text-muted-foreground align-top">{mt.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Database className="w-3 h-3 text-muted-foreground" />
            {c.sources.map((s) => (
              <span key={s} className="font-mono text-[8px] px-1 py-0.5 border border-border rounded text-muted-foreground">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DocumentationTab() {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return ANALYTICS_RESOURCES
    return ANALYTICS_RESOURCES
      .map(cat => ({
        ...cat,
        components: cat.components.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.definition.toLowerCase().includes(q) ||
          c.metrics.some(m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)) ||
          c.methodology.some(m => m.toLowerCase().includes(q)),
        ),
      }))
      .filter(cat => cat.components.length > 0 || cat.name.toLowerCase().includes(q))
  }, [q])

  return (
    <div className="space-y-3">
      {/* Base URL */}
      <Panel title="BASE URL" actions={<CopyButton text={ANALYTICS_API_BASE_URL} />}>
        <div className="font-mono text-[13px] text-green-600 dark:text-green-400 break-all">{ANALYTICS_API_BASE_URL}</div>
        <div className="mt-2 pt-2 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-2">
          {ANALYTICS_API_GROUPS.map(g => (
            <div key={g.base} className="font-mono text-[9px]">
              <div className="text-foreground">{g.label}</div>
              <div className="text-cyan-600 dark:text-cyan-400">{ANALYTICS_API_BASE_URL}{g.base}</div>
              <div className="text-muted-foreground mt-0.5">{g.note}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-border flex items-start gap-1.5">
          <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
          <span className="font-mono text-[9px] text-muted-foreground leading-relaxed">
            Per-endpoint reference (paths, parameters, response schemas) is being finalised. The catalog below documents
            what every metric means and how it is derived.
          </span>
        </div>
      </Panel>

      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search metrics, components, methodologies…"
          className="w-full pl-8 pr-3 py-2 font-mono text-[11px] bg-card/50 border border-border rounded focus:border-amber-500/50 focus:outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Resources catalog */}
      {filtered.map(cat => (
        <Panel key={cat.id} title={`${cat.name.toUpperCase()} — ${cat.blurb}`}>
          <div className="space-y-2">
            {cat.components.map(c => <ComponentCard key={c.id} c={c} />)}
          </div>
        </Panel>
      ))}
      {filtered.length === 0 && (
        <div className="font-mono text-[10px] text-muted-foreground text-center py-8">No components match “{query}”.</div>
      )}

      <div className="font-mono text-[9px] text-muted-foreground">
        All analytics are computed from real Ghana Statistical Service (GSS), Bank of Ghana (BoG) and PropMetrik
        transaction data. No metric is seeded; unavailable source components are re-normalised, not fabricated.
      </div>
    </div>
  )
}

function ScaffoldTab({ icon: Icon, title, lines }: { icon: any; title: string; lines: string[] }) {
  return (
    <Panel title={title}>
      <div className="flex flex-col items-center text-center py-10">
        <Icon className="w-8 h-8 text-amber-500/70 mb-3" />
        <div className="font-mono text-[11px] text-foreground mb-2">Coming soon</div>
        <div className="max-w-md space-y-1">
          {lines.map((l, i) => (
            <p key={i} className="font-mono text-[10px] text-muted-foreground leading-relaxed">{l}</p>
          ))}
        </div>
      </div>
    </Panel>
  )
}

export default function AnalyticsApiPage() {
  const [tab, setTab] = useState<Tab>('documentation')
  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'users', label: 'USERS', icon: Users },
    { key: 'documentation', label: 'DOCUMENTATION', icon: BookOpen },
    { key: 'api-keys', label: 'API KEYS', icon: KeyRound },
  ]

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="font-mono text-xl text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-500" /> ANALYTICS API
        </h1>
        <p className="font-mono text-[10px] text-muted-foreground">
          Programmatic access to PropMetrik analytics — users, documentation &amp; keys.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-4">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] tracking-wider border-b-2 -mb-px transition-colors',
              tab === key ? 'text-amber-500 border-amber-500' : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'documentation' && <DocumentationTab />}
      {tab === 'users' && (
        <ScaffoldTab
          icon={Users}
          title="API USERS"
          lines={[
            'Manage which platform users and subscriber organisations have programmatic access to the analytics API.',
            'This panel will list API consumers, their assigned scopes and last-used activity once the access layer is finalised.',
          ]}
        />
      )}
      {tab === 'api-keys' && (
        <ScaffoldTab
          icon={KeyRound}
          title="API KEYS"
          lines={[
            'Generate, rotate and revoke API keys, and set per-key rate limits and scopes.',
            'Key issuance is disabled until the analytics API surface is finalised.',
          ]}
        />
      )}
    </div>
  )
}
