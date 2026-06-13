'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    Save,
    Loader2,
    Building2,
    MapPin,
    AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Property } from '@/types/property-management'

export default function EditPropertyPage() {
    const params = useParams()
    const router = useRouter()
    const propertyId = params.id as string

    const [property, setProperty] = useState<Property | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        propertyType: '',
        transactionType: '',
        status: '',
        price: '',
        priceCurrency: 'GHS',
        addressStreet: '',
        addressCity: '',
        region: '',
        digitalAddress: '',
        bedrooms: '',
        bathrooms: '',
        totalAreaSqm: '',
        floors: '',
        unitNumber: ''
    })

    useEffect(() => {
        const loadProperty = async () => {
            try {
                setIsLoading(true)
                const prop = await propertyManagementApi.getPropertyById(propertyId)
                setProperty(prop)
                setFormData({
                    title: prop.title || '',
                    description: prop.description || '',
                    propertyType: prop.propertyType || '',
                    transactionType: prop.transactionType || '',
                    status: prop.status || '',
                    price: prop.price?.toString() || '',
                    priceCurrency: prop.priceCurrency || 'GHS',
                    addressStreet: prop.addressStreet || '',
                    addressCity: prop.addressCity || '',
                    region: prop.region || '',
                    digitalAddress: prop.digitalAddress || '',
                    bedrooms: prop.bedrooms?.toString() || '',
                    bathrooms: prop.bathrooms?.toString() || '',
                    totalAreaSqm: prop.totalAreaSqm?.toString() || '',
                    floors: prop.floors?.toString() || '',
                    unitNumber: prop.unitNumber || ''
                })
            } catch (err) {
                console.error('Failed to load property:', err)
                setError('Failed to load property details.')
            } finally {
                setIsLoading(false)
            }
        }
        if (propertyId) loadProperty()
    }, [propertyId])

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const optionalText = (value: string) => value.trim() === '' ? undefined : value.trim()
    const optionalNumber = (value: string) => value.trim() === '' ? undefined : Number(value)

    const formatErrorMessage = (err: unknown) => {
        if (err instanceof Error) return err.message
        return 'Failed to update property. Please try again.'
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setIsSaving(true)
            setError(null)
            
            await propertyManagementApi.updateProperty(propertyId, {
                title: formData.title.trim(),
                description: optionalText(formData.description) as any,
                propertyType: optionalText(formData.propertyType) as any,
                transactionType: optionalText(formData.transactionType) as any,
                status: optionalText(formData.status) as any,
                price: optionalNumber(formData.price) as any,
                priceCurrency: optionalText(formData.priceCurrency),
                addressStreet: optionalText(formData.addressStreet),
                addressCity: optionalText(formData.addressCity),
                region: optionalText(formData.region) as any,
                digitalAddress: optionalText(formData.digitalAddress),
                bedrooms: optionalNumber(formData.bedrooms) as any,
                bathrooms: optionalNumber(formData.bathrooms) as any,
                totalAreaSqm: optionalNumber(formData.totalAreaSqm) as any,
                floors: optionalNumber(formData.floors) as any,
                unitNumber: optionalText(formData.unitNumber)
            })

            setSuccessMessage('Property updated successfully!')
            setTimeout(() => {
                router.push(`/dashboard/property-management/properties/${propertyId}`)
            }, 1500)
        } catch (err) {
            console.error('Failed to update property:', err)
            setError(formatErrorMessage(err))
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
                <p className="text-muted-foreground font-mono text-xs uppercase animate-pulse">Loading Property Data...</p>
            </div>
        )
    }

    if (error && !property) {
        return (
            <div className="p-8 bg-red-950/20 border border-red-900 rounded-lg text-center">
                <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <p className="text-red-500 font-mono mb-4">{error}</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        CANCEL
                    </Button>
                    <div className="h-4 w-px bg-muted" />
                    <h1 className="text-lg font-mono text-amber-500 uppercase">Edit Property</h1>
                </div>
                <Button
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-xs uppercase"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="h-3 w-3 mr-2" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>

            {/* Success/Error Messages */}
            {successMessage && (
                <div className="p-4 bg-green-950/20 border border-green-900 rounded-lg">
                    <p className="text-green-500 font-mono text-sm">{successMessage}</p>
                </div>
            )}
            {error && property && (
                <div className="p-4 bg-red-950/20 border border-red-900 rounded-lg">
                    <p className="text-red-500 font-mono text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <Card className="bg-background border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono text-amber-500 uppercase flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Basic Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Property Title *</Label>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => handleInputChange('title', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    placeholder="Ex: Luxury Villa in East Legon"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Unit Number</Label>
                                <Input
                                    value={formData.unitNumber}
                                    onChange={(e) => handleInputChange('unitNumber', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    placeholder="Ex: Unit 4B"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                className="bg-background border-border text-foreground font-mono resize-none"
                                rows={4}
                                placeholder="Describe the property..."
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Property Type</Label>
                                <Select
                                    value={formData.propertyType}
                                    onValueChange={(v) => handleInputChange('propertyType', v)}
                                >
                                    <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border">
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
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Transaction Type</Label>
                                <Select
                                    value={formData.transactionType}
                                    onValueChange={(v) => handleInputChange('transactionType', v)}
                                >
                                    <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border">
                                        <SelectItem value="rental">Rental</SelectItem>
                                        <SelectItem value="sale">Sale</SelectItem>
                                        <SelectItem value="lease">Lease</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Status</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(v) => handleInputChange('status', v)}
                                >
                                    <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border">
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="pending_review">Pending Review</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="under_offer">Under Offer</SelectItem>
                                        <SelectItem value="sold">Sold</SelectItem>
                                        <SelectItem value="rented">Rented</SelectItem>
                                        <SelectItem value="expired">Expired</SelectItem>
                                        <SelectItem value="withdrawn">Withdrawn</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Pricing */}
                <Card className="bg-background border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono text-amber-500 uppercase">Pricing</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Price</Label>
                                <Input
                                    type="number"
                                    value={formData.price}
                                    onChange={(e) => handleInputChange('price', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Currency</Label>
                                <Select
                                    value={formData.priceCurrency}
                                    onValueChange={(v) => handleInputChange('priceCurrency', v)}
                                >
                                    <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border">
                                        <SelectItem value="GHS">GHS</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                        <SelectItem value="GBP">GBP</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Location */}
                <Card className="bg-background border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono text-amber-500 uppercase flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Location
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Street Address</Label>
                                <Input
                                    value={formData.addressStreet}
                                    onChange={(e) => handleInputChange('addressStreet', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    placeholder="Ex: 123 Independence Ave"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">City</Label>
                                <Input
                                    value={formData.addressCity}
                                    onChange={(e) => handleInputChange('addressCity', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    placeholder="Ex: Accra"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Region</Label>
                                <Select
                                    value={formData.region}
                                    onValueChange={(v) => handleInputChange('region', v)}
                                >
                                    <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                        <SelectValue placeholder="Select region" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border">
                                        <SelectItem value="greater_accra">Greater Accra</SelectItem>
                                        <SelectItem value="ashanti">Ashanti</SelectItem>
                                        <SelectItem value="western">Western</SelectItem>
                                        <SelectItem value="eastern">Eastern</SelectItem>
                                        <SelectItem value="central">Central</SelectItem>
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
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Digital Address</Label>
                                <Input
                                    value={formData.digitalAddress}
                                    onChange={(e) => handleInputChange('digitalAddress', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    placeholder="Ex: GA-057-1363"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Property Details */}
                <Card className="bg-background border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-mono text-amber-500 uppercase">Property Specifications</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Bedrooms</Label>
                                <Input
                                    type="number"
                                    value={formData.bedrooms}
                                    onChange={(e) => handleInputChange('bedrooms', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    min="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Bathrooms</Label>
                                <Input
                                    type="number"
                                    value={formData.bathrooms}
                                    onChange={(e) => handleInputChange('bathrooms', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    min="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Total Area (m²)</Label>
                                <Input
                                    type="number"
                                    value={formData.totalAreaSqm}
                                    onChange={(e) => handleInputChange('totalAreaSqm', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    min="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-mono uppercase text-muted-foreground">Floors</Label>
                                <Input
                                    type="number"
                                    value={formData.floors}
                                    onChange={(e) => handleInputChange('floors', e.target.value)}
                                    className="bg-background border-border text-foreground font-mono"
                                    min="1"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Submit Button (Mobile) */}
                <div className="md:hidden">
                    <Button
                        type="submit"
                        disabled={isSaving}
                        className="w-full bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono uppercase"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                Save Changes
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}
