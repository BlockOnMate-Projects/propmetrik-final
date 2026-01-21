'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, Building2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { propertyManagementApi } from '@/lib/property-management-api'
// Note: CreatePropertyDto might not be in frontend types, I'll use Partial<Property> instead or define locally or verify.
// I'll use any or Partial<Property> since I added Property interface.

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
        unitsCount: '1'
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            // Convert numbers
            const payload = {
                ...formData,
                bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : undefined,
                bathrooms: formData.bathrooms ? parseInt(formData.bathrooms) : undefined,
                floors: formData.floors ? parseInt(formData.floors) : undefined,
                totalAreaSqm: formData.totalAreaSqm ? parseFloat(formData.totalAreaSqm) : undefined,
                price: parseFloat(formData.price) || 0,
                unitsCount: isMultiUnit ? parseInt(formData.unitsCount) : 1,
                // Add required fields expected by backend if missing (though form has defaults)
                referenceNumber: `PROP-${Date.now().toString().slice(-6)}` // Fallback or let backend generate
            }

            // Backend usually generates referenceNumber if missing, but let's see. 
            // In PropertyService.ts I saw it generates it.

            await propertyManagementApi.createProperty(payload)
            router.push('/dashboard/property-management/properties')
        } catch (err: any) {
            console.error('Failed to create property:', err)
            setError(err.message || 'Failed to create property. Please checking your inputs.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
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
                                    value={isMultiUnit ? "multi" : "single"}
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

                            {isMultiUnit && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono uppercase text-zinc-400">Number of Units</Label>
                                    <Input
                                        name="unitsCount"
                                        type="number"
                                        value={formData.unitsCount}
                                        onChange={handleChange}
                                        className="bg-black border-zinc-700 font-mono text-amber-500 font-bold"
                                        min="2"
                                    />
                                </div>
                            )}
                        </div>

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
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
                        </div>

                        {/* Financial */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase text-zinc-400">
                                    {isMultiUnit ? 'Rental Price (Per Unit) *' : 'Rental Price *'}
                                </Label>
                                <Input
                                    name="price"
                                    type="number"
                                    value={formData.price}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    className="bg-black border-zinc-700 font-mono font-bold text-amber-500"
                                    required
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
                            <Button type="submit" disabled={isLoading} className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono">
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
