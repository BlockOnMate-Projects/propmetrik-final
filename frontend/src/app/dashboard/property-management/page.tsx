
'use client'

import React, { useEffect, useState } from 'react'
import {
    Building2,
    Users,
    Wallet,
    AlertCircle,
    TrendingUp,
    ArrowUpRight,
    Activity,
    Loader2
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { propertyManagementApi } from '@/lib/property-management-api'

export default function PropertyManagementDashboard() {
    const [metrics, setMetrics] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadDashboard = async () => {
            try {
                setIsLoading(true)
                const response = await propertyManagementApi.getPortfolioOverview()
                setMetrics(response)
            } catch (err) {
                console.error('Failed to load portfolio overview:', err)
                setError('Failed to load portfolio metrics.')
            } finally {
                setIsLoading(false)
            }
        }
        loadDashboard()
    }, [])

    if (error) {
        return (
            <div className="p-8 text-center text-red-500 font-mono">
                {error}
                <Button variant="link" onClick={() => window.location.reload()} className="block mx-auto mt-2 text-amber-500">Retry</Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Properties Managed</CardTitle>
                        <Building2 className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : metrics?.totalProperties || 0}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1 font-mono uppercase">Portfolio Active</p>
                    </CardContent>
                </Card>
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Occupancy Rate</CardTitle>
                        <Users className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `${metrics?.occupancyRate || 0}%`}
                        </div>
                        <p className="text-[10px] text-green-500 mt-1 font-mono uppercase flex items-center">
                            <ArrowUpRight className="h-3 w-3 mr-1" /> Stable
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Monthly Revenue</CardTitle>
                        <Wallet className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `₵${(metrics?.monthlyRevenue || 0).toLocaleString()}`}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1 font-mono uppercase">Rental Income</p>
                        <Progress value={85} className="h-1 mt-2 bg-zinc-900" indicatorClassName="bg-amber-600" />
                    </CardContent>
                </Card>
                <Card className="bg-black border border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Service Requests</CardTitle>
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white font-mono">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : metrics?.activeWorkOrders || 0}
                        </div>
                        <p className="text-[10px] text-red-500 mt-1 font-mono uppercase flex items-center">
                            Requires Attention
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* Main Chart Area */}
                <Card className="col-span-4 bg-black border border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono uppercase text-amber-500">Revenue Performance (YTD)</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px] flex items-center justify-center border border-dashed border-zinc-800 bg-zinc-950/30">
                            <div className="text-center space-y-2">
                                <TrendingUp className="h-8 w-8 text-amber-900/50 mx-auto" />
                                <p className="text-xs text-zinc-600 font-mono uppercase">Portfolio Performance Visualization</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Action Items / Feed */}
                <Card className="col-span-3 bg-black border border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono uppercase text-amber-500">System Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                                </div>
                            ) : (
                                [
                                    { type: 'Portfolio Sync', desc: 'Real-time metrics updated', time: 'Just now', urgent: false },
                                    { type: 'API Connection', desc: 'Property management services live', time: 'Connected', urgent: false },
                                    { type: 'Service Status', desc: `${metrics?.activeWorkOrders || 0} Open maintenance tickets`, time: 'Action needed', urgent: metrics?.activeWorkOrders > 0 },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between border-b border-zinc-900 pb-2 last:border-0 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium font-mono text-zinc-300 leading-none uppercase">
                                                {item.urgent ? <span className="text-red-500 mr-2">!</span> : null}
                                                {item.type}
                                            </p>
                                            <p className="text-[10px] text-zinc-500 font-mono uppercase">{item.desc}</p>
                                        </div>
                                        <div className="text-[10px] text-zinc-600 font-mono uppercase">{item.time}</div>
                                    </div>
                                ))
                            )}
                        </div>
                        <Button variant="ghost" className="w-full mt-4 text-xs font-mono text-amber-600 hover:text-amber-500 hover:bg-zinc-900 uppercase">
                            View All Events
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Links Grid */}
            <div className="grid gap-4 md:grid-cols-4">
                {[
                    { label: 'Register Tenant', href: '/dashboard/property-management/tenants/new' },
                    { label: 'View Tenancies', href: '/dashboard/property-management/tenants' },
                    { label: 'Issue Work Order', href: '/dashboard/property-management/maintenance' },
                    { label: 'Audit Records', href: '/dashboard/property-management/financials' }
                ].map((action) => (
                    <Link key={action.label} href={action.href}>
                        <Button
                            variant="outline"
                            className="w-full h-20 bg-zinc-950 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-amber-500 hover:border-amber-900 group transition-all"
                        >
                            <div className="flex flex-col items-center gap-2">
                                <Activity className="h-5 w-5 opacity-50 group-hover:opacity-100" />
                                <span className="text-xs font-mono uppercase">{action.label}</span>
                            </div>
                        </Button>
                    </Link>
                ))}
            </div>
        </div>
    )
}
