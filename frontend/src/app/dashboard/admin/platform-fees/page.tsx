'use client'

import React, { useEffect, useState } from 'react'
import {
    DollarSign,
    Percent,
    Save,
    Loader2,
    AlertTriangle,
    CheckCircle,
    Info,
    Landmark,
    Briefcase,
    HardHat,
    RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface FeeConfig {
    id: string
    paymentType: string
    organizationId: string | null
    organizationName: string | null
    feeMode: string
    percentageRate: number
    flatAmount: number
    currency: string
    minFee: number | null
    maxFee: number | null
    isActive: boolean
    effectiveFrom: string
    effectiveUntil: string | null
    createdAt: string
    updatedAt: string
}

interface EditState {
    feeMode: string
    percentageRate: string  // Human-readable: "1" for 1%
    flatAmount: string      // GHS: "25"
    minFee: string
    maxFee: string
}

const paymentTypeConfig: Record<string, { label: string; description: string; icon: React.ElementType; color: string }> = {
    rent: {
        label: 'Rent Payments',
        description: 'Fee charged on tenant rent payments through the platform',
        icon: Landmark,
        color: 'amber',
    },
    deal: {
        label: 'Deal Commissions',
        description: 'Fee charged on deal commission payouts and transactions',
        icon: Briefcase,
        color: 'blue',
    },
    project: {
        label: 'Project Payments',
        description: 'Fee charged on buyer payments and contractor settlements',
        icon: HardHat,
        color: 'green',
    },
}

const feeModeLabels: Record<string, string> = {
    percentage: 'Percentage Only',
    flat: 'Flat Fee Only',
    max_of: 'Max of (Percentage, Flat)',
}

export default function PlatformFeesPage() {
    const [configs, setConfigs] = useState<FeeConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editState, setEditState] = useState<EditState | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

    const loadConfigs = async () => {
        try {
            setLoading(true)
            setError(null)
            const res = await authedFetch(`${API_BASE}/admin/fee-configurations`, {
                credentials: 'include',
            })
            if (!res.ok) throw new Error(`Failed to load: ${res.status}`)
            const json = await res.json()
            setConfigs(json.data || [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadConfigs()
    }, [])

    const startEdit = (config: FeeConfig) => {
        setEditingId(config.id)
        setEditState({
            feeMode: config.feeMode,
            percentageRate: (config.percentageRate * 100).toFixed(2),  // Convert 0.01 → "1.00"
            flatAmount: config.flatAmount.toFixed(2),
            minFee: config.minFee?.toFixed(2) || '',
            maxFee: config.maxFee?.toFixed(2) || '',
        })
        setSaveSuccess(null)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditState(null)
    }

    const handleSave = async (configId: string) => {
        if (!editState) return

        const percentageRate = parseFloat(editState.percentageRate) / 100  // Convert "1" → 0.01
        const flatAmount = parseFloat(editState.flatAmount)

        if (isNaN(percentageRate) || percentageRate < 0 || percentageRate > 1) {
            setError('Percentage rate must be between 0% and 100%')
            return
        }
        if (isNaN(flatAmount) || flatAmount < 0) {
            setError('Flat amount must be >= 0')
            return
        }

        try {
            setSaving(true)
            setError(null)
            const res = await authedFetch(`${API_BASE}/admin/fee-configurations/${configId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    feeMode: editState.feeMode,
                    percentageRate,
                    flatAmount,
                    minFee: editState.minFee ? parseFloat(editState.minFee) : null,
                    maxFee: editState.maxFee ? parseFloat(editState.maxFee) : null,
                }),
            })

            if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                throw new Error(json.error || `Failed to save: ${res.status}`)
            }

            setSaveSuccess(configId)
            setEditingId(null)
            setEditState(null)
            await loadConfigs()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    // Compute human-readable fee description
    const feeDescription = (config: FeeConfig): string => {
        const pct = (config.percentageRate * 100).toFixed(2)
        switch (config.feeMode) {
            case 'max_of':
                return `max(${pct}%, ${config.currency} ${config.flatAmount.toFixed(2)})`
            case 'percentage':
                return `${pct}%`
            case 'flat':
                return `${config.currency} ${config.flatAmount.toFixed(2)}`
            default:
                return `${pct}%`
        }
    }

    // Calculate example fee
    const exampleFee = (config: FeeConfig, amount: number): string => {
        let fee: number
        switch (config.feeMode) {
            case 'max_of':
                fee = Math.max(amount * config.percentageRate, config.flatAmount)
                break
            case 'percentage':
                fee = amount * config.percentageRate
                break
            case 'flat':
                fee = config.flatAmount
                break
            default:
                fee = amount * config.percentageRate
        }
        if (config.minFee != null && fee < config.minFee) fee = config.minFee
        if (config.maxFee != null && fee > config.maxFee) fee = config.maxFee
        return `${config.currency} ${fee.toFixed(2)}`
    }

    // Filter to show only global defaults (not org-specific overrides)
    const globalConfigs = configs.filter(c => !c.organizationId)

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white font-mono">PLATFORM FEES</h1>
                    <p className="text-sm text-zinc-500 font-mono">
                        Configure service fees charged on payments processed through PROPMETRIK
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={loadConfigs}
                    disabled={loading}
                    className="border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900 bg-black font-mono text-xs uppercase"
                >
                    <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-3 p-4 bg-blue-950/20 border border-blue-900/30 rounded-lg">
                <Info className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-300 font-mono space-y-1">
                    <p className="font-bold">How fees work</p>
                    <p>Fees are charged to the payer on top of the principal amount. Paystack deducts fees from the payer&apos;s payment and splits the remainder between the recipient&apos;s subaccount and PROPMETRIK.</p>
                    <p><strong>max_of</strong> = whichever is higher: percentage or flat fee. <strong>percentage</strong> = percentage only. <strong>flat</strong> = fixed amount.</p>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-800 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <p className="text-sm text-red-400 font-mono">{error}</p>
                    <Button variant="link" onClick={() => setError(null)} className="text-zinc-500 ml-auto text-xs">
                        Dismiss
                    </Button>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-red-500" />
                </div>
            )}

            {/* Fee Configuration Cards */}
            {!loading && globalConfigs.length === 0 && (
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-zinc-500 font-mono">
                        <DollarSign className="h-10 w-10 mb-3 opacity-30" />
                        <p>No fee configurations found.</p>
                        <p className="text-xs mt-1">The payment system migration may not have run yet.</p>
                    </CardContent>
                </Card>
            )}

            {!loading && globalConfigs.map((config) => {
                const typeConfig = paymentTypeConfig[config.paymentType]
                if (!typeConfig) return null
                const Icon = typeConfig.icon
                const isEditing = editingId === config.id
                const justSaved = saveSuccess === config.id

                return (
                    <Card key={config.id} className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg bg-${typeConfig.color}-950/30 border border-${typeConfig.color}-800/30`}>
                                        <Icon className={`h-5 w-5 text-${typeConfig.color}-500`} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-sm font-mono uppercase text-white flex items-center gap-2">
                                            {typeConfig.label}
                                            <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-mono text-[10px]">
                                                {config.paymentType}
                                            </Badge>
                                            {justSaved && (
                                                <Badge className="bg-green-900/30 text-green-400 border-green-800 font-mono text-[10px]">
                                                    <CheckCircle className="h-3 w-3 mr-1" /> Saved
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="text-zinc-500 font-mono text-xs">
                                            {typeConfig.description}
                                        </CardDescription>
                                    </div>
                                </div>
                                {!isEditing && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => startEdit(config)}
                                        className="border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900 bg-black font-mono text-xs uppercase"
                                    >
                                        Edit
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isEditing && editState ? (
                                /* Edit Form */
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-zinc-400 font-mono text-[11px] uppercase">Fee Mode</Label>
                                            <Select value={editState.feeMode} onValueChange={(v) => setEditState({ ...editState, feeMode: v })}>
                                                <SelectTrigger className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-black border-zinc-800">
                                                    <SelectItem value="percentage">Percentage Only</SelectItem>
                                                    <SelectItem value="flat">Flat Fee Only</SelectItem>
                                                    <SelectItem value="max_of">Max of (Percentage, Flat)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-400 font-mono text-[11px] uppercase">
                                                Percentage Rate (%)
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="100"
                                                    value={editState.percentageRate}
                                                    onChange={(e) => setEditState({ ...editState, percentageRate: e.target.value })}
                                                    className="bg-black border-zinc-800 text-white font-mono text-sm pr-8"
                                                    disabled={editState.feeMode === 'flat'}
                                                />
                                                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600" />
                                            </div>
                                            <p className="text-[10px] text-zinc-600 font-mono">
                                                e.g., 1 = 1%, 0.25 = 0.25%
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-400 font-mono text-[11px] uppercase">
                                                Flat Amount (GHS)
                                            </Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 font-mono text-sm">₵</span>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={editState.flatAmount}
                                                    onChange={(e) => setEditState({ ...editState, flatAmount: e.target.value })}
                                                    className="bg-black border-zinc-800 text-white font-mono text-sm pl-8"
                                                    disabled={editState.feeMode === 'percentage'}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-zinc-400 font-mono text-[11px] uppercase">
                                                Min Fee (GHS) <span className="text-zinc-600">— optional</span>
                                            </Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 font-mono text-sm">₵</span>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={editState.minFee}
                                                    onChange={(e) => setEditState({ ...editState, minFee: e.target.value })}
                                                    className="bg-black border-zinc-800 text-white font-mono text-sm pl-8"
                                                    placeholder="No minimum"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-400 font-mono text-[11px] uppercase">
                                                Max Fee (GHS) <span className="text-zinc-600">— optional</span>
                                            </Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 font-mono text-sm">₵</span>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={editState.maxFee}
                                                    onChange={(e) => setEditState({ ...editState, maxFee: e.target.value })}
                                                    className="bg-black border-zinc-800 text-white font-mono text-sm pl-8"
                                                    placeholder="No maximum"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">Preview</p>
                                        <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                                            <div>
                                                <span className="text-zinc-500">₵500 payment:</span>
                                                <span className="text-white ml-2">
                                                    {(() => {
                                                        const pct = parseFloat(editState.percentageRate) / 100
                                                        const flat = parseFloat(editState.flatAmount)
                                                        let fee = editState.feeMode === 'percentage' ? 500 * pct
                                                            : editState.feeMode === 'flat' ? flat
                                                            : Math.max(500 * pct, flat)
                                                        if (editState.minFee && fee < parseFloat(editState.minFee)) fee = parseFloat(editState.minFee)
                                                        if (editState.maxFee && fee > parseFloat(editState.maxFee)) fee = parseFloat(editState.maxFee)
                                                        return `₵${(isNaN(fee) ? 0 : fee).toFixed(2)} fee`
                                                    })()}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">₵2,000 payment:</span>
                                                <span className="text-white ml-2">
                                                    {(() => {
                                                        const pct = parseFloat(editState.percentageRate) / 100
                                                        const flat = parseFloat(editState.flatAmount)
                                                        let fee = editState.feeMode === 'percentage' ? 2000 * pct
                                                            : editState.feeMode === 'flat' ? flat
                                                            : Math.max(2000 * pct, flat)
                                                        if (editState.minFee && fee < parseFloat(editState.minFee)) fee = parseFloat(editState.minFee)
                                                        if (editState.maxFee && fee > parseFloat(editState.maxFee)) fee = parseFloat(editState.maxFee)
                                                        return `₵${(isNaN(fee) ? 0 : fee).toFixed(2)} fee`
                                                    })()}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">₵10,000 payment:</span>
                                                <span className="text-white ml-2">
                                                    {(() => {
                                                        const pct = parseFloat(editState.percentageRate) / 100
                                                        const flat = parseFloat(editState.flatAmount)
                                                        let fee = editState.feeMode === 'percentage' ? 10000 * pct
                                                            : editState.feeMode === 'flat' ? flat
                                                            : Math.max(10000 * pct, flat)
                                                        if (editState.minFee && fee < parseFloat(editState.minFee)) fee = parseFloat(editState.minFee)
                                                        if (editState.maxFee && fee > parseFloat(editState.maxFee)) fee = parseFloat(editState.maxFee)
                                                        return `₵${(isNaN(fee) ? 0 : fee).toFixed(2)} fee`
                                                    })()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-3 pt-2">
                                        <Button
                                            onClick={() => handleSave(config.id)}
                                            disabled={saving}
                                            className="bg-red-600 hover:bg-red-700 text-white font-mono text-xs uppercase"
                                        >
                                            {saving ? (
                                                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                            ) : (
                                                <Save className="h-3 w-3 mr-2" />
                                            )}
                                            Save Changes
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={cancelEdit}
                                            disabled={saving}
                                            className="border-zinc-800 text-zinc-400 hover:text-white bg-black font-mono text-xs uppercase"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                /* Display View */
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Fee Mode</p>
                                            <Badge variant="outline" className="border-zinc-700 text-zinc-300 font-mono text-xs">
                                                {feeModeLabels[config.feeMode] || config.feeMode}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Fee Formula</p>
                                            <p className="text-sm text-white font-mono font-bold">{feeDescription(config)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Currency</p>
                                            <p className="text-sm text-white font-mono">{config.currency}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Last Updated</p>
                                            <p className="text-sm text-zinc-400 font-mono">
                                                {new Date(config.updatedAt).toLocaleDateString('en-GH')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Example Calculations */}
                                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2">Example Fees</p>
                                        <div className="grid grid-cols-4 gap-4 text-xs font-mono">
                                            <div>
                                                <span className="text-zinc-500">₵500:</span>
                                                <span className="text-amber-400 ml-1">{exampleFee(config, 500)}</span>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">₵2,000:</span>
                                                <span className="text-amber-400 ml-1">{exampleFee(config, 2000)}</span>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">₵5,000:</span>
                                                <span className="text-amber-400 ml-1">{exampleFee(config, 5000)}</span>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">₵10,000:</span>
                                                <span className="text-amber-400 ml-1">{exampleFee(config, 10000)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Caps */}
                                    {(config.minFee != null || config.maxFee != null) && (
                                        <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
                                            {config.minFee != null && (
                                                <span>Min fee: <span className="text-white">{config.currency} {config.minFee.toFixed(2)}</span></span>
                                            )}
                                            {config.maxFee != null && (
                                                <span>Max fee: <span className="text-white">{config.currency} {config.maxFee.toFixed(2)}</span></span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
