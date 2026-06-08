'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Property, Tenant, Tenancy } from '@/types/property-management'

const UTILITIES = ['water', 'electricity', 'internet', 'cleaning', 'generator', 'security']

export default function NewLeasePage() {
    const router = useRouter()

    const [properties, setProperties] = useState<Property[]>([])
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [units, setUnits] = useState<Property[]>([])
    const [unitsLoading, setUnitsLoading] = useState(false)

    const [propertyId, setPropertyId] = useState('')
    const [unitId, setUnitId] = useState('')
    const [tenantId, setTenantId] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [autoRenew, setAutoRenew] = useState(false)
    const [noticePeriod, setNoticePeriod] = useState('90')
    const [rentAmount, setRentAmount] = useState('')
    const [currency, setCurrency] = useState('GHS')
    const [securityDeposit, setSecurityDeposit] = useState('')
    const [advanceMonths, setAdvanceMonths] = useState('1')
    const [rentDueDay, setRentDueDay] = useState('1')
    const [includedUtilities, setIncludedUtilities] = useState<string[]>([])
    const [specialConditions, setSpecialConditions] = useState('')

    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Top-level properties only (standalone + parent buildings); child units are picked via the Unit dropdown
    const selectableProperties = useMemo(
        () => properties.filter(p => !p.parentPropertyId),
        [properties]
    )
    const selectedProperty = properties.find(p => p.id === propertyId)
    const isBuilding = !!selectedProperty && !!selectedProperty.totalUnits && selectedProperty.totalUnits > 0

    useEffect(() => {
        (async () => {
            try {
                const [propRes, tenantRes] = await Promise.all([
                    propertyManagementApi.getProperties({ limit: 200 }),
                    propertyManagementApi.getTenants({ limit: 200 }),
                ])
                setProperties(Array.isArray(propRes) ? propRes : propRes.data || [])
                setTenants(Array.isArray(tenantRes) ? tenantRes : (tenantRes as any).data || [])
            } catch (err) {
                console.error('Failed to load form data:', err)
                setError('Failed to load properties/tenants. Please refresh.')
            }
        })()
    }, [])

    // When a building is selected, load its units; otherwise clear
    useEffect(() => {
        setUnitId('')
        setUnits([])
        if (!isBuilding || !propertyId) return
        setUnitsLoading(true)
        propertyManagementApi.getPropertyUnits(propertyId)
            .then(res => setUnits(Array.isArray(res) ? res : []))
            .catch(err => console.error('Failed to load units:', err))
            .finally(() => setUnitsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyId, isBuilding])

    // Prefill rent from the chosen property/unit
    useEffect(() => {
        const src = isBuilding ? units.find(u => u.id === unitId) : selectedProperty
        if (src?.price) setRentAmount(String(src.price))
        if (src?.priceCurrency) setCurrency(src.priceCurrency)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unitId, propertyId, units])

    const toggleUtility = (u: string) =>
        setIncludedUtilities(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])

    const handleSubmit = async () => {
        setError(null)
        // The lease must point at the exact space: a unit for a building, else the property itself
        const effectivePropertyId = isBuilding ? unitId : propertyId

        if (!effectivePropertyId) { setError(isBuilding ? 'Select a unit for this building.' : 'Select a property.'); return }
        if (!tenantId) { setError('Select a tenant.'); return }
        if (!startDate || !endDate) { setError('Set the lease start and end dates.'); return }
        if (!rentAmount) { setError('Enter the monthly rent.'); return }

        setIsSaving(true)
        try {
            const payload: Partial<Tenancy> = {
                propertyId: effectivePropertyId,
                tenantId,
                leaseStartDate: startDate,
                leaseEndDate: endDate,
                monthlyRent: parseFloat(rentAmount) || 0,
                rentCurrency: currency,
                advancePaymentMonths: parseInt(advanceMonths) || 1,
                rentDueDay: parseInt(rentDueDay) || 1,
            }
            // Fields the backend reads via passthrough (not all on the Tenancy type)
            const extra = {
                securityDeposit: securityDeposit ? parseFloat(securityDeposit) : 0,
                autoRenew,
                specialConditions: specialConditions || undefined,
                leaseTerms: {
                    landlordUtilities: includedUtilities,
                    noticePeriodDays: parseInt(noticePeriod) || 30,
                },
            }
            await propertyManagementApi.createTenancy({ ...payload, ...extra } as Partial<Tenancy>)
            router.push('/dashboard/property-management/leases')
        } catch (err: any) {
            console.error('Failed to create lease:', err)
            setError(err.message || 'Failed to create lease. Please check your inputs.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/leases">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">New Lease Agreement</h1>
                        <p className="text-sm text-zinc-400">Create a new tenancy for a property</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/property-management/leases">
                        <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800">
                            Cancel
                        </Button>
                    </Link>
                    <Button onClick={handleSubmit} disabled={isSaving} className="bg-orange-600 hover:bg-orange-500 text-white">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Create Lease
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/20 border border-red-900 text-red-400 p-3 rounded text-sm">{error}</div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {/* Step 1: Property & Tenant Selection */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Property & Tenant</CardTitle>
                        <CardDescription className="text-zinc-500">Select the property and tenant for this lease</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Property</Label>
                                <Select value={propertyId} onValueChange={setPropertyId}>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                        <SelectValue placeholder="Select property" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-h-72">
                                        {selectableProperties.map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.title}{p.totalUnits ? ` (${p.totalUnits} units)` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">
                                    Unit {isBuilding ? <span className="text-red-500">*</span> : '(N/A for single property)'}
                                </Label>
                                <Select value={unitId} onValueChange={setUnitId} disabled={!isBuilding || unitsLoading}>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                        <SelectValue placeholder={
                                            !isBuilding ? 'Single-unit property' : unitsLoading ? 'Loading units…' : 'Select unit'
                                        } />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-h-72">
                                        {units.map(u => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.unitNumber || u.title}
                                                {u.floorNumber != null ? ` · Floor ${u.floorNumber}` : ''}
                                                {` · ${u.priceCurrency || 'GHS'} ${Number(u.price || 0).toLocaleString()}`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Tenant</Label>
                                <Select value={tenantId} onValueChange={setTenantId}>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                        <SelectValue placeholder="Select tenant" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-h-72">
                                        {tenants.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Step 2: Lease Terms */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Lease Duration</CardTitle>
                        <CardDescription className="text-zinc-500">Define the start and end dates</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Start Date</Label>
                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">End Date</Label>
                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 pt-2">
                            <Checkbox id="autoRenew" checked={autoRenew} onCheckedChange={(v) => setAutoRenew(!!v)} className="border-zinc-600 data-[state=checked]:bg-orange-500" />
                            <Label htmlFor="autoRenew" className="text-zinc-300 font-normal">Auto-renew lease at end of term</Label>
                        </div>
                        <div className="space-y-2 pt-2">
                            <Label className="text-zinc-300">Notice Period (Days)</Label>
                            <Input type="number" value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                        </div>
                    </CardContent>
                </Card>

                {/* Step 3: Financial Details */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Financials</CardTitle>
                        <CardDescription className="text-zinc-500">Rent, deposits, and payment terms</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Monthly Rent</Label>
                                <Input type="number" placeholder="0.00" value={rentAmount} onChange={e => setRentAmount(e.target.value)} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Currency</Label>
                                <Select value={currency} onValueChange={setCurrency}>
                                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                        <SelectItem value="GHS">GHS (Cedi)</SelectItem>
                                        <SelectItem value="USD">USD ($)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Security Deposit</Label>
                                <Input type="number" placeholder="0.00" value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-300">Advance Months</Label>
                                <Input type="number" value={advanceMonths} onChange={e => setAdvanceMonths(e.target.value)} className="bg-zinc-950 border-zinc-800 focus:border-orange-500" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Rent Due Day</Label>
                            <Select value={rentDueDay} onValueChange={setRentDueDay}>
                                <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-zinc-300">
                                    <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300 h-64 overflow-y-auto">
                                    {Array.from({ length: 28 }, (_, i) => (
                                        <SelectItem key={i + 1} value={(i + 1).toString()}>{i + 1}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Step 4: Additional Terms */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-white">Terms & Conditions</CardTitle>
                        <CardDescription className="text-zinc-500">Special clauses and included utilities</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <Label className="text-zinc-300 mb-3 block">Included Utilities</Label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {UTILITIES.map(u => (
                                    <div key={u} className="flex items-center space-x-2">
                                        <Checkbox id={u} checked={includedUtilities.includes(u)} onCheckedChange={() => toggleUtility(u)} className="border-zinc-600 data-[state=checked]:bg-green-500" />
                                        <Label htmlFor={u} className="text-zinc-400 font-normal capitalize">{u}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Separator className="bg-zinc-800" />

                        <div className="space-y-2">
                            <Label className="text-zinc-300">Special Conditions</Label>
                            <Textarea value={specialConditions} onChange={e => setSpecialConditions(e.target.value)} placeholder="Enter any additional clauses or conditions..." className="bg-zinc-950 border-zinc-800 focus:border-orange-500 h-24" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
