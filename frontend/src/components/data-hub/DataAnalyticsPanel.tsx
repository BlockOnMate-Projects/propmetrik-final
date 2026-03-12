'use client'

import { TerminalPanel, DataQualityIndicator } from '@/components/ui/terminal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, RefreshCw, Filter } from 'lucide-react'
import { useState } from 'react'

interface DataAnalyticsPanelProps {
    title: string
    children: React.ReactNode
    onExport?: (format: 'csv' | 'json' | 'pdf') => void
    onRefresh?: () => void
    isRefreshing?: boolean
    timeRange?: string
    onTimeRangeChange?: (range: string) => void
    filters?: React.ReactNode
}

const TIME_RANGES = [
    { value: '1h', label: '1 Hour' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'all', label: 'All Time' },
]

export function DataAnalyticsPanel({
    title,
    children,
    onExport,
    onRefresh,
    isRefreshing = false,
    timeRange = '24h',
    onTimeRangeChange,
    filters
}: DataAnalyticsPanelProps) {
    const [showExportMenu, setShowExportMenu] = useState(false)
    const [showFilters, setShowFilters] = useState(false)

    const handleExport = (format: 'csv' | 'json' | 'pdf') => {
        onExport?.(format)
        setShowExportMenu(false)
    }

    return (
        <TerminalPanel
            title={title}
            action={
                <div className="flex items-center gap-2">
                    {/* Time Range Selector */}
                    {onTimeRangeChange && (
                        <div className="flex gap-1">
                            {TIME_RANGES.map((range) => (
                                <button
                                    key={range.value}
                                    onClick={() => onTimeRangeChange(range.value)}
                                    className={`px-2 py-1 font-mono text-[10px] transition-colors ${timeRange === range.value
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                        }`}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Filters Toggle */}
                    {filters && (
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-1.5 transition-colors ${showFilters
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                        >
                            <Filter className="w-3 h-3" />
                        </button>
                    )}

                    {/* Refresh Button */}
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    )}

                    {/* Export Menu */}
                    {onExport && (
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            >
                                <Download className="w-3 h-3" />
                            </button>

                            {showExportMenu && (
                                <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 shadow-lg z-10">
                                    <button
                                        onClick={() => handleExport('csv')}
                                        className="block w-full px-4 py-2 text-left font-mono text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                    >
                                        Export CSV
                                    </button>
                                    <button
                                        onClick={() => handleExport('json')}
                                        className="block w-full px-4 py-2 text-left font-mono text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                    >
                                        Export JSON
                                    </button>
                                    <button
                                        onClick={() => handleExport('pdf')}
                                        className="block w-full px-4 py-2 text-left font-mono text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                    >
                                        Export PDF
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            }
        >
            {/* Filters Panel */}
            {showFilters && filters && (
                <div className="mb-4 p-3 bg-zinc-800/30 border border-zinc-800">
                    {filters}
                </div>
            )}

            {/* Main Content */}
            {children}
        </TerminalPanel>
    )
}
