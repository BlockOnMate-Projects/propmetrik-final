'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    ArrowRight,
    Save,
    Plus,
    Trash2,
    User,
    Building2,
    FileText,
    CreditCard,
    Home,
    CheckCircle,
    Loader2,
    Calendar,
    Phone,
    Mail,
    MapPin,
    Briefcase,
    Shield,
    AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { propertyManagementApi } from '@/lib/property-management-api'
import { Property } from '@/types/property-management'
import { format, addMonths, addYears } from 'date-fns'

// Steps for the wizard
const STEPS = [
    { id: 1, title: 'Tenant Info', icon: User, description: 'Personal details' },
    { id: 2, title: 'Property', icon: Building2, description: 'Select property' },
    { id: 3, title: 'Lease Terms', icon: FileText, description: 'Duration & rent' },
    { id: 4, title: 'Payment', icon: CreditCard, description: 'Payment details' },
    { id: 5, title: 'Review', icon: CheckCircle, description: 'Confirm & generate' },
]

// Amenities options
const AMENITIES = [
    'Kitchen appliances',
    'Air conditioning',
    'Water heater',
    'Generator',
    'Furniture',
    'Parking space',
    'Security',
    'Swimming pool',
    'Gym'
]

const UTILITIES = [
    'Electricity',
    'Water',
    'Gas',
    'Internet/Cable',
    'Waste Collection'
]

export default function NewTenantPage() {
    const router = useRouter()
    const [currentStep, setCurrentStep] = useState(1)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [properties, setProperties] = useState<Property[]>([])
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

    // Form state - Tenant Info
    const [tenantForm, setTenantForm] = useState({
        fullName: '',
        email: '',
        phonePrimary: '',
        phoneSecondary: '',
        dateOfBirth: '',
        ghanaCardNumber: '',
        currentAddress: '',
        digitalAddress: '',
        occupation: '',
        employer: '',
        employerPhone: '',
        monthlyIncome: '',
        creditScore: '',
        emergencyContactName: '',
        emergencyContactRelationship: '',
        emergencyContactPhone: ''
    })

    // Form state - Lease Terms
    const [leaseForm, setLeaseForm] = useState({
        propertyId: '',
        leaseStartDate: format(new Date(), 'yyyy-MM-dd'),
        leaseDuration: '12', // months
        leaseEndDate: format(addYears(new Date(), 1), 'yyyy-MM-dd'),
        monthlyRent: '',
        rentCurrency: 'GHS',
        advanceMonths: '2',
        securityDepositMonths: '1',
        maxOccupants: '4',
        petsAllowed: false,
        petDetails: '',
        useType: 'residential' as const,
        includedAmenities: [] as string[],
        tenantUtilities: ['Electricity', 'Water', 'Internet/Cable', 'Waste Collection'] as string[],
        landlordUtilities: [] as string[],
        specialConditions: ''
    })

    // Form state - Payment
    const [paymentForm, setPaymentForm] = useState({
        paymentDueDay: '1',
        paymentMethod: 'mobile_money' as const,
        paymentDetails: '',
        latePaymentPenaltyPercent: '5',
        latePaymentGraceDays: '7',
        noticePeriodMonths: '1',
        earlyTerminationNoticePeriod: '1',
        disputeResolutionCity: 'Accra'
    })

    // Load properties
    useEffect(() => {
        const loadProperties = async () => {
            try {
                setIsLoading(true)
                const res = await propertyManagementApi.getProperties({ limit: 100 })
                const data = Array.isArray(res) ? res : res.data || []
                // Filter to available properties
                setProperties(data.filter((p: Property) => p.status === 'available' || p.status === 'active'))
            } catch (err) {
                console.error('Failed to load properties:', err)
            } finally {
                setIsLoading(false)
            }
        }
        loadProperties()
    }, [])

    // Update end date when start date or duration changes
    useEffect(() => {
        if (leaseForm.leaseStartDate && leaseForm.leaseDuration) {
            const startDate = new Date(leaseForm.leaseStartDate)
            const months = parseInt(leaseForm.leaseDuration) || 12
            const endDate = addMonths(startDate, months)
            setLeaseForm(prev => ({
                ...prev,
                leaseEndDate: format(endDate, 'yyyy-MM-dd')
            }))
        }
    }, [leaseForm.leaseStartDate, leaseForm.leaseDuration])

    // Select property
    const handleSelectProperty = (propertyId: string) => {
        const property = properties.find(p => p.id === propertyId)
        setSelectedProperty(property || null)
        setLeaseForm(prev => ({
            ...prev,
            propertyId,
            monthlyRent: property?.price?.toString() || prev.monthlyRent
        }))
    }

    // Toggle amenity
    const toggleAmenity = (amenity: string) => {
        setLeaseForm(prev => ({
            ...prev,
            includedAmenities: prev.includedAmenities.includes(amenity)
                ? prev.includedAmenities.filter(a => a !== amenity)
                : [...prev.includedAmenities, amenity]
        }))
    }

    // Toggle tenant utility
    const toggleTenantUtility = (utility: string) => {
        setLeaseForm(prev => {
            const isTenant = prev.tenantUtilities.includes(utility)
            return {
                ...prev,
                tenantUtilities: isTenant
                    ? prev.tenantUtilities.filter(u => u !== utility)
                    : [...prev.tenantUtilities, utility],
                landlordUtilities: isTenant
                    ? [...prev.landlordUtilities, utility]
                    : prev.landlordUtilities.filter(u => u !== utility)
            }
        })
    }

    // Calculate totals
    const monthlyRent = parseFloat(leaseForm.monthlyRent) || 0
    const advanceAmount = monthlyRent * (parseInt(leaseForm.advanceMonths) || 0)
    const securityDeposit = monthlyRent * (parseInt(leaseForm.securityDepositMonths) || 0)
    const totalDueAtSigning = advanceAmount + securityDeposit

    // Validation
    const isStep1Valid = tenantForm.fullName && tenantForm.phonePrimary && tenantForm.ghanaCardNumber
    const isStep2Valid = !!leaseForm.propertyId
    const isStep3Valid = leaseForm.monthlyRent && leaseForm.leaseStartDate && leaseForm.leaseEndDate
    const isStep4Valid = paymentForm.paymentMethod

    const canProceed = () => {
        switch (currentStep) {
            case 1: return isStep1Valid
            case 2: return isStep2Valid
            case 3: return isStep3Valid
            case 4: return isStep4Valid
            default: return true
        }
    }

    // Save tenant and tenancy
    const handleSave = async () => {
        try {
            setIsSaving(true)

            // Create tenant - match backend CreateTenantDto
            const tenantData = {
                fullName: tenantForm.fullName,
                email: tenantForm.email || undefined,
                phonePrimary: tenantForm.phonePrimary,
                phoneSecondary: tenantForm.phoneSecondary || undefined,
                dateOfBirth: tenantForm.dateOfBirth || undefined,
                ghanaCardNumber: tenantForm.ghanaCardNumber || undefined,
                currentAddress: tenantForm.currentAddress || undefined,
                digitalAddress: tenantForm.digitalAddress || undefined,
                occupation: tenantForm.occupation || undefined,
                employerName: tenantForm.employer || undefined,  // Backend expects employerName
                employerPhone: tenantForm.employerPhone || undefined,
                monthlyIncome: tenantForm.monthlyIncome ? parseFloat(tenantForm.monthlyIncome) : undefined,
                emergencyContactName: tenantForm.emergencyContactName || undefined,
                emergencyContactRelationship: tenantForm.emergencyContactRelationship || undefined,
                emergencyContactPhone: tenantForm.emergencyContactPhone || undefined
            }

            const tenant = await propertyManagementApi.createTenant(tenantData)

            // Create tenancy
            const tenancyData = {
                propertyId: leaseForm.propertyId,
                tenantId: tenant.id,
                leaseStartDate: leaseForm.leaseStartDate,
                leaseEndDate: leaseForm.leaseEndDate,
                monthlyRent: parseFloat(leaseForm.monthlyRent),
                rentCurrency: leaseForm.rentCurrency,
                paymentFreq: 'monthly',
                advanceMonths: parseInt(leaseForm.advanceMonths),
                securityDeposit: securityDeposit,
                status: 'active'
            }

            await propertyManagementApi.createTenancy(tenancyData)

            // Navigate to tenant detail with success message
            router.push(`/dashboard/property-management/tenants/${tenant.id}?created=true`)
        } catch (err) {
            console.error('Failed to save:', err)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/property-management/tenants">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white font-mono uppercase">Register New Tenant</h1>
                        <p className="text-sm text-zinc-500 font-mono">Complete all steps to generate a lease agreement</p>
                    </div>
                </div>
            </div>

            {/* Step Progress */}
            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                {STEPS.map((step, index) => {
                    const StepIcon = step.icon
                    const isActive = currentStep === step.id
                    const isCompleted = currentStep > step.id

                    return (
                        <React.Fragment key={step.id}>
                            <button
                                onClick={() => currentStep > step.id && setCurrentStep(step.id)}
                                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                                    isActive
                                        ? 'bg-amber-600 text-black'
                                        : isCompleted
                                            ? 'bg-green-900/30 text-green-500 cursor-pointer hover:bg-green-900/50'
                                            : 'text-zinc-600'
                                }`}
                                disabled={currentStep < step.id}
                            >
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                    isActive ? 'bg-black/20' : isCompleted ? 'bg-green-500/20' : 'bg-zinc-800'
                                }`}>
                                    {isCompleted ? (
                                        <CheckCircle className="h-4 w-4" />
                                    ) : (
                                        <StepIcon className="h-4 w-4" />
                                    )}
                                </div>
                                <div className="hidden sm:block text-left">
                                    <div className={`text-xs font-mono font-bold ${isActive ? 'text-black' : ''}`}>
                                        {step.title}
                                    </div>
                                    <div className={`text-[10px] font-mono ${isActive ? 'text-black/70' : 'text-zinc-600'}`}>
                                        {step.description}
                                    </div>
                                </div>
                            </button>
                            {index < STEPS.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-2 ${
                                    isCompleted ? 'bg-green-500' : 'bg-zinc-800'
                                }`} />
                            )}
                        </React.Fragment>
                    )
                })}
            </div>

            {/* Step Content */}
            <div className="min-h-[500px]">
                {/* Step 1: Tenant Information */}
                {currentStep === 1 && (
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Personal Information</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500">Basic tenant details and identification</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Full Name *</Label>
                                        <Input
                                            placeholder="e.g. Kwame Mensah"
                                            value={tenantForm.fullName}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, fullName: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Ghana Card Number *</Label>
                                        <Input
                                            placeholder="GHA-000000000-0"
                                            value={tenantForm.ghanaCardNumber}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, ghanaCardNumber: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Phone (Primary) *</Label>
                                        <Input
                                            placeholder="e.g. 024 123 4567"
                                            value={tenantForm.phonePrimary}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, phonePrimary: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Email</Label>
                                        <Input
                                            type="email"
                                            placeholder="e.g. kwame@example.com"
                                            value={tenantForm.email}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, email: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Date of Birth</Label>
                                        <Input
                                            type="date"
                                            value={tenantForm.dateOfBirth}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Digital Address</Label>
                                        <Input
                                            placeholder="GA-123-4567"
                                            value={tenantForm.digitalAddress}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, digitalAddress: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Current Address</Label>
                                    <Textarea
                                        placeholder="Enter current residential address"
                                        value={tenantForm.currentAddress}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, currentAddress: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500 h-20"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Employment</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500">For income verification</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Occupation</Label>
                                    <Input
                                        placeholder="e.g. Software Engineer"
                                        value={tenantForm.occupation}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, occupation: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Employer</Label>
                                    <Input
                                        placeholder="e.g. Tech Solutions Ltd"
                                        value={tenantForm.employer}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, employer: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Monthly Income (GHS)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={tenantForm.monthlyIncome}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, monthlyIncome: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Emergency Contact</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500">In case of emergency</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Contact Name</Label>
                                    <Input
                                        placeholder="Full Name"
                                        value={tenantForm.emergencyContactName}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, emergencyContactName: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Relationship</Label>
                                    <Select
                                        value={tenantForm.emergencyContactRelationship}
                                        onValueChange={(v) => setTenantForm(prev => ({ ...prev, emergencyContactRelationship: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue placeholder="Select relationship" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="spouse">Spouse</SelectItem>
                                            <SelectItem value="parent">Parent</SelectItem>
                                            <SelectItem value="sibling">Sibling</SelectItem>
                                            <SelectItem value="friend">Friend</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Phone Number</Label>
                                    <Input
                                        placeholder="e.g. 020 987 6543"
                                        value={tenantForm.emergencyContactPhone}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, emergencyContactPhone: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Step 2: Property Selection */}
                {currentStep === 2 && (
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-amber-500">Select Property</CardTitle>
                            <CardDescription className="text-xs font-mono text-zinc-500">Choose a property for this tenancy</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                                    <p className="text-zinc-500 font-mono text-xs mt-4">Loading properties...</p>
                                </div>
                            ) : properties.length === 0 ? (
                                <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
                                    <Building2 className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
                                    <p className="text-zinc-500 font-mono text-sm">No available properties</p>
                                    <Link href="/dashboard/property-management/properties/new">
                                        <Button className="mt-4 bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs">
                                            Add Property First
                                        </Button>
                                    </Link>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {properties.map((property) => (
                                        <button
                                            key={property.id}
                                            onClick={() => handleSelectProperty(property.id)}
                                            className={`p-4 rounded-lg border text-left transition-all ${
                                                leaseForm.propertyId === property.id
                                                    ? 'border-amber-500 bg-amber-950/30'
                                                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="h-10 w-10 rounded bg-zinc-800 flex items-center justify-center">
                                                    <Home className="h-5 w-5 text-amber-500" />
                                                </div>
                                                {leaseForm.propertyId === property.id && (
                                                    <CheckCircle className="h-5 w-5 text-amber-500" />
                                                )}
                                            </div>
                                            <h3 className="font-mono font-bold text-white text-sm mb-1">{property.title}</h3>
                                            <p className="text-[10px] font-mono text-zinc-500 mb-2">
                                                {property.addressStreet}, {property.addressCity}
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge className="bg-zinc-800 text-zinc-400 text-[9px] font-mono">
                                                    {property.propertyType}
                                                </Badge>
                                                {property.bedrooms && (
                                                    <Badge className="bg-zinc-800 text-zinc-400 text-[9px] font-mono">
                                                        {property.bedrooms} BR
                                                    </Badge>
                                                )}
                                                <Badge className="bg-amber-900/30 text-amber-500 text-[9px] font-mono">
                                                    {property.priceCurrency} {property.price?.toLocaleString()}/mo
                                                </Badge>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Step 3: Lease Terms */}
                {currentStep === 3 && (
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Lease Duration</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Start Date *</Label>
                                    <Input
                                        type="date"
                                        value={leaseForm.leaseStartDate}
                                        onChange={(e) => setLeaseForm(prev => ({ ...prev, leaseStartDate: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Duration</Label>
                                    <Select
                                        value={leaseForm.leaseDuration}
                                        onValueChange={(v) => setLeaseForm(prev => ({ ...prev, leaseDuration: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="6">6 Months</SelectItem>
                                            <SelectItem value="12">1 Year</SelectItem>
                                            <SelectItem value="24">2 Years</SelectItem>
                                            <SelectItem value="36">3 Years</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">End Date</Label>
                                    <Input
                                        type="date"
                                        value={leaseForm.leaseEndDate}
                                        onChange={(e) => setLeaseForm(prev => ({ ...prev, leaseEndDate: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Rent & Deposit</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Monthly Rent *</Label>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            value={leaseForm.monthlyRent}
                                            onChange={(e) => setLeaseForm(prev => ({ ...prev, monthlyRent: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Currency</Label>
                                        <Select
                                            value={leaseForm.rentCurrency}
                                            onValueChange={(v) => setLeaseForm(prev => ({ ...prev, rentCurrency: v }))}
                                        >
                                            <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-950 border-zinc-800">
                                                <SelectItem value="GHS">GHS (₵)</SelectItem>
                                                <SelectItem value="USD">USD ($)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Advance Rent (Months)</Label>
                                    <Select
                                        value={leaseForm.advanceMonths}
                                        onValueChange={(v) => setLeaseForm(prev => ({ ...prev, advanceMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                            <SelectItem value="6">6 Months (Max per law)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Security Deposit (Months)</Label>
                                    <Select
                                        value={leaseForm.securityDepositMonths}
                                        onValueChange={(v) => setLeaseForm(prev => ({ ...prev, securityDepositMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800 mt-4">
                                    <div className="text-[10px] font-mono uppercase text-zinc-500 mb-2">Total Due at Signing</div>
                                    <div className="text-2xl font-bold text-amber-500 font-mono">
                                        {leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{totalDueAtSigning.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-zinc-600 font-mono mt-1">
                                        Advance: {leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{advanceAmount.toLocaleString()} + 
                                        Deposit: {leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{securityDeposit.toLocaleString()}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Property Use</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Use Type</Label>
                                    <Select
                                        value={leaseForm.useType}
                                        onValueChange={(v: 'residential' | 'commercial') => setLeaseForm(prev => ({ ...prev, useType: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="residential">Residential</SelectItem>
                                            <SelectItem value="commercial">Commercial</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Max Occupants</Label>
                                    <Input
                                        type="number"
                                        value={leaseForm.maxOccupants}
                                        onChange={(e) => setLeaseForm(prev => ({ ...prev, maxOccupants: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="petsAllowed"
                                        checked={leaseForm.petsAllowed}
                                        onCheckedChange={(checked) => setLeaseForm(prev => ({ ...prev, petsAllowed: !!checked }))}
                                    />
                                    <Label htmlFor="petsAllowed" className="text-xs font-mono text-zinc-400">Pets Allowed</Label>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Utilities</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500">Toggle to assign to Landlord</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {UTILITIES.map((utility) => {
                                    const isTenantPaying = leaseForm.tenantUtilities.includes(utility)
                                    return (
                                        <div key={utility} className="flex items-center justify-between p-2 bg-zinc-950 rounded border border-zinc-800">
                                            <span className="text-xs font-mono text-zinc-300">{utility}</span>
                                            <button
                                                onClick={() => toggleTenantUtility(utility)}
                                                className={`px-3 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                                                    isTenantPaying
                                                        ? 'bg-amber-600 text-black'
                                                        : 'bg-zinc-700 text-zinc-300'
                                                }`}
                                            >
                                                {isTenantPaying ? 'TENANT' : 'LANDLORD'}
                                            </button>
                                        </div>
                                    )
                                })}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Step 4: Payment Details */}
                {currentStep === 4 && (
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Payment Method</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Primary Method</Label>
                                    <Select
                                        value={paymentForm.paymentMethod}
                                        onValueChange={(v: 'bank_transfer' | 'mobile_money' | 'cash' | 'other') => setPaymentForm(prev => ({ ...prev, paymentMethod: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                            <SelectItem value="cash">Cash (with receipt)</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Payment Details</Label>
                                    <Textarea
                                        placeholder={
                                            paymentForm.paymentMethod === 'bank_transfer'
                                                ? 'Bank Name, Account Number, Branch'
                                                : paymentForm.paymentMethod === 'mobile_money'
                                                    ? 'Mobile Money Number (e.g. 024 123 4567)'
                                                    : 'Enter payment details...'
                                        }
                                        value={paymentForm.paymentDetails}
                                        onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDetails: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Payment Due Day</Label>
                                    <Select
                                        value={paymentForm.paymentDueDay}
                                        onValueChange={(v) => setPaymentForm(prev => ({ ...prev, paymentDueDay: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="1">1st of month</SelectItem>
                                            <SelectItem value="5">5th of month</SelectItem>
                                            <SelectItem value="15">15th of month</SelectItem>
                                            <SelectItem value="28">28th of month</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Late Payment & Termination</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Late Fee (%)</Label>
                                        <Input
                                            type="number"
                                            value={paymentForm.latePaymentPenaltyPercent}
                                            onChange={(e) => setPaymentForm(prev => ({ ...prev, latePaymentPenaltyPercent: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Grace Days</Label>
                                        <Input
                                            type="number"
                                            value={paymentForm.latePaymentGraceDays}
                                            onChange={(e) => setPaymentForm(prev => ({ ...prev, latePaymentGraceDays: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Notice Period (Months)</Label>
                                    <Select
                                        value={paymentForm.noticePeriodMonths}
                                        onValueChange={(v) => setPaymentForm(prev => ({ ...prev, noticePeriodMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-950 border-zinc-800">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Dispute Resolution City</Label>
                                    <Input
                                        value={paymentForm.disputeResolutionCity}
                                        onChange={(e) => setPaymentForm(prev => ({ ...prev, disputeResolutionCity: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Special Conditions</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500">Additional terms agreed by both parties</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Textarea
                                    placeholder="Enter any additional terms or conditions..."
                                    value={leaseForm.specialConditions}
                                    onChange={(e) => setLeaseForm(prev => ({ ...prev, specialConditions: e.target.value }))}
                                    className="bg-black border-zinc-800 text-white font-mono focus:border-amber-500 min-h-[100px]"
                                />
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Step 5: Review */}
                {currentStep === 5 && (
                    <div className="space-y-6">
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-amber-500">Review & Confirm</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500">Please review all details before generating the lease</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-6 md:grid-cols-2">
                                    {/* Tenant Summary */}
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <User className="h-4 w-4 text-amber-500" />
                                            <span className="text-xs font-mono uppercase text-amber-500">Tenant</span>
                                        </div>
                                        <div className="text-lg font-bold text-white font-mono mb-2">{tenantForm.fullName}</div>
                                        <div className="space-y-1 text-xs font-mono text-zinc-400">
                                            <p><Phone className="inline h-3 w-3 mr-1" /> {tenantForm.phonePrimary}</p>
                                            {tenantForm.email && <p><Mail className="inline h-3 w-3 mr-1" /> {tenantForm.email}</p>}
                                            <p><Shield className="inline h-3 w-3 mr-1" /> {tenantForm.ghanaCardNumber}</p>
                                        </div>
                                    </div>

                                    {/* Property Summary */}
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Building2 className="h-4 w-4 text-amber-500" />
                                            <span className="text-xs font-mono uppercase text-amber-500">Property</span>
                                        </div>
                                        <div className="text-lg font-bold text-white font-mono mb-2">{selectedProperty?.title}</div>
                                        <div className="space-y-1 text-xs font-mono text-zinc-400">
                                            <p><MapPin className="inline h-3 w-3 mr-1" /> {selectedProperty?.addressStreet}, {selectedProperty?.addressCity}</p>
                                            <p>{selectedProperty?.propertyType} • {selectedProperty?.bedrooms} BR</p>
                                        </div>
                                    </div>

                                    {/* Lease Terms Summary */}
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <FileText className="h-4 w-4 text-amber-500" />
                                            <span className="text-xs font-mono uppercase text-amber-500">Lease Terms</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                            <div>
                                                <span className="text-zinc-500">Start:</span>
                                                <p className="text-white">{format(new Date(leaseForm.leaseStartDate), 'dd MMM yyyy')}</p>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">End:</span>
                                                <p className="text-white">{format(new Date(leaseForm.leaseEndDate), 'dd MMM yyyy')}</p>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">Duration:</span>
                                                <p className="text-white">{leaseForm.leaseDuration} Months</p>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">Use:</span>
                                                <p className="text-white capitalize">{leaseForm.useType}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Financial Summary */}
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <CreditCard className="h-4 w-4 text-amber-500" />
                                            <span className="text-xs font-mono uppercase text-amber-500">Financials</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                            <div>
                                                <span className="text-zinc-500">Monthly Rent:</span>
                                                <p className="text-white">{leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{monthlyRent.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">Advance:</span>
                                                <p className="text-white">{leaseForm.advanceMonths} mo ({leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{advanceAmount.toLocaleString()})</p>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">Deposit:</span>
                                                <p className="text-white">{leaseForm.securityDepositMonths} mo ({leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{securityDeposit.toLocaleString()})</p>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">Total Due:</span>
                                                <p className="text-amber-500 font-bold">{leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{totalDueAtSigning.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Utilities */}
                                <div className="mt-6 p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                    <div className="text-xs font-mono uppercase text-amber-500 mb-3">Utilities Assignment</div>
                                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                        <div>
                                            <span className="text-zinc-500">Tenant Pays:</span>
                                            <p className="text-white">{leaseForm.tenantUtilities.join(', ') || 'None'}</p>
                                        </div>
                                        <div>
                                            <span className="text-zinc-500">Landlord Pays:</span>
                                            <p className="text-white">{leaseForm.landlordUtilities.join(', ') || 'None'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Warning */}
                                <div className="mt-6 p-4 bg-amber-950/30 border border-amber-900/50 rounded-lg flex gap-3">
                                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-mono text-amber-500 font-bold">Ready to Generate Lease Agreement</p>
                                        <p className="text-xs font-mono text-amber-500/70 mt-1">
                                            This will create the tenant record and generate a tenancy agreement based on the Ghana Rent Act. 
                                            The lease document can be downloaded for signing.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                <Button
                    variant="outline"
                    className="border-zinc-800 text-zinc-400 hover:text-white font-mono text-xs"
                    onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                    disabled={currentStep === 1}
                >
                    <ArrowLeft className="h-3 w-3 mr-2" />
                    Previous
                </Button>

                {currentStep < 5 ? (
                    <Button
                        className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs"
                        onClick={() => setCurrentStep(prev => prev + 1)}
                        disabled={!canProceed()}
                    >
                        Next Step
                        <ArrowRight className="h-3 w-3 ml-2" />
                    </Button>
                ) : (
                    <Button
                        className="bg-green-600 hover:bg-green-500 text-white font-bold font-mono text-xs"
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="h-3 w-3 mr-2" />
                                Create Tenant & Generate Lease
                            </>
                        )}
                    </Button>
                )}
            </div>
        </div>
    )
}
