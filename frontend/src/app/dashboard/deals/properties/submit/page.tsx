'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { 
    Loader2, ArrowLeft, Save, Home, Building2, LandPlot, 
    MapPin, DollarSign, User, Phone, Mail, Camera
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
import { PropertyImageUploader, PropertyImage } from '@/components/crm/PropertyImageUploader'
import { authedFetch } from '@/lib/authed-fetch'

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
        <div className="border border-border bg-card">
            <div className="px-4 py-2 bg-muted/50 border-b border-border">
                <span className="font-mono text-[10px] text-primary tracking-wider">{title}</span>
            </div>
            <div className="p-4 space-y-4">
                {children}
            </div>
        </div>
    )
}

export default function SubmitPropertyPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const editId = searchParams.get('editId')
    const isEditMode = !!editId

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([])

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

    // Load existing property data when editing
    useEffect(() => {
        if (!editId) return
        setIsLoading(true)
        authedFetch(`${API_BASE}/crm/properties/${editId}`)
            .then(res => res.json())
            .then(data => {
                const p = data.property || data
                setFormData({
                    property_name: p.property_name || '',
                    property_type: p.property_type || 'house',
                    listing_type: p.listing_type || 'sale',
                    address: p.address || '',
                    city: p.city || '',
                    region: p.region || 'Greater Accra',
                    digital_address: p.digital_address || '',
                    price: p.price?.toString() || '',
                    currency: p.currency || 'GHS',
                    bedrooms: p.bedrooms?.toString() || '',
                    bathrooms: p.bathrooms?.toString() || '',
                    area_sqm: p.area_sqm?.toString() || '',
                    land_size_sqm: p.land_size_sqm?.toString() || '',
                    description: p.description || '',
                    owner_name: p.owner_name || '',
                    owner_contact: p.owner_contact || '',
                    owner_email: p.owner_email || '',
                })
            })
            .catch(err => setError('Failed to load property: ' + err.message))
            .finally(() => setIsLoading(false))
    }, [editId])

    const handleChange = (field: keyof PropertyFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        try {
            const url = isEditMode
                ? `${API_BASE}/crm/properties/${editId}`
                : `${API_BASE}/crm/properties/submit`
            const response = await authedFetch(url, {
                method: isEditMode ? 'PUT' : 'POST',
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
            const propertyId = isEditMode ? editId : (property.id || property.property?.id)

            // Upload images if any were added
            if (pendingImageFiles.length > 0 && propertyId) {
                try {
                    const formData = new FormData()
                    pendingImageFiles.forEach(file => formData.append('images', file))

                    await authedFetch(`${API_BASE}/crm/properties/${propertyId}/images`, {
                        method: 'POST',
                        body: formData,
                    })
                } catch (imgErr) {
                }
            }

            router.push(`/dashboard/deals/properties/${propertyId}`)
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
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="font-mono text-xl text-foreground">{isEditMode ? 'Edit Property' : 'Submit Property'}</h1>
                        <p className="font-mono text-[10px] text-muted-foreground mt-1">
                            {isEditMode ? 'UPDATE PROPERTY DETAILS' : 'ADD A NEW CLIENT PROPERTY TO THE CRM'}
                        </p>
                    </div>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2 font-mono text-sm text-muted-foreground">Loading property...</span>
                </div>
            )}

            {error && (
                <div className="border border-red-500/30 bg-red-500/10 p-4 rounded">
                    <p className="font-mono text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Property Details */}
                <FormSection title="PROPERTY DETAILS">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-muted-foreground">Property Name *</Label>
                            <Input
                                value={formData.property_name}
                                onChange={(e) => handleChange('property_name', e.target.value)}
                                placeholder="e.g., 4-Bedroom Executive House in East Legon"
                                required
                                className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">Property Type *</Label>
                            <Select
                                value={formData.property_type}
                                onValueChange={(v) => handleChange('property_type', v)}
                            >
                                <SelectTrigger className="mt-1 bg-card border-border text-foreground font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
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
                            <Label className="font-mono text-[10px] text-muted-foreground">Listing Type *</Label>
                            <Select
                                value={formData.listing_type}
                                onValueChange={(v) => handleChange('listing_type', v)}
                            >
                                <SelectTrigger className="mt-1 bg-card border-border text-foreground font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="sale" className="font-mono text-sm">For Sale</SelectItem>
                                    <SelectItem value="rent" className="font-mono text-sm">For Rent</SelectItem>
                                    <SelectItem value="lease" className="font-mono text-sm">For Lease</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-muted-foreground">Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => handleChange('description', e.target.value)}
                                placeholder="Describe the property..."
                                rows={3}
                                className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                            />
                        </div>
                    </div>
                </FormSection>

                {/* Property Images */}
                <FormSection title="PROPERTY IMAGES">
                    <p className="text-xs text-muted-foreground mb-3">
                        Add photos of the property. Images will be uploaded after submission.
                    </p>
                    <div
                        className={cn(
                            'relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
                            'border-border hover:border-primary/50'
                        )}
                        onClick={() => document.getElementById('property-images-input')?.click()}
                    >
                        <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            id="property-images-input"
                            onChange={(e) => {
                                if (e.target.files) {
                                    setPendingImageFiles(prev => [...prev, ...Array.from(e.target.files!)])
                                    e.target.value = ''
                                }
                            }}
                        />
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <Camera className="h-6 w-6 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-foreground">
                                Drop images here or click to browse
                            </p>
                            <p className="text-xs text-muted-foreground">
                                JPEG, PNG, WebP up to 10MB each • {pendingImageFiles.length}/20 images
                            </p>
                        </div>
                    </div>
                    {pendingImageFiles.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mt-3">
                            {pendingImageFiles.map((file, i) => (
                                <div key={i} className="relative aspect-square rounded overflow-hidden border border-border bg-muted group">
                                    <img
                                        src={URL.createObjectURL(file)}
                                        alt={file.name}
                                        className="w-full h-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setPendingImageFiles(prev => prev.filter((_, idx) => idx !== i))}
                                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                    >
                                        ×
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 bg-background/50 p-1">
                                        <p className="text-[9px] text-foreground truncate">{file.name}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </FormSection>

                {/* Location */}
                <FormSection title="LOCATION">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-muted-foreground">Address *</Label>
                            <Input
                                value={formData.address}
                                onChange={(e) => handleChange('address', e.target.value)}
                                placeholder="Street address"
                                required
                                className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">City *</Label>
                            <Input
                                value={formData.city}
                                onChange={(e) => handleChange('city', e.target.value)}
                                placeholder="e.g., Accra"
                                required
                                className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">Region *</Label>
                            <Select
                                value={formData.region}
                                onValueChange={(v) => handleChange('region', v)}
                            >
                                <SelectTrigger className="mt-1 bg-card border-border text-foreground font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border max-h-[200px]">
                                    {GHANA_REGIONS.map(region => (
                                        <SelectItem key={region} value={region} className="font-mono text-sm">
                                            {region}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">Ghana Post GPS Address</Label>
                            <Input
                                value={formData.digital_address}
                                onChange={(e) => handleChange('digital_address', e.target.value)}
                                placeholder="e.g., GA-123-4567"
                                className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                            />
                        </div>
                    </div>
                </FormSection>

                {/* Pricing */}
                <FormSection title="PRICING">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                            <Label className="font-mono text-[10px] text-muted-foreground">
                                {formData.listing_type === 'rent' ? 'Monthly Rent' : 'Asking Price'} *
                            </Label>
                            <Input
                                type="number"
                                value={formData.price}
                                onChange={(e) => handleChange('price', e.target.value)}
                                placeholder="0.00"
                                required
                                className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                            />
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">Currency</Label>
                            <Select
                                value={formData.currency}
                                onValueChange={(v) => handleChange('currency', v)}
                            >
                                <SelectTrigger className="mt-1 bg-card border-border text-foreground font-mono text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
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
                                <Label className="font-mono text-[10px] text-muted-foreground">Bedrooms</Label>
                                <Input
                                    type="number"
                                    value={formData.bedrooms}
                                    onChange={(e) => handleChange('bedrooms', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label className="font-mono text-[10px] text-muted-foreground">Bathrooms</Label>
                                <Input
                                    type="number"
                                    value={formData.bathrooms}
                                    onChange={(e) => handleChange('bathrooms', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label className="font-mono text-[10px] text-muted-foreground">Building Area (sqm)</Label>
                                <Input
                                    type="number"
                                    value={formData.area_sqm}
                                    onChange={(e) => handleChange('area_sqm', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>

                            <div>
                                <Label className="font-mono text-[10px] text-muted-foreground">Land Size (sqm)</Label>
                                <Input
                                    type="number"
                                    value={formData.land_size_sqm}
                                    onChange={(e) => handleChange('land_size_sqm', e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>
                        </div>
                    </FormSection>
                )}

                {formData.property_type === 'land' && (
                    <FormSection title="LAND SPECIFICATIONS">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="font-mono text-[10px] text-muted-foreground">Land Size (sqm) *</Label>
                                <Input
                                    type="number"
                                    value={formData.land_size_sqm}
                                    onChange={(e) => handleChange('land_size_sqm', e.target.value)}
                                    placeholder="0"
                                    required
                                    min="0"
                                    className="mt-1 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>
                        </div>
                    </FormSection>
                )}

                {/* Owner Information */}
                <FormSection title="PROPERTY OWNER">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">Owner Name</Label>
                            <div className="relative mt-1">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={formData.owner_name}
                                    onChange={(e) => handleChange('owner_name', e.target.value)}
                                    placeholder="Full name"
                                    className="pl-10 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">Phone Number</Label>
                            <div className="relative mt-1">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={formData.owner_contact}
                                    onChange={(e) => handleChange('owner_contact', e.target.value)}
                                    placeholder="+233..."
                                    className="pl-10 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="font-mono text-[10px] text-muted-foreground">Email</Label>
                            <div className="relative mt-1">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="email"
                                    value={formData.owner_email}
                                    onChange={(e) => handleChange('owner_email', e.target.value)}
                                    placeholder="owner@example.com"
                                    className="pl-10 bg-card border-border text-foreground font-mono text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </FormSection>

                {/* Actions */}
                <div className="flex items-center justify-end gap-4 pt-4">
                    <Link href="/dashboard/deals/properties">
                        <Button type="button" variant="outline" className="border-border text-foreground font-mono text-xs">
                            CANCEL
                        </Button>
                    </Link>
                    <Button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {isEditMode ? 'SAVING...' : 'SUBMITTING...'}
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                {isEditMode ? 'SAVE CHANGES' : 'SUBMIT PROPERTY'}
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}
