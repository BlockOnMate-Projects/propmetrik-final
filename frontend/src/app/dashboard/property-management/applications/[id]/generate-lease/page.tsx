'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ESignEditor, Signer, SignerRole } from '@/components/e-sign'
import { propertyManagementApi, Application, esignApi, CreateEnvelopeDto } from '@/lib/property-management-api'
import { generateLeaseAgreementHTML, LeaseAgreementData } from '@/lib/lease-generator'

export default function ApplicationLeaseGeneratorPage() {
    const router = useRouter()
    const params = useParams()
    const applicationId = params.id as string
    
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [application, setApplication] = useState<Application | null>(null)
    const [property, setProperty] = useState<any | null>(null)
    const [leaseHtml, setLeaseHtml] = useState<string>('')
    const [landlordInfo] = useState({
        fullName: 'Property Owner',
        address: '',
        phone: '',
        email: ''
    })

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

                // Calculate lease dates from application
                const leaseStartDate = appData.desiredMoveInDate 
                    ? new Date(appData.desiredMoveInDate) 
                    : new Date()
                const leaseEndDate = new Date(leaseStartDate)
                leaseEndDate.setMonth(leaseEndDate.getMonth() + (appData.desiredLeaseTermMonths || 12))

                // Generate lease HTML from application data
                const leaseData: LeaseAgreementData = {
                    landlord: {
                        fullName: landlordInfo.fullName || '[LANDLORD NAME]',
                        address: landlordInfo.address || '[LANDLORD ADDRESS]',
                        phone: landlordInfo.phone || '[LANDLORD PHONE]',
                        email: landlordInfo.email,
                        ghanaCardNumber: ''
                    },
                    tenant: {
                        fullName: appData.applicantFullName,
                        address: appData.applicantCurrentAddress || appData.applicantDigitalAddress || 'N/A',
                        phone: appData.applicantPhone || 'N/A',
                        ghanaCardNumber: appData.applicantGhanaCard || 'N/A',
                        email: appData.applicantEmail,
                        occupation: appData.occupation,
                        employer: appData.employerName
                    },
                    property: {
                        title: propertyData?.title || appData.propertyName || 'Property',
                        addressStreet: propertyData?.addressStreet || appData.propertyAddress || '',
                        addressCity: propertyData?.addressCity || '',
                        addressRegion: propertyData?.region || 'Greater Accra',
                        digitalAddress: propertyData?.digitalAddress,
                        propertyType: propertyData?.propertyType || 'Apartment',
                        bedrooms: propertyData?.bedrooms,
                        bathrooms: propertyData?.bathrooms
                    },
                    terms: {
                        leaseStartDate: leaseStartDate.toISOString(),
                        leaseEndDate: leaseEndDate.toISOString(),
                        monthlyRent: propertyData?.price || 0,
                        rentCurrency: propertyData?.priceCurrency || 'GHS',
                        advanceMonths: 2,
                        securityDepositMonths: 1,
                        paymentDueDay: 1,
                        paymentMethod: 'mobile_money',
                        latePaymentPenaltyPercent: 5,
                        latePaymentGraceDays: 7,
                        noticePeriodMonths: 1,
                        useType: 'residential',
                        maxOccupants: appData.numberOfOccupants || 4,
                        petsAllowed: appData.hasPets || false,
                        tenantUtilities: ['Electricity', 'Water', 'Internet/Cable', 'Waste Collection'],
                        landlordUtilities: ['Gas'],
                        includedAmenities: [],
                        disputeResolutionCity: 'Accra'
                    },
                    generatedAt: new Date()
                }

                const html = generateLeaseAgreementHTML(leaseData)
                setLeaseHtml(html)
            } catch (err) {
                console.error('Failed to load application:', err)
                setError('Failed to load application data')
            } finally {
                setIsLoading(false)
            }
        }

        loadData()
    }, [applicationId, landlordInfo])

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
            onCancel={handleCancel}
        />
    )
}
