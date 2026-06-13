'use client'

import { TerminalPanel, DataMetricCard } from '@/components/ui/terminal'
import { DataAnalyticsPanel } from '@/components/data-hub/DataAnalyticsPanel'
import {
    Search,
    Database,
    FileText,
    Tag,
    Eye,
    TrendingUp,
    Clock,
    Shield,
    Filter,
} from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dataCatalogApi } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export default function CatalogPage() {
    const [mounted, setMounted] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        setMounted(true)
    }, [])
    const [selectedCategory, setSelectedCategory] = useState('all')

    const { data: catalogData, isLoading: isLoadingCatalog } = useQuery({
        queryKey: ['catalog-entries'],
        queryFn: () => dataCatalogApi.listEntries(),
    })

    const catalogEntries = useMemo(() => catalogData?.data || [], [catalogData])

    // Filter entries based on search and category
    const filteredEntries = useMemo(() => {
        return catalogEntries.filter((entry: any) => {
            const matchesSearch = searchQuery === '' ||
                entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (entry.tags as string[]).some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

            const matchesCategory = selectedCategory === 'all' ||
                entry.type.toLowerCase() === selectedCategory.toLowerCase()

            return matchesSearch && matchesCategory
        })
    }, [catalogEntries, searchQuery, selectedCategory])

    // Schema for selected entry
    const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
    const selectedEntryData = catalogEntries.find(e => e.id === selectedEntry)

    const { data: schemaData, isLoading: isLoadingSchema } = useQuery({
        queryKey: ['catalog-schema', selectedEntry],
        queryFn: () => dataCatalogApi.getSchema(selectedEntry!),
        enabled: !!selectedEntry,
    })

    const schemaFields = useMemo(() => schemaData?.data || [], [schemaData])

    // Summary metrics
    const totalRecords = useMemo(() =>
        catalogEntries.reduce((acc: number, curr: any) => acc + (Number(curr.records) || 0), 0)
        , [catalogEntries])

    const totalDataSources = useMemo(() =>
        new Set(catalogEntries.map((e: any) => e.source)).size
        , [catalogEntries])

    const getClassificationColor = (classification: string) => {
        switch (classification) {
            case 'Public': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20 border-green-500/30'
            case 'Internal': return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 border-blue-500/30'
            case 'Sensitive': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 border-red-500/30'
            default: return 'text-muted-foreground bg-muted/20 border-border/30'
        }
    }

    const getUsageColor = (usage: string) => {
        switch (usage) {
            case 'High': return 'text-red-600 dark:text-red-400'
            case 'Medium': return 'text-yellow-600 dark:text-yellow-400'
            case 'Low': return 'text-green-600 dark:text-green-400'
            default: return 'text-muted-foreground'
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-4 pb-10">
            {/* Header */}
            <div className="mb-6">
                <h1 className="font-mono text-2xl text-amber-500 tracking-wider">DATA CATALOG & DISCOVERY</h1>
                <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    SEARCHABLE DATA INVENTORY • SCHEMA BROWSER • METADATA MANAGEMENT
                </p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <DataMetricCard
                    title="Total Datasets"
                    value={catalogEntries.length}
                    subtitle="Cataloged assets"
                    icon={Database}
                    color="blue"
                />

                <DataMetricCard
                    title="Total Records"
                    value={formatNumber(totalRecords)}
                    subtitle="Across all datasets"
                    trend={8.5}
                    icon={FileText}
                    color="green"
                />

                <DataMetricCard
                    title="Avg Fields"
                    value="15"
                    subtitle="Per dataset"
                    icon={Tag}
                    color="purple"
                />

                <DataMetricCard
                    title="Data Sources"
                    value={totalDataSources}
                    subtitle="PostgreSQL, MinIO, OpenSearch"
                    icon={Database}
                    color="amber"
                />
            </div>

            {/* Search and Filters */}
            <div className="mb-6">
                <TerminalPanel title="Search & Filter">
                    <div className="flex items-center gap-4">
                        {/* Search Bar */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search datasets, fields, tags..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-muted border border-border text-foreground font-mono text-sm focus:outline-none focus:border-amber-500"
                            />
                        </div>

                        {/* Category Filter */}
                        <div className="flex gap-1">
                            {['all', 'table', 'object storage'].map((category) => (
                                <button
                                    key={category}
                                    onClick={() => setSelectedCategory(category)}
                                    className={`px-3 py-2 font-mono text-xs transition-colors ${selectedCategory === category
                                        ? 'bg-amber-500 text-foreground'
                                        : 'bg-muted text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {category.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </TerminalPanel>
            </div>

            {/* Catalog Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {filteredEntries.map((entry) => (
                    <div
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry.id)}
                        className={`p-4 border cursor-pointer transition-all ${selectedEntry === entry.id
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-border bg-muted/30 hover:border-border'
                            }`}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <div>
                                    <div className="font-mono text-sm text-foreground">{entry.name}</div>
                                    <div className="font-mono text-[10px] text-muted-foreground">
                                        {entry.source} • {entry.schema}
                                    </div>
                                </div>
                            </div>
                            <span className={`px-2 py-1 border font-mono text-[10px] ${getClassificationColor(entry.classification)}`}>
                                {entry.classification}
                            </span>
                        </div>

                        <p className="font-mono text-[10px] text-muted-foreground mb-3 line-clamp-2">
                            {entry.description}
                        </p>

                        <div className="grid grid-cols-3 gap-3 mb-3">
                            <div>
                                <div className="font-mono text-[9px] text-muted-foreground">RECORDS</div>
                                <div className="font-mono text-sm text-foreground">{entry.records.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="font-mono text-[9px] text-muted-foreground">FIELDS</div>
                                <div className="font-mono text-sm text-foreground">{entry.fields}</div>
                            </div>
                            <div>
                                <div className="font-mono text-[9px] text-muted-foreground">USAGE</div>
                                <div className={`font-mono text-sm ${getUsageColor(entry.usage)}`}>{entry.usage}</div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex flex-wrap gap-1">
                                {entry.tags.map((tag: string) => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-zinc-700 text-muted-foreground font-mono text-[9px]">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span className="font-mono text-[9px]">{mounted && entry.lastUpdated ? new Date(entry.lastUpdated).toLocaleDateString('en-GB') : 'Never'}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Schema Browser */}
            {selectedEntryData && (
                <TerminalPanel title={`Schema: ${selectedEntryData.name}`}>
                    <div className="space-y-2">
                        {schemaFields.map((field: any) => (
                            <div key={field.name} className="flex items-center justify-between p-3 bg-muted/30 border border-border">
                                <div className="flex items-center gap-4">
                                    <div className="font-mono text-sm text-foreground min-w-[150px]">{field.name}</div>
                                    <div className="font-mono text-xs text-blue-600 dark:text-blue-400">{field.type}</div>
                                    <div className="font-mono text-[10px] text-muted-foreground">{field.description}</div>
                                </div>
                                <div>
                                    {field.nullable ? (
                                        <span className="px-2 py-1 bg-zinc-700 text-muted-foreground font-mono text-[9px]">NULLABLE</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-mono text-[9px]">REQUIRED</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </TerminalPanel>
            )}
        </div>
    )
}
