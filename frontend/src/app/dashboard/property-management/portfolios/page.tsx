'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Plus,
    Briefcase,
    BarChart3,
    TrendingUp,
    TrendingDown,
    Users,
    Building2,
    ArrowUpRight,
    ArrowDownRight,
    FileText,
    PieChart as PieChartIcon,
    LayoutDashboard,
    Search,
    Activity,
    DollarSign,
    Calendar,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Home,
    Building,
    Warehouse,
    MapPin,
    Target,
    Percent
} from 'lucide-react'
import { propertyManagementApi } from '@/lib/property-management-api'
import { RateStamp } from '@/components/property-management/RateStamp'
import { useExchangeRates } from '@/lib/use-exchange-rates'
import {
    PortfolioMetrics,
    PortfolioComposition,
    LeasePortfolioSummary,
    Property
} from '@/types/property-management'
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    AreaChart,
    Area,
    CartesianGrid
} from 'recharts'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { EnterpriseNav } from '@/components/layout/EnterpriseNav'

const COLORS = ['#d97706', '#0ea5e9', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

const TYPE_LABELS: Record<string, string> = {
    'residential_house': 'Residential',
    'apartment_flat': 'Apartment',
    'commercial_office': 'Commercial',
    'industrial': 'Industrial',
    'land': 'Land',
    'mixed_use': 'Mixed Use'
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
    'residential_house': <Home className="h-3 w-3" />,
    'apartment_flat': <Building className="h-3 w-3" />,
    'commercial_office': <Building2 className="h-3 w-3" />,
    'industrial': <Warehouse className="h-3 w-3" />,
};

export default function PortfoliosPage() {
    // Properties keep their listed currency in the registry; the footer total normalizes to GHS.
    const { fx, toGHS } = useExchangeRates();
    const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
    const [composition, setComposition] = useState<PortfolioComposition | null>(null);
    const [leaseSummary, setLeaseSummary] = useState<LeasePortfolioSummary | null>(null);
    const [properties, setProperties] = useState<Property[]>([]);
    const [portfolioFinancials, setPortfolioFinancials] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setMounted(true);
        async function loadData() {
            try {
                const [m, c, l, p, pf] = await Promise.all([
                    propertyManagementApi.getPortfolioOverview(),
                    propertyManagementApi.getPortfolioComposition(),
                    propertyManagementApi.getLeasePortfolioSummary(),
                    propertyManagementApi.getProperties({ limit: 100 }),
                    propertyManagementApi.getPortfolioFinancialSummary().catch(() => null),
                ]);
                setMetrics(m);
                setComposition(c);
                setLeaseSummary(l);
                setPortfolioFinancials(pf);

                const propertyData = Array.isArray(p) ? p : (p as any).data || [];
                setProperties(propertyData);
            } catch (error) {
                console.error('Failed to load portfolio data:', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Transform composition data for charts with proper labels
    const typeChartData = useMemo(() => {
        if (!composition?.byType) return [];
        return composition.byType.map(item => ({
            name: TYPE_LABELS[item.type] || item.type,
            value: item.count,
            amount: item.value
        }));
    }, [composition]);

    const regionChartData = useMemo(() => {
        if (!composition?.byRegion) return [];
        return composition.byRegion.map(item => ({
            name: item.region.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            value: item.count,
            amount: item.value
        }));
    }, [composition]);

    // Filter properties based on search
    const filteredProperties = useMemo(() => {
        if (!searchTerm) return properties;
        const term = searchTerm.toLowerCase();
        return properties.filter(p =>
            p.title?.toLowerCase().includes(term) ||
            p.referenceNumber?.toLowerCase().includes(term) ||
            p.addressCity?.toLowerCase().includes(term)
        );
    }, [properties, searchTerm]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-GH', {
            style: 'currency',
            currency: 'GHS',
            maximumFractionDigits: 0
        }).format(val);
    };

    const formatCurrencyShort = (val: number) => {
        if (val >= 1000000) return `GH₵${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `GH₵${(val / 1000).toFixed(0)}K`;
        return `GH₵${val}`;
    };

    // Per-property amounts stay in their listed currency (e.g. US$1,200).
    const formatNative = (val: number, currency?: string | null) =>
        new Intl.NumberFormat('en-GH', {
            style: 'currency',
            currency: (currency || 'GHS').toUpperCase(),
            maximumFractionDigits: 0
        }).format(val);

    // GH₵ equivalent shown beneath a non-GHS native amount; null when already GHS.
    const ghsEquivalent = (price: number, currency?: string | null) =>
        (currency || 'GHS').toUpperCase() === 'GHS' ? null : `≈ ${formatCurrency(toGHS(price || 0, currency))}`;

    // Calculate additional metrics
    const avgPropertyValue = metrics?.totalValue && metrics?.totalProperties
        ? metrics.totalValue / metrics.totalProperties
        : 0;

    const occupiedUnits = leaseSummary?.activeLeases || 0;
    const totalUnits = leaseSummary?.totalUnits || metrics?.totalProperties || 0;
    const vacantUnits = totalUnits - occupiedUnits;
    const expiringTotal = (leaseSummary?.expiringSoon?.within30Days || 0) +
        (leaseSummary?.expiringSoon?.within60Days || 0) +
        (leaseSummary?.expiringSoon?.within90Days || 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* Enterprise Navigation */}
            <EnterpriseNav />

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Briefcase className="h-5 w-5 text-amber-500" />
                        <h1 className="text-2xl font-bold tracking-tight text-white font-mono uppercase">Portfolio Engine</h1>
                    </div>
                    <p className="text-sm text-zinc-500 font-mono">Real-time portfolio analytics & asset performance tracking</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/property-management/properties/new">
                        <Button className="bg-amber-600 hover:bg-amber-500 text-white font-bold font-mono text-xs uppercase">
                            <Plus className="mr-2 h-3 w-3" />
                            New Asset
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Primary KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {/* Total Portfolio Value */}
                <Card className="bg-zinc-900 border-zinc-800 col-span-2">
                    <CardContent className="pt-6 pb-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Total Portfolio Value</p>
                                <h2 className="text-3xl font-black text-white font-mono tracking-tight">{formatCurrency(metrics?.totalValue || 0)}</h2>
                                <RateStamp fx={metrics?.fx} className="mt-1 block" />
                                <div className="flex items-center gap-2 mt-2">
                                    {(metrics?.valueTrend || 0) >= 0 ? (
                                        <span className="text-xs text-emerald-500 font-mono inline-flex items-center bg-emerald-500/10 px-2 py-0.5 rounded">
                                            <TrendingUp className="h-3 w-3 mr-1" />
                                            +{metrics?.valueTrend}% YoY
                                        </span>
                                    ) : (
                                        <span className="text-xs text-red-500 font-mono inline-flex items-center bg-red-500/10 px-2 py-0.5 rounded">
                                            <TrendingDown className="h-3 w-3 mr-1" />
                                            {metrics?.valueTrend}% YoY
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <DollarSign className="h-5 w-5 text-amber-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Monthly Revenue */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="pt-6 pb-4">
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Monthly Revenue</p>
                        <h2 className="text-xl font-bold text-white font-mono">{formatCurrency(metrics?.monthlyIncome || 0)}</h2>
                        <p className="text-[10px] text-zinc-500 font-mono mt-1">
                            <span className={metrics?.incomeTrend && metrics.incomeTrend >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                {metrics?.incomeTrend && metrics.incomeTrend >= 0 ? '+' : ''}{metrics?.incomeTrend || 0}%
                            </span> vs last month
                        </p>
                    </CardContent>
                </Card>

                {/* Occupancy Rate */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="pt-6 pb-4">
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Occupancy Rate</p>
                        <h2 className="text-xl font-bold text-white font-mono">{metrics?.occupancyRate?.toFixed(1) || 0}%</h2>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-1000 bg-gradient-to-r from-amber-500 to-amber-400"
                                style={{ width: `${metrics?.occupancyRate || 0}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Collection Rate */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="pt-6 pb-4">
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Collection Rate</p>
                        <h2 className="text-xl font-bold text-emerald-500 font-mono">{metrics?.collectionRate?.toFixed(1) || 0}%</h2>
                        <p className="text-[10px] text-zinc-500 font-mono mt-1">
                            <span className="text-emerald-500">{metrics?.overduePayments || 0}</span> overdue
                        </p>
                    </CardContent>
                </Card>

                {/* Total Assets */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="pt-6 pb-4">
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Total Assets</p>
                        <h2 className="text-xl font-bold text-white font-mono">{metrics?.totalProperties || 0}</h2>
                        <p className="text-[10px] text-zinc-500 font-mono mt-1">
                            {composition?.byRegion?.length || 0} region{(composition?.byRegion?.length || 0) !== 1 ? 's' : ''}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Secondary Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-sky-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase">Active Tenants</p>
                        <p className="text-lg font-bold text-white font-mono">{metrics?.totalTenants || 0}</p>
                    </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase">Active Leases</p>
                        <p className="text-lg font-bold text-white font-mono">{leaseSummary?.activeLeases || 0}</p>
                    </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase">Pending Work Orders</p>
                        <p className="text-lg font-bold text-white font-mono">{metrics?.pendingWorkOrders || 0}</p>
                    </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                        <Target className="h-5 w-5 text-violet-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase">Avg. Asset Value</p>
                        <p className="text-lg font-bold text-white font-mono">{formatCurrencyShort(avgPropertyValue)}</p>
                    </div>
                </div>
            </div>

            {/* Financial Analytics Row */}
            {portfolioFinancials && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-5 pb-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Portfolio NOI</p>
                            <p className={`text-xl font-bold font-mono ${(portfolioFinancials.portfolioNOI ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatCurrency(portfolioFinancials.portfolioNOI ?? 0)}
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Net Operating Income</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-5 pb-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Wtd. Cap Rate</p>
                            <p className="text-xl font-bold text-amber-400 font-mono">
                                {(portfolioFinancials.weightedCapRate ?? 0).toFixed(2)}%
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Weighted Capitalization</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-5 pb-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Monthly Income</p>
                            <p className="text-xl font-bold text-green-400 font-mono">
                                {formatCurrency(portfolioFinancials.totalMonthlyIncome ?? 0)}
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Gross Monthly</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-5 pb-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Net Monthly</p>
                            <p className={`text-xl font-bold font-mono ${(portfolioFinancials.netMonthlyCashFlow ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatCurrency(portfolioFinancials.netMonthlyCashFlow ?? 0)}
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">After Expenses</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardContent className="pt-5 pb-4">
                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Avg Occupancy</p>
                            <p className={`text-xl font-bold font-mono ${(portfolioFinancials.averageOccupancy ?? 0) >= 90 ? 'text-green-400' : (portfolioFinancials.averageOccupancy ?? 0) >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                                {(portfolioFinancials.averageOccupancy ?? 0).toFixed(0)}%
                            </p>
                            <p className="text-[9px] font-mono text-zinc-600 mt-1">Portfolio Average</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Asset Distribution Charts */}
                <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-mono text-white flex items-center gap-2">
                            <PieChartIcon className="h-4 w-4 text-amber-500" />
                            PORTFOLIO COMPOSITION
                        </CardTitle>
                        <CardDescription className="text-[10px] font-mono text-zinc-500">
                            Asset distribution by property type and geographic region
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* By Property Type */}
                            <div className="h-[280px]">
                                <p className="text-center text-[10px] text-zinc-500 font-mono uppercase mb-4 flex items-center justify-center gap-2">
                                    <Building2 className="h-3 w-3" /> By Property Type
                                </p>
                                {mounted && typeChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={typeChartData}
                                                innerRadius={55}
                                                outerRadius={85}
                                                paddingAngle={3}
                                                dataKey="value"
                                                nameKey="name"
                                                stroke="#18181b"
                                                strokeWidth={2}
                                            >
                                                {typeChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#18181b',
                                                    border: '1px solid #27272a',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
                                                }}
                                                itemStyle={{ color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                                                formatter={(value: number, name: string, props: any) => [
                                                    `${value} properties (${formatCurrencyShort(props.payload.amount)})`,
                                                    name
                                                ]}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={50}
                                                wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
                                                formatter={(value) => <span className="text-zinc-400">{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-xs">
                                        No property data
                                    </div>
                                )}
                            </div>

                            {/* By Region */}
                            <div className="h-[280px]">
                                <p className="text-center text-[10px] text-zinc-500 font-mono uppercase mb-4 flex items-center justify-center gap-2">
                                    <MapPin className="h-3 w-3" /> By Region
                                </p>
                                {mounted && regionChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={regionChartData}
                                                innerRadius={55}
                                                outerRadius={85}
                                                paddingAngle={3}
                                                dataKey="value"
                                                nameKey="name"
                                                stroke="#18181b"
                                                strokeWidth={2}
                                            >
                                                {regionChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#18181b',
                                                    border: '1px solid #27272a',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
                                                }}
                                                itemStyle={{ color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                                                formatter={(value: number, name: string, props: any) => [
                                                    `${value} properties (${formatCurrencyShort(props.payload.amount)})`,
                                                    name
                                                ]}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={50}
                                                wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
                                                formatter={(value) => <span className="text-zinc-400">{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-xs">
                                        No region data
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Type Breakdown Bar */}
                        <div className="mt-6 pt-4 border-t border-zinc-800">
                            <div className="flex gap-2 h-3 rounded-full overflow-hidden bg-zinc-800">
                                {typeChartData.map((item, index) => (
                                    <div
                                        key={item.name}
                                        className="h-full transition-all duration-500"
                                        style={{
                                            width: `${(item.value / (metrics?.totalProperties || 1)) * 100}%`,
                                            backgroundColor: COLORS[index % COLORS.length]
                                        }}
                                        title={`${item.name}: ${item.value} properties`}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-between mt-3">
                                {typeChartData.map((item, index) => (
                                    <div key={item.name} className="flex items-center gap-1.5">
                                        <div
                                            className="h-2 w-2 rounded-full"
                                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                        />
                                        <span className="text-[10px] font-mono text-zinc-500">
                                            {item.name} ({item.value})
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Lease & Risk Dashboard */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-mono text-white flex items-center gap-2">
                            <Activity className="h-4 w-4 text-amber-500" />
                            LEASE INTELLIGENCE
                        </CardTitle>
                        <CardDescription className="text-[10px] font-mono text-zinc-500">
                            Lease status and upcoming expirations
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {/* Occupancy Gauge */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] text-zinc-500 font-mono uppercase">Portfolio Occupancy</span>
                                <span className="text-sm font-bold text-white font-mono">
                                    {occupiedUnits} / {totalUnits} Units
                                </span>
                            </div>
                            <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-1000 relative"
                                    style={{ width: `${leaseSummary?.globalOccupancyRate || metrics?.occupancyRate || 0}%` }}
                                >
                                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/30" />
                                </div>
                            </div>
                            <div className="flex justify-between mt-2">
                                <span className="text-[10px] font-mono text-emerald-500">
                                    Occupied: {occupiedUnits}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-500">
                                    Vacant: {vacantUnits}
                                </span>
                            </div>
                        </div>

                        {/* Expiring Leases */}
                        <div className="bg-black/40 rounded-lg p-4 border border-zinc-800/50">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] text-zinc-400 font-mono uppercase flex items-center gap-1.5">
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    Expiring Leases
                                </span>
                                <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5 text-[9px]">
                                    {expiringTotal} Total
                                </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                                    <p className="text-lg font-black text-red-500 font-mono">{leaseSummary?.expiringSoon?.within30Days || 0}</p>
                                    <p className="text-[9px] text-red-400/70 font-mono uppercase">30 Days</p>
                                </div>
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                                    <p className="text-lg font-black text-amber-500 font-mono">{leaseSummary?.expiringSoon?.within60Days || 0}</p>
                                    <p className="text-[9px] text-amber-400/70 font-mono uppercase">60 Days</p>
                                </div>
                                <div className="bg-zinc-700/30 border border-zinc-700/50 rounded-lg p-3 text-center">
                                    <p className="text-lg font-black text-zinc-300 font-mono">{leaseSummary?.expiringSoon?.within90Days || 0}</p>
                                    <p className="text-[9px] text-zinc-500 font-mono uppercase">90 Days</p>
                                </div>
                            </div>
                        </div>

                        {/* Revenue Metrics */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Percent className="h-4 w-4 text-emerald-500" />
                                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Collection Rate</span>
                                </div>
                                <span className="text-lg font-black text-emerald-500 font-mono">{metrics?.collectionRate?.toFixed(1) || 0}%</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-sky-500/5 border border-sky-500/20 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-sky-500" />
                                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Annual Revenue</span>
                                </div>
                                <span className="text-sm font-bold text-sky-400 font-mono">
                                    {formatCurrencyShort((leaseSummary?.totalMonthlyRevenue || 0) * 12)}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Asset Inventory */}
            <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div>
                        <CardTitle className="text-sm font-mono text-white uppercase tracking-tight flex items-center gap-2">
                            <FileText className="h-4 w-4 text-amber-500" />
                            Asset Registry
                        </CardTitle>
                        <CardDescription className="text-[10px] font-mono text-zinc-500 mt-1">
                            Complete inventory of {properties.length} properties in your portfolio
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Search properties..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-black border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 w-[220px] placeholder:text-zinc-600"
                            />
                        </div>
                        <Link href="/dashboard/property-management/properties/new">
                            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 font-mono text-[10px]">
                                <Plus className="h-3 w-3 mr-1" />
                                Add Property
                            </Button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative w-full overflow-auto border border-zinc-800 rounded-lg">
                        <table className="w-full text-xs font-mono text-left border-collapse">
                            <thead className="bg-black/60 text-[10px] text-zinc-500 uppercase sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 font-medium w-[140px]">Reference</th>
                                    <th className="px-4 py-3 font-medium">Property</th>
                                    <th className="px-4 py-3 font-medium text-center w-[130px]">Type</th>
                                    <th className="px-4 py-3 font-medium text-right w-[120px]">Value</th>
                                    <th className="px-4 py-3 font-medium text-center w-[100px]">Status</th>
                                    <th className="px-4 py-3 font-medium text-center w-[60px]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {filteredProperties.map((property, idx) => (
                                    <tr
                                        key={property.id}
                                        className="hover:bg-zinc-800/30 transition-colors group"
                                    >
                                        <td className="px-4 py-3">
                                            <code className="text-[10px] text-zinc-500 group-hover:text-amber-500 transition-colors">
                                                {property.referenceNumber}
                                            </code>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                                    {TYPE_ICONS[property.propertyType] || <Building2 className="h-3 w-3 text-zinc-500" />}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-zinc-200 group-hover:text-white transition-colors">{property.title}</p>
                                                    <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                                                        <MapPin className="h-2.5 w-2.5" />
                                                        {property.addressCity}, {property.region?.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Badge
                                                variant="outline"
                                                className="text-[9px] uppercase border-zinc-700 bg-zinc-800/50 font-normal"
                                            >
                                                {TYPE_LABELS[property.propertyType] || property.propertyType}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-semibold text-zinc-200">{formatNative(property.price, property.priceCurrency)}</span>
                                            {ghsEquivalent(property.price, property.priceCurrency) && (
                                                <span className="block text-[9px] text-zinc-500 font-normal">{ghsEquivalent(property.price, property.priceCurrency)}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-800/50">
                                                <div className={`h-1.5 w-1.5 rounded-full ${property.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                                <span className={`uppercase text-[9px] ${property.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {property.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Link href={`/dashboard/property-management/properties/${property.id}`}>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7 text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10"
                                                >
                                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                                </Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {filteredProperties.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center">
                                                    <Building2 className="h-6 w-6 text-zinc-600" />
                                                </div>
                                                <div>
                                                    <p className="text-zinc-400 font-mono text-sm">No properties found</p>
                                                    <p className="text-zinc-600 font-mono text-[10px] mt-1">
                                                        {searchTerm ? 'Try adjusting your search' : 'Add your first property to get started'}
                                                    </p>
                                                </div>
                                                {!searchTerm && (
                                                    <Link href="/dashboard/property-management/properties/new">
                                                        <Button size="sm" className="mt-2 bg-amber-600 hover:bg-amber-500 text-white font-mono text-[10px]">
                                                            <Plus className="h-3 w-3 mr-1" />
                                                            Add First Property
                                                        </Button>
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Table Footer */}
                    {filteredProperties.length > 0 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                            <p className="text-[10px] font-mono text-zinc-500">
                                Showing {filteredProperties.length} of {properties.length} properties
                            </p>
                            <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500">
                                <RateStamp fx={fx} />
                                <span>Total Value: <span className="text-amber-500 font-bold">{formatCurrency(filteredProperties.reduce((sum, p) => sum + toGHS(p.price || 0, p.priceCurrency), 0))}</span></span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
