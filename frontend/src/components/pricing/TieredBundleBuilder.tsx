'use client';

/**
 * Tiered bundle builder — the real "mix & match" for the tiered pricing page.
 * Pick a tier (Starter/Professional/Enterprise), then 1–4 services (or the full
 * platform), and get the live 20%/35% bundle discount for the page's billing
 * interval. Reuses the same BundleSelector + pricing endpoints as the annual
 * flow — no duplicated pricing logic. CTA carries services + tier + interval to
 * signup, which computes the authoritative price server-side.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PricingCatalog, WorkflowService, fetchPricingCatalog } from '@/lib/pricing';
import BundleSelector from './BundleSelector';

const TIERS = [
  { value: 'starter', label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

export default function TieredBundleBuilder({ billing }: { billing: 'monthly' | 'annual' }) {
  const [tier, setTier] = useState<string>('professional');
  const [catalog, setCatalog] = useState<PricingCatalog | null>(null);
  const [selected, setSelected] = useState<WorkflowService[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchPricingCatalog(tier).then((c) => { if (!cancelled) setCatalog(c); });
    return () => { cancelled = true; };
  }, [tier]);

  const href = selected.length === 4
    ? `/signup?services=full&tier=${tier}&billing=${billing}`
    : selected.length > 0
    ? `/signup?services=${selected.join(',')}&tier=${tier}&billing=${billing}`
    : '';

  return (
    <div className="border-t border-border pt-16">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold mb-3 font-mono">
          Prefer à la carte? <span className="text-amber-500">Mix &amp; match services.</span>
        </h3>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Pick a tier, then choose the services you need. Bundle 2 for 20% off, 3 for 35% off,
          or take the full platform.
        </p>
      </div>

      {/* Tier selector */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTier(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${
              tier === t.value
                ? 'bg-amber-500 text-zinc-950 font-bold'
                : 'bg-card text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-5xl mx-auto">
        {catalog ? (
          <BundleSelector
            catalog={catalog}
            selected={selected}
            onChange={setSelected}
            interval={billing}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-card/50 border border-border h-40 animate-pulse" />
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          {href ? (
            <Link
              href={href}
              className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-8 py-3.5 font-mono font-bold text-zinc-950 transition-colors hover:bg-amber-400"
            >
              Get started
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex items-center justify-center rounded-xl bg-muted px-8 py-3.5 font-mono font-bold text-muted-foreground cursor-not-allowed"
            >
              Select a service to continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
