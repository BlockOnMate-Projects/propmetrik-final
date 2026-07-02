'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, KeyRound, BookOpen, Terminal } from 'lucide-react'
import { ANALYTICS_API_BASE_URL } from '@/lib/analytics-resources'
import { getUsageSummary, type UsageSummary } from '@/lib/developer-api'
import { useDeveloper } from './ctx'
import { PageHeader, Card, Stat, CopyButton, Spinner } from './_components'

export default function OverviewPage() {
  const { entitlements } = useDeveloper()
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUsageSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false))
  }, [])

  const curl = `curl -H "Authorization: Bearer pmk_your_key" \\\n  ${ANALYTICS_API_BASE_URL}/analytics/market/price-index`
  const quota = entitlements?.monthly_quota ?? null
  const mtd = entitlements?.usage.month_to_date ?? 0
  const pct = entitlements?.usage.quota_used_pct ?? null

  return (
    <div>
      <PageHeader
        title="Welcome to the Developer Portal"
        subtitle="Programmatic access to PropMetrik's real-estate intelligence for Ghana — market data, valuations, macro series and short-stay analytics over REST."
      />

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Requests (30d)" value={(summary?.requests_30d ?? 0).toLocaleString()} accent />
            <Stat label="Requests today" value={(summary?.requests_today ?? 0).toLocaleString()} />
            <Stat label="Active keys" value={summary?.active_keys ?? 0} />
            <Stat label="Error rate" value={`${((summary?.error_rate ?? 0) * 100).toFixed(1)}%`} />
          </div>

          {/* Quota */}
          {quota != null && (
            <Card title="Monthly usage" className="mb-6">
              <div className="flex items-end justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  <span className="text-foreground font-semibold tabular-nums">{mtd.toLocaleString()}</span> of{' '}
                  {quota.toLocaleString()} requests
                </span>
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400 tabular-nums">{pct ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                />
              </div>
            </Card>
          )}

          {/* Quick start + shortcuts */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card title="Quick start" className="md:col-span-2">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Base URL</p>
                  <div className="flex items-center gap-2 bg-background border border-border rounded px-3 py-2">
                    <code className="text-xs font-mono text-amber-600 dark:text-amber-400 flex-1 break-all">{ANALYTICS_API_BASE_URL}</code>
                    <CopyButton text={ANALYTICS_API_BASE_URL} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Your first call</p>
                  <div className="bg-background border border-border rounded p-3 relative">
                    <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre">{curl}</pre>
                    <div className="absolute top-2 right-2"><CopyButton text={curl} /></div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Create a key under <Link href="/developers/keys" className="text-amber-600 dark:text-amber-400 hover:underline">API Keys</Link>, then swap in <code className="font-mono">pmk_your_key</code>.
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <Link href="/developers/keys" className="block border border-border bg-card/40 rounded-xl p-4 hover:border-amber-500/40 transition-colors group">
                <KeyRound className="w-5 h-5 text-amber-500 mb-2" />
                <p className="text-sm font-semibold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400">API Keys</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create, rotate and revoke keys.</p>
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-2">Manage <ArrowRight className="w-3 h-3" /></span>
              </Link>
              <a href="/api" target="_blank" rel="noopener noreferrer" className="block border border-border bg-card/40 rounded-xl p-4 hover:border-amber-500/40 transition-colors group">
                <BookOpen className="w-5 h-5 text-amber-500 mb-2" />
                <p className="text-sm font-semibold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400">Documentation</p>
                <p className="text-xs text-muted-foreground mt-0.5">Endpoints, metrics &amp; methodology.</p>
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-2">Read docs <ArrowRight className="w-3 h-3" /></span>
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
