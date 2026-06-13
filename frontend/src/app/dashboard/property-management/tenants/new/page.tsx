'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Property, TenancyStatus } from '@/types/property-management'
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

function NewTenantContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const preSelectedPropertyId = searchParams.get('propertyId')
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
        useType: 'residential' as 'residential' | 'commercial',
        includedAmenities: [] as string[],
        tenantUtilities: ['Electricity', 'Water', 'Internet/Cable', 'Waste Collection'] as string[],
        landlordUtilities: [] as string[],
        specialConditions: ''
    })

    // Form state - Payment
    const [paymentForm, setPaymentForm] = useState({
        paymentDueDay: '1',
        paymentMethod: 'mobile_money' as 'bank_transfer' | 'mobile_money' | 'cash' | 'other',
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

    // Pre-select property if in URL
    useEffect(() => {
        if (preSelectedPropertyId && properties.length > 0) {
            handleSelectProperty(preSelectedPropertyId)
            // Optional: Auto-advance to step 2 if we want to show it selected, 
            // but maybe users want to start with Tenant Info.
            // Let's just set the form data.
        }
    }, [preSelectedPropertyId, properties])

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
                status: TenancyStatus.ACTIVE
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono uppercase">Register New Tenant</h1>
                        <p className="text-sm text-muted-foreground font-mono">Complete all steps to generate a lease agreement</p>
                    </div>
                </div>
            </div>

            {/* Step Progress */}
            <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
                {STEPS.map((step, index) => {
                    const StepIcon = step.icon
                    const isActive = currentStep === step.id
                    const isCompleted = currentStep > step.id

                    return (
                        <React.Fragment key={step.id}>
                            <button
                                onClick={() => currentStep > step.id && setCurrentStep(step.id)}
                                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : isCompleted
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-500 cursor-pointer hover:bg-green-900/50'
                                        : 'text-muted-foreground'
                                    }`}
                                disabled={currentStep < step.id}
                            >
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isActive ? 'bg-background/20' : isCompleted ? 'bg-green-500/20' : 'bg-secondary'
                                    }`}>
                                    {isCompleted ? (
                                        <CheckCircle className="h-4 w-4" />
                                    ) : (
                                        <StepIcon className="h-4 w-4" />
                                    )}
                                </div>
                                <div className="hidden sm:block text-left">
                                    <div className={`text-xs font-mono font-bold ${isActive ? 'text-primary-foreground' : ''}`}>
                                        {step.title}
                                    </div>
                                    <div className={`text-[10px] font-mono ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                        {step.description}
                                    </div>
                                </div>
                            </button>
                            {index < STEPS.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-border'
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
                        <Card className="bg-card border-border md:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Personal Information</CardTitle>
                                <CardDescription className="text-xs font-mono text-muted-foreground">Basic tenant details and identification</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Full Name *</Label>
                                        <Input
                                            placeholder="e.g. Kwame Mensah"
                                            value={tenantForm.fullName}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, fullName: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Ghana Card Number *</Label>
                                        <Input
                                            placeholder="GHA-000000000-0"
                                            value={tenantForm.ghanaCardNumber}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, ghanaCardNumber: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Phone (Primary) *</Label>
                                        <Input
                                            placeholder="e.g. 024 123 4567"
                                            value={tenantForm.phonePrimary}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, phonePrimary: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Email</Label>
                                        <Input
                                            type="email"
                                            placeholder="e.g. kwame@example.com"
                                            value={tenantForm.email}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, email: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Date of Birth</Label>
                                        <Input
                                            type="date"
                                            value={tenantForm.dateOfBirth}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Digital Address</Label>
                                        <Input
                                            placeholder="GA-123-4567"
                                            value={tenantForm.digitalAddress}
                                            onChange={(e) => setTenantForm(prev => ({ ...prev, digitalAddress: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Current Address</Label>
                                    <Textarea
                                        placeholder="Enter current residential address"
                                        value={tenantForm.currentAddress}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, currentAddress: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-amber-500 h-20"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Employment</CardTitle>
                                <CardDescription className="text-xs font-mono text-muted-foreground">For income verification</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Occupation</Label>
                                    <Input
                                        placeholder="e.g. Software Engineer"
                                        value={tenantForm.occupation}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, occupation: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Employer</Label>
                                    <Input
                                        placeholder="e.g. Tech Solutions Ltd"
                                        value={tenantForm.employer}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, employer: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Monthly Income (GHS)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={tenantForm.monthlyIncome}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, monthlyIncome: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Emergency Contact</CardTitle>
                                <CardDescription className="text-xs font-mono text-muted-foreground">In case of emergency</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Contact Name</Label>
                                    <Input
                                        placeholder="Full Name"
                                        value={tenantForm.emergencyContactName}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, emergencyContactName: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Relationship</Label>
                                    <Select
                                        value={tenantForm.emergencyContactRelationship}
                                        onValueChange={(v) => setTenantForm(prev => ({ ...prev, emergencyContactRelationship: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue placeholder="Select relationship" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-background border-border">
                                            <SelectItem value="spouse">Spouse</SelectItem>
                                            <SelectItem value="parent">Parent</SelectItem>
                                            <SelectItem value="sibling">Sibling</SelectItem>
                                            <SelectItem value="friend">Friend</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Phone Number</Label>
                                    <Input
                                        placeholder="e.g. 020 987 6543"
                                        value={tenantForm.emergencyContactPhone}
                                        onChange={(e) => setTenantForm(prev => ({ ...prev, emergencyContactPhone: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-amber-500"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Step 2: Property Selection */}
                {currentStep === 2 && (
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-mono uppercase text-primary">Select Property</CardTitle>
                            <CardDescription className="text-xs font-mono text-muted-foreground">Choose a property for this tenancy</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                    <p className="text-muted-foreground font-mono text-xs mt-4">Loading properties...</p>
                                </div>
                            ) : properties.length === 0 ? (
                                <div className="text-center py-12 border border-dashed border-border rounded-lg">
                                    <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <p className="text-muted-foreground font-mono text-sm">No available properties</p>
                                    <Link href="/dashboard/property-management/properties/new">
                                        <Button className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs">
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
                                            className={`p-4 rounded-lg border text-left transition-all ${leaseForm.propertyId === property.id
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border bg-card hover:border-primary/50'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center">
                                                    <Home className="h-5 w-5 text-primary" />
                                                </div>
                                                {leaseForm.propertyId === property.id && (
                                                    <CheckCircle className="h-5 w-5 text-primary" />
                                                )}
                                            </div>
                                            <h3 className="font-mono font-bold text-foreground text-sm mb-1">{property.title}</h3>
                                            <p className="text-[10px] font-mono text-muted-foreground mb-2">
                                                {property.addressStreet}, {property.addressCity}
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge className="bg-secondary text-secondary-foreground text-[9px] font-mono">
                                                    {property.propertyType}
                                                </Badge>
                                                {property.bedrooms && (
                                                    <Badge className="bg-secondary text-secondary-foreground text-[9px] font-mono">
                                                        {property.bedrooms} BR
                                                    </Badge>
                                                )}
                                                <Badge className="bg-primary/10 text-primary text-[9px] font-mono">
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
                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Lease Duration</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Start Date *</Label>
                                    <Input
                                        type="date"
                                        value={leaseForm.leaseStartDate}
                                        onChange={(e) => setLeaseForm(prev => ({ ...prev, leaseStartDate: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-primary"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Duration</Label>
                                    <Select
                                        value={leaseForm.leaseDuration}
                                        onValueChange={(v) => setLeaseForm(prev => ({ ...prev, leaseDuration: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="6">6 Months</SelectItem>
                                            <SelectItem value="12">1 Year</SelectItem>
                                            <SelectItem value="24">2 Years</SelectItem>
                                            <SelectItem value="36">3 Years</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">End Date</Label>
                                    <Input
                                        type="date"
                                        value={leaseForm.leaseEndDate}
                                        onChange={(e) => setLeaseForm(prev => ({ ...prev, leaseEndDate: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-primary"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Rent & Deposit</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Monthly Rent *</Label>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            value={leaseForm.monthlyRent}
                                            onChange={(e) => setLeaseForm(prev => ({ ...prev, monthlyRent: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Currency</Label>
                                        <Select
                                            value={leaseForm.rentCurrency}
                                            onValueChange={(v) => setLeaseForm(prev => ({ ...prev, rentCurrency: v }))}
                                        >
                                            <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-card border-border">
                                                <SelectItem value="GHS">GHS (₵)</SelectItem>
                                                <SelectItem value="USD">USD ($)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Advance Rent (Months)</Label>
                                    <Select
                                        value={leaseForm.advanceMonths}
                                        onValueChange={(v) => setLeaseForm(prev => ({ ...prev, advanceMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                            <SelectItem value="6">6 Months (Max per law)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Security Deposit (Months)</Label>
                                    <Select
                                        value={leaseForm.securityDepositMonths}
                                        onValueChange={(v) => setLeaseForm(prev => ({ ...prev, securityDepositMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="p-4 bg-background rounded-lg border border-border mt-4">
                                    <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">Total Due at Signing</div>
                                    <div className="text-2xl font-bold text-primary font-mono">
                                        {leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{totalDueAtSigning.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-mono mt-1">
                                        Advance: {leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{advanceAmount.toLocaleString()} +
                                        Deposit: {leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{securityDeposit.toLocaleString()}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Property Use</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Use Type</Label>
                                    <Select
                                        value={leaseForm.useType}
                                        onValueChange={(v: 'residential' | 'commercial') => setLeaseForm(prev => ({ ...prev, useType: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="residential">Residential</SelectItem>
                                            <SelectItem value="commercial">Commercial</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Max Occupants</Label>
                                    <Input
                                        type="number"
                                        value={leaseForm.maxOccupants}
                                        onChange={(e) => setLeaseForm(prev => ({ ...prev, maxOccupants: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-primary"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="petsAllowed"
                                        checked={leaseForm.petsAllowed}
                                        onCheckedChange={(checked) => setLeaseForm(prev => ({ ...prev, petsAllowed: !!checked }))}
                                    />
                                    <Label htmlFor="petsAllowed" className="text-xs font-mono text-muted-foreground">Pets Allowed</Label>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Utilities</CardTitle>
                                <CardDescription className="text-xs font-mono text-muted-foreground">Toggle to assign to Landlord</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {UTILITIES.map((utility) => {
                                    const isTenantPaying = leaseForm.tenantUtilities.includes(utility)
                                    return (
                                        <div key={utility} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                                            <span className="text-xs font-mono text-muted-foreground">{utility}</span>
                                            <button
                                                onClick={() => toggleTenantUtility(utility)}
                                                className={`px-3 py-1 rounded text-[10px] font-mono font-bold transition-all ${isTenantPaying
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-secondary text-secondary-foreground'
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
                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Payment Method</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Primary Method</Label>
                                    <Select
                                        value={paymentForm.paymentMethod}
                                        onValueChange={(v: 'bank_transfer' | 'mobile_money' | 'cash' | 'other') => setPaymentForm(prev => ({ ...prev, paymentMethod: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                            <SelectItem value="cash">Cash (with receipt)</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Payment Details</Label>
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
                                        className="bg-background border-border text-foreground font-mono focus:border-primary"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Payment Due Day</Label>
                                    <Select
                                        value={paymentForm.paymentDueDay}
                                        onValueChange={(v) => setPaymentForm(prev => ({ ...prev, paymentDueDay: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="1">1st of month</SelectItem>
                                            <SelectItem value="5">5th of month</SelectItem>
                                            <SelectItem value="15">15th of month</SelectItem>
                                            <SelectItem value="28">28th of month</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Late Payment & Termination</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Late Fee (%)</Label>
                                        <Input
                                            type="number"
                                            value={paymentForm.latePaymentPenaltyPercent}
                                            onChange={(e) => setPaymentForm(prev => ({ ...prev, latePaymentPenaltyPercent: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-muted-foreground">Grace Days</Label>
                                        <Input
                                            type="number"
                                            value={paymentForm.latePaymentGraceDays}
                                            onChange={(e) => setPaymentForm(prev => ({ ...prev, latePaymentGraceDays: e.target.value }))}
                                            className="bg-background border-border text-foreground font-mono focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Notice Period (Months)</Label>
                                    <Select
                                        value={paymentForm.noticePeriodMonths}
                                        onValueChange={(v) => setPaymentForm(prev => ({ ...prev, noticePeriodMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-background border-border text-foreground font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-muted-foreground">Dispute Resolution City</Label>
                                    <Input
                                        value={paymentForm.disputeResolutionCity}
                                        onChange={(e) => setPaymentForm(prev => ({ ...prev, disputeResolutionCity: e.target.value }))}
                                        className="bg-background border-border text-foreground font-mono focus:border-primary"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border md:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Special Conditions</CardTitle>
                                <CardDescription className="text-xs font-mono text-muted-foreground">Additional terms agreed by both parties</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Textarea
                                    placeholder="Enter any additional terms or conditions..."
                                    value={leaseForm.specialConditions}
                                    onChange={(e) => setLeaseForm(prev => ({ ...prev, specialConditions: e.target.value }))}
                                    className="bg-background border-border text-foreground font-mono focus:border-primary min-h-[100px]"
                                />
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Step 5: Review */}
                {currentStep === 5 && (
                    <div className="space-y-6">
                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Review & Confirm</CardTitle>
                                <CardDescription className="text-xs font-mono text-muted-foreground">Please review all details before generating the lease</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-6 md:grid-cols-2">
                                    {/* Tenant Summary */}
                                    <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                                        <div className="flex items-center gap-2 mb-3">
                                            <User className="h-4 w-4 text-primary" />
                                            <span className="text-xs font-mono uppercase text-primary">Tenant</span>
                                        </div>
                                        <div className="text-lg font-bold text-foreground font-mono mb-2">{tenantForm.fullName}</div>
                                        <div className="space-y-1 text-xs font-mono text-muted-foreground">
                                            <p><Phone className="inline h-3 w-3 mr-1" /> {tenantForm.phonePrimary}</p>
                                            {tenantForm.email && <p><Mail className="inline h-3 w-3 mr-1" /> {tenantForm.email}</p>}
                                            <p><Shield className="inline h-3 w-3 mr-1" /> {tenantForm.ghanaCardNumber}</p>
                                        </div>
                                    </div>

                                    {/* Property Summary */}
                                    <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Building2 className="h-4 w-4 text-primary" />
                                            <span className="text-xs font-mono uppercase text-primary">Property</span>
                                        </div>
                                        <div className="text-lg font-bold text-foreground font-mono mb-2">{selectedProperty?.title}</div>
                                        <div className="space-y-1 text-xs font-mono text-muted-foreground">
                                            <p><MapPin className="inline h-3 w-3 mr-1" /> {selectedProperty?.addressStreet}, {selectedProperty?.addressCity}</p>
                                            <p>{selectedProperty?.propertyType} • {selectedProperty?.bedrooms} BR</p>
                                        </div>
                                    </div>

                                    {/* Lease Terms Summary */}
                                    <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                                        <div className="flex items-center gap-2 mb-3">
                                            <FileText className="h-4 w-4 text-primary" />
                                            <span className="text-xs font-mono uppercase text-primary">Lease Terms</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                            <div>
                                                <span className="text-muted-foreground">Start:</span>
                                                <p className="text-foreground">{format(new Date(leaseForm.leaseStartDate), 'dd MMM yyyy')}</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">End:</span>
                                                <p className="text-foreground">{format(new Date(leaseForm.leaseEndDate), 'dd MMM yyyy')}</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Duration:</span>
                                                <p className="text-foreground">{leaseForm.leaseDuration} Months</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Use:</span>
                                                <p className="text-foreground capitalize">{leaseForm.useType}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Financial Summary */}
                                    <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                                        <div className="flex items-center gap-2 mb-3">
                                            <CreditCard className="h-4 w-4 text-primary" />
                                            <span className="text-xs font-mono uppercase text-primary">Financials</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                            <div>
                                                <span className="text-muted-foreground">Monthly Rent:</span>
                                                <p className="text-foreground">{leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{monthlyRent.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Advance:</span>
                                                <p className="text-foreground">{leaseForm.advanceMonths} mo ({leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{advanceAmount.toLocaleString()})</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Deposit:</span>
                                                <p className="text-foreground">{leaseForm.securityDepositMonths} mo ({leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{securityDeposit.toLocaleString()})</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Total Due:</span>
                                                <p className="text-primary font-bold">{leaseForm.rentCurrency === 'USD' ? '$' : '₵'}{totalDueAtSigning.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Utilities */}
                                <div className="mt-6 p-4 bg-secondary/50 rounded-lg border border-border">
                                    <div className="text-xs font-mono uppercase text-primary mb-3">Utilities Assignment</div>
                                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                        <div>
                                            <span className="text-muted-foreground">Tenant Pays:</span>
                                            <p className="text-foreground">{leaseForm.tenantUtilities.join(', ') || 'None'}</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Landlord Pays:</span>
                                            <p className="text-foreground">{leaseForm.landlordUtilities.join(', ') || 'None'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Warning */}
                                <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-lg flex gap-3">
                                    <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-mono text-primary font-bold">Ready to Generate Lease Agreement</p>
                                        <p className="text-xs font-mono text-primary/70 mt-1">
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
            <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                    variant="outline"
                    className="border-border text-muted-foreground hover:text-foreground font-mono text-xs"
                    onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                    disabled={currentStep === 1}
                >
                    <ArrowLeft className="h-3 w-3 mr-2" />
                    Previous
                </Button>

                {currentStep < 5 ? (
                    <Button
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold font-mono text-xs"
                        onClick={() => setCurrentStep(prev => prev + 1)}
                        disabled={!canProceed()}
                    >
                        Next Step
                        <ArrowRight className="h-3 w-3 ml-2" />
                    </Button>
                ) : (
                    <Button
                        className="bg-green-600 hover:bg-green-500 text-foreground font-bold font-mono text-xs"
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

export default function NewTenantPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <NewTenantContent />
        </Suspense>
    )
}
