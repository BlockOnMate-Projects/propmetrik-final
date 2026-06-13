'use client'

import { PortfolioFxMeta } from '@/types/property-management'

/**
 * Small "rates as of HH:MM" stamp shown next to GHS-normalized aggregates so users
 * know totals are converted at a live rate, and which rate was used.
 */
export function RateStamp({ fx, className }: { fx?: PortfolioFxMeta | null; className?: string }) {
    if (!fx || !fx.rates) return null

    const usd = fx.rates['USD']
    let time: string | null = null
    try {
        const d = new Date(fx.ratesAsOf)
        if (!isNaN(d.getTime())) time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } catch {
        time = null
    }

    return (
        <span
            className={`text-[9px] font-mono ${fx.ratesDegraded ? 'text-amber-600' : 'text-zinc-500'} ${className || ''}`}
            title={fx.ratesDegraded ? 'A live rate was unavailable — converted at 1:1' : `Source: ${fx.ratesSource}`}
        >
            GH₵ base{usd ? ` · USD ${Number(usd).toFixed(2)}` : ''}{time ? ` · ${time}` : ''}
            {fx.ratesDegraded ? ' · ⚠ rate stale' : ''}
        </span>
    )
}
