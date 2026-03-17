'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    ChevronLeft,
    Printer,
    Building2,
    MapPin,
    TrendingUp,
    Users,
    Shield,
    Target,
    BarChart3,
    PieChart,
    DollarSign,
    Percent,
    Home,
    Briefcase,
    CheckCircle2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { propertyManagementApi } from '@/lib/property-management-api'
import {
    PortfolioMetrics,
    PortfolioComposition,
    Property
} from '@/types/property-management'
import { QRCodeSVG } from 'qrcode.react'
import { EnterpriseNav } from '@/components/layout/EnterpriseNav'

export default function PortfolioBrochurePage() {
    const router = useRouter();
    const brochureRef = useRef<HTMLDivElement>(null);
    const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
    const [composition, setComposition] = useState<PortfolioComposition | null>(null);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportingPdf, setExportingPdf] = useState(false);

    useEffect(() => {
        async function loadData() {
            try {
                const [m, c, p] = await Promise.all([
                    propertyManagementApi.getPortfolioOverview(),
                    propertyManagementApi.getPortfolioComposition(),
                    propertyManagementApi.getProperties({ limit: 100 })
                ]);
                setMetrics(m);
                setComposition(c);
                const propertyData = Array.isArray(p) ? p : (p as any).data || [];
                setProperties(propertyData);
            } catch (error) {
                console.error('Failed to load brochure data:', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-GH', {
            style: 'currency',
            currency: 'GHS',
            maximumFractionDigits: 0
        }).format(val);
    };

    const formatCurrencyShort = (val: number) => {
        if (val >= 1000000) return `₵${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `₵${(val / 1000).toFixed(0)}K`;
        return `₵${val}`;
    };

    const handlePrint = async () => {
        const brochureNode = brochureRef.current;
        if (!brochureNode || exportingPdf) return;

        setExportingPdf(true);

        try {
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf'),
            ]);

            const canvas = await html2canvas(brochureNode, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: brochureNode.scrollWidth,
                height: brochureNode.scrollHeight,
                windowWidth: brochureNode.scrollWidth,
                windowHeight: brochureNode.scrollHeight,
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            let yOffset = 0;
            let pageIndex = 0;
            while (yOffset < imgHeight) {
                if (pageIndex > 0) {
                    pdf.addPage();
                }
                pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgWidth, imgHeight);
                yOffset += pdfHeight;
                pageIndex += 1;
            }

            const fileName = `Portfolio_Brochure_${new Date().toISOString().slice(0, 10)}.pdf`;
            pdf.save(fileName);
        } catch (error) {
            console.error('Portfolio brochure PDF export failed, falling back to print:', error);
            window.print();
        } finally {
            setExportingPdf(false);
        }
    };

    const currentDate = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const currentQuarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;

    // Calculate portfolio metrics
    const totalValue = metrics?.totalValue || 0;
    const avgPropertyValue = properties.length > 0 ? totalValue / properties.length : 0;
    const residentialCount = composition?.byType?.filter((t: { type: string }) => t.type.includes('residential') || t.type.includes('house')).reduce((sum: number, t: { count: number }) => sum + t.count, 0) || 0;
    const commercialCount = composition?.byType?.filter((t: { type: string }) => t.type.includes('commercial')).reduce((sum: number, t: { count: number }) => sum + t.count, 0) || 0;
    const apartmentCount = composition?.byType?.filter((t: { type: string }) => t.type.includes('apartment')).reduce((sum: number, t: { count: number }) => sum + t.count, 0) || 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-black text-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans print:bg-white print:text-white">
            {/* Action Bar - Hidden on Print */}
            <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-zinc-800 p-4 print:hidden">
                <div className="max-w-6xl mx-auto space-y-4">
                    <EnterpriseNav />
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-bold text-white font-mono">MY PORTFOLIO REPORT</h1>
                            <p className="text-xs text-zinc-500 font-mono">Personal property portfolio summary & performance</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => router.back()}
                                className="border-zinc-800 text-zinc-400 hover:text-white bg-black font-mono text-xs"
                            >
                                <ChevronLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>
                            <Button
                                onClick={handlePrint}
                                disabled={exportingPdf}
                                className="bg-amber-600 hover:bg-amber-500 text-white font-bold font-mono text-xs uppercase disabled:opacity-60"
                            >
                                <Printer className="mr-2 h-4 w-4" />
                                {exportingPdf ? 'Exporting PDF...' : 'Print / Export PDF'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Brochure Document */}
            <div ref={brochureRef} className="max-w-[850px] mx-auto my-8 print:my-0">
                
                {/* ============================================= */}
                {/* PAGE 1: COVER PAGE */}
                {/* ============================================= */}
                <div className="bg-white text-zinc-900 shadow-2xl print:shadow-none min-h-[1100px] relative overflow-hidden">
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @media print {
                            @page { size: A4; margin: 0; }
                            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                            .print-page { page-break-after: always; min-height: 297mm; }
                            .print-page:last-child { page-break-after: avoid; }
                        }
                    ` }} />

                    {/* Cover Background Pattern */}
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                    }} />

                    <div className="relative z-10 p-16 min-h-[1100px] flex flex-col">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center">
                                    <Building2 className="h-7 w-7 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white tracking-tight">PROPMETRIK</h2>
                                    <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Real Estate Intelligence</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-mono text-zinc-500 uppercase">Document Date</p>
                                <p className="text-sm font-bold text-white">{currentDate}</p>
                            </div>
                        </div>

                        {/* Main Title */}
                        <div className="flex-1 flex flex-col justify-center -mt-16">
                            <div className="border-l-4 border-amber-500 pl-8 mb-8">
                                <p className="text-amber-500 font-mono text-sm uppercase tracking-widest mb-4">Personal Report</p>
                                <h1 className="text-6xl font-black text-white leading-none mb-4">
                                    MY PORTFOLIO<br />SUMMARY
                                </h1>
                                <p className="text-xl text-zinc-400 font-light mt-6">
                                    Property Holdings Overview<br />
                                    <span className="text-amber-500 font-semibold">{currentQuarter}</span>
                                </p>
                            </div>

                            {/* Key Stats Preview */}
                            <div className="grid grid-cols-3 gap-6 mt-12">
                                <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Portfolio Value</p>
                                    <p className="text-3xl font-black text-white">{formatCurrencyShort(totalValue)}</p>
                                </div>
                                <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Total Assets</p>
                                    <p className="text-3xl font-black text-white">{metrics?.totalProperties || 0}</p>
                                </div>
                                <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
                                    <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Occupancy</p>
                                    <p className="text-3xl font-black text-white">{metrics?.occupancyRate || 0}%</p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
                                    Generated via PROPMETRIK
                                </p>
                                <p className="text-[9px] font-mono text-zinc-600">
                                    Your personal property portfolio report
                                </p>
                            </div>
                            <div className="p-3 bg-white rounded-lg">
                                <QRCodeSVG value="https://propmetrik.com/portfolio/verify" size={64} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ============================================= */}
                {/* PAGE 2: EXECUTIVE SUMMARY */}
                {/* ============================================= */}
                <div className="bg-white text-zinc-900 shadow-2xl print:shadow-none min-h-[1100px] p-16 print-page">
                    {/* Page Header */}
                    <div className="flex justify-between items-center border-b-2 border-zinc-900 pb-4 mb-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center">
                                <Target className="h-4 w-4 text-white" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight">Portfolio Overview</h2>
                        </div>
                        <p className="text-xs font-mono text-zinc-400">Page 2</p>
                    </div>

                    {/* Portfolio Summary */}
                    <div className="mb-10">
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4 flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            Portfolio Summary
                        </h3>
                        <div className="bg-zinc-50 border-l-4 border-amber-500 p-6 rounded-r-lg">
                            <p className="text-sm text-zinc-700 leading-relaxed">
                                Your property portfolio consists of {metrics?.totalProperties || 0} assets 
                                across Ghana with a combined value of {formatCurrency(totalValue)}. 
                                This report provides a comprehensive overview of your holdings, performance metrics, 
                                and current status of your real estate investments.
                            </p>
                        </div>
                    </div>

                    {/* Investment Highlights */}
                    <div className="mb-10">
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Investment Highlights
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { icon: TrendingUp, title: 'Value Appreciation', desc: `${metrics?.valueTrend || 0}% portfolio growth trend` },
                                { icon: Users, title: 'Active Tenant Base', desc: `${metrics?.totalTenants || 0} tenants with ${metrics?.activeTenancies || 0} active leases` },
                                { icon: Shield, title: 'Collection Efficiency', desc: `${metrics?.collectionRate || 0}% rent collection rate` },
                                { icon: Building2, title: 'Asset Diversification', desc: 'Residential, commercial & mixed-use assets' },
                            ].map((item, idx) => (
                                <div key={idx} className="flex gap-3 p-4 border border-zinc-200 rounded-lg">
                                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <item.icon className="h-5 w-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-zinc-900 uppercase">{item.title}</p>
                                        <p className="text-xs text-zinc-500 mt-1">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Key Metrics Dashboard */}
                    <div className="mb-10">
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Portfolio Metrics
                        </h3>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-zinc-900 text-white p-5 rounded-xl text-center">
                                <DollarSign className="h-6 w-6 mx-auto mb-2 text-amber-500" />
                                <p className="text-2xl font-black">{formatCurrencyShort(totalValue)}</p>
                                <p className="text-[9px] font-mono uppercase text-zinc-400 mt-1">Total Value</p>
                            </div>
                            <div className="bg-zinc-100 p-5 rounded-xl text-center">
                                <Building2 className="h-6 w-6 mx-auto mb-2 text-zinc-600" />
                                <p className="text-2xl font-black text-zinc-900">{metrics?.totalProperties || 0}</p>
                                <p className="text-[9px] font-mono uppercase text-zinc-500 mt-1">Properties</p>
                            </div>
                            <div className="bg-zinc-100 p-5 rounded-xl text-center">
                                <Percent className="h-6 w-6 mx-auto mb-2 text-emerald-600" />
                                <p className="text-2xl font-black text-zinc-900">{metrics?.occupancyRate || 0}%</p>
                                <p className="text-[9px] font-mono uppercase text-zinc-500 mt-1">Occupancy</p>
                            </div>
                            <div className="bg-zinc-100 p-5 rounded-xl text-center">
                                <TrendingUp className="h-6 w-6 mx-auto mb-2 text-amber-600" />
                                <p className="text-2xl font-black text-zinc-900">{formatCurrencyShort(avgPropertyValue)}</p>
                                <p className="text-[9px] font-mono uppercase text-zinc-500 mt-1">Avg Value</p>
                            </div>
                        </div>
                    </div>

                    {/* Asset Type Distribution */}
                    <div>
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4 flex items-center gap-2">
                            <PieChart className="h-4 w-4" />
                            Portfolio Composition
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                            {composition?.byType?.map((type: { type: string; count: number; value: number }, idx: number) => {
                                const percentage = ((type.count / (metrics?.totalProperties || 1)) * 100).toFixed(0);
                                const colors = ['bg-amber-500', 'bg-zinc-700', 'bg-emerald-500'];
                                return (
                                    <div key={idx} className="border border-zinc-200 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className={`w-3 h-3 rounded-full ${colors[idx % 3]}`} />
                                            <p className="text-[10px] font-bold uppercase text-zinc-500">
                                                {type.type.replace(/_/g, ' ')}
                                            </p>
                                        </div>
                                        <p className="text-2xl font-black text-zinc-900">{type.count}</p>
                                        <p className="text-xs text-zinc-500">{percentage}% of portfolio</p>
                                        <p className="text-xs font-mono text-amber-600 mt-2">{formatCurrency(type.value)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ============================================= */}
                {/* PAGE 3: GEOGRAPHIC & MARKET ANALYSIS */}
                {/* ============================================= */}
                <div className="bg-white text-zinc-900 shadow-2xl print:shadow-none min-h-[1100px] p-16 print-page">
                    {/* Page Header */}
                    <div className="flex justify-between items-center border-b-2 border-zinc-900 pb-4 mb-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center">
                                <MapPin className="h-4 w-4 text-white" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight">Geographic Distribution</h2>
                        </div>
                        <p className="text-xs font-mono text-zinc-400">Page 3</p>
                    </div>

                    {/* Regional Overview */}
                    <div className="mb-10">
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4">Regional Allocation</h3>
                        <div className="space-y-4">
                            {composition?.byRegion?.map((region: { region: string; count: number; value: number }, idx: number) => {
                                const percentage = ((region.count / (metrics?.totalProperties || 1)) * 100).toFixed(0);
                                return (
                                    <div key={idx} className="border border-zinc-200 rounded-lg p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-lg font-bold text-zinc-900 capitalize">
                                                    {region.region.replace(/_/g, ' ')}
                                                </p>
                                                <p className="text-xs text-zinc-500">Primary Market</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-black text-amber-600">{region.count}</p>
                                                <p className="text-[10px] font-mono text-zinc-400 uppercase">Assets</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-100">
                                            <div>
                                                <p className="text-[10px] font-mono text-zinc-500 uppercase">Total Value</p>
                                                <p className="text-sm font-bold text-zinc-900">{formatCurrency(region.value)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-mono text-zinc-500 uppercase">Portfolio %</p>
                                                <p className="text-sm font-bold text-zinc-900">{percentage}%</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-mono text-zinc-500 uppercase">Avg Value</p>
                                                <p className="text-sm font-bold text-zinc-900">{formatCurrency(region.value / region.count)}</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 w-full bg-zinc-100 rounded-full h-2">
                                            <div 
                                                className="bg-amber-500 h-full rounded-full" 
                                                style={{ width: `${percentage}%` }} 
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Market Dynamics */}
                    <div className="mb-10">
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4">Market Dynamics</h3>
                        <div className="bg-zinc-50 rounded-xl p-6">
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <h4 className="text-xs font-bold text-zinc-900 uppercase mb-3">Growth Drivers</h4>
                                    <ul className="space-y-2">
                                        {[
                                            'Rapid urbanization and population growth',
                                            'Expanding middle class with increasing disposable income',
                                            'Government infrastructure investments',
                                            'Growing demand for quality residential & commercial space'
                                        ].map((item, idx) => (
                                            <li key={idx} className="flex gap-2 text-xs text-zinc-600">
                                                <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-zinc-900 uppercase mb-3">Strategic Positioning</h4>
                                    <ul className="space-y-2">
                                        {[
                                            'Prime locations in high-growth corridors',
                                            'Mix of income-generating and appreciation assets',
                                            'Strong tenant quality and lease terms',
                                            'Active asset management approach'
                                        ].map((item, idx) => (
                                            <li key={idx} className="flex gap-2 text-xs text-zinc-600">
                                                <CheckCircle2 className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Performance Metrics */}
                    <div>
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4">Operational Performance</h3>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="border border-zinc-200 rounded-lg p-4 text-center">
                                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Monthly Income</p>
                                <p className="text-xl font-black text-emerald-600">{formatCurrency(metrics?.monthlyIncome || 0)}</p>
                            </div>
                            <div className="border border-zinc-200 rounded-lg p-4 text-center">
                                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Collection Rate</p>
                                <p className="text-xl font-black text-zinc-900">{metrics?.collectionRate || 0}%</p>
                            </div>
                            <div className="border border-zinc-200 rounded-lg p-4 text-center">
                                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Active Tenancies</p>
                                <p className="text-xl font-black text-zinc-900">{metrics?.activeTenancies || 0}</p>
                            </div>
                            <div className="border border-zinc-200 rounded-lg p-4 text-center">
                                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Pending Work Orders</p>
                                <p className="text-xl font-black text-amber-600">{metrics?.pendingWorkOrders || 0}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ============================================= */}
                {/* PAGE 4: ASSET SCHEDULE */}
                {/* ============================================= */}
                <div className="bg-white text-zinc-900 shadow-2xl print:shadow-none min-h-[1100px] p-16 print-page">
                    {/* Page Header */}
                    <div className="flex justify-between items-center border-b-2 border-zinc-900 pb-4 mb-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center">
                                <Home className="h-4 w-4 text-white" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight">Asset Schedule</h2>
                        </div>
                        <p className="text-xs font-mono text-zinc-400">Page 4</p>
                    </div>

                    {/* Asset Table */}
                    <div className="mb-8">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="bg-zinc-900 text-white">
                                    <th className="px-3 py-3 text-[9px] font-mono uppercase tracking-wider">Ref #</th>
                                    <th className="px-3 py-3 text-[9px] font-mono uppercase tracking-wider">Property</th>
                                    <th className="px-3 py-3 text-[9px] font-mono uppercase tracking-wider">Type</th>
                                    <th className="px-3 py-3 text-[9px] font-mono uppercase tracking-wider">Location</th>
                                    <th className="px-3 py-3 text-[9px] font-mono uppercase tracking-wider text-right">Value</th>
                                    <th className="px-3 py-3 text-[9px] font-mono uppercase tracking-wider text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                {properties.slice(0, 12).map((p, idx) => (
                                    <tr key={p.id} className={`border-b border-zinc-100 ${idx % 2 === 1 ? 'bg-zinc-50/50' : ''}`}>
                                        <td className="px-3 py-3 font-mono text-[10px] text-zinc-400 font-bold">
                                            {p.referenceNumber || `PM-${String(idx + 1).padStart(3, '0')}`}
                                        </td>
                                        <td className="px-3 py-3">
                                            <p className="font-bold text-zinc-900 text-[11px]">{p.title}</p>
                                        </td>
                                        <td className="px-3 py-3 text-[10px] text-zinc-500 uppercase">
                                            {p.propertyType?.replace(/_/g, ' ')}
                                        </td>
                                        <td className="px-3 py-3 text-[10px] text-zinc-500">
                                            {p.addressCity}, {p.region?.replace(/_/g, ' ')}
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono font-bold text-zinc-900">
                                            {formatCurrency(p.price)}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                p.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                                p.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                'bg-zinc-100 text-zinc-600'
                                            }`}>
                                                {p.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-zinc-100 font-bold">
                                    <td colSpan={4} className="px-3 py-3 text-[10px] font-mono uppercase">
                                        Total Portfolio Value ({properties.length} Assets)
                                    </td>
                                    <td className="px-3 py-3 text-right font-mono text-amber-600">
                                        {formatCurrency(totalValue)}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                        {properties.length > 12 && (
                            <p className="text-[10px] font-mono text-zinc-400 mt-2 text-center">
                                + {properties.length - 12} additional assets (see full appendix)
                            </p>
                        )}
                    </div>

                    {/* Portfolio Summary Box */}
                    <div className="bg-zinc-900 text-white rounded-xl p-6">
                        <div className="grid grid-cols-5 gap-4 text-center">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-400 uppercase mb-1">Total Assets</p>
                                <p className="text-xl font-black">{metrics?.totalProperties || 0}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-mono text-zinc-400 uppercase mb-1">Residential</p>
                                <p className="text-xl font-black">{residentialCount + apartmentCount}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-mono text-zinc-400 uppercase mb-1">Commercial</p>
                                <p className="text-xl font-black">{commercialCount}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-mono text-zinc-400 uppercase mb-1">Avg Price</p>
                                <p className="text-xl font-black text-amber-500">{formatCurrencyShort(avgPropertyValue)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-mono text-zinc-400 uppercase mb-1">Growth</p>
                                <p className="text-xl font-black text-emerald-400">+{metrics?.valueTrend || 0}%</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ============================================= */}
                {/* PAGE 5: NOTES & INFO */}
                {/* ============================================= */}
                <div className="bg-white text-zinc-900 shadow-2xl print:shadow-none min-h-[1100px] p-16 print-page">
                    {/* Page Header */}
                    <div className="flex justify-between items-center border-b-2 border-zinc-900 pb-4 mb-10">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center">
                                <Shield className="h-4 w-4 text-white" />
                            </div>
                            <h2 className="text-lg font-black uppercase tracking-tight">Notes & Information</h2>
                        </div>
                        <p className="text-xs font-mono text-zinc-400">Page 5</p>
                    </div>

                    {/* Portfolio Considerations */}
                    <div className="mb-10">
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4">Portfolio Considerations</h3>
                        <div className="bg-zinc-50 rounded-lg p-6 space-y-4">
                            {[
                                { title: 'Data Accuracy', desc: 'Property values and metrics are based on your input data. Regular updates ensure accuracy.' },
                                { title: 'Market Conditions', desc: 'Real estate values fluctuate. Consider periodic professional appraisals for significant holdings.' },
                                { title: 'Maintenance Planning', desc: 'Factor in ongoing maintenance and capital expenditure requirements for your properties.' },
                                { title: 'Tenant Management', desc: 'Occupancy rates and rental income depend on effective tenant relations and property upkeep.' },
                                { title: 'Tax Implications', desc: 'Consult with tax advisors regarding property income, capital gains, and deductions.' }
                            ].map((item, idx) => (
                                <div key={idx} className="border-b border-zinc-200 pb-3 last:border-0 last:pb-0">
                                    <p className="text-xs font-bold text-zinc-900 uppercase mb-1">{item.title}</p>
                                    <p className="text-xs text-zinc-600">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="mb-10">
                        <h3 className="text-sm font-bold uppercase text-amber-600 mb-4">Notes</h3>
                        <div className="border border-zinc-200 rounded-lg p-6">
                            <p className="text-[10px] text-zinc-600 leading-relaxed mb-4">
                                This portfolio report is generated based on the property data you have entered into the 
                                PROPMETRIK platform. Property values shown are based on your input and may not reflect 
                                current market conditions.
                            </p>
                            <p className="text-[10px] text-zinc-600 leading-relaxed mb-4">
                                Performance metrics are calculated based on recorded income, expenses, and occupancy data. 
                                For accurate financial planning, please consult with qualified professionals.
                            </p>
                            <p className="text-[10px] text-zinc-600 leading-relaxed">
                                This report is for your personal use. You may share it with property managers, 
                                financial advisors, or other stakeholders as needed.
                            </p>
                        </div>
                    </div>

                    {/* Platform Info */}
                    <div className="bg-zinc-900 text-white rounded-xl p-8">
                        <h3 className="text-sm font-bold uppercase text-amber-500 mb-6">Powered by PROPMETRIK</h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <p className="text-xs font-bold text-white uppercase mb-2">About This Report</p>
                                <p className="text-xs text-zinc-400">This portfolio report was generated using PROPMETRIK&apos;s property management platform.</p>
                                <p className="text-xs text-zinc-400 mt-4">All data reflects your current portfolio status as of the report date.</p>
                            </div>
                            <div>
                                <p className="text-xs text-zinc-400 mb-2">
                                    <span className="text-white font-bold">Platform:</span> propmetrik.com
                                </p>
                                <p className="text-xs text-zinc-400 mb-2">
                                    <span className="text-white font-bold">Report Type:</span> Portfolio Summary
                                </p>
                                <p className="text-xs text-zinc-400">
                                    <span className="text-white font-bold">Format:</span> Standard Brochure
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Document Footer */}
                    <div className="mt-12 pt-8 border-t border-zinc-200 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-zinc-900">PROPMETRIK</p>
                                <p className="text-[10px] text-zinc-500">Property Management Platform</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-mono text-zinc-400 uppercase">Report ID: PR-{new Date().getFullYear()}-{String(new Date().getMonth() + 1).padStart(2, '0')}</p>
                            <p className="text-[10px] text-zinc-400">Generated: {currentDate}</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
