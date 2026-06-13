'use client'

import { useEffect, useState } from 'react'
import { propertyManagementApi } from './property-management-api'
import { PortfolioFxMeta } from '@/types/property-management'

/**
 * Shared live FX rates (USD/EUR/GBP -> GHS) for client-side aggregates and
 * native+equivalent displays. One module-level cache is shared across every
 * component so the page makes a single /pm/fx/rates request, not one per card.
 *
 * Rule of thumb: individual amounts stay in their native currency; any SUM across
 * mixed currencies must be converted to GHS first (you can't add USD and GHS).
 */
const TTL_MS = 5 * 60 * 1000 // matches the backend FX cache window
let cache: { data: PortfolioFxMeta; fetchedAt: number } | null = null
let inflight: Promise<PortfolioFxMeta> | null = null

async function loadRates(): Promise<PortfolioFxMeta> {
    if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.data
    if (inflight) return inflight
    inflight = (async () => {
        try {
            const data = await propertyManagementApi.getFxRates()
            cache = { data, fetchedAt: Date.now() }
            return data
        } finally {
            inflight = null
        }
    })()
    return inflight
}

export interface UseExchangeRates {
    fx: PortfolioFxMeta | null
    loading: boolean
    /** GHS per 1 unit of `currency` (1 for GHS / unknown). */
    rateFor: (currency?: string | null) => number
    /** Convert a native amount to GHS. Falls back to 1:1 when the rate is unknown. */
    toGHS: (amount: number, currency?: string | null) => number
}

export function useExchangeRates(): UseExchangeRates {
    const [fx, setFx] = useState<PortfolioFxMeta | null>(cache?.data ?? null)
    const [loading, setLoading] = useState<boolean>(!cache)

    useEffect(() => {
        let active = true
        loadRates()
            .then(d => { if (active) { setFx(d); setLoading(false) } })
            .catch(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [])

    const rateFor = (currency?: string | null): number => {
        const c = (currency || 'GHS').toUpperCase()
        if (c === 'GHS') return 1
        const r = fx?.rates?.[c]
        return typeof r === 'number' && r > 0 ? r : 1
    }

    const toGHS = (amount: number, currency?: string | null): number => (amount || 0) * rateFor(currency)

    return { fx, loading, rateFor, toGHS }
}
