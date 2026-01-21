'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { 
    Loader2, ArrowLeft, Save, Home, Building2, LandPlot, 
    MapPin, DollarSign, User, Phone, Mail
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface PropertyFormData {
    property_name: string
    property_type: string
    listing_type: string
    address: string
    city: string
    region: string
    digital_address: string
    price: string
    currency: string
    bedrooms: string
    bathrooms: string
    area_sqm: string
    land_size_sqm: string
    description: string
    owner_name: string
    owner_contact: string
    owner_email: string
}

const GHANA_REGIONS = [
    'Greater Accra',
    'Ashanti',
    'Western',
    'Central',
    'Eastern',
    'Volta',
    'Northern',
    'Upper East',
    'Upper West',
    'Brong-Ahafo',
    'Bono East',
    'Ahafo',
    'Western North',
    'Oti',
    'North East',
    'Savannah'
]

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="border border-zinc-800 bg-zinc-900/50">
            <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-4 space-y-4">
                {children}
            </div>
        </div>
    )
}

export default function SubmitPropertyPage() {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [formData, setFormData] = useState<PropertyFormData>({
        property_name: '',
        property_type: 'house',
        listing_type: 'sale',
        address: '',
        city: '',
        region: 'Greater Accra',
        digital_address: '',
        price: '',
        currency: 'GHS',
        bedrooms: '',
        bathrooms: '',
        area_sqm: '',
        land_size_sqm: '',
        description: '',
        owner_name: '',
        owner_contact: '',
        owner_email: '',
    })

    const handleChange = (field: keyof PropertyFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        try {
            const response = await fetch(`${API_BASE}/crm/properties/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    price: formData.price ? parseFloat(formData.price) : undefined,
                    bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : undefined,
                    bathrooms: formData.bathrooms ? parseInt(formData.bathrooms) : undefined,
                    area_sqm: formData.area_sqm ? parseFloat(formData.area_sqm) : undefined,
                    land_size_sqm: formData.land_size_sqm ? parseFloat(formData.land_size_sqm) : undefined,
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to submit property')
            }

            const property = await response.json()
            router.push(`/dashboard/deals/properties/${property.id}`)
        } catch (err) {
            console.error('Submit error:', err)
            setError(err instanceof Error ? err.message : 'Failed to submit property')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/deals/properties">
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="font-mono text-xl text-white">Submit Property</h1>
                        <p className="font-mono text-[10px] text-zinc-500 mt-1">
                            ADD A NEW CLIENT PROPERTY TO THE CRM
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="border border-red-500/30 bg-red-500/10 p-4 rounded">
                    <p className="font-mono text-sm text-red-400">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Property Details */}
                <FormSection title="PROPERTY DETAILS">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-zinc-400">Property Name *</Label>
                            <Input
                                value={formData.property_name}
                                onChange={(e) => handleChange('property_name', e.target.value)}
                                placeholder="e.g., 4-Bedroom Executive House in East Legon"
                                required
                                className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Property Type *</Label>
                            <Select
                                value={formData.property_type}
                                onValueChange={(v) => handleChange('property_type', v)}
                            >
                                <SelectTrigger className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                    <SelectItem value="house" className="font-mono text-sm">
                                        <div className="flex items-center gap-2">
                                            <Home className="h-4 w-4" /> House
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="apartment" className="font-mono text-sm">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4" /> Apartment
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="land" className="font-mono text-sm">
                                        <div className="flex items-center gap-2">
                                            <LandPlot className="h-4 w-4" /> Land
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="commercial" className="font-mono text-sm">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4" /> Commercial
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Listing Type *</Label>
                            <Select
                                value={formData.listing_type}
                                onValueChange={(v) => handleChange('listing_type', v)}
                            >
                                <SelectTrigger className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                    <SelectItem value="sale" className="font-mono text-sm">For Sale</SelectItem>
                                    <SelectItem value="rent" className="font-mono text-sm">For Rent</SelectItem>
                                    <SelectItem value="lease" className="font-mono text-sm">For Lease</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-zinc-400">Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => handleChange('description', e.target.value)}
                                placeholder="Describe the property..."
                                rows={3}
                                className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                            />
                        </div>
                    </div>
                </FormSection>

                {/* Location */}
                <FormSection title="LOCATION">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-zinc-400">Address *</Label>
                            <Input
                                value={formData.address}
                                onChange={(e) => handleChange('address', e.target.value)}
                                placeholder="Street address"
                                required
                                className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">City *</Label>
                            <Input
                                value={formData.city}
                                onChange={(e) => handleChange('city', e.target.value)}
                                placeholder="e.g., Accra"
                                required
                                className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Region *</Label>
                            <Select
                                value={formData.region}
                                onValueChange={(v) => handleChange('region', v)}
                            >
                                <SelectTrigger className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 max-h-[200px]">
                                    {GHANA_REGIONS.map(region => (
                                        <SelectItem key={region} value={region} className="font-mono text-sm">
                                            {region}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Ghana Post GPS Address</Label>
                            <Input
                                value={formData.digital_address}
                                onChange={(e) => handleChange('digital_address', e.target.value)}
                                placeholder="e.g., GA-123-4567"
                                className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                            />
                        </div>
                    </div>
                </FormSection>

                {/* Pricing */}
                <FormSection title="PRICING">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-zinc-400">
                                {formData.listing_type === 'rent' ? 'Monthly Rent' : 'Asking Price'} *
                            </Label>
                            <Input
                                type="number"
                                value={formData.price}
                                onChange={(e) => handleChange('price', e.target.value)}
                                placeholder="0.00"
                                required
                                className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Currency</Label>
                            <Select
                                value={formData.currency}
                                onValueChange={(v) => handleChange('currency', v)}
                            >
                                <SelectTrigger className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                    <SelectItem value="GHS" className="font-mono text-sm">GHS (₵)</SelectItem>
                                    <SelectItem value="USD" className="font-mono text-sm">USD ($)</SelectItem>
                                    <SelectItem value="EUR" className="font-mono text-sm">EUR (€)</SelectItem>
                                    <SelectItem value="GBP" className="font-mono text-sm">GBP (£)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </FormSection>

                {/* Property Specs */}
                {formData.property_type !== 'land' && (
                    <FormSection title="PROPERTY SPECIFICATIONS">
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <Label className="font-mono text-[10px] text-zinc-400">Bedrooms</Label>
                                <Input
                                    type="number"
                                    value={formData.bedrooms}
                                    onChange={(e) => handleChange('bedrooms', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label className="font-mono text-[10px] text-zinc-400">Bathrooms</Label>
                                <Input
                                    type="number"
                                    value={formData.bathrooms}
                                    onChange={(e) => handleChange('bathrooms', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label className="font-mono text-[10px] text-zinc-400">Building Area (sqm)</Label>
                                <Input
                                    type="number"
                                    value={formData.area_sqm}
                                    onChange={(e) => handleChange('area_sqm', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label className="font-mono text-[10px] text-zinc-400">Land Size (sqm)</Label>
                                <Input
                                    type="number"
                                    value={formData.land_size_sqm}
                                    onChange={(e) => handleChange('land_size_sqm', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>
                        </div>
                    </FormSection>
                )}

                {formData.property_type === 'land' && (
                    <FormSection title="LAND SPECIFICATIONS">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="font-mono text-[10px] text-zinc-400">Land Size (sqm) *</Label>
                                <Input
                                    type="number"
                                    value={formData.land_size_sqm}
                                    onChange={(e) => handleChange('land_size_sqm', e.target.value)}
                                    placeholder="0"
                                    required
                                    min="0"
                                    className="mt-1 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>
                        </div>
                    </FormSection>
                )}

                {/* Owner Information */}
                <FormSection title="PROPERTY OWNER">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Owner Name</Label>
                            <div className="relative mt-1">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    value={formData.owner_name}
                                    onChange={(e) => handleChange('owner_name', e.target.value)}
                                    placeholder="Full name"
                                    className="pl-10 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Phone Number</Label>
                            <div className="relative mt-1">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    value={formData.owner_contact}
                                    onChange={(e) => handleChange('owner_contact', e.target.value)}
                                    placeholder="+233..."
                                    className="pl-10 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-zinc-400">Email</Label>
                            <div className="relative mt-1">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    type="email"
                                    value={formData.owner_email}
                                    onChange={(e) => handleChange('owner_email', e.target.value)}
                                    placeholder="owner@example.com"
                                    className="pl-10 bg-black border-zinc-800 text-white font-mono text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </FormSection>

                {/* Actions */}
                <div className="flex items-center justify-end gap-4 pt-4">
                    <Link href="/dashboard/deals/properties">
                        <Button type="button" variant="outline" className="border-zinc-700 text-zinc-300 font-mono text-xs">
                            CANCEL
                        </Button>
                    </Link>
                    <Button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                SUBMITTING...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                SUBMIT PROPERTY
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}
