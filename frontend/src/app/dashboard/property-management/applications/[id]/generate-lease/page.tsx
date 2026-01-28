'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, AlertCircle, ArrowLeft, ArrowRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ESignEditor, Signer, SignerRole } from '@/components/e-sign'
import { propertyManagementApi, Application, esignApi, CreateEnvelopeDto } from '@/lib/property-management-api'
import { generateLeaseAgreementHTML, LeaseAgreementData } from '@/lib/lease-generator'
import { format, addMonths, addYears } from 'date-fns'

const UTILITIES = [
    'Electricity',
    'Water',
    'Gas',
    'Internet/Cable',
    'Waste Collection'
]

const DURATION_OPTIONS = [
    { value: '6', label: '6 Months' },
    { value: '12', label: '1 Year' },
    { value: '24', label: '2 Years' },
    { value: '36', label: '3 Years' }
]

export default function ApplicationLeaseGeneratorPage() {
    const router = useRouter()
    const params = useParams()
    const applicationId = params.id as string
    
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [application, setApplication] = useState<Application | null>(null)
    const [property, setProperty] = useState<any | null>(null)
    const [leaseHtml, setLeaseHtml] = useState<string>('')
    const [showEditor, setShowEditor] = useState(false)
    const [landlordInfo] = useState({
        fullName: 'Property Owner',
        address: '',
        phone: '',
        email: ''
    })
    
    // Lease configuration state
    const [leaseConfig, setLeaseConfig] = useState({
        leaseStartDate: format(new Date(), 'yyyy-MM-dd'),
        leaseDuration: '12',
        leaseEndDate: format(addYears(new Date(), 1), 'yyyy-MM-dd'),
        monthlyRent: '',
        rentCurrency: 'GHS',
        advanceMonths: '2',
        securityDepositMonths: '1',
        maxOccupants: '4',
        petsAllowed: false,
        useType: 'residential' as 'residential' | 'commercial',
        tenantUtilities: ['Electricity', 'Water', 'Internet/Cable', 'Waste Collection'] as string[],
        landlordUtilities: ['Gas'] as string[]
    })

    // Toggle utility responsibility
    const toggleUtility = (utility: string) => {
        setLeaseConfig(prev => {
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

    // Calculate end date when start date or duration changes
    const updateEndDate = (startDate: string, months: string) => {
        const start = new Date(startDate)
        const end = addMonths(start, parseInt(months))
        setLeaseConfig(prev => ({
            ...prev,
            leaseStartDate: startDate,
            leaseDuration: months,
            leaseEndDate: format(end, 'yyyy-MM-dd')
        }))
    }

    // Calculate total due at signing
    const calculateTotalDue = () => {
        const rent = parseFloat(leaseConfig.monthlyRent) || 0
        const advance = parseInt(leaseConfig.advanceMonths) || 0
        const deposit = parseInt(leaseConfig.securityDepositMonths) || 0
        return rent * (advance + deposit)
    }

    // Load application and property data
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true)
                const appData = await propertyManagementApi.getApplicationById(applicationId)
                setApplication(appData)

                // Load property details
                const propertyData = await propertyManagementApi.getPropertyById(appData.propertyId)
                setProperty(propertyData)

                // Pre-populate lease config from application and property data
                const startDate = appData.desiredMoveInDate 
                    ? format(new Date(appData.desiredMoveInDate), 'yyyy-MM-dd')
                    : format(new Date(), 'yyyy-MM-dd')
                const duration = appData.desiredLeaseTermMonths?.toString() || '12'
                const endDate = format(addMonths(new Date(startDate), parseInt(duration)), 'yyyy-MM-dd')

                setLeaseConfig(prev => ({
                    ...prev,
                    leaseStartDate: startDate,
                    leaseDuration: duration,
                    leaseEndDate: endDate,
                    monthlyRent: propertyData?.price?.toString() || '',
                    rentCurrency: propertyData?.priceCurrency || 'GHS',
                    maxOccupants: appData.numberOfOccupants?.toString() || '4',
                    petsAllowed: appData.hasPets || false
                }))

            } catch (err) {
                console.error('Failed to load application:', err)
                setError('Failed to load application data')
            } finally {
                setIsLoading(false)
            }
        }

        loadData()
    }, [applicationId])

    // Generate lease HTML from current configuration
    const generateLease = () => {
        if (!application || !property) return

        const leaseData: LeaseAgreementData = {
            landlord: {
                fullName: landlordInfo.fullName || '[LANDLORD NAME]',
                address: landlordInfo.address || '[LANDLORD ADDRESS]',
                phone: landlordInfo.phone || '[LANDLORD PHONE]',
                email: landlordInfo.email,
                ghanaCardNumber: ''
            },
            tenant: {
                fullName: application.applicantFullName,
                address: application.applicantCurrentAddress || application.applicantDigitalAddress || 'N/A',
                phone: application.applicantPhone || 'N/A',
                ghanaCardNumber: application.applicantGhanaCard || 'N/A',
                email: application.applicantEmail,
                occupation: application.occupation,
                employer: application.employerName
            },
            property: {
                title: property?.title || application.propertyName || 'Property',
                addressStreet: property?.addressStreet || application.propertyAddress || '',
                addressCity: property?.addressCity || '',
                addressRegion: property?.region || 'Greater Accra',
                digitalAddress: property?.digitalAddress,
                propertyType: property?.propertyType || 'Apartment',
                bedrooms: property?.bedrooms,
                bathrooms: property?.bathrooms
            },
            terms: {
                leaseStartDate: new Date(leaseConfig.leaseStartDate).toISOString(),
                leaseEndDate: new Date(leaseConfig.leaseEndDate).toISOString(),
                monthlyRent: parseFloat(leaseConfig.monthlyRent) || 0,
                rentCurrency: leaseConfig.rentCurrency,
                advanceMonths: parseInt(leaseConfig.advanceMonths) || 2,
                securityDepositMonths: parseInt(leaseConfig.securityDepositMonths) || 1,
                paymentDueDay: 1,
                paymentMethod: 'mobile_money',
                latePaymentPenaltyPercent: 5,
                latePaymentGraceDays: 7,
                noticePeriodMonths: 1,
                useType: leaseConfig.useType,
                maxOccupants: parseInt(leaseConfig.maxOccupants) || 4,
                petsAllowed: leaseConfig.petsAllowed,
                tenantUtilities: leaseConfig.tenantUtilities,
                landlordUtilities: leaseConfig.landlordUtilities,
                includedAmenities: [],
                disputeResolutionCity: 'Accra'
            },
            generatedAt: new Date()
        }

        const html = generateLeaseAgreementHTML(leaseData)
        setLeaseHtml(html)
        setShowEditor(true)
    }

    // Default signers for lease
    const defaultSigners: Partial<Signer>[] = application ? [
        {
            id: 'landlord',
            role: 'signer_1' as SignerRole,
            name: landlordInfo.fullName || 'Landlord',
            email: landlordInfo.email || '',
            order: 1
        },
        {
            id: 'applicant',
            role: 'signer_2' as SignerRole,
            name: application.applicantFullName || '',
            email: application.applicantEmail || '',
            phone: application.applicantPhone,
            order: 2
        }
    ] : []

    // Handle save
    const handleSave = async (envelope: any) => {
        console.log('Saving draft:', envelope)
        // TODO: Save lease draft to backend linked to application
    }

    // Handle send for signature
    const handleSend = async (envelope: any) => {
        console.log('Sending for signatures:', envelope)
        
        try {
            // Create the e-sign envelope with all data
            const envelopeData: CreateEnvelopeDto = {
                name: `Tenancy Agreement - ${property?.title || application?.propertyName || 'Property'}`,
                documentHtml: leaseHtml,
                // Include pre-rendered document image and capture dimensions for consistent display
                documentImageUrl: envelope.documentImageUrl,
                captureWidth: envelope.captureWidth,
                captureHeight: envelope.captureHeight,
                contextType: 'lease',
                contextEntityId: applicationId,
                contextEntityName: `${application?.applicantFullName} @ ${property?.title || application?.propertyName}`,
                message: envelope.message || '',
                expiresInDays: 30,
                signers: envelope.signers?.map((s: any, idx: number) => ({
                    name: s.name,
                    email: s.email,
                    phone: s.phone,
                    role: s.role || `signer_${idx + 1}`,
                    order: s.order || idx + 1
                })) || [],
                fields: envelope.fields?.map((f: any) => {
                    // Map frontend field types to database enum values
                    const fieldTypeMap: Record<string, string> = {
                        'signature': 'signature',
                        'initials': 'initials',
                        'date': 'date_signed',
                        'text': 'text',
                        'checkbox': 'checkbox'
                    }
                    return {
                        signerId: f.signerId,
                        fieldType: fieldTypeMap[f.type] || 'signature',
                        page: f.page || 1,
                        x: f.x,
                        y: f.y,
                        width: f.width,
                        height: f.height,
                        required: f.required !== false,
                        label: f.label,
                        value: f.value || null,
                        fontFamily: f.fontFamily || null,
                        signedAt: f.signedAt || null
                    }
                }) || []
            }

            // Save the envelope to the backend
            const savedEnvelope = await esignApi.createEnvelope(envelopeData)
            console.log('Envelope created:', savedEnvelope)
            
            // Update application status to lease_generated
            await propertyManagementApi.sendLease(applicationId, {
                envelopeId: savedEnvelope.id,
                signers: envelope.signers?.map((s: any) => ({
                    name: s.name,
                    email: s.email,
                    role: s.role
                }))
            })
            
            // Navigate back to application page with envelope ID
            router.push(`/dashboard/property-management/applications/${applicationId}?lease_sent=true&envelope_id=${savedEnvelope.id}`)
        } catch (error) {
            console.error('Failed to send lease:', error)
            throw error
        }
    }

    // Handle cancel
    const handleCancel = () => {
        router.push(`/dashboard/property-management/applications/${applicationId}`)
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                <p className="text-zinc-500 font-mono text-xs mt-4 uppercase">Loading lease document...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-500 font-mono text-sm">{error}</p>
                <Button 
                    variant="outline" 
                    className="mt-4 border-zinc-800 text-zinc-400"
                    onClick={handleCancel}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go Back
                </Button>
            </div>
        )
    }

    // Show configuration form before editor
    if (!showEditor) {
        return (
            <div className="min-h-screen bg-black p-6">
                <div className="max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="mb-6">
                        <Button
                            variant="ghost"
                            onClick={handleCancel}
                            className="mb-4 text-zinc-400 hover:text-white"
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Application
                        </Button>
                        <h1 className="text-xl font-bold text-white">Configure Lease Terms</h1>
                        <p className="text-zinc-500 text-sm font-mono">
                            Review and customize the lease terms before generating the agreement
                        </p>
                    </div>

                    {/* Applicant Info Card */}
                    <Card className="bg-zinc-900/50 border-zinc-800 mb-6">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-mono uppercase text-primary">Applicant</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                                    <span className="text-lg font-bold text-primary">
                                        {application?.applicantFullName?.charAt(0) || '?'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-white font-medium">{application?.applicantFullName}</p>
                                    <p className="text-zinc-500 text-sm">{application?.applicantEmail}</p>
                                </div>
                                <div className="ml-auto text-right">
                                    <p className="text-zinc-400 text-xs font-mono">Property</p>
                                    <p className="text-white">{property?.title || application?.propertyName}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Lease Duration Card */}
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Lease Duration</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Start Date</Label>
                                    <Input
                                        type="date"
                                        value={leaseConfig.leaseStartDate}
                                        onChange={(e) => updateEndDate(e.target.value, leaseConfig.leaseDuration)}
                                        className="bg-black border-zinc-800 text-white font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Duration</Label>
                                    <Select
                                        value={leaseConfig.leaseDuration}
                                        onValueChange={(v) => updateEndDate(leaseConfig.leaseStartDate, v)}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            {DURATION_OPTIONS.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">End Date</Label>
                                    <Input
                                        type="date"
                                        value={leaseConfig.leaseEndDate}
                                        disabled
                                        className="bg-black/50 border-zinc-800 text-zinc-400 font-mono"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Rent & Deposit Card */}
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Rent & Deposit</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-3">
                                    <div className="flex-1 space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Monthly Rent</Label>
                                        <Input
                                            type="number"
                                            value={leaseConfig.monthlyRent}
                                            onChange={(e) => setLeaseConfig(prev => ({ ...prev, monthlyRent: e.target.value }))}
                                            className="bg-black border-zinc-800 text-white font-mono"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="w-24 space-y-2">
                                        <Label className="text-[10px] font-mono uppercase text-zinc-500">Currency</Label>
                                        <Select
                                            value={leaseConfig.rentCurrency}
                                            onValueChange={(v) => setLeaseConfig(prev => ({ ...prev, rentCurrency: v }))}
                                        >
                                            <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                                <SelectItem value="GHS">GHS (₵)</SelectItem>
                                                <SelectItem value="USD">USD ($)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Advance Rent (Months)</Label>
                                    <Select
                                        value={leaseConfig.advanceMonths}
                                        onValueChange={(v) => setLeaseConfig(prev => ({ ...prev, advanceMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                            <SelectItem value="6">6 Months</SelectItem>
                                            <SelectItem value="12">12 Months</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Security Deposit (Months)</Label>
                                    <Select
                                        value={leaseConfig.securityDepositMonths}
                                        onValueChange={(v) => setLeaseConfig(prev => ({ ...prev, securityDepositMonths: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="1">1 Month</SelectItem>
                                            <SelectItem value="2">2 Months</SelectItem>
                                            <SelectItem value="3">3 Months</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="pt-3 border-t border-zinc-800">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Total Due at Signing</Label>
                                    <p className="text-2xl font-bold text-primary">
                                        {leaseConfig.rentCurrency === 'GHS' ? '₵' : '$'}{calculateTotalDue().toLocaleString()}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 font-mono">
                                        Advance: {leaseConfig.rentCurrency === 'GHS' ? '₵' : '$'}{((parseFloat(leaseConfig.monthlyRent) || 0) * parseInt(leaseConfig.advanceMonths)).toLocaleString()} + 
                                        Deposit: {leaseConfig.rentCurrency === 'GHS' ? '₵' : '$'}{((parseFloat(leaseConfig.monthlyRent) || 0) * parseInt(leaseConfig.securityDepositMonths)).toLocaleString()}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Property Use Card */}
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Property Use</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Use Type</Label>
                                    <Select
                                        value={leaseConfig.useType}
                                        onValueChange={(v: 'residential' | 'commercial') => setLeaseConfig(prev => ({ ...prev, useType: v }))}
                                    >
                                        <SelectTrigger className="bg-black border-zinc-800 text-white font-mono">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="residential">Residential</SelectItem>
                                            <SelectItem value="commercial">Commercial</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono uppercase text-zinc-500">Max Occupants</Label>
                                    <Input
                                        type="number"
                                        value={leaseConfig.maxOccupants}
                                        onChange={(e) => setLeaseConfig(prev => ({ ...prev, maxOccupants: e.target.value }))}
                                        className="bg-black border-zinc-800 text-white font-mono"
                                        min="1"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="petsAllowed"
                                        checked={leaseConfig.petsAllowed}
                                        onCheckedChange={(checked) => setLeaseConfig(prev => ({ ...prev, petsAllowed: !!checked }))}
                                    />
                                    <Label htmlFor="petsAllowed" className="text-xs font-mono text-zinc-400">Pets Allowed</Label>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Utilities Card */}
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-sm font-mono uppercase text-primary">Utilities</CardTitle>
                                <CardDescription className="text-xs font-mono text-zinc-500">Toggle to assign to Landlord</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {UTILITIES.map((utility) => {
                                    const isTenantPaying = leaseConfig.tenantUtilities.includes(utility)
                                    return (
                                        <div key={utility} className="flex items-center justify-between p-3 bg-black rounded border border-zinc-800">
                                            <span className="text-sm font-mono text-zinc-300">{utility}</span>
                                            <button
                                                onClick={() => toggleUtility(utility)}
                                                className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all ${
                                                    isTenantPaying
                                                        ? 'bg-primary text-primary-foreground'
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

                    {/* Actions */}
                    <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-800">
                        <Button
                            variant="outline"
                            onClick={handleCancel}
                            className="border-zinc-700 text-zinc-400"
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Cancel
                        </Button>
                        <Button
                            onClick={generateLease}
                            className="bg-primary hover:bg-primary/90"
                            disabled={!leaseConfig.monthlyRent}
                        >
                            Generate Lease
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <ESignEditor
            documentHtml={leaseHtml}
            documentName={`Tenancy Agreement - ${property?.title || application?.propertyName || 'Property'}`}
            context={{
                type: 'lease',
                entityId: applicationId,
                entityName: `${application?.applicantFullName} @ ${property?.title || application?.propertyName}`
            }}
            defaultSigners={defaultSigners}
            onSave={handleSave}
            onSend={handleSend}
            onCancel={() => setShowEditor(false)}
        />
    )
}
