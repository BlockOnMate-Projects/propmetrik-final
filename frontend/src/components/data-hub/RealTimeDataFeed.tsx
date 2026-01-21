'use client'

import { LiveDataFeed } from '@/components/ui/terminal'
import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface DataFeedItem {
    id: string
    timestamp: Date | string
    type: 'ingestion' | 'job' | 'error' | 'success' | 'warning'
    source?: string
    message: string
    metadata?: Record<string, unknown>
}

interface RealTimeDataFeedProps {
    initialItems?: DataFeedItem[]
    maxItems?: number
    autoRefresh?: boolean
    refreshInterval?: number
    onFetchItems?: () => Promise<DataFeedItem[]>
    filterType?: DataFeedItem['type'] | 'all'
    filterSource?: string
}

export function RealTimeDataFeed({
    initialItems = [],
    maxItems = 20,
    autoRefresh = true,
    refreshInterval = 5000,
    onFetchItems,
    filterType = 'all',
    filterSource
}: RealTimeDataFeedProps) {
    const [items, setItems] = useState<DataFeedItem[]>(initialItems)
    const [isPaused, setIsPaused] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Auto-refresh logic
    useEffect(() => {
        if (!autoRefresh || isPaused || !onFetchItems) return

        const interval = setInterval(async () => {
            try {
                const newItems = await onFetchItems()
                setItems((prev) => {
                    const combined = [...newItems, ...prev]
                    // Remove duplicates by id
                    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values())
                    return unique.slice(0, maxItems)
                })
            } catch (error) {
                console.error('Failed to fetch feed items:', error)
            }
        }, refreshInterval)

        return () => clearInterval(interval)
    }, [autoRefresh, isPaused, onFetchItems, refreshInterval, maxItems])

    // Filter items
    const filteredItems = items.filter((item) => {
        if (filterType !== 'all' && item.type !== filterType) return false
        if (filterSource && item.source !== filterSource) return false
        return true
    })

    // Auto-scroll to bottom on new items
    useEffect(() => {
        if (scrollRef.current && !isPaused) {
            scrollRef.current.scrollTop = 0
        }
    }, [filteredItems, isPaused])

    return (
        <div className="border border-zinc-800 bg-zinc-900/50">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                        Live Activity Feed
                    </span>
                    {autoRefresh && !isPaused && (
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            <span className="font-mono text-[9px] text-green-500">LIVE</span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-zinc-500">
                        {filteredItems.length} events
                    </span>

                    <button
                        onClick={() => setIsPaused(!isPaused)}
                        className={cn(
                            'px-2 py-1 font-mono text-[10px] transition-colors',
                            isPaused
                                ? 'bg-amber-500 text-black'
                                : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        )}
                    >
                        {isPaused ? 'RESUME' : 'PAUSE'}
                    </button>
                </div>
            </div>

            {/* Feed Content */}
            <div
                ref={scrollRef}
                className="p-3 h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900"
            >
                {filteredItems.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-xs">
                        No activity to display
                    </div>
                ) : (
                    <LiveDataFeed items={filteredItems} maxItems={maxItems} />
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="font-mono text-[9px] text-zinc-500">Success</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-500 rounded-full" />
                        <span className="font-mono text-[9px] text-zinc-500">Error</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full" />
                        <span className="font-mono text-[9px] text-zinc-500">Warning</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        <span className="font-mono text-[9px] text-zinc-500">Ingestion</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-purple-500 rounded-full" />
                        <span className="font-mono text-[9px] text-zinc-500">Job</span>
                    </div>
                </div>

                <span className="font-mono text-[9px] text-zinc-500">
                    Updates every {refreshInterval / 1000}s
                </span>
            </div>
        </div>
    )
}
