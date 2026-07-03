'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Upload,
    Landmark,
    Briefcase,
    Users,
    CheckCircle,
    Clock,
    FileText,
} from 'lucide-react'
import { FileUploadModal } from './FileUploadModal'
import { cn, formatRelativeTime } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSourcesApi } from '@/lib/api'
import { DataSource } from '@/types/data-hub'

export function DataIngestionPanel() {
    const queryClient = useQueryClient()
    const [uploadModalOpen, setUploadModalOpen] = useState(false)
    const [selectedSource, setSelectedSource] = useState<DataSource | null>(null)

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

    // Fetch Tier 1 Sources
    const { data: tier1Data } = useQuery({
        queryKey: ['data-sources', 'tier1'],
        queryFn: () => dataSourcesApi.getAll({ tier: 'tier1_government', limit: 100 }),
    })

    // Fetch Tier 2 Sources
    const { data: tier2Data } = useQuery({
        queryKey: ['data-sources', 'tier2'],
        queryFn: () => dataSourcesApi.getAll({ tier: 'tier2_financial', limit: 100 }),
    })

    // Fetch Tier 3 Sources
    const { data: tier3Data } = useQuery({
        queryKey: ['data-sources', 'tier3'],
        queryFn: () => dataSourcesApi.getAll({ tier: 'tier3_partners', limit: 100 }),
    })

    // Fetch recent uploads
    const { data: recentUploads } = useQuery({
        queryKey: ['recent-uploads'],
        queryFn: async () => {
            const response = await authedFetch(`${API_BASE}/data-hub/uploads?page=1&limit=10`)
            if (!response.ok) return []
            const result = await response.json().catch(() => null)
            return (result?.data || []) as any[]
        },
        refetchInterval: 10000,
    })

    const handleUploadClick = (source: DataSource) => {
        setSelectedSource(source)
        setUploadModalOpen(true)
    }

    const getStatusIcon = (isActive: boolean) => {
        return isActive ?
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" /> :
            <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
    }

    const renderSourceGrid = (sources: DataSource[] = []) => {
        if (!sources || sources.length === 0) {
            return <div className="text-center py-12 text-muted-foreground">No data sources available for this tier.</div>
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sources.map((source) => (
                    <Card key={source.id} className="border-muted hover:border-primary/50 transition-colors">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-lg bg-muted">
                                        {source.tier.includes('government') ?
                                            <Landmark className="h-5 w-5 text-blue-600 dark:text-blue-400" /> :
                                            source.tier.includes('financial') ?
                                            <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" /> :
                                            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                        }
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-sm leading-none mb-1.5">{source.name}</h3>
                                        <div className="flex items-center gap-1.5">
                                            {getStatusIcon(source.is_active)}
                                            <span className="text-xs text-muted-foreground">
                                                {source.is_active ? 'Active' : 'Pending'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handleUploadClick(source)}
                                    className="h-8"
                                >
                                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                                    Upload
                                </Button>
                            </div>

                            <div className="pt-3 mt-1 border-t flex justify-between text-xs text-muted-foreground">
                                <span>{Number(source.total_records_synced || 0).toLocaleString()} records</span>
                                <span>{source.last_sync_at ? formatRelativeTime(source.last_sync_at) : 'Never synced'}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-6">
                <div>
                    <h2 className="text-lg font-medium mb-1">Upload Data</h2>
                    <p className="text-sm text-muted-foreground mb-6">Select a data source to upload files (CSV, Excel, PDF)</p>

                    <Tabs defaultValue="tier1" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 max-w-[600px] mb-6">
                            <TabsTrigger value="tier1">Tier 1: Government</TabsTrigger>
                            <TabsTrigger value="tier2">Tier 2: Financial</TabsTrigger>
                            <TabsTrigger value="tier3">Tier 3: Partners</TabsTrigger>
                        </TabsList>

                        <TabsContent value="tier1" className="m-0 focus-visible:outline-none">
                            {renderSourceGrid(tier1Data?.data)}
                        </TabsContent>
                        <TabsContent value="tier2" className="m-0 focus-visible:outline-none">
                            {renderSourceGrid(tier2Data?.data)}
                        </TabsContent>
                        <TabsContent value="tier3" className="m-0 focus-visible:outline-none">
                            {renderSourceGrid(tier3Data?.data)}
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="border-t pt-8">
                    <h2 className="text-lg font-medium mb-4">Recent Activity</h2>
                    <Card>
                        <CardContent className="p-0">
                            <div className="divide-y">
                                {recentUploads && recentUploads.length > 0 ? (
                                    recentUploads.map((upload: any) => (
                                        <div key={upload.id} className="flex items-center justify-between p-4 bg-card/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-full bg-muted">
                                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm text-foreground">{upload.original_name || upload.file_name}</p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                        <span>{formatRelativeTime(upload.created_at)}</span>
                                                        <span>•</span>
                                                        <span>{upload.file_size_bytes ? (upload.file_size_bytes / 1024).toFixed(0) + ' KB' : 'Unknown size'}</span>
                                                        {upload.source_name ? (
                                                            <>
                                                                <span>•</span>
                                                                <span>{upload.source_name}</span>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full capitalize border",
                                                upload.upload_status === 'completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                                    upload.upload_status === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')}>
                                                {upload.upload_status}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground">No recent uploads found</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Upload Modal */}
            {selectedSource && (
                <FileUploadModal
                    isOpen={uploadModalOpen}
                    onClose={() => {
                        setUploadModalOpen(false)
                        setSelectedSource(null)
                    }}
                    sourceId={selectedSource.id}
                    sourceName={selectedSource.name}
                    onUploadComplete={() => {
                        queryClient.invalidateQueries({ queryKey: ['recent-uploads'] })
                        queryClient.invalidateQueries({ queryKey: ['data-sources', 'tier1'] })
                        queryClient.invalidateQueries({ queryKey: ['data-sources', 'tier2'] })
                        queryClient.invalidateQueries({ queryKey: ['data-sources', 'tier3'] })
                    }}
                />
            )}
        </div>
    )
}
