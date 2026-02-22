'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, GitMerge, AlertTriangle, Check, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { contactsApi } from '@/lib/crm-api'
import { toast } from 'sonner'

// Types matching backend contactMergeService
interface DuplicateContact {
    id: string
    first_name: string
    last_name: string
    email?: string
    phone_primary?: string
    contact_type?: string
    lead_status?: string
    created_at: string
}

interface DuplicateGroup {
    contact_a: DuplicateContact
    contact_b: DuplicateContact
    confidence: number
    match_type: string
}

interface ContactMergeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onMergeComplete?: () => void
}

const MERGE_FIELDS = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone_primary', label: 'Phone' },
    { key: 'contact_type', label: 'Type' },
    { key: 'lead_status', label: 'Lead Status' },
] as const

type FieldKey = typeof MERGE_FIELDS[number]['key']

export function ContactMergeDialog({ open, onOpenChange, onMergeComplete }: ContactMergeDialogProps) {
    const [groups, setGroups] = useState<DuplicateGroup[]>([])
    const [loading, setLoading] = useState(false)
    const [merging, setMerging] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)
    const [survivorSide, setSurvivorSide] = useState<'a' | 'b'>('a')
    const [useFromDuplicate, setUseFromDuplicate] = useState<Set<string>>(new Set())

    // Load duplicate groups
    useEffect(() => {
        if (!open) return
        setLoading(true)
        const fetchDuplicates = async () => {
            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/crm/contacts/duplicates?limit=50&min_confidence=0.5`,
                    { credentials: 'include' }
                )
                if (res.ok) {
                    const data = await res.json()
                    setGroups(data.groups || [])
                    setActiveIndex(0)
                    setSurvivorSide('a')
                    setUseFromDuplicate(new Set())
                }
            } catch (err) {
                console.error('Failed to load duplicates:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchDuplicates()
    }, [open])

    const currentGroup = groups[activeIndex]
    const survivor = currentGroup ? (survivorSide === 'a' ? currentGroup.contact_a : currentGroup.contact_b) : null
    const duplicate = currentGroup ? (survivorSide === 'a' ? currentGroup.contact_b : currentGroup.contact_a) : null

    const toggleField = useCallback((field: string) => {
        setUseFromDuplicate(prev => {
            const next = new Set(prev)
            if (next.has(field)) next.delete(field)
            else next.add(field)
            return next
        })
    }, [])

    const handleMerge = async () => {
        if (!survivor || !duplicate) return
        setMerging(true)
        try {
            const useFields = Array.from(useFromDuplicate)
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/crm/contacts/merge`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        survivor_id: survivor.id,
                        duplicate_id: duplicate.id,
                        use_duplicate_fields: useFields.length > 0 ? useFields : undefined,
                    }),
                }
            )
            if (res.ok) {
                toast.success(`Merged into ${survivor.first_name} ${survivor.last_name}`)
                // Remove the merged group and move to next
                setGroups(prev => prev.filter((_, i) => i !== activeIndex))
                setActiveIndex(prev => Math.min(prev, groups.length - 2))
                setSurvivorSide('a')
                setUseFromDuplicate(new Set())
                onMergeComplete?.()
            } else {
                const err = await res.json()
                toast.error(err.error || 'Merge failed')
            }
        } catch (err) {
            toast.error('Failed to merge contacts')
        } finally {
            setMerging(false)
        }
    }

    const handleSkip = () => {
        if (activeIndex < groups.length - 1) {
            setActiveIndex(prev => prev + 1)
            setSurvivorSide('a')
            setUseFromDuplicate(new Set())
        }
    }

    const confidenceColor = (conf: number) =>
        conf >= 0.9 ? 'text-red-400' : conf >= 0.7 ? 'text-amber-400' : 'text-muted-foreground'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitMerge className="h-5 w-5 text-primary" />
                        Contact Merge &amp; Dedup
                    </DialogTitle>
                    <DialogDescription>
                        {loading
                            ? 'Scanning for duplicates...'
                            : groups.length === 0
                            ? 'No duplicate contacts found.'
                            : `${groups.length} potential duplicate${groups.length > 1 ? 's' : ''} found. Review ${activeIndex + 1} of ${groups.length}.`}
                    </DialogDescription>
                </DialogHeader>

                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                )}

                {!loading && groups.length === 0 && (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                        <Check className="h-10 w-10 mx-auto mb-3 text-green-500" />
                        All contacts are unique. No duplicates detected.
                    </div>
                )}

                {!loading && currentGroup && survivor && duplicate && (
                    <div className="space-y-4">
                        {/* Confidence badge */}
                        <div className="flex items-center justify-between">
                            <Badge variant="outline" className={cn('text-xs', confidenceColor(currentGroup.confidence))}>
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {Math.round(currentGroup.confidence * 100)}% match ({currentGroup.match_type})
                            </Badge>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant={survivorSide === 'a' ? 'default' : 'outline'}
                                    onClick={() => { setSurvivorSide('a'); setUseFromDuplicate(new Set()) }}
                                    className="text-xs"
                                >
                                    Keep Left
                                </Button>
                                <Button
                                    size="sm"
                                    variant={survivorSide === 'b' ? 'default' : 'outline'}
                                    onClick={() => { setSurvivorSide('b'); setUseFromDuplicate(new Set()) }}
                                    className="text-xs"
                                >
                                    Keep Right
                                </Button>
                            </div>
                        </div>

                        {/* Comparison table */}
                        <div className="border border-border rounded-lg overflow-hidden">
                            {/* Header */}
                            <div className="grid grid-cols-[1fr_2fr_auto_2fr] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
                                <span>Field</span>
                                <span className={cn(survivorSide === 'a' && 'text-primary')}>
                                    {survivorSide === 'a' ? '★ Survivor' : 'Duplicate'}
                                </span>
                                <span />
                                <span className={cn(survivorSide === 'b' && 'text-primary')}>
                                    {survivorSide === 'b' ? '★ Survivor' : 'Duplicate'}
                                </span>
                            </div>

                            {/* Rows */}
                            {MERGE_FIELDS.map(({ key, label }) => {
                                const aVal = (currentGroup.contact_a as any)[key] || '—'
                                const bVal = (currentGroup.contact_b as any)[key] || '—'
                                const isDifferent = aVal !== bVal
                                const isOverridden = useFromDuplicate.has(key)
                                const dupKey = survivorSide === 'a' ? key : key // field from duplicate side

                                return (
                                    <div
                                        key={key}
                                        className={cn(
                                            'grid grid-cols-[1fr_2fr_auto_2fr] px-3 py-2 text-sm border-t border-border',
                                            isDifferent && 'bg-amber-500/5'
                                        )}
                                    >
                                        <span className="text-xs text-muted-foreground font-medium">{label}</span>
                                        <span className={cn(
                                            'truncate',
                                            survivorSide === 'a' && !isOverridden && 'text-foreground font-medium',
                                            survivorSide === 'b' && isOverridden && 'text-foreground font-medium',
                                        )}>
                                            {aVal}
                                        </span>
                                        <span className="px-2">
                                            {isDifferent && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleField(key)}
                                                    className="text-muted-foreground hover:text-primary transition-colors"
                                                    title="Use this value from duplicate"
                                                >
                                                    <ArrowRight className={cn(
                                                        'h-3 w-3',
                                                        isOverridden && 'text-primary rotate-180'
                                                    )} />
                                                </button>
                                            )}
                                        </span>
                                        <span className={cn(
                                            'truncate',
                                            survivorSide === 'b' && !isOverridden && 'text-foreground font-medium',
                                            survivorSide === 'a' && isOverridden && 'text-foreground font-medium',
                                        )}>
                                            {bVal}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {groups.length > 0 && activeIndex < groups.length - 1 && (
                        <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
                            Skip
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    {currentGroup && (
                        <Button onClick={handleMerge} disabled={merging}>
                            {merging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GitMerge className="h-4 w-4 mr-2" />}
                            Merge Contacts
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
