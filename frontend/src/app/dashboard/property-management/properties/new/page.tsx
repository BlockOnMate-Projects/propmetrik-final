'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, Building2, Layers, Wand2, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Property } from '@/types/property-management'

type NumberingScheme = 'floor_letter' | 'floor_number' | 'sequential'

interface UnitRow {
    label: string
    floorNumber: number
    bedrooms: string
    bathrooms: string
    totalAreaSqm: string
    price: string
}

export default function NewPropertyPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isMultiUnit, setIsMultiUnit] = useState(false)

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        region: 'greater_accra',
        addressCity: '',
        addressDistrict: '',
        addressStreet: '',
        digitalAddress: '',
        propertyType: 'residential_house',
        transactionType: 'rental',
        bedrooms: '',
        bathrooms: '',
        floors: '',
        totalAreaSqm: '',
        price: '',
        priceCurrency: 'GHS',
        status: 'active',
    })

    // Multi-unit building layout configuration
    const [floorsCount, setFloorsCount] = useState('1')
    const [unitsPerFloorMode, setUnitsPerFloorMode] = useState<'same' | 'custom'>('same')
    const [unitsPerFloor, setUnitsPerFloor] = useState('2')
    const [perFloorCounts, setPerFloorCounts] = useState<string[]>([])
    const [numberingScheme, setNumberingScheme] = useState<NumberingScheme>('floor_letter')
    const [units, setUnits] = useState<UnitRow[]>([])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const unitLabel = (floor: number, indexOnFloor: number, sequential: number): string => {
        if (numberingScheme === 'floor_letter') {
            // 1A, 1B ... falls back to a number past Z (26+ units on a floor is unusual)
            return indexOnFloor < 26
                ? `${floor}${String.fromCharCode(65 + indexOnFloor)}`
                : `${floor}-${indexOnFloor + 1}`
        }
        if (numberingScheme === 'floor_number') {
            return `${floor}${String(indexOnFloor + 1).padStart(2, '0')}`
        }
        return `Unit ${sequential}`
    }

    const generateUnits = () => {
        const floors = Math.max(1, Math.min(200, parseInt(floorsCount) || 1))
        const rows: UnitRow[] = []
        let seq = 1
        for (let f = 1; f <= floors; f++) {
            const count = unitsPerFloorMode === 'same'
                ? Math.max(1, parseInt(unitsPerFloor) || 1)
                : Math.max(1, parseInt(perFloorCounts[f - 1] ?? unitsPerFloor) || 1)
            for (let j = 0; j < count; j++) {
                rows.push({
                    label: unitLabel(f, j, seq),
                    floorNumber: f,
                    bedrooms: formData.bedrooms,
                    bathrooms: formData.bathrooms,
                    totalAreaSqm: formData.totalAreaSqm,
                    price: formData.price,
                })
                seq++
            }
        }
        setUnits(rows)
    }

    const updateUnit = (idx: number, field: keyof UnitRow, value: string) => {
        setUnits(prev => prev.map((u, i) =>
            i === idx ? { ...u, [field]: field === 'floorNumber' ? (parseInt(value) || 0) : value } : u
        ))
    }

    const removeUnit = (idx: number) => setUnits(prev => prev.filter((_, i) => i !== idx))

    const addUnit = () => setUnits(prev => [...prev, {
        label: '',
        floorNumber: Math.max(1, parseInt(floorsCount) || 1),
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        totalAreaSqm: formData.totalAreaSqm,
        price: formData.price,
    }])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            let payload: Partial<Property>

            if (isMultiUnit) {
                if (units.length === 0) {
                    setError('Generate the unit layout (or add a unit) before saving.')
                    setIsLoading(false)
                    return
                }
                if (units.some(u => !u.label.trim())) {
                    setError('Every unit needs a label/number (e.g. 3A, 201).')
                    setIsLoading(false)
                    return
                }

                payload = {
                    title: formData.title,
                    description: formData.description,
                    region: formData.region,
                    addressCity: formData.addressCity,
                    addressDistrict: formData.addressDistrict,
                    addressStreet: formData.addressStreet,
                    digitalAddress: formData.digitalAddress,
                    propertyType: formData.propertyType,
                    transactionType: formData.transactionType,
                    priceCurrency: formData.priceCurrency,
                    status: formData.status,
                    floors: parseInt(floorsCount) || undefined,
                    units: units.map(u => ({
                        label: u.label.trim(),
                        floorNumber: u.floorNumber || undefined,
                        bedrooms: u.bedrooms ? parseInt(u.bedrooms) : undefined,
                        bathrooms: u.bathrooms ? parseInt(u.bathrooms) : undefined,
                        totalAreaSqm: u.totalAreaSqm ? parseFloat(u.totalAreaSqm) : undefined,
                        price: u.price ? parseFloat(u.price) : 0,
                    })),
                }
            } else {
                payload = {
                    ...formData,
                    bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : undefined,
                    bathrooms: formData.bathrooms ? parseInt(formData.bathrooms) : undefined,
                    floors: formData.floors ? parseInt(formData.floors) : undefined,
                    totalAreaSqm: formData.totalAreaSqm ? parseFloat(formData.totalAreaSqm) : undefined,
                    price: parseFloat(formData.price) || 0,
                }
            }

            await propertyManagementApi.createProperty(payload)
            router.push('/dashboard/property-management/properties')
        } catch (err: any) {
            console.error('Failed to create property:', err)
            setError(err.message || 'Failed to create property. Please check your inputs.')
        } finally {
            setIsLoading(false)
        }
    }

    const floorsForCustom = Math.max(1, Math.min(200, parseInt(floorsCount) || 1))

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
                <Link href="/dashboard/property-management/properties">
                    <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white font-mono">NEW PROPERTY</h1>
                    <p className="text-sm text-zinc-500 font-mono">Add a new asset to portfolio</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono uppercase text-amber-500 flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Property Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {error && (
                            <div className="bg-red-900/20 border border-red-900 text-red-500 p-3 rounded font-mono text-sm">
                                {error}
                            </div>
                        )}

                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">Property Title *</Label>
                                <Input
                                    name="title"
                                    value={formData.title}
                                    onChange={handleChange}
                                    placeholder="e.g. Sunset Apartments Block A"
                                    className="bg-black border-zinc-700 focus:border-amber-500 font-mono"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">Property Type</Label>
                                <Select value={formData.propertyType} onValueChange={(val) => handleSelectChange('propertyType', val)}>
                                    <SelectTrigger className="bg-black border-zinc-700 font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="residential_house">Residential House</SelectItem>
                                        <SelectItem value="apartment_flat">Apartment / Flat</SelectItem>
                                        <SelectItem value="commercial_shop">Commercial Shop</SelectItem>
                                        <SelectItem value="commercial_office">Commercial Office</SelectItem>
                                        <SelectItem value="warehouse">Warehouse</SelectItem>
                                        <SelectItem value="industrial">Industrial</SelectItem>
                                        <SelectItem value="mixed_use">Mixed Use</SelectItem>
                                        <SelectItem value="land">Land</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">Structure</Label>
                                <Select
                                    value={isMultiUnit ? 'multi' : 'single'}
                                    onValueChange={(val) => setIsMultiUnit(val === 'multi')}
                                >
                                    <SelectTrigger className="bg-black border-zinc-700 font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="single">Single Unit</SelectItem>
                                        <SelectItem value="multi">Multi-Unit Building</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Multi-unit building layout */}
                        {isMultiUnit && (
                            <div className="space-y-4 rounded-lg border border-amber-900/40 bg-amber-950/10 p-4">
                                <div className="flex items-center gap-2 text-amber-500 font-mono text-xs uppercase">
                                    <Layers className="h-4 w-4" />
                                    Building Layout
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono uppercase text-zinc-400">Floors</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={floorsCount}
                                            onChange={(e) => setFloorsCount(e.target.value)}
                                            className="bg-black border-zinc-700 font-mono text-amber-500 font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono uppercase text-zinc-400">Units Per Floor</Label>
                                        <Select value={unitsPerFloorMode} onValueChange={(v) => setUnitsPerFloorMode(v as 'same' | 'custom')}>
                                            <SelectTrigger className="bg-black border-zinc-700 font-mono">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="same">Same on every floor</SelectItem>
                                                <SelectItem value="custom">Different per floor</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono uppercase text-zinc-400">Numbering</Label>
                                        <Select value={numberingScheme} onValueChange={(v) => setNumberingScheme(v as NumberingScheme)}>
                                            <SelectTrigger className="bg-black border-zinc-700 font-mono">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="floor_letter">Floor + Letter (3A, 3B)</SelectItem>
                                                <SelectItem value="floor_number">Floor + Number (301, 302)</SelectItem>
                                                <SelectItem value="sequential">Sequential (Unit 1, 2)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {unitsPerFloorMode === 'same' ? (
                                    <div className="space-y-2 max-w-[12rem]">
                                        <Label className="text-xs font-mono uppercase text-zinc-400"># Units / Floor</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={unitsPerFloor}
                                            onChange={(e) => setUnitsPerFloor(e.target.value)}
                                            className="bg-black border-zinc-700 font-mono text-amber-500 font-bold"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono uppercase text-zinc-400">Units on each floor</Label>
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                            {Array.from({ length: floorsForCustom }, (_, i) => (
                                                <div key={i} className="space-y-1">
                                                    <span className="text-[10px] font-mono text-zinc-500">Floor {i + 1}</span>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        value={perFloorCounts[i] ?? ''}
                                                        placeholder={unitsPerFloor}
                                                        onChange={(e) => {
                                                            const next = [...perFloorCounts]
                                                            next[i] = e.target.value
                                                            setPerFloorCounts(next)
                                                        }}
                                                        className="bg-black border-zinc-700 font-mono text-xs h-9"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 pt-1">
                                    <Button type="button" onClick={generateUnits} variant="outline" className="border-amber-700 text-amber-500 hover:bg-amber-950 hover:text-amber-400 bg-transparent font-mono text-xs">
                                        <Wand2 className="h-3 w-3 mr-2" />
                                        {units.length > 0 ? 'Regenerate Units' : 'Generate Units'}
                                    </Button>
                                    <p className="text-[11px] font-mono text-zinc-500">
                                        Uses the default specs below as a starting point — edit each unit in the roster.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Location */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">Region</Label>
                                    <Select value={formData.region} onValueChange={(val) => handleSelectChange('region', val)}>
                                        <SelectTrigger className="bg-black border-zinc-700 font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="greater_accra">Greater Accra</SelectItem>
                                            <SelectItem value="ashanti">Ashanti</SelectItem>
                                            <SelectItem value="eastern">Eastern</SelectItem>
                                            <SelectItem value="central">Central</SelectItem>
                                            <SelectItem value="western">Western</SelectItem>
                                            <SelectItem value="volta">Volta</SelectItem>
                                            <SelectItem value="northern">Northern</SelectItem>
                                            <SelectItem value="upper_east">Upper East</SelectItem>
                                            <SelectItem value="upper_west">Upper West</SelectItem>
                                            <SelectItem value="bono">Bono</SelectItem>
                                            <SelectItem value="bono_east">Bono East</SelectItem>
                                            <SelectItem value="ahafo">Ahafo</SelectItem>
                                            <SelectItem value="savannah">Savannah</SelectItem>
                                            <SelectItem value="north_east">North East</SelectItem>
                                            <SelectItem value="oti">Oti</SelectItem>
                                            <SelectItem value="western_north">Western North</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">City/Town *</Label>
                                    <Input
                                        name="addressCity"
                                        value={formData.addressCity}
                                        onChange={handleChange}
                                        placeholder="e.g. Accra"
                                        className="bg-black border-zinc-700 font-mono"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">District/Area</Label>
                                    <Input
                                        name="addressDistrict"
                                        value={formData.addressDistrict}
                                        onChange={handleChange}
                                        placeholder="e.g. Cantonments"
                                        className="bg-black border-zinc-700 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">Digital Address (Ghana Post GPS)</Label>
                                    <Input
                                        name="digitalAddress"
                                        value={formData.digitalAddress}
                                        onChange={handleChange}
                                        placeholder="e.g. GA-123-4567"
                                        className="bg-black border-zinc-700 font-mono text-amber-500 placeholder:text-zinc-600"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">Street Address</Label>
                                <Input
                                    name="addressStreet"
                                    value={formData.addressStreet}
                                    onChange={handleChange}
                                    placeholder="e.g. 15 Independence Avenue"
                                    className="bg-black border-zinc-700 font-mono"
                                />
                            </div>
                        </div>

                        {/* Specs */}
                        <div className="space-y-2">
                            {isMultiUnit && (
                                <p className="text-[11px] font-mono text-zinc-500 uppercase">Default Unit Specs (seed each unit — edit individually below)</p>
                            )}
                            <div className={`grid grid-cols-2 gap-6 ${isMultiUnit ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">Bedrooms</Label>
                                    <Input
                                        name="bedrooms"
                                        type="number"
                                        value={formData.bedrooms}
                                        onChange={handleChange}
                                        className="bg-black border-zinc-700 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">Bathrooms</Label>
                                    <Input
                                        name="bathrooms"
                                        type="number"
                                        value={formData.bathrooms}
                                        onChange={handleChange}
                                        className="bg-black border-zinc-700 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">Area (sqm)</Label>
                                    <Input
                                        name="totalAreaSqm"
                                        type="number"
                                        value={formData.totalAreaSqm}
                                        onChange={handleChange}
                                        className="bg-black border-zinc-700 font-mono"
                                    />
                                </div>
                                {!isMultiUnit && (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-mono uppercase text-zinc-400">Floors</Label>
                                        <Input
                                            name="floors"
                                            type="number"
                                            value={formData.floors}
                                            onChange={handleChange}
                                            className="bg-black border-zinc-700 font-mono"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Financial */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">
                                    {isMultiUnit ? 'Default Rent (Per Unit)' : 'Rental Price *'}
                                </Label>
                                <Input
                                    name="price"
                                    type="number"
                                    value={formData.price}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    className="bg-black border-zinc-700 font-mono font-bold text-amber-500"
                                    required={!isMultiUnit}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">Currency</Label>
                                <Select value={formData.priceCurrency} onValueChange={(val) => handleSelectChange('priceCurrency', val)}>
                                    <SelectTrigger className="bg-black border-zinc-700 font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="GHS">GHS (Cedis)</SelectItem>
                                        <SelectItem value="USD">USD (Dollars)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">Transaction Type</Label>
                                <Select value={formData.transactionType} onValueChange={(val) => handleSelectChange('transactionType', val)}>
                                    <SelectTrigger className="bg-black border-zinc-700 font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="rental">Rental</SelectItem>
                                        <SelectItem value="sale">Sale</SelectItem>
                                        <SelectItem value="lease">Lease</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Unit roster */}
                        {isMultiUnit && units.length > 0 && (
                            <div className="space-y-3 rounded-lg border border-zinc-800 bg-black/40 p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-amber-500 font-mono text-xs uppercase">
                                        <Building2 className="h-4 w-4" />
                                        Unit Roster
                                        <span className="text-zinc-500 normal-case">
                                            ({units.length} units{floorsCount ? ` across ${floorsForCustom} floor${floorsForCustom > 1 ? 's' : ''}` : ''})
                                        </span>
                                    </div>
                                    <Button type="button" onClick={addUnit} variant="ghost" size="sm" className="text-zinc-400 hover:text-amber-500 font-mono text-xs h-7">
                                        <Plus className="h-3 w-3 mr-1" /> Add Unit
                                    </Button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs font-mono">
                                        <thead>
                                            <tr className="text-zinc-500 uppercase text-[10px]">
                                                <th className="text-left font-normal py-1 px-2">Unit #</th>
                                                <th className="text-left font-normal py-1 px-2 w-16">Floor</th>
                                                <th className="text-left font-normal py-1 px-2 w-20">Beds</th>
                                                <th className="text-left font-normal py-1 px-2 w-20">Baths</th>
                                                <th className="text-left font-normal py-1 px-2 w-24">Area m²</th>
                                                <th className="text-left font-normal py-1 px-2 w-28">Rent</th>
                                                <th className="py-1 px-2 w-8"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {units.map((u, idx) => (
                                                <tr key={idx} className="border-t border-zinc-800/60">
                                                    <td className="py-1 px-2">
                                                        <Input value={u.label} onChange={(e) => updateUnit(idx, 'label', e.target.value)} className="bg-black border-zinc-800 font-mono h-8 text-amber-500" />
                                                    </td>
                                                    <td className="py-1 px-2">
                                                        <Input type="number" value={u.floorNumber} onChange={(e) => updateUnit(idx, 'floorNumber', e.target.value)} className="bg-black border-zinc-800 font-mono h-8" />
                                                    </td>
                                                    <td className="py-1 px-2">
                                                        <Input type="number" value={u.bedrooms} onChange={(e) => updateUnit(idx, 'bedrooms', e.target.value)} className="bg-black border-zinc-800 font-mono h-8" />
                                                    </td>
                                                    <td className="py-1 px-2">
                                                        <Input type="number" value={u.bathrooms} onChange={(e) => updateUnit(idx, 'bathrooms', e.target.value)} className="bg-black border-zinc-800 font-mono h-8" />
                                                    </td>
                                                    <td className="py-1 px-2">
                                                        <Input type="number" value={u.totalAreaSqm} onChange={(e) => updateUnit(idx, 'totalAreaSqm', e.target.value)} className="bg-black border-zinc-800 font-mono h-8" />
                                                    </td>
                                                    <td className="py-1 px-2">
                                                        <Input type="number" value={u.price} onChange={(e) => updateUnit(idx, 'price', e.target.value)} className="bg-black border-zinc-800 font-mono h-8" />
                                                    </td>
                                                    <td className="py-1 px-2 text-center">
                                                        <button type="button" onClick={() => removeUnit(idx)} className="text-zinc-600 hover:text-red-500">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-xs font-mono uppercase text-zinc-400">Description</Label>
                            <Textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                className="bg-black border-zinc-700 font-mono min-h-[100px]"
                            />
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                            <Link href="/dashboard/property-management/properties">
                                <Button variant="outline" type="button" className="border-zinc-700 text-zinc-400 hover:text-white bg-transparent font-mono">
                                    CANCEL
                                </Button>
                            </Link>
                            <Button type="submit" disabled={isLoading} className="bg-amber-600 hover:bg-amber-500 text-white font-bold font-mono">
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                SAVE PROPERTY
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    )
}
