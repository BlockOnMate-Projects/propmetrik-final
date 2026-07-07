'use client';

/**
 * Bundle selector — pick 1–4 workflow services à la carte (with live 20%/35%
 * bundle discounts) or the full platform (all 4). Interval-aware so it drives
 * BOTH the annual entry pricing and the tiered (starter/pro/enterprise) pricing;
 * the caller sets `interval` and passes the tier-specific catalog. Each service
 * is a vertical card with description + "what you get" list. Controlled: parent
 * owns the selected set.
 */
import { Check } from 'lucide-react';
import { useMemo } from 'react';
import {
  PricingCatalog,
  WorkflowService,
  WORKFLOW_SERVICES,
  computeLocalQuote,
  formatGhs,
} from '@/lib/pricing';

interface Props {
  catalog: PricingCatalog;
  selected: WorkflowService[];
  onChange: (next: WorkflowService[]) => void;
  /** Billing interval — controls price field + labels. Default annual. */
  interval?: 'annual' | 'monthly';
  /** Compact = signup embed (tighter cards). */
  compact?: boolean;
}

export default function BundleSelector({ catalog, selected, onChange, interval = 'annual', compact }: Props) {
  const allSelected = selected.length === WORKFLOW_SERVICES.length;
  const per = interval === 'annual' ? '/year' : '/month';
  const perShort = interval === 'annual' ? '/yr' : '/mo';
  const billed = interval === 'annual' ? 'billed annually' : 'billed monthly';
  const priceOf = (annual: number, monthly: number) => (interval === 'annual' ? annual : monthly);

  const quote = useMemo(
    () => computeLocalQuote(catalog, selected, interval),
    [catalog, selected, interval]
  );

  const toggle = (key: WorkflowService) => {
    onChange(selected.includes(key) ? selected.filter((s) => s !== key) : [...selected, key]);
  };
  const selectAll = () => onChange(allSelected ? [] : [...WORKFLOW_SERVICES]);

  const discountLabel =
    selected.length >= 2 && !quote.is_full_platform
      ? `${Math.round(quote.discount_pct * 100)}% bundle discount applied`
      : quote.is_full_platform
      ? 'Best value — full platform'
      : selected.length === 1
      ? 'Add another service to unlock 20% off'
      : '';

  return (
    <div className="w-full">
      {/* Full-platform highlight */}
      {catalog.full_platform && (
        <button
          type="button"
          onClick={selectAll}
          className={`w-full mb-5 rounded-2xl border-2 p-5 text-left transition-all ${
            allSelected
              ? 'border-amber-500/60 bg-gradient-to-b from-amber-500/10 to-transparent'
              : 'border-border bg-card hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-lg">Full Platform</span>
                <span className="bg-amber-500 text-zinc-950 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                  ALL 4 SERVICES
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {catalog.full_platform.description || 'Valuations · Property Management · CRM · Projects'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono font-bold text-xl text-amber-500">
                {formatGhs(priceOf(catalog.full_platform.annual_ghs, catalog.full_platform.monthly_ghs))}
              </div>
              <div className="text-xs text-muted-foreground">{per}</div>
            </div>
          </div>
          {catalog.full_platform.features.length > 0 && (
            <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {catalog.full_platform.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </button>
      )}

      <div className="flex items-center gap-3 my-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          or build your own
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Per-service vertical cards */}
      <div className={`grid gap-4 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
        {catalog.services.map((svc) => {
          const isOn = selected.includes(svc.key);
          return (
            <button
              type="button"
              key={svc.key}
              onClick={() => toggle(svc.key)}
              className={`relative flex flex-col rounded-xl border p-5 text-left transition-all ${
                isOn
                  ? 'border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono font-bold text-base">{svc.name}</div>
                  {svc.description && (
                    <p className="text-xs text-muted-foreground mt-1">{svc.description}</p>
                  )}
                </div>
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    isOn ? 'border-amber-500 bg-amber-500 text-zinc-950' : 'border-border'
                  }`}
                >
                  {isOn && <Check className="h-3.5 w-3.5" />}
                </span>
              </div>

              <div className="mt-3">
                <span className="font-mono font-bold text-xl text-foreground">
                  {formatGhs(priceOf(svc.annual_ghs, svc.monthly_ghs))}
                </span>
                <span className="text-xs text-muted-foreground">{per}</span>
              </div>

              {svc.features.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                  {svc.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className={`h-3.5 w-3.5 shrink-0 ${isOn ? 'text-amber-500' : 'text-muted-foreground/60'}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      {/* Live quote summary */}
      <div className="mt-6 rounded-xl border border-border bg-muted/40 p-5">
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center font-mono">
            Select one or more services to see your price.
          </p>
        ) : (
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {quote.is_full_platform
                  ? 'Full platform'
                  : `${selected.length} service${selected.length > 1 ? 's' : ''} selected`}
              </div>
              {discountLabel && (
                <div className="text-xs text-green-600 dark:text-green-400 font-mono mt-1">
                  {discountLabel}
                </div>
              )}
            </div>
            <div className="text-right">
              {quote.discount_pct > 0 && (
                <div className="text-xs text-muted-foreground line-through font-mono">
                  {formatGhs(quote.list_ghs)}{perShort}
                </div>
              )}
              <div className="font-mono font-bold text-2xl text-amber-500">
                {formatGhs(quote.price_ghs)}
              </div>
              <div className="text-xs text-muted-foreground">{billed}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
