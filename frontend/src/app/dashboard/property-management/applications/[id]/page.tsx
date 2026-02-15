'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    ArrowLeft,
    FileText,
    Loader2,
    Phone,
    Mail,
    CheckCircle2,
    XCircle,
    Clock,
    Building2,
    Calendar,
    User,
    Briefcase,
    MapPin,
    Home,
    Users,
    PawPrint,
    AlertCircle,
    PlayCircle,
    UserCheck,
    Eye,
    Send,
    X,
    History
} from 'lucide-react'
import { propertyManagementApi, Application, ApplicationStatus, ApplicationStatusChange } from '@/lib/property-management-api'
import { format } from 'date-fns'
import Link from 'next/link'

export default function ApplicationDetailPage() {
    const router = useRouter()
    const params = useParams()
    const applicationId = params.id as string
    
    const [application, setApplication] = useState<Application | null>(null)
    const [history, setHistory] = useState<ApplicationStatusChange[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    
    // Action dialogs
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
    const [rejectionReason, setRejectionReason] = useState('')
    const [approvalNotes, setApprovalNotes] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)

    useEffect(() => {
        if (applicationId) {
            loadApplication()
        }
    }, [applicationId])

    const loadApplication = async () => {
        try {
            setIsLoading(true)
            const [appData, historyData] = await Promise.all([
                propertyManagementApi.getApplicationById(applicationId),
                propertyManagementApi.getApplicationHistory(applicationId)
            ])
            setApplication(appData)
            setHistory(historyData)
        } catch (err) {
            console.error('Failed to load application:', err)
            setError('Failed to load application details.')
        } finally {
            setIsLoading(false)
        }
    }

    const getStatusBadge = (status: ApplicationStatus) => {
        const config: Record<ApplicationStatus, { color: string; icon: React.ReactNode; label: string }> = {
            [ApplicationStatus.DRAFT]: { 
                color: 'border-zinc-700 text-zinc-400 bg-zinc-800/20', 
                icon: <Clock className="h-3 w-3" />, 
                label: 'Draft' 
            },
            [ApplicationStatus.SUBMITTED]: { 
                color: 'border-blue-900 text-blue-400 bg-blue-900/20', 
                icon: <Send className="h-3 w-3" />, 
                label: 'Submitted' 
            },
            [ApplicationStatus.UNDER_REVIEW]: { 
                color: 'border-amber-900 text-amber-400 bg-amber-900/20', 
                icon: <Eye className="h-3 w-3" />, 
                label: 'Under Review' 
            },
            [ApplicationStatus.APPROVED]: { 
                color: 'border-green-900 text-green-400 bg-green-900/20', 
                icon: <CheckCircle2 className="h-3 w-3" />, 
                label: 'Approved' 
            },
            [ApplicationStatus.REJECTED]: { 
                color: 'border-red-900 text-red-400 bg-red-900/20', 
                icon: <XCircle className="h-3 w-3" />, 
                label: 'Rejected' 
            },
            [ApplicationStatus.WITHDRAWN]: { 
                color: 'border-zinc-700 text-zinc-500 bg-zinc-800/20', 
                icon: <X className="h-3 w-3" />, 
                label: 'Withdrawn' 
            },
            [ApplicationStatus.LEASE_GENERATED]: { 
                color: 'border-emerald-900 text-emerald-400 bg-emerald-900/20', 
                icon: <FileText className="h-3 w-3" />, 
                label: 'Lease Generated' 
            },
            [ApplicationStatus.EXPIRED]: { 
                color: 'border-zinc-700 text-zinc-500 bg-zinc-800/20', 
                icon: <Clock className="h-3 w-3" />, 
                label: 'Expired' 
            }
        }
        const { color, icon, label } = config[status] || config[ApplicationStatus.DRAFT]
        return (
            <Badge variant="outline" className={`${color} gap-1 px-3 py-1`}>
                {icon} {label}
            </Badge>
        )
    }

    // Actions
    const handleStartReview = async () => {
        if (!application) return
        try {
            setIsProcessing(true)
            await propertyManagementApi.startReviewApplication(application.id)
            await loadApplication()
        } catch (err) {
            console.error('Failed to start review:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleApprove = async () => {
        if (!application) return
        try {
            setIsProcessing(true)
            await propertyManagementApi.approveApplication(application.id, approvalNotes || undefined)
            setIsApproveDialogOpen(false)
            setApprovalNotes('')
            await loadApplication()
        } catch (err) {
            console.error('Failed to approve:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleReject = async () => {
        if (!application || !rejectionReason.trim()) return
        try {
            setIsProcessing(true)
            await propertyManagementApi.rejectApplication(application.id, rejectionReason)
            setIsRejectDialogOpen(false)
            setRejectionReason('')
            await loadApplication()
        } catch (err) {
            console.error('Failed to reject:', err)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleGenerateLease = () => {
        if (!application) return
        // Navigate to the lease generation page for this application
        router.push(`/dashboard/property-management/applications/${application.id}/generate-lease`)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        )
    }

    if (error || !application) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <p className="text-zinc-400">{error || 'Application not found'}</p>
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go Back
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => router.push('/dashboard/property-management/applications')}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-white">{application.applicantFullName}</h1>
                            {getStatusBadge(application.status)}
                        </div>
                        <p className="text-zinc-400 mt-1">
                            Applied for {application.propertyName || 'Property'} • {format(new Date(application.createdAt), 'MMMM d, yyyy')}
                        </p>
                    </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                    {application.status === ApplicationStatus.SUBMITTED && (
                        <Button 
                            onClick={handleStartReview}
                            disabled={isProcessing}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Start Review
                        </Button>
                    )}
                    
                    {application.status === ApplicationStatus.UNDER_REVIEW && (
                        <>
                            <Button 
                                onClick={() => setIsApproveDialogOpen(true)}
                                disabled={isProcessing}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                            </Button>
                            <Button 
                                onClick={() => setIsRejectDialogOpen(true)}
                                disabled={isProcessing}
                                variant="destructive"
                            >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                            </Button>
                        </>
                    )}
                    
                    {application.status === ApplicationStatus.APPROVED && !application.tenantId && (
                        <Button 
                            onClick={handleGenerateLease}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            <FileText className="h-4 w-4 mr-2" />
                            Generate Lease
                        </Button>
                    )}
                    
                    {application.tenantId && (
                        <Link href={`/dashboard/property-management/tenants/${application.tenantId}`}>
                            <Button variant="outline">
                                <User className="h-4 w-4 mr-2" />
                                View Tenant
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* Status Messages */}
            {application.status === ApplicationStatus.REJECTED && application.rejectionReason && (
                <Card className="bg-red-900/20 border-red-900">
                    <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                            <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-400">Application Rejected</p>
                                <p className="text-zinc-400 mt-1">{application.rejectionReason}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {application.status === ApplicationStatus.APPROVED && application.approvalNotes && (
                <Card className="bg-green-900/20 border-green-900">
                    <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5" />
                            <div>
                                <p className="font-medium text-green-400">Application Approved</p>
                                <p className="text-zinc-400 mt-1">{application.approvalNotes}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lease Signed - Tenant Created Banner */}
            {/* Only show when lease is actually signed (has envelopeId with completed status or explicit signed flag) */}
            {application.tenantId && application.envelopeId && application.status === 'lease_signed' && (
                <Card className="bg-emerald-900/20 border-emerald-900">
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <UserCheck className="h-5 w-5 text-emerald-400 mt-0.5" />
                                <div>
                                    <p className="font-medium text-emerald-400">Lease Signed - Tenant Record Created</p>
                                    <p className="text-zinc-400 mt-1">
                                        The lease has been signed and this applicant is now a tenant.
                                        All personal details, employment information, and references have been transferred to the tenant system.
                                    </p>
                                </div>
                            </div>
                            <Link href={`/dashboard/property-management/tenants/${application.tenantId}`}>
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    View Tenant Record
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lease Generated - Awaiting Signature Banner */}
            {/* Show only when status is lease_generated */}
            {application.status === ApplicationStatus.LEASE_GENERATED && (
                <Card className="bg-amber-900/20 border-amber-900">
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <Send className="h-5 w-5 text-amber-400 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-400">Lease Generated - Awaiting Signature</p>
                                    <p className="text-zinc-400 mt-1">
                                        The lease agreement has been generated. Continue to the e-sign wizard to place signature fields and send for signing.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {application.envelopeId ? (
                                    <Link href={`/dashboard/e-sign/envelopes/${application.envelopeId}?return=/dashboard/property-management/applications/${application.id}`}>
                                        <Button 
                                            variant="outline"
                                            size="sm"
                                            className="border-amber-700 text-amber-400 hover:bg-amber-900/30"
                                        >
                                            <Eye className="h-4 w-4 mr-2" />
                                            View Envelope
                                        </Button>
                                    </Link>
                                ) : (
                                    <Link href={`/dashboard/property-management/applications/${application.id}/generate-lease`}>
                                        <Button className="bg-emerald-600 hover:bg-emerald-700">
                                            <FileText className="h-4 w-4 mr-2" />
                                            Continue to E-Sign
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lease Sent - Awaiting Signature Banner (legacy - for old leases without tenantId set during generation) */}
            {application.status === ApplicationStatus.LEASE_GENERATED && !application.tenantId && (
                <Card className="bg-amber-900/20 border-amber-900">
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <Send className="h-5 w-5 text-amber-400 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-400">Lease Sent - Awaiting Signature</p>
                                    <p className="text-zinc-400 mt-1">
                                        The lease agreement has been sent to <span className="text-white">{application.applicantEmail}</span> for signature.
                                        Once the tenant signs the lease, they will automatically be converted to a tenant record.
                                    </p>
                                    {!application.envelopeId && (
                                        <p className="text-zinc-500 text-xs mt-2">
                                            <AlertCircle className="h-3 w-3 inline mr-1" />
                                            This lease was created before envelope tracking. Regenerate to enable View/Void/Resend.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {application.envelopeId ? (
                                    <>
                                        <Link href={`/dashboard/e-sign/envelopes/${application.envelopeId}?return=/dashboard/property-management/applications/${application.id}`}>
                                            <Button 
                                                variant="outline"
                                                size="sm"
                                                className="border-amber-700 text-amber-400 hover:bg-amber-900/30"
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                View Lease
                                            </Button>
                                        </Link>
                                        <Button 
                                            variant="outline"
                                            size="sm"
                                            className="border-amber-700 text-amber-400 hover:bg-amber-900/30"
                                        >
                                            <Mail className="h-4 w-4 mr-2" />
                                            Resend Email
                                        </Button>
                                    </>
                                ) : (
                                    <Button 
                                        onClick={handleGenerateLease}
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        <FileText className="h-4 w-4 mr-2" />
                                        Regenerate Lease
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Generate Lease Info Banner (when approved but no lease yet) */}
            {application.status === ApplicationStatus.APPROVED && !application.tenantId && (
                <Card className="bg-blue-900/20 border-blue-900">
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <FileText className="h-5 w-5 text-blue-400 mt-0.5" />
                                <div>
                                    <p className="font-medium text-blue-400">Ready to Generate Lease</p>
                                    <p className="text-zinc-400 mt-1">
                                        Click "Generate Lease" to create the lease agreement using this applicant's information.
                                        Once the lease is signed, the applicant will be converted to a tenant.
                                    </p>
                                </div>
                            </div>
                            <Button 
                                onClick={handleGenerateLease}
                                className="bg-emerald-600 hover:bg-emerald-700"
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                Generate Lease
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Personal Information */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <User className="h-5 w-5 text-blue-400" />
                                Personal Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-zinc-500">Full Name</p>
                                    <p className="text-white">{application.applicantFullName}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Ghana Card Number</p>
                                    <p className="text-white">{application.applicantGhanaCard || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Email</p>
                                    <p className="text-white flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-zinc-500" />
                                        {application.applicantEmail}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Phone</p>
                                    <p className="text-white flex items-center gap-2">
                                        <Phone className="h-4 w-4 text-zinc-500" />
                                        {application.applicantPhone}
                                    </p>
                                </div>
                                {application.applicantPhoneSecondary && (
                                    <div>
                                        <p className="text-sm text-zinc-500">Secondary Phone</p>
                                        <p className="text-white">{application.applicantPhoneSecondary}</p>
                                    </div>
                                )}
                                {application.applicantDateOfBirth && (
                                    <div>
                                        <p className="text-sm text-zinc-500">Date of Birth</p>
                                        <p className="text-white">{format(new Date(application.applicantDateOfBirth), 'MMMM d, yyyy')}</p>
                                    </div>
                                )}
                            </div>
                            
                            <Separator className="bg-zinc-800" />
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <p className="text-sm text-zinc-500">Current Address</p>
                                    <p className="text-white flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-zinc-500" />
                                        {application.applicantCurrentAddress || '-'}
                                    </p>
                                </div>
                                {application.applicantDigitalAddress && (
                                    <div>
                                        <p className="text-sm text-zinc-500">Digital Address</p>
                                        <p className="text-white">{application.applicantDigitalAddress}</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Employment Information */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Briefcase className="h-5 w-5 text-amber-400" />
                                Employment Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-zinc-500">Occupation</p>
                                    <p className="text-white">{application.occupation || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Employer</p>
                                    <p className="text-white">{application.employerName || '-'}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-sm text-zinc-500">Employer Address</p>
                                    <p className="text-white">{application.employerAddress || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Employer Phone</p>
                                    <p className="text-white">{application.employerPhone || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Monthly Income</p>
                                    <p className="text-white font-medium">
                                        {application.monthlyIncome 
                                            ? `GH₵ ${application.monthlyIncome.toLocaleString()}`
                                            : '-'}
                                    </p>
                                </div>
                                {application.employmentDurationMonths && (
                                    <div>
                                        <p className="text-sm text-zinc-500">Employment Duration</p>
                                        <p className="text-white">{application.employmentDurationMonths} months</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Lease Preferences */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Home className="h-5 w-5 text-green-400" />
                                Lease Preferences
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-zinc-500">Desired Move-in Date</p>
                                    <p className="text-white flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-zinc-500" />
                                        {application.desiredMoveInDate 
                                            ? format(new Date(application.desiredMoveInDate), 'MMMM d, yyyy')
                                            : 'Not specified'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Lease Term</p>
                                    <p className="text-white">{application.desiredLeaseTermMonths} months</p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Number of Occupants</p>
                                    <p className="text-white flex items-center gap-2">
                                        <Users className="h-4 w-4 text-zinc-500" />
                                        {application.numberOfOccupants}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Pets</p>
                                    <p className="text-white flex items-center gap-2">
                                        <PawPrint className="h-4 w-4 text-zinc-500" />
                                        {application.hasPets ? 'Yes' : 'No'}
                                    </p>
                                </div>
                                {application.hasPets && application.petDetails && (
                                    <div className="col-span-2">
                                        <p className="text-sm text-zinc-500">Pet Details</p>
                                        <p className="text-white">{application.petDetails}</p>
                                    </div>
                                )}
                                {application.reasonForMoving && (
                                    <div className="col-span-2">
                                        <p className="text-sm text-zinc-500">Reason for Moving</p>
                                        <p className="text-white">{application.reasonForMoving}</p>
                                    </div>
                                )}
                                {application.specialRequirements && (
                                    <div className="col-span-2">
                                        <p className="text-sm text-zinc-500">Special Requirements</p>
                                        <p className="text-white">{application.specialRequirements}</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Emergency Contact */}
                    {application.emergencyContactName && (
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5 text-red-400" />
                                    Emergency Contact
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-sm text-zinc-500">Name</p>
                                        <p className="text-white">{application.emergencyContactName}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-500">Relationship</p>
                                        <p className="text-white">{application.emergencyContactRelationship || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-500">Phone</p>
                                        <p className="text-white">{application.emergencyContactPhone || '-'}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* References */}
                    {application.characterReferences && application.characterReferences.length > 0 && (
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-white">Character References</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {application.characterReferences.map((ref, idx) => (
                                        <div key={idx} className="p-3 bg-zinc-800/50 rounded-lg">
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <p className="text-sm text-zinc-500">Name</p>
                                                    <p className="text-white">{ref.name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-zinc-500">Relationship</p>
                                                    <p className="text-white">{ref.relationship}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-zinc-500">Phone</p>
                                                    <p className="text-white">{ref.phone}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Previous Addresses */}
                    {application.previousAddresses && application.previousAddresses.length > 0 && (
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-white">Previous Addresses</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {application.previousAddresses.map((addr, idx) => (
                                        <div key={idx} className="p-3 bg-zinc-800/50 rounded-lg">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="col-span-2">
                                                    <p className="text-sm text-zinc-500">Address</p>
                                                    <p className="text-white">{addr.address}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-zinc-500">Duration</p>
                                                    <p className="text-white">{addr.duration}</p>
                                                </div>
                                                {addr.landlordName && (
                                                    <div>
                                                        <p className="text-sm text-zinc-500">Landlord</p>
                                                        <p className="text-white">{addr.landlordName} {addr.landlordPhone && `(${addr.landlordPhone})`}</p>
                                                    </div>
                                                )}
                                                {addr.reasonForLeaving && (
                                                    <div className="col-span-2">
                                                        <p className="text-sm text-zinc-500">Reason for Leaving</p>
                                                        <p className="text-white">{addr.reasonForLeaving}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Property Info */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-blue-400" />
                                Property
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-white font-medium">{application.propertyName || 'Unknown Property'}</p>
                            {application.propertyAddress && (
                                <p className="text-zinc-400 text-sm mt-1">{application.propertyAddress}</p>
                            )}
                            <Link href={`/dashboard/property-management/properties/${application.propertyId}`}>
                                <Button variant="outline" size="sm" className="mt-3 w-full">
                                    View Property
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Timeline */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <History className="h-5 w-5 text-zinc-400" />
                                Status History
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {/* Current Status */}
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                                    <div>
                                        <p className="text-white text-sm font-medium">
                                            Application Created
                                        </p>
                                        <p className="text-zinc-500 text-xs">
                                            {format(new Date(application.createdAt), 'MMM d, yyyy h:mm a')}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* History entries */}
                                {history.map((entry, idx) => (
                                    <div key={entry.id} className="flex items-start gap-3">
                                        <div className={`w-2 h-2 rounded-full mt-2 ${
                                            entry.toStatus === ApplicationStatus.APPROVED ? 'bg-green-500' :
                                            entry.toStatus === ApplicationStatus.REJECTED ? 'bg-red-500' :
                                            entry.toStatus === ApplicationStatus.UNDER_REVIEW ? 'bg-amber-500' :
                                            'bg-zinc-500'
                                        }`} />
                                        <div>
                                            <p className="text-white text-sm font-medium">
                                                {entry.fromStatus 
                                                    ? `${formatStatus(entry.fromStatus)} → ${formatStatus(entry.toStatus)}`
                                                    : formatStatus(entry.toStatus)}
                                            </p>
                                            {entry.changedBy && (
                                                <p className="text-zinc-400 text-xs">by {entry.changedBy}</p>
                                            )}
                                            {entry.reason && (
                                                <p className="text-zinc-500 text-xs mt-1">{entry.reason}</p>
                                            )}
                                            <p className="text-zinc-500 text-xs">
                                                {format(new Date(entry.changedAt), 'MMM d, yyyy h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Documents */}
                    {application.uploadedDocuments && application.uploadedDocuments.length > 0 && (
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-zinc-400" />
                                    Documents
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {application.uploadedDocuments.map((doc, idx) => (
                                        <a 
                                            key={idx} 
                                            href={doc.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded hover:bg-zinc-800 transition-colors"
                                        >
                                            <FileText className="h-4 w-4 text-zinc-500" />
                                            <span className="text-white text-sm truncate">{doc.filename || doc.type}</span>
                                        </a>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Source */}
                    {application.howDidYouHear && (
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardContent className="pt-4">
                                <p className="text-sm text-zinc-500">How did you hear about us?</p>
                                <p className="text-white">{application.howDidYouHear}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Approve Dialog */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Approve Application</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Approve application from {application.applicantFullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-zinc-400">Approval Notes (Optional)</Label>
                            <Textarea
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                placeholder="Add any notes about this approval..."
                                className="bg-zinc-800 border-zinc-700 text-white mt-2"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsApproveDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleApprove}
                            disabled={isProcessing}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Approve Application
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <DialogContent className="bg-zinc-900 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Reject Application</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Reject application from {application.applicantFullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-zinc-400">Rejection Reason (Required)</Label>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Enter the reason for rejection..."
                                className="bg-zinc-800 border-zinc-700 text-white mt-2"
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsRejectDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleReject}
                            disabled={isProcessing || !rejectionReason.trim()}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Reject Application
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function formatStatus(status: ApplicationStatus): string {
    const labels: Record<ApplicationStatus, string> = {
        [ApplicationStatus.DRAFT]: 'Draft',
        [ApplicationStatus.SUBMITTED]: 'Submitted',
        [ApplicationStatus.UNDER_REVIEW]: 'Under Review',
        [ApplicationStatus.APPROVED]: 'Approved',
        [ApplicationStatus.REJECTED]: 'Rejected',
        [ApplicationStatus.WITHDRAWN]: 'Withdrawn',
        [ApplicationStatus.LEASE_GENERATED]: 'Lease Generated',
        [ApplicationStatus.EXPIRED]: 'Expired'
    }
    return labels[status] || status
}
