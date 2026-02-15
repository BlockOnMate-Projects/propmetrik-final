'use client'

import React, { useState } from 'react'
import {
    DollarSign,
    CreditCard,
    TrendingUp,
    BarChart3,
    Wallet,
    ArrowUpRight,
    FileText,
    Users,
    Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import PaymentSettings from '@/components/property-management/PaymentSettings'
import { crmPaymentConfigApi } from '@/lib/crm-api'

export default function DealsFinancialsPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'payment-settings'>('overview')

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
                        DEAL FINANCIAL CENTER
                    </h1>
                    <p className="text-zinc-500 font-mono text-xs mt-1">
                        Commission payouts, deal revenue tracking &amp; payment configuration
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
                    paymentApi={crmPaymentConfigApi}
                    serviceLabel="Deal Management"
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
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">TOTAL DEAL VALUE</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-amber-500/10 rounded-lg">
                                        <DollarSign className="h-5 w-5 text-amber-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <TrendingUp className="h-3 w-3 mr-1 text-emerald-400" />
                                    <span>This period</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">COMMISSIONS EARNED</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                                        <Wallet className="h-5 w-5 text-emerald-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <ArrowUpRight className="h-3 w-3 mr-1 text-emerald-400" />
                                    <span>Approved &amp; paid</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">PENDING PAYOUTS</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-orange-500/10 rounded-lg">
                                        <FileText className="h-5 w-5 text-orange-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <span>Awaiting approval</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900/80 border-zinc-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-mono text-zinc-500 tracking-wider">ACTIVE AGENTS</p>
                                        <p className="text-2xl font-mono font-bold text-white mt-1">0</p>
                                    </div>
                                    <div className="p-2 bg-blue-500/10 rounded-lg">
                                        <Users className="h-5 w-5 text-blue-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                                    <span>With commission plans</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Revenue chart placeholder */}
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-mono text-white">DEAL REVENUE (YTD)</CardTitle>
                            <CardDescription className="text-[10px] font-mono text-zinc-500">
                                Closed deals and commission payouts over time
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-64 flex items-center justify-center">
                            <div className="text-center text-zinc-600">
                                <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                <p className="text-xs font-mono">Revenue chart will populate with deal data</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent transactions placeholder */}
                    <Card className="bg-zinc-900/80 border-zinc-800">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-mono text-white">RECENT TRANSACTIONS</CardTitle>
                            <CardDescription className="text-[10px] font-mono text-zinc-500">
                                Latest deal payments and commission payouts
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
