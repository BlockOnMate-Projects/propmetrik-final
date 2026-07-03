'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Network,
    Users,
    Building2,
    Link2,
    Loader2,
    ZoomIn,
    ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

interface RelationshipNode {
    id: string
    type: 'contact' | 'company' | 'deal'
    label: string
    subtitle?: string
}

interface RelationshipEdge {
    from: string
    to: string
    relationship: string
}

interface RelationshipMapProps {
    entityId?: string
    entityType?: 'contact' | 'company' | 'deal'
}

export function RelationshipMap({ entityId, entityType }: RelationshipMapProps) {
    const [nodes, setNodes] = useState<RelationshipNode[]>([])
    const [edges, setEdges] = useState<RelationshipEdge[]>([])
    const [loading, setLoading] = useState(false)
    const [zoom, setZoom] = useState(1)
    const [selectedNode, setSelectedNode] = useState<string | null>(null)

    useEffect(() => {
        if (!entityId || !entityType) return
        setLoading(true)

        const fetchRelationships = async () => {
            try {
                const nodesMap = new Map<string, RelationshipNode>()
                const edgesList: RelationshipEdge[] = []

                // Fetch contact details if contact
                if (entityType === 'contact') {
                    const contactRes = await authedFetch(`${API_BASE}/crm/contacts/${entityId}`, { credentials: 'include' })
                    if (contactRes.ok) {
                        const contact = await contactRes.json()
                        nodesMap.set(entityId, {
                            id: entityId,
                            type: 'contact',
                            label: `${contact.first_name} ${contact.last_name}`,
                            subtitle: contact.email,
                        })
                    }

                    // Fetch contact's deals
                    const dealsRes = await authedFetch(`${API_BASE}/crm/contacts/${entityId}/deals`, { credentials: 'include' })
                    if (dealsRes.ok) {
                        const deals = await dealsRes.json()
                        for (const deal of deals.slice(0, 10)) {
                            nodesMap.set(deal.id, {
                                id: deal.id,
                                type: 'deal',
                                label: deal.title,
                                subtitle: deal.deal_status,
                            })
                            edgesList.push({ from: entityId, to: deal.id, relationship: 'deal' })
                        }
                    }
                }

                if (entityType === 'deal') {
                    // Fetch deal details
                    const dealRes = await authedFetch(`${API_BASE}/crm/deals/${entityId}`, { credentials: 'include' })
                    if (dealRes.ok) {
                        const deal = await dealRes.json()
                        nodesMap.set(entityId, {
                            id: entityId,
                            type: 'deal',
                            label: deal.title,
                            subtitle: deal.deal_status,
                        })

                        if (deal.primary_contact_id) {
                            try {
                                const cRes = await authedFetch(`${API_BASE}/crm/contacts/${deal.primary_contact_id}`, { credentials: 'include' })
                                if (cRes.ok) {
                                    const c = await cRes.json()
                                    nodesMap.set(c.id, { id: c.id, type: 'contact', label: `${c.first_name} ${c.last_name}`, subtitle: c.email })
                                    edgesList.push({ from: entityId, to: c.id, relationship: 'primary_contact' })
                                }
                            } catch {}
                        }
                    }
                }

                setNodes(Array.from(nodesMap.values()))
                setEdges(edgesList)
            } catch (err) {
                console.error('Failed to load relationships:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchRelationships()
    }, [entityId, entityType])

    const nodeIcon = (type: string) => {
        switch (type) {
            case 'contact': return <Users className="h-4 w-4" />
            case 'company': return <Building2 className="h-4 w-4" />
            case 'deal': return <Link2 className="h-4 w-4" />
            default: return <Network className="h-4 w-4" />
        }
    }

    const nodeColor = (type: string) => {
        switch (type) {
            case 'contact': return 'border-blue-500/50 bg-blue-500/10'
            case 'company': return 'border-purple-500/50 bg-purple-500/10'
            case 'deal': return 'border-green-500/50 bg-green-500/10'
            default: return 'border-border bg-muted/50'
        }
    }

    // Simple radial layout
    const layoutNodes = useMemo(() => {
        if (nodes.length === 0) return []
        const centerX = 300
        const centerY = 200
        const radius = 140

        return nodes.map((node, i) => {
            const isCenter = node.id === entityId
            const angle = (2 * Math.PI * i) / Math.max(nodes.length - 1, 1)
            return {
                ...node,
                x: isCenter ? centerX : centerX + radius * Math.cos(angle),
                y: isCenter ? centerY : centerY + radius * Math.sin(angle),
            }
        })
    }, [nodes, entityId])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    Relationship Map
                </CardTitle>
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(z + 0.2, 2))}>
                        <ZoomIn className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))}>
                        <ZoomOut className="h-3 w-3" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {nodes.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        No relationships to display.
                    </div>
                ) : (
                    <div className="relative overflow-hidden rounded-lg border border-border bg-background" style={{ height: 400 }}>
                        <svg
                            viewBox="0 0 600 400"
                            className="w-full h-full"
                            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                        >
                            {/* Edges */}
                            {edges.map((edge, i) => {
                                const from = layoutNodes.find(n => n.id === edge.from)
                                const to = layoutNodes.find(n => n.id === edge.to)
                                if (!from || !to) return null
                                return (
                                    <line
                                        key={i}
                                        x1={from.x}
                                        y1={from.y}
                                        x2={to.x}
                                        y2={to.y}
                                        stroke="currentColor"
                                        className="text-border"
                                        strokeWidth={1.5}
                                        strokeDasharray={edge.relationship === 'deal' ? '4,4' : undefined}
                                    />
                                )
                            })}
                            {/* Nodes */}
                            {layoutNodes.map(node => (
                                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                                    <circle
                                        r={node.id === entityId ? 28 : 22}
                                        className={cn(
                                            'fill-card stroke-2',
                                            node.type === 'contact' && 'stroke-blue-500',
                                            node.type === 'company' && 'stroke-purple-500',
                                            node.type === 'deal' && 'stroke-green-500',
                                            selectedNode === node.id && 'stroke-primary stroke-[3]',
                                        )}
                                        onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    <text
                                        y={-6}
                                        textAnchor="middle"
                                        className="fill-foreground text-[9px] font-medium pointer-events-none"
                                    >
                                        {node.label.length > 14 ? node.label.slice(0, 14) + '…' : node.label}
                                    </text>
                                    <text
                                        y={6}
                                        textAnchor="middle"
                                        className="fill-muted-foreground text-[7px] pointer-events-none"
                                    >
                                        {node.type}
                                    </text>
                                </g>
                            ))}
                        </svg>
                    </div>
                )}

                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Contact</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Deal</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Company</span>
                </div>
            </CardContent>
        </Card>
    )
}
