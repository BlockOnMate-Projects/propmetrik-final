'use client'

import React, { useState, lazy, Suspense } from 'react'
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

const RevenueForecaster = lazy(() => import('@/components/crm/RevenueForecaster'))
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import PaymentSettings from '@/components/property-management/PaymentSettings'
import { crmPaymentConfigApi } from '@/lib/crm-api'

export default function DealsFinancialsPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'payment-settings' | 'forecast'>('overview')

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Deal Financial Center
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Commission payouts, deal revenue tracking &amp; payment configuration
                    </p>
                </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'overview'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <DollarSign className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('payment-settings')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'payment-settings'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <CreditCard className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Payment Settings
                </button>
                <button
                    onClick={() => setActiveTab('forecast')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'forecast'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <TrendingUp className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    Forecast
                </button>
            </div>

            {/* Tab: Forecast */}
            {activeTab === 'forecast' && (
                <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
                    <RevenueForecaster />
                </Suspense>
            )}

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
                        <Card className="border-border shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Deal Value</p>
                                        <p className="text-2xl font-bold text-foreground mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <DollarSign className="h-5 w-5 text-primary" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-xs text-muted-foreground">
                                    <TrendingUp className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                                    <span>This period</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Commissions Earned</p>
                                        <p className="text-2xl font-bold text-foreground mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                                        <Wallet className="h-5 w-5 text-emerald-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-xs text-muted-foreground">
                                    <ArrowUpRight className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                                    <span>Approved &amp; paid</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending Payouts</p>
                                        <p className="text-2xl font-bold text-foreground mt-1">GH₵0</p>
                                    </div>
                                    <div className="p-2 bg-orange-500/10 rounded-lg">
                                        <FileText className="h-5 w-5 text-orange-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-xs text-muted-foreground">
                                    <span>Awaiting approval</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Agents</p>
                                        <p className="text-2xl font-bold text-foreground mt-1">0</p>
                                    </div>
                                    <div className="p-2 bg-blue-500/10 rounded-lg">
                                        <Users className="h-5 w-5 text-blue-500" />
                                    </div>
                                </div>
                                <div className="flex items-center mt-2 text-xs text-muted-foreground">
                                    <span>With commission plans</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Revenue chart placeholder */}
                    <Card className="border-border shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-foreground">Deal Revenue (YTD)</CardTitle>
                            <CardDescription className="text-xs text-muted-foreground">
                                Closed deals and commission payouts over time
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-64 flex items-center justify-center">
                            <div className="text-center text-muted-foreground">
                                <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                <p className="text-xs">Revenue chart will populate with deal data</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent transactions placeholder */}
                    <Card className="border-border shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-foreground">Recent Transactions</CardTitle>
                            <CardDescription className="text-xs text-muted-foreground">
                                Latest deal payments and commission payouts
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="py-8 text-center">
                            <p className="text-xs text-muted-foreground">No transactions yet</p>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
