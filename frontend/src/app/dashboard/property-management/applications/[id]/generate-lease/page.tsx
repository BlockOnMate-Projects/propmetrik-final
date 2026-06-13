'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import {
    ArrowLeft,
    FileText,
    Loader2,
    Building2,
    Calendar,
    User,
    Mail,
    Phone,
    AlertCircle,
    CheckCircle2,
    Send,
    Eye,
    DollarSign,
    Clock,
    FileSignature,
    UserCheck,
    Users
} from 'lucide-react'
import { propertyManagementApi, Application, ApplicationStatus, LeaseTemplate, GeneratedLeaseDocument } from '@/lib/property-management-api'
import { useSession } from 'next-auth/react'
import { format, addMonths } from 'date-fns'
import Link from 'next/link'

interface LeaseFormData {
    templateId: string
    startDate: string
    endDate: string
    monthlyRent: number
    currency: string
    securityDeposit: number
    advanceMonths: number
    noticePeriodDays: number
    autoRenew: boolean
    additionalTerms: string
    landlordName: string
    landlordEmail: string
    includeESign: boolean
    // Signing authorization
    isUserLandlord: boolean
    landlordWillSign: boolean
    // Utility responsibility
    tenantUtilities: string[]
    landlordUtilities: string[]
}

// Available utilities
const UTILITIES = [
    { id: 'electricity', label: 'Electricity' },
    { id: 'water', label: 'Water' },
    { id: 'gas', label: 'Gas' },
    { id: 'internet', label: 'Internet/Cable' },
    { id: 'waste', label: 'Waste Collection' },
    { id: 'security', label: 'Security' },
]

export default function GenerateLeasePage() {
    const router = useRouter()
    const params = useParams()
    const applicationId = params.id as string
    const { data: session } = useSession()
    const user = session?.user

    const [application, setApplication] = useState<Application | null>(null)
    const [templates, setTemplates] = useState<LeaseTemplate[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isPreparingEsign, setIsPreparingEsign] = useState(false)
    // When true, show the lease form even though a lease already exists (regeneration)
    const [forceShowForm, setForceShowForm] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [previewHtml, setPreviewHtml] = useState<string | null>(null)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [isSuccessOpen, setIsSuccessOpen] = useState(false)
    const [generatedResult, setGeneratedResult] = useState<{ tenantId?: string; tenancyId?: string; envelopeId?: string } | null>(null)

    const [formData, setFormData] = useState<LeaseFormData>({
        templateId: '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(addMonths(new Date(), 12), 'yyyy-MM-dd'),
        monthlyRent: 0,
        currency: 'GHS',
        securityDeposit: 0,
        advanceMonths: 1,
        noticePeriodDays: 30,
        autoRenew: false,
        additionalTerms: '',
        landlordName: '',
        landlordEmail: '',
        includeESign: true,
        isUserLandlord: false,
        landlordWillSign: false,
        tenantUtilities: ['electricity', 'water', 'gas', 'internet', 'waste'],
        landlordUtilities: []
    })

    // When user checks "I am the landlord", auto-fill landlord info
    useEffect(() => {
        if (formData.isUserLandlord && user) {
            setFormData(prev => ({
                ...prev,
                landlordName: user.name || '',
                landlordEmail: user.email || ''
            }))
        }
    }, [formData.isUserLandlord, user])

    useEffect(() => {
        if (applicationId) {
            loadData()
        }
    }, [applicationId])

    const loadData = async () => {
        try {
            setIsLoading(true)
            setError(null)

            // Load application and templates in parallel
            const [appData, templatesData] = await Promise.all([
                propertyManagementApi.getApplicationById(applicationId),
                propertyManagementApi.getLeaseTemplates()
            ])

            setApplication(appData)
            setTemplates(templatesData.templates || [])

            // If a tenancy already exists (lease was already generated), show a message and redirect option
            // Note: tenantId is only set AFTER the lease is signed
            if (appData.tenancyId) {
                // Check if there's existing e-sign data in session
                const existingEsignData = sessionStorage.getItem('esign_lease_document')
                if (existingEsignData) {
                    const esignData = JSON.parse(existingEsignData)
                    // If it's for the same application, redirect to e-sign wizard
                    if (esignData.applicationId === applicationId) {
                        router.push('/dashboard/e-sign/new?source=lease-generator')
                        return
                    }
                }
                
                // Otherwise show that a lease already exists
                setError('A lease has already been generated for this application. You can view the tenant record or regenerate if needed.')
            }

            // Pre-fill form with application and property data
            if (appData) {
                const desiredMonths = appData.desiredLeaseTermMonths || 12
                const startDate = appData.desiredMoveInDate || format(new Date(), 'yyyy-MM-dd')
                
                // Use property price for monthly rent (the property's listed price)
                const monthlyRent = appData.propertyPrice || 0
                // Security deposit is typically 2-3 months rent in Ghana
                const securityDeposit = monthlyRent * 2

                setFormData(prev => ({
                    ...prev,
                    startDate,
                    endDate: format(addMonths(new Date(startDate), desiredMonths), 'yyyy-MM-dd'),
                    monthlyRent,
                    currency: (appData as any).propertyPriceCurrency || 'GHS',
                    securityDeposit,
                }))

                // Set default template
                const defaultTemplate = templatesData.templates?.find((t: LeaseTemplate) => t.isDefault)
                if (defaultTemplate) {
                    setFormData(prev => ({ ...prev, templateId: defaultTemplate.id }))
                }
            }
        } catch (err) {
            console.error('Failed to load data:', err)
            setError('Failed to load application or templates.')
        } finally {
            setIsLoading(false)
        }
    }

    const handlePreview = async () => {
        if (!formData.templateId) {
            setError('Please select a lease template')
            return
        }

        try {
            setIsGenerating(true)
            const response = await propertyManagementApi.previewLeaseTemplate(formData.templateId, {
                tenantName: application?.applicantFullName,
                tenantEmail: application?.applicantEmail,
                tenantPhone: application?.applicantPhone,
                propertyAddress: application?.propertyAddress,
                propertyName: application?.propertyName,
                monthlyRent: formData.monthlyRent,
                securityDeposit: formData.securityDeposit,
                startDate: formData.startDate,
                endDate: formData.endDate,
                noticePeriodDays: formData.noticePeriodDays,
                landlordName: formData.landlordName,
                additionalTerms: formData.additionalTerms,
                tenantUtilities: formData.tenantUtilities,
                landlordUtilities: formData.landlordUtilities
            })
            setPreviewHtml(response as unknown as string)
            setIsPreviewOpen(true)
        } catch (err) {
            console.error('Failed to preview:', err)
            setError('Failed to generate preview')
        } finally {
            setIsGenerating(false)
        }
    }

    const handleGenerateLease = async () => {
        if (!formData.templateId) {
            setError('Please select a lease template')
            return
        }

        if (!application) {
            setError('Application not found')
            return
        }

        // Strict governance: the landlord must be explicitly named so they appear on the
        // lease agreement. Without a name the document silently falls back to the
        // organization name, which is not an acceptable record of who the landlord is.
        if (!formData.isUserLandlord && !formData.landlordName?.trim()) {
            setError('Please enter the landlord name — it must appear on the lease agreement')
            return
        }

        // Validate landlord email if landlord will sign
        if (!formData.isUserLandlord && formData.landlordWillSign && !formData.landlordEmail) {
            setError('Please provide the landlord email since they will be signing the lease')
            return
        }

        try {
            setIsGenerating(true)
            setError(null)

            // Build signers list based on authorization checkboxes
            const signers = []

            if (formData.isUserLandlord) {
                // User IS the landlord - they sign first as landlord
                signers.push({
                    role: 'landlord',
                    name: formData.landlordName || user?.name || 'Landlord',
                    email: formData.landlordEmail || user?.email || '',
                    order: 1
                })
            } else {
                // User is property manager - they sign first
                signers.push({
                    role: 'property_manager',
                    name: user?.name || 'Property Manager',
                    email: user?.email || '',
                    order: 1
                })
            }

            // Tenant is always signer 2
            signers.push({
                role: 'tenant',
                name: application.applicantFullName,
                email: application.applicantEmail,
                order: 2
            })

            // If user is NOT landlord AND landlord WILL sign, add landlord as signer 3
            if (!formData.isUserLandlord && formData.landlordWillSign) {
                signers.push({
                    role: 'landlord',
                    name: formData.landlordName || 'Landlord',
                    email: formData.landlordEmail,
                    order: 3
                })
            }

            // Prepare lease data for document generation (NOT sending yet)
            const leaseData = {
                templateId: formData.templateId,
                startDate: formData.startDate,
                endDate: formData.endDate,
                monthlyRent: formData.monthlyRent,
                currency: formData.currency,
                securityDeposit: formData.securityDeposit,
                advanceMonths: formData.advanceMonths,
                noticePeriodDays: formData.noticePeriodDays,
                autoRenew: formData.autoRenew,
                additionalTerms: formData.additionalTerms,
                landlordName: formData.landlordName,
                landlordEmail: formData.landlordEmail,
                // Utility responsibilities
                tenantUtilities: formData.tenantUtilities,
                landlordUtilities: formData.landlordUtilities,
                // Signing authorization
                isUserLandlord: formData.isUserLandlord,
                landlordWillSign: formData.landlordWillSign,
                signers: signers,
            }

            // Generate the lease document (creates tenant/tenancy + PDF) but does NOT send to e-sign
            const result = await propertyManagementApi.generateLeaseDocument(applicationId, leaseData)

            // Store document info in sessionStorage for e-sign wizard
            const esignData = {
                documentUrl: result.documentUrl,
                documentKey: result.documentKey,
                filename: result.filename,
                tenancyId: result.tenancyId,
                applicationId: applicationId,
                propertyName: application.propertyName || application.propertyAddress || 'Property',
                signers: signers, // Use our constructed signers list
                subject: `Lease Agreement - ${application.propertyName || application.propertyAddress}`,
                message: `Please sign the lease agreement for ${application.propertyAddress}. This lease is effective from ${formData.startDate} to ${formData.endDate}.`
            }
            sessionStorage.setItem('esign_lease_document', JSON.stringify(esignData))

            // Redirect to e-sign wizard for field placement
            router.push('/dashboard/e-sign/new?source=lease-generator')
        } catch (err: any) {
            console.error('Failed to generate lease:', err)
            setError(err.message || 'Failed to generate lease. Please try again.')
        } finally {
            setIsGenerating(false)
        }
    }

    const handleSuccessClose = () => {
        setIsSuccessOpen(false)
        if (generatedResult?.tenancyId) {
            router.push(`/dashboard/property-management/leases/${generatedResult.tenancyId}`)
        } else {
            router.push('/dashboard/property-management/applications')
        }
    }

    // When a lease was already generated (e.g. in a prior session), the e-sign wizard's
    // sessionStorage handoff is empty — so we must re-fetch the lease PDF for the existing
    // tenancy and rebuild the handoff before sending the user into the wizard. Without this
    // the wizard falls back to a blank self-sign envelope.
    const handleContinueToESign = async () => {
        if (!application?.tenancyId) {
            setError('No tenancy is linked to this application yet.')
            return
        }

        try {
            setIsPreparingEsign(true)
            setError(null)

            const result = await propertyManagementApi.generateLeaseDocumentFromTenancy({
                tenancyId: application.tenancyId,
                format: 'pdf',
            })

            const documentUrl = (result as any).documentUrl || (result as any).downloadUrl
            if (!documentUrl) {
                throw new Error('Could not load the generated lease document.')
            }

            // Prefer the signers stored on the tenancy when the lease was generated (these include
            // the landlord when "landlord will also sign" was chosen). Fall back to a sensible
            // default order (property manager → tenant) if none are stored.
            let signers: Array<{ role: string; name: string; email: string; order: number }> = [
                {
                    role: 'property_manager',
                    name: user?.name || 'Property Manager',
                    email: user?.email || '',
                    order: 1,
                },
                {
                    role: 'tenant',
                    name: application.applicantFullName,
                    email: application.applicantEmail,
                    order: 2,
                },
            ]
            try {
                const tenancy = await propertyManagementApi.getTenancyById(application.tenancyId)
                const stored = (tenancy as any)?.leaseTerms?.signers
                if (Array.isArray(stored) && stored.length > 0) {
                    signers = stored.map((s: any, i: number) => ({
                        role: s.role || 'signer',
                        name: s.name,
                        email: s.email,
                        order: s.order ?? i + 1,
                    }))
                }
            } catch { /* keep default signers */ }

            const esignData = {
                documentUrl,
                documentKey: result.documentKey,
                filename: result.filename,
                tenancyId: application.tenancyId,
                applicationId,
                propertyName: application.propertyName || application.propertyAddress || 'Property',
                signers,
                subject: `Lease Agreement - ${application.propertyName || application.propertyAddress}`,
                message: `Please review and sign the lease agreement for ${application.propertyAddress || application.propertyName}.`,
            }
            sessionStorage.setItem('esign_lease_document', JSON.stringify(esignData))
            router.push('/dashboard/e-sign/new?source=lease-generator')
        } catch (err: any) {
            console.error('Failed to prepare e-sign:', err)
            setError(err.message || 'Failed to load the lease for e-signing. Please try again.')
            setIsPreparingEsign(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        )
    }

    if (!application) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <p className="text-muted-foreground">Application not found</p>
                <Link href="/dashboard/property-management/applications">
                    <Button variant="outline">Back to Applications</Button>
                </Link>
            </div>
        )
    }

    // If lease was already generated (either by status or by having a tenancy), show appropriate message with options
    // Note: tenantId is only set AFTER the lease is signed
    if ((application.status === ApplicationStatus.LEASE_GENERATED || application.tenancyId) && !forceShowForm) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <h2 className="text-xl font-semibold text-foreground">Lease Already Generated</h2>
                <p className="text-muted-foreground text-center max-w-md">
                    A lease has already been generated for this application. You can continue to e-sign, view the lease, or regenerate it (e.g. to fix the currency, rent, or signers).
                </p>
                <div className="flex flex-wrap gap-3 mt-4 justify-center">
                    <Link href={`/dashboard/property-management/applications/${applicationId}`}>
                        <Button variant="outline">Back to Application</Button>
                    </Link>
                    {application.tenancyId && (
                        <Link href={`/dashboard/property-management/leases/${application.tenancyId}`}>
                            <Button variant="outline">View Tenancy</Button>
                        </Link>
                    )}
                    <Button
                        variant="outline"
                        onClick={() => { setError(null); setForceShowForm(true); }}
                        className="border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-950/40 hover:text-amber-300"
                    >
                        <FileSignature className="h-4 w-4 mr-2" />
                        Regenerate Lease
                    </Button>
                    <Button
                        onClick={handleContinueToESign}
                        disabled={isPreparingEsign || !application.tenancyId}
                        className="bg-emerald-600 hover:bg-emerald-500"
                    >
                        {isPreparingEsign ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Preparing…
                            </>
                        ) : (
                            <>
                                <FileSignature className="h-4 w-4 mr-2" />
                                Continue to E-Sign
                            </>
                        )}
                    </Button>
                </div>
            </div>
        )
    }

    if (application.status !== ApplicationStatus.APPROVED && !forceShowForm) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <AlertCircle className="h-12 w-12 text-yellow-500" />
                <p className="text-muted-foreground">Application must be approved before generating a lease</p>
                <Link href={`/dashboard/property-management/applications/${applicationId}`}>
                    <Button variant="outline">Back to Application</Button>
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href={`/dashboard/property-management/applications/${applicationId}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Generate Lease Agreement</h1>
                        <p className="text-sm text-muted-foreground">Create a lease for {application.applicantFullName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handlePreview}
                        disabled={isGenerating || !formData.templateId}
                        className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                    </Button>
                    <Button
                        onClick={handleGenerateLease}
                        disabled={isGenerating || !formData.templateId}
                        className="bg-emerald-600 hover:bg-emerald-500 text-foreground"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <FileSignature className="mr-2 h-4 w-4" />
                                Generate Lease & Continue to E-Sign
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-red-100 dark:bg-red-900/20 border border-red-900 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {/* Application Summary */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Applicant Information
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground">Name</p>
                                <p className="text-foreground">{application.applicantFullName}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground">Email</p>
                                <p className="text-foreground">{application.applicantEmail}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground">Phone</p>
                                <p className="text-foreground">{application.applicantPhone}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 md:col-span-3">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-xs text-muted-foreground">Property</p>
                                <p className="text-foreground">{application.propertyName || application.propertyAddress || 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Template Selection */}
                <Card className="bg-card border-border md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground">Lease Template</CardTitle>
                        <CardDescription className="text-muted-foreground">Select a template for this lease agreement</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="template" className="text-muted-foreground">Template</Label>
                                <Select
                                    value={formData.templateId}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, templateId: value }))}
                                >
                                    <SelectTrigger className="bg-background border-border focus:border-orange-500 text-muted-foreground">
                                        <SelectValue placeholder="Select a lease template" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-muted-foreground">
                                        {templates.length === 0 ? (
                                            <SelectItem value="none" disabled>No templates available</SelectItem>
                                        ) : (
                                            templates.map((template) => (
                                                <SelectItem key={template.id} value={template.id}>
                                                    {template.name} {template.isDefault && '(Default)'} - {template.category}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                                {templates.length === 0 && (
                                    <p className="text-sm text-yellow-500">
                                        No lease templates found. Please create a template first.
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Lease Duration */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Lease Duration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="startDate" className="text-muted-foreground">Start Date</Label>
                                <Input
                                    id="startDate"
                                    type="date"
                                    value={formData.startDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                                    className="bg-background border-border focus:border-orange-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endDate" className="text-muted-foreground">End Date</Label>
                                <Input
                                    id="endDate"
                                    type="date"
                                    value={formData.endDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                                    className="bg-background border-border focus:border-orange-500"
                                />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 pt-2">
                            <Checkbox
                                id="autoRenew"
                                checked={formData.autoRenew}
                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, autoRenew: checked as boolean }))}
                                className="border-zinc-600 data-[state=checked]:bg-orange-500"
                            />
                            <Label htmlFor="autoRenew" className="text-muted-foreground font-normal">Auto-renew lease at end of term</Label>
                        </div>
                        <div className="space-y-2 pt-2">
                            <Label htmlFor="noticePeriod" className="text-muted-foreground">Notice Period (Days)</Label>
                            <Input
                                id="noticePeriod"
                                type="number"
                                value={formData.noticePeriodDays}
                                onChange={(e) => setFormData(prev => ({ ...prev, noticePeriodDays: parseInt(e.target.value) || 30 }))}
                                className="bg-background border-border focus:border-orange-500"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Financial Details */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Financial Terms
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currency" className="text-muted-foreground">Currency</Label>
                            <select
                                id="currency"
                                value={formData.currency}
                                onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-orange-500 focus:outline-none"
                            >
                                <option value="GHS">GHS (Ghana Cedi)</option>
                                <option value="USD">USD (US Dollar)</option>
                                <option value="EUR">EUR (Euro)</option>
                                <option value="GBP">GBP (Pound Sterling)</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="monthlyRent" className="text-muted-foreground">Monthly Rent ({formData.currency})</Label>
                                <Input
                                    id="monthlyRent"
                                    type="number"
                                    value={formData.monthlyRent}
                                    onChange={(e) => setFormData(prev => ({ ...prev, monthlyRent: parseFloat(e.target.value) || 0 }))}
                                    className="bg-background border-border focus:border-orange-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="securityDeposit" className="text-muted-foreground">Security Deposit ({formData.currency})</Label>
                                <Input
                                    id="securityDeposit"
                                    type="number"
                                    value={formData.securityDeposit}
                                    onChange={(e) => setFormData(prev => ({ ...prev, securityDeposit: parseFloat(e.target.value) || 0 }))}
                                    className="bg-background border-border focus:border-orange-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="advanceMonths" className="text-muted-foreground">Advance Months</Label>
                            <Input
                                id="advanceMonths"
                                type="number"
                                min={1}
                                value={formData.advanceMonths}
                                onChange={(e) => setFormData(prev => ({ ...prev, advanceMonths: parseInt(e.target.value) || 1 }))}
                                className="bg-background border-border focus:border-orange-500"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Utilities & Services */}
                <Card className="bg-card border-border md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Utilities & Services
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">Select who is responsible for each utility</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-6">
                            {/* Tenant Utilities */}
                            <div className="space-y-3">
                                <Label className="text-muted-foreground font-medium">Tenant Pays For:</Label>
                                <div className="space-y-2">
                                    {UTILITIES.map((utility) => (
                                        <div key={`tenant-${utility.id}`} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`tenant-${utility.id}`}
                                                checked={formData.tenantUtilities.includes(utility.id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            tenantUtilities: [...prev.tenantUtilities, utility.id],
                                                            landlordUtilities: prev.landlordUtilities.filter(u => u !== utility.id)
                                                        }))
                                                    } else {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            tenantUtilities: prev.tenantUtilities.filter(u => u !== utility.id)
                                                        }))
                                                    }
                                                }}
                                                className="border-zinc-600 data-[state=checked]:bg-orange-500"
                                            />
                                            <Label htmlFor={`tenant-${utility.id}`} className="text-muted-foreground font-normal cursor-pointer">
                                                {utility.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Landlord Utilities */}
                            <div className="space-y-3">
                                <Label className="text-muted-foreground font-medium">Landlord Pays For:</Label>
                                <div className="space-y-2">
                                    {UTILITIES.map((utility) => (
                                        <div key={`landlord-${utility.id}`} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`landlord-${utility.id}`}
                                                checked={formData.landlordUtilities.includes(utility.id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            landlordUtilities: [...prev.landlordUtilities, utility.id],
                                                            tenantUtilities: prev.tenantUtilities.filter(u => u !== utility.id)
                                                        }))
                                                    } else {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            landlordUtilities: prev.landlordUtilities.filter(u => u !== utility.id)
                                                        }))
                                                    }
                                                }}
                                                className="border-zinc-600 data-[state=checked]:bg-emerald-500"
                                            />
                                            <Label htmlFor={`landlord-${utility.id}`} className="text-muted-foreground font-normal cursor-pointer">
                                                {utility.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">
                            Note: Utilities not selected by either party will be left blank in the lease agreement.
                        </p>
                    </CardContent>
                </Card>

                {/* Landlord Information */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Landlord / Owner Details
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                            The landlord's name will appear on the lease agreement
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Signing Authorization Questions */}
                        <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    id="isUserLandlord"
                                    checked={formData.isUserLandlord}
                                    onCheckedChange={(checked) => setFormData(prev => ({ 
                                        ...prev, 
                                        isUserLandlord: checked as boolean,
                                        landlordWillSign: false // Reset when this changes
                                    }))}
                                    className="border-zinc-600 data-[state=checked]:bg-blue-500 mt-0.5"
                                />
                                <div>
                                    <Label htmlFor="isUserLandlord" className="text-zinc-200 font-medium">
                                        I am the Landlord / Property Owner
                                    </Label>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Check this if you own the property and will sign as the landlord
                                    </p>
                                </div>
                            </div>

                            {!formData.isUserLandlord && (
                                <div className="flex items-start space-x-3 pt-2 border-t border-border">
                                    <Checkbox
                                        id="landlordWillSign"
                                        checked={formData.landlordWillSign}
                                        onCheckedChange={(checked) => setFormData(prev => ({ 
                                            ...prev, 
                                            landlordWillSign: checked as boolean 
                                        }))}
                                        className="border-zinc-600 data-[state=checked]:bg-blue-500 mt-0.5"
                                    />
                                    <div>
                                        <Label htmlFor="landlordWillSign" className="text-zinc-200 font-medium">
                                            Landlord will also sign this lease
                                        </Label>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Check this if the property owner will also sign. Otherwise, you'll sign on their behalf as authorized agent.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Separator className="bg-zinc-700" />

                        <div className="space-y-2">
                            <Label htmlFor="landlordName" className="text-muted-foreground">
                                Landlord Name <span className="text-red-600 dark:text-red-400">*</span>
                            </Label>
                            <Input
                                id="landlordName"
                                value={formData.landlordName}
                                onChange={(e) => setFormData(prev => ({ ...prev, landlordName: e.target.value }))}
                                placeholder="Enter landlord or property owner name"
                                className="bg-background border-border focus:border-orange-500"
                                disabled={formData.isUserLandlord}
                            />
                            {formData.isUserLandlord && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                    Auto-filled from your profile
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="landlordEmail" className="text-muted-foreground">
                                Landlord Email {formData.landlordWillSign && <span className="text-red-600 dark:text-red-400">*</span>}
                            </Label>
                            <Input
                                id="landlordEmail"
                                type="email"
                                value={formData.landlordEmail}
                                onChange={(e) => setFormData(prev => ({ ...prev, landlordEmail: e.target.value }))}
                                placeholder="landlord@email.com"
                                className="bg-background border-border focus:border-orange-500"
                                disabled={formData.isUserLandlord}
                            />
                            {!formData.isUserLandlord && !formData.landlordWillSign && (
                                <p className="text-xs text-muted-foreground">
                                    Optional if landlord won't sign (you'll sign on their behalf)
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* E-Signature Options */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                            <FileSignature className="h-5 w-5" />
                            E-Signature Options
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="includeESign"
                                checked={formData.includeESign}
                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, includeESign: checked as boolean }))}
                                className="border-zinc-600 data-[state=checked]:bg-emerald-500"
                            />
                            <Label htmlFor="includeESign" className="text-muted-foreground font-normal">
                                Send for electronic signature
                            </Label>
                        </div>
                        {formData.includeESign && (
                            <div className="bg-muted/50 rounded-lg p-4 mt-4">
                                <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Signing Order
                                </h4>
                                <div className="space-y-3 text-sm">
                                    {/* Signer 1: Current User (Agent or Landlord) */}
                                    <div className="flex justify-between items-center p-2 bg-card rounded">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs text-foreground font-bold">1</div>
                                            <span className="text-muted-foreground">
                                                {formData.isUserLandlord ? 'Landlord (You)' : 'Property Manager (You)'}
                                            </span>
                                        </div>
                                        <span className="text-muted-foreground">{user?.name || 'Current User'}</span>
                                    </div>

                                    {/* Signer 2: Tenant */}
                                    <div className="flex justify-between items-center p-2 bg-card rounded">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs text-foreground font-bold">2</div>
                                            <span className="text-muted-foreground">Tenant</span>
                                        </div>
                                        <span className="text-muted-foreground">{application?.applicantFullName}</span>
                                    </div>

                                    {/* Signer 3: Landlord (only if not user and landlord will sign) */}
                                    {!formData.isUserLandlord && formData.landlordWillSign && (
                                        <div className="flex justify-between items-center p-2 bg-card rounded">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs text-foreground font-bold">3</div>
                                                <span className="text-muted-foreground">Landlord</span>
                                            </div>
                                            <span className="text-muted-foreground">{formData.landlordName || 'Not specified'}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Info message */}
                                <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-600 dark:text-blue-300">
                                    {formData.isUserLandlord ? (
                                        <p>As the landlord, you will sign first, then the tenant will receive the document for signature.</p>
                                    ) : formData.landlordWillSign ? (
                                        <p>You will sign first as the authorized agent, then the tenant, and finally the landlord will receive the document for signature.</p>
                                    ) : (
                                        <p>You will sign on behalf of the landlord as an authorized agent. The tenant will then receive the document for signature.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Additional Terms */}
                <Card className="bg-card border-border md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-foreground">Additional Terms & Conditions</CardTitle>
                        <CardDescription className="text-muted-foreground">Add any custom terms for this specific lease</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            value={formData.additionalTerms}
                            onChange={(e) => setFormData(prev => ({ ...prev, additionalTerms: e.target.value }))}
                            placeholder="Enter any additional terms, conditions, or special agreements..."
                            className="bg-background border-border focus:border-orange-500 min-h-[100px]"
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Lease Preview</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Preview how the lease document will look
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-card rounded-lg p-6 text-foreground">
                        <div dangerouslySetInnerHTML={{ __html: previewHtml || '' }} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Success Dialog */}
            <Dialog open={isSuccessOpen} onOpenChange={() => {}}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            Lease Generated Successfully
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            The lease agreement has been generated and sent for signature.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                            {generatedResult?.tenantId && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Tenant Created</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                                </div>
                            )}
                            {generatedResult?.tenancyId && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Tenancy Created</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                                </div>
                            )}
                            {formData.includeESign && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">E-Signature Requested</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSuccessClose} className="bg-emerald-600 hover:bg-emerald-500">
                            View Lease Details
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
