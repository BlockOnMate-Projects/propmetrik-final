'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ESignEditor, Signer, SignerRole, SIGNER_COLORS } from '@/components/e-sign'
import { propertyManagementApi } from '@/lib/property-management-api'
import { generateLeaseAgreementHTML, LeaseAgreementData } from '@/lib/lease-generator'
import { Tenancy } from '@/types/property-management'

export default function LeaseESignPage() {
    const router = useRouter()
    const params = useParams()
    const tenancyId = params.tenancyId as string
    
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tenancy, setTenancy] = useState<Tenancy | null>(null)
    const [leaseHtml, setLeaseHtml] = useState<string>('')
    const [landlordInfo, setLandlordInfo] = useState({
        fullName: '',
        address: '',
        phone: '',
        email: ''
    })

    // Load tenancy data
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true)
                const tenancyData = await propertyManagementApi.getTenancyById(tenancyId)
                setTenancy(tenancyData)

                // Generate lease HTML
                const leaseData: LeaseAgreementData = {
                    landlord: {
                        fullName: landlordInfo.fullName || '[LANDLORD NAME]',
                        address: landlordInfo.address || '[LANDLORD ADDRESS]',
                        phone: landlordInfo.phone || '[LANDLORD PHONE]',
                        email: landlordInfo.email,
                        ghanaCardNumber: ''
                    },
                    tenant: {
                        fullName: tenancyData.tenant?.fullName || 'Tenant',
                        address: tenancyData.tenant?.currentAddress || tenancyData.tenant?.digitalAddress || 'N/A',
                        phone: tenancyData.tenant?.phonePrimary || 'N/A',
                        ghanaCardNumber: tenancyData.tenant?.ghanaCardNumber || 'N/A',
                        email: tenancyData.tenant?.email,
                        occupation: tenancyData.tenant?.occupation,
                        employer: tenancyData.tenant?.employerName
                    },
                    property: {
                        title: tenancyData.property?.title || 'Property',
                        addressStreet: tenancyData.property?.addressStreet || tenancyData.property?.address || '',
                        addressCity: tenancyData.property?.addressCity || '',
                        addressRegion: tenancyData.property?.addressRegion || 'Greater Accra',
                        digitalAddress: tenancyData.property?.digitalAddress,
                        propertyType: tenancyData.property?.propertyType || 'Apartment',
                        bedrooms: tenancyData.property?.bedrooms,
                        bathrooms: tenancyData.property?.bathrooms
                    },
                    terms: {
                        leaseStartDate: tenancyData.leaseStartDate,
                        leaseEndDate: tenancyData.leaseEndDate,
                        monthlyRent: tenancyData.monthlyRent || 0,
                        rentCurrency: tenancyData.rentCurrency || 'GHS',
                        advanceMonths: tenancyData.advancePaymentMonths || 2,
                        securityDepositMonths: 1,
                        paymentDueDay: tenancyData.rentDueDay || 1,
                        paymentMethod: 'mobile_money',
                        latePaymentPenaltyPercent: 5,
                        latePaymentGraceDays: tenancyData.lateFeeGraceDays || 7,
                        noticePeriodMonths: 1,
                        useType: 'residential',
                        maxOccupants: 4,
                        petsAllowed: false,
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
                console.error('Failed to load tenancy:', err)
                setError('Failed to load lease data')
            } finally {
                setIsLoading(false)
            }
        }

        loadData()
    }, [tenancyId, landlordInfo])

    // Default signers for lease
    const defaultSigners: Partial<Signer>[] = tenancy ? [
        {
            id: 'landlord',
            role: 'signer_1' as SignerRole,
            name: landlordInfo.fullName || 'Landlord',
            email: landlordInfo.email || '',
            order: 1
        },
        {
            id: 'tenant',
            role: 'signer_2' as SignerRole,
            name: tenancy.tenant?.fullName || '',
            email: tenancy.tenant?.email || '',
            phone: tenancy.tenant?.phonePrimary,
            order: 2
        }
    ] : []

    // Handle save
    const handleSave = async (envelope: any) => {
        console.log('Saving draft:', envelope)
        // TODO: Save to backend
    }

    // Handle send
    const handleSend = async (envelope: any) => {
        console.log('Sending for signatures:', envelope)
        
        // In production, this would:
        // 1. Convert HTML to PDF
        // 2. Upload PDF to storage
        // 3. Create signing request via API
        // 4. Send magic links to external signers
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Navigate back to tenant page with success
        router.push(`/dashboard/property-management/tenants/${tenancy?.tenantId}?lease_sent=true`)
    }

    // Handle cancel
    const handleCancel = () => {
        router.push(`/dashboard/property-management/tenants/${tenancy?.tenantId}`)
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
            documentName={`Tenancy Agreement - ${tenancy?.property?.title || 'Property'}`}
            context={{
                type: 'lease',
                entityId: tenancyId,
                entityName: `${tenancy?.tenant?.fullName} @ ${tenancy?.property?.title}`
            }}
            defaultSigners={defaultSigners}
            onSave={handleSave}
            onSend={handleSend}
            onCancel={handleCancel}
        />
    )
}
