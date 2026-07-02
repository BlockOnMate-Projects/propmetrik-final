'use client'

import Link from 'next/link'
import { CheckCircle2, Gauge, ArrowUpRight } from 'lucide-react'
import { useDeveloper } from '../ctx'
import { PageHeader, Card, Stat, Spinner, Button } from '../_components'

function fmtExpiry(s: string | null) {
  if (!s) return 'No expiry'
  return `Renews ${new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
}

export default function PlanPage() {
  const { entitlements, loading } = useDeveloper()

  if (loading || !entitlements) return <Spinner />

  const { tier, products, limits, monthly_quota, usage } = entitlements
  const pct = usage.quota_used_pct ?? 0

  return (
    <div>
      <PageHeader
        title="Plan & Billing"
        subtitle="Your active API entitlements, enforced rate limits and this period's consumption."
        action={
          <Link href="/pricing">
            <Button variant="ghost"><ArrowUpRight className="w-4 h-4" /> View plans</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Plan tier" value={<span className="capitalize">{tier}</span>} accent />
        <Stat label="Rate limit" value={`${limits.rate_limit_per_minute}/min`} hint={`${limits.rate_limit_per_day.toLocaleString()}/day`} />
        <Stat label="This month" value={usage.month_to_date.toLocaleString()} hint="requests" />
        <Stat label="All-time" value={usage.total.toLocaleString()} hint="requests" />
      </div>

      {/* Quota */}
      <Card title="Monthly quota" className="mb-6">
        {monthly_quota != null ? (
          <>
            <div className="flex items-end justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold tabular-nums">{usage.month_to_date.toLocaleString()}</span>{' '}
                of {monthly_quota.toLocaleString()} included requests
              </span>
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400 tabular-nums">{pct}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="w-4 h-4" />
            Usage-based — no fixed monthly cap on your current plan. Requests are rate-limited to {limits.rate_limit_per_day.toLocaleString()}/day per key.
          </div>
        )}
      </Card>

      {/* Products */}
      <Card title="Subscribed API products">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Tier</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Renewal</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.service_key} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-foreground capitalize">{p.name.replace(/_/g, ' ')}</span>
                    <code className="block text-[10px] font-mono text-muted-foreground">/{p.service_key === 'market_intelligence' ? 'analytics/market' : p.service_key === 'short_stay' ? 'short-stay' : 'analytics'}</code>
                  </td>
                  <td className="py-2.5 pr-3 capitalize text-muted-foreground">{p.tier}</td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {p.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{fmtExpiry(p.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Each product gates its own endpoints — Analytics (<code className="font-mono">/analytics</code>), Market
          Intelligence (<code className="font-mono">/analytics/market</code>) and Short-Stay (<code className="font-mono">/short-stay</code>).
          Manage billing and invoices from your account settings.
        </p>
      </Card>
    </div>
  )
}
