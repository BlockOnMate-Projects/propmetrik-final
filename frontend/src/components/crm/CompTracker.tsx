'use client'

import React, { useState, useEffect } from 'react'
import {
    TrendingUp,
    TrendingDown,
    BarChart3,
    Building2,
    MapPin,
    Calendar,
    Loader2,
    ArrowUpRight,
    ArrowDownRight,
} from 'lucide-react'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface CompSale {
    id: string
    address: string
    city: string
    property_type: string
    price: number
    currency: string
    sold_date: string
    size_sqft?: number
    price_per_sqft?: number
}

interface MarketTrend {
    period: string
    avg_price: number
    median_price: number
    volume: number
    change_pct: number
}

export function CompTracker() {
    const [loading, setLoading] = useState(false)
    const [region, setRegion] = useState('all')
    const [propertyType, setPropertyType] = useState('all')
    const [comps, setComps] = useState<CompSale[]>([])
    const [trends, setTrends] = useState<MarketTrend[]>([])

    useEffect(() => {
        setLoading(true)
        const fetchData = async () => {
            try {
                // Fetch recent property sales as comps
                const params = new URLSearchParams({ limit: '20' })
                if (region !== 'all') params.set('city', region)
                if (propertyType !== 'all') params.set('property_type', propertyType)
                params.set('sort', 'updated_at')
                params.set('order', 'desc')

                const propsRes = await fetch(`${API_BASE}/crm/properties?${params}`, { credentials: 'include' })
                if (propsRes.ok) {
                    const data = await propsRes.json()
                    const properties = data.properties || []
                    setComps(properties.map((p: any) => ({
                        id: p.id,
                        address: p.address || p.property_name,
                        city: p.city || '',
                        property_type: p.property_type || '',
                        price: p.price || 0,
                        currency: p.currency || 'GHS',
                        sold_date: p.updated_at || p.created_at,
                        size_sqft: p.total_area || undefined,
                        price_per_sqft: p.total_area && p.price ? Math.round(p.price / p.total_area) : undefined,
                    })))

                    // Derive simple trends from data
                    const monthlyData: Record<string, { prices: number[]; count: number }> = {}
                    for (const p of properties) {
                        const date = new Date(p.updated_at || p.created_at)
                        const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                        if (!monthlyData[period]) monthlyData[period] = { prices: [], count: 0 }
                        if (p.price) monthlyData[period].prices.push(p.price)
                        monthlyData[period].count++
                    }

                    const sortedPeriods = Object.keys(monthlyData).sort()
                    const derivedTrends: MarketTrend[] = sortedPeriods.slice(-6).map((period, i, arr) => {
                        const d = monthlyData[period]
                        const avg = d.prices.length > 0 ? d.prices.reduce((a, b) => a + b, 0) / d.prices.length : 0
                        const sorted = [...d.prices].sort((a, b) => a - b)
                        const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
                        const prevPeriod = arr[i - 1]
                        const prevAvg = prevPeriod ? (monthlyData[prevPeriod]?.prices?.reduce((a, b) => a + b, 0) || 0) / (monthlyData[prevPeriod]?.prices?.length || 1) : avg
                        const changePct = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : 0

                        return { period, avg_price: Math.round(avg), median_price: Math.round(median), volume: d.count, change_pct: Math.round(changePct * 10) / 10 }
                    })
                    setTrends(derivedTrends)
                }
            } catch (err) {
                console.error('Failed to load comp data:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [region, propertyType])

    const formatCurrency = (val: number, cur = 'GHS') =>
        new Intl.NumberFormat('en-GH', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val)

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Comparable Sales Tracker</h2>
                <div className="ml-auto flex gap-2">
                    <Select value={region} onValueChange={setRegion}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue placeholder="Region" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Regions</SelectItem>
                            <SelectItem value="Accra">Accra</SelectItem>
                            <SelectItem value="Kumasi">Kumasi</SelectItem>
                            <SelectItem value="East Legon">East Legon</SelectItem>
                            <SelectItem value="Airport Residential">Airport Res.</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={propertyType} onValueChange={setPropertyType}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="residential">Residential</SelectItem>
                            <SelectItem value="commercial">Commercial</SelectItem>
                            <SelectItem value="land">Land</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    {/* Trend summary cards */}
                    {trends.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {(() => {
                                const latest = trends[trends.length - 1]
                                const totalVolume = trends.reduce((s, t) => s + t.volume, 0)
                                return (
                                    <>
                                        <Card className="border-border bg-card">
                                            <CardContent className="pt-4 pb-3">
                                                <div className="text-xs text-muted-foreground uppercase">Avg Price ({latest.period})</div>
                                                <div className="text-lg font-semibold text-foreground mt-1 font-mono">
                                                    {formatCurrency(latest.avg_price)}
                                                </div>
                                                <div className={cn('flex items-center text-xs mt-1', latest.change_pct >= 0 ? 'text-green-500' : 'text-red-500')}>
                                                    {latest.change_pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                                    {Math.abs(latest.change_pct)}% MoM
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className="border-border bg-card">
                                            <CardContent className="pt-4 pb-3">
                                                <div className="text-xs text-muted-foreground uppercase">Median Price</div>
                                                <div className="text-lg font-semibold text-foreground mt-1 font-mono">
                                                    {formatCurrency(latest.median_price)}
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className="border-border bg-card">
                                            <CardContent className="pt-4 pb-3">
                                                <div className="text-xs text-muted-foreground uppercase">Total Volume</div>
                                                <div className="text-lg font-semibold text-foreground mt-1 font-mono">
                                                    {totalVolume} <span className="text-xs text-muted-foreground font-normal">properties</span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </>
                                )
                            })()}
                        </div>
                    )}

                    {/* Comps table */}
                    <Card className="border-border bg-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-primary" />
                                Recent Comparable Sales
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {comps.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">No comparable data available.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-xs text-muted-foreground uppercase">
                                                <th className="text-left py-2 font-medium">Address</th>
                                                <th className="text-left py-2 font-medium">City</th>
                                                <th className="text-left py-2 font-medium">Type</th>
                                                <th className="text-right py-2 font-medium">Price</th>
                                                <th className="text-right py-2 font-medium">$/sqft</th>
                                                <th className="text-right py-2 font-medium">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {comps.map(comp => (
                                                <tr key={comp.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                                    <td className="py-2 text-foreground">{comp.address}</td>
                                                    <td className="py-2 text-muted-foreground">{comp.city}</td>
                                                    <td className="py-2 text-muted-foreground capitalize">{comp.property_type}</td>
                                                    <td className="py-2 text-right font-mono text-foreground">{formatCurrency(comp.price, comp.currency)}</td>
                                                    <td className="py-2 text-right font-mono text-muted-foreground">
                                                        {comp.price_per_sqft ? formatCurrency(comp.price_per_sqft) : '—'}
                                                    </td>
                                                    <td className="py-2 text-right text-muted-foreground text-xs">
                                                        {new Date(comp.sold_date).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
