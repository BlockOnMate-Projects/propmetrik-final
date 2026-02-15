'use client'

import React, { useState } from 'react'
import {
    DollarSign,
    CreditCard,
    TrendingUp,
    BarChart3,
    Wallet,
    ArrowUpRight,
    HardHat,
    Building2,
    Layers,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import PaymentSettings from '@/components/property-management/PaymentSettings'
import { projectsPaymentConfigApi } from '@/lib/projects-api'

export default function ProjectsFinancialsPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'payment-settings'>('overview')

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
                        PROJECT FINANCIAL CENTER
                    </h1>
                    <p className="text-zinc-500 font-mono text-xs mt-1">
                        Project costs, buyer payments, contractor payouts &amp; payment configuration
                    </p>
                </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2.5 font-mono text-[11px] tracking-wider border-b-2 transition-colors ${
                        activeTab === 'overview'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    <DollarSign className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('payment-settings')}
                    className={`px-4 py-2.5 font-mono text-[11px] tracking-wider border-b-2 transition-colors ${
                        activeTab === 'payment-settings'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    <CreditCard className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Payment Settings
                </button>
            </div>

            {/* Tab: Payment Settings */}
            {activeTab === 'payment-settings' && (
                <PaymentSettings
                    paymentApi={projectsPaymentConfigApi}
                    serviceLabel="Project Management"
                />
            )}

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">TOTAL PROJECT BUDGET</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-amber-500/10 rounded-lg">
                                        <DollarSign className="h-5 w-5 text-amber-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <TrendingUp className="h-3 w-3 mr-1 text-emerald-400" />
                                    <span>Across all projects</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">BUYER PAYMENTS</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                                        <Wallet className="h-5 w-5 text-emerald-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <ArrowUpRight className="h-3 w-3 mr-1 text-emerald-400" />
                                    <span>Collected this period</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">CONTRACTOR PAYOUTS</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-orange-500/10 rounded-lg">
                                        <HardHat className="h-5 w-5 text-orange-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <span>Pending &amp; completed</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">ACTIVE PROJECTS</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">0</p>
                                    </div>
                                    <div className="p-2 bg-blue-500/10 rounded-lg">
                                        <Building2 className="h-5 w-5 text-blue-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <span>With payment plans</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Costs chart placeholder */}
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-mono text-white">PROJECT COSTS (YTD)</CardTitle>
                            <CardDescription className="text-[10px] font-mono text-zinc-500">
                                Budget vs. actual spend across active projects
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-64 flex items-center justify-center">
                            <div className="text-center text-zinc-600">
                                <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                <p className="text-xs font-mono">Cost tracking will populate with project data</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent transactions placeholder */}
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-mono text-white">RECENT TRANSACTIONS</CardTitle>
                            <CardDescription className="text-[10px] font-mono text-zinc-500">
                                Latest buyer payments, cost invoices &amp; contractor payouts
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="py-8 text-center">
                            <p className="text-xs font-mono text-zinc-600">No transactions yet</p>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
