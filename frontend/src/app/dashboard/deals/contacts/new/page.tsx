'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    ArrowLeft,
    Loader2,
    Save,
    User,
    Building2,
    Phone,
    Mail,
    MapPin,
    Briefcase,
    DollarSign,
    Tag,
    FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { contactsApi } from '@/lib/crm-api'
import { ContactType, LeadStatus, BuyerType } from '@/types/crm'

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({ title, icon: Icon, children, className }: { 
    title: string; 
    icon?: React.ElementType;
    children: React.ReactNode; 
    className?: string;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                {Icon && <Icon className="h-3 w-3 text-amber-500" />}
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

// =====================================================
// FORM FIELD COMPONENT
// =====================================================
function FormField({ label, required, children, className }: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            {children}
        </div>
    )
}

// =====================================================
// REGIONS LIST
// =====================================================
const GHANA_REGIONS = [
    'Greater Accra',
    'Ashanti',
    'Western',
    'Central',
    'Eastern',
    'Northern',
    'Volta',
    'Upper East',
    'Upper West',
    'Brong-Ahafo',
    'Bono East',
    'Ahafo',
    'Savannah',
    'North East',
    'Oti',
    'Western North'
]

// =====================================================
// NEW CONTACT PAGE
// =====================================================
export default function NewContactPage() {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        contact_type: ContactType.FIRST_TIME_BUYER,
        title: '',
        first_name: '',
        last_name: '',
        email: '',
        phone_primary: '',
        phone_secondary: '',
        whatsapp_number: '',
        ghana_post_gps: '',
        region: '',
        city: '',
        address: '',
        occupation: '',
        company_name: '',
        job_title: '',
        income_range: '',
        buyer_type: '' as BuyerType | '',
        budget_min: '',
        budget_max: '',
        lead_status: LeadStatus.NEW,
        lead_source: '',
        tags: '',
        notes: ''
    })

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        // Validation
        if (!formData.first_name.trim()) {
            setError('First name is required')
            return
        }
        if (!formData.last_name.trim()) {
            setError('Last name is required')
            return
        }
        if (!formData.phone_primary.trim()) {
            setError('Primary phone is required')
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const payload: Record<string, any> = {
                contact_type: formData.contact_type,
                first_name: formData.first_name.trim(),
                last_name: formData.last_name.trim(),
                lead_status: formData.lead_status,
                primary_phone: formData.phone_primary.trim()
            }

            // Add optional fields if they have values (using backend field names)
            if (formData.title) payload.title = formData.title
            if (formData.email) payload.email = formData.email.trim()
            if (formData.whatsapp_number) payload.whatsapp_number = formData.whatsapp_number.trim()
            if (formData.ghana_post_gps) payload.digital_address = formData.ghana_post_gps.trim()
            if (formData.region) payload.region = formData.region
            if (formData.city) payload.city = formData.city.trim()
            if (formData.occupation) payload.occupation = formData.occupation.trim()
            if (formData.budget_min) payload.budget_min = parseFloat(formData.budget_min)
            if (formData.budget_max) payload.budget_max = parseFloat(formData.budget_max)
            if (formData.lead_source) payload.lead_source = formData.lead_source
            if (formData.tags) payload.tags = formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
            if (formData.notes) payload.notes = formData.notes.trim()

            const contact = await contactsApi.create(payload)
            router.push(`/dashboard/deals/contacts/${contact.id}`)
        } catch (err: any) {
            console.error('Failed to create contact:', err)
            setError(err.message || 'Failed to create contact. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/deals/contacts">
                            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Contacts
                            </Button>
                        </Link>
                        <div>
                            <h1 className="font-mono text-xl font-bold text-white">NEW CONTACT</h1>
                            <p className="font-mono text-[10px] text-zinc-500">Create a new contact record</p>
                        </div>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-900/20 border border-red-800 text-red-400 font-mono text-xs">
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic Information */}
                    <Panel title="BASIC INFORMATION" icon={User}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField label="Contact Type" required>
                                <Select
                                    value={formData.contact_type}
                                    onValueChange={(value) => handleChange('contact_type', value)}
                                >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ContactType.FIRST_TIME_BUYER}>First Time Buyer</SelectItem>
                                        <SelectItem value={ContactType.REPEAT_BUYER}>Repeat Buyer</SelectItem>
                                        <SelectItem value={ContactType.INVESTOR}>Investor</SelectItem>
                                        <SelectItem value={ContactType.DEVELOPER}>Developer</SelectItem>
                                        <SelectItem value={ContactType.DIASPORA_BUYER}>Diaspora Buyer</SelectItem>
                                        <SelectItem value={ContactType.CORPORATE_BUYER}>Corporate Buyer</SelectItem>
                                        <SelectItem value={ContactType.GOVERNMENT_ENTITY}>Government Entity</SelectItem>
                                        <SelectItem value={ContactType.TENANT}>Tenant</SelectItem>
                                        <SelectItem value={ContactType.LANDLORD}>Landlord</SelectItem>
                                        <SelectItem value={ContactType.AGENT}>Agent</SelectItem>
                                        <SelectItem value={ContactType.LAWYER}>Lawyer</SelectItem>
                                        <SelectItem value={ContactType.OTHER}>Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>

                            <FormField label="Title">
                                <Select
                                    value={formData.title}
                                    onValueChange={(value) => handleChange('title', value)}
                                >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Mr">Mr</SelectItem>
                                        <SelectItem value="Mrs">Mrs</SelectItem>
                                        <SelectItem value="Ms">Ms</SelectItem>
                                        <SelectItem value="Dr">Dr</SelectItem>
                                        <SelectItem value="Prof">Prof</SelectItem>
                                        <SelectItem value="Chief">Chief</SelectItem>
                                        <SelectItem value="Hon">Hon</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>

                            <FormField label="Lead Status" required>
                                <Select
                                    value={formData.lead_status}
                                    onValueChange={(value) => handleChange('lead_status', value)}
                                >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={LeadStatus.NEW}>New</SelectItem>
                                        <SelectItem value={LeadStatus.CONTACTED}>Contacted</SelectItem>
                                        <SelectItem value={LeadStatus.QUALIFIED}>Qualified</SelectItem>
                                        <SelectItem value={LeadStatus.UNQUALIFIED}>Unqualified</SelectItem>
                                        <SelectItem value={LeadStatus.NURTURING}>Nurturing</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <FormField label="First Name" required>
                                <Input
                                    value={formData.first_name}
                                    onChange={(e) => handleChange('first_name', e.target.value)}
                                    placeholder="Enter first name"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Last Name" required>
                                <Input
                                    value={formData.last_name}
                                    onChange={(e) => handleChange('last_name', e.target.value)}
                                    placeholder="Enter last name"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>
                        </div>
                    </Panel>

                    {/* Contact Details */}
                    <Panel title="CONTACT DETAILS" icon={Phone}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Email">
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleChange('email', e.target.value)}
                                    placeholder="email@example.com"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Primary Phone" required>
                                <Input
                                    value={formData.phone_primary}
                                    onChange={(e) => handleChange('phone_primary', e.target.value)}
                                    placeholder="+233 XX XXX XXXX"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Secondary Phone">
                                <Input
                                    value={formData.phone_secondary}
                                    onChange={(e) => handleChange('phone_secondary', e.target.value)}
                                    placeholder="+233 XX XXX XXXX"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="WhatsApp Number">
                                <Input
                                    value={formData.whatsapp_number}
                                    onChange={(e) => handleChange('whatsapp_number', e.target.value)}
                                    placeholder="+233 XX XXX XXXX"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>
                        </div>
                    </Panel>

                    {/* Address */}
                    <Panel title="ADDRESS" icon={MapPin}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Ghana Post GPS">
                                <Input
                                    value={formData.ghana_post_gps}
                                    onChange={(e) => handleChange('ghana_post_gps', e.target.value)}
                                    placeholder="e.g. GA-XXX-XXXX"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Region">
                                <Select
                                    value={formData.region}
                                    onValueChange={(value) => handleChange('region', value)}
                                >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue placeholder="Select region..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {GHANA_REGIONS.map(region => (
                                            <SelectItem key={region} value={region}>{region}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormField>

                            <FormField label="City">
                                <Input
                                    value={formData.city}
                                    onChange={(e) => handleChange('city', e.target.value)}
                                    placeholder="Enter city"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Address">
                                <Input
                                    value={formData.address}
                                    onChange={(e) => handleChange('address', e.target.value)}
                                    placeholder="Street address"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>
                        </div>
                    </Panel>

                    {/* Professional Information */}
                    <Panel title="PROFESSIONAL INFORMATION" icon={Briefcase}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Occupation">
                                <Input
                                    value={formData.occupation}
                                    onChange={(e) => handleChange('occupation', e.target.value)}
                                    placeholder="Enter occupation"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Company Name">
                                <Input
                                    value={formData.company_name}
                                    onChange={(e) => handleChange('company_name', e.target.value)}
                                    placeholder="Enter company name"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Job Title">
                                <Input
                                    value={formData.job_title}
                                    onChange={(e) => handleChange('job_title', e.target.value)}
                                    placeholder="Enter job title"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Income Range">
                                <Select
                                    value={formData.income_range}
                                    onValueChange={(value) => handleChange('income_range', value)}
                                >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue placeholder="Select range..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0-5000">GHS 0 - 5,000</SelectItem>
                                        <SelectItem value="5000-10000">GHS 5,000 - 10,000</SelectItem>
                                        <SelectItem value="10000-20000">GHS 10,000 - 20,000</SelectItem>
                                        <SelectItem value="20000-50000">GHS 20,000 - 50,000</SelectItem>
                                        <SelectItem value="50000-100000">GHS 50,000 - 100,000</SelectItem>
                                        <SelectItem value="100000+">GHS 100,000+</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                        </div>
                    </Panel>

                    {/* Buyer Profile */}
                    <Panel title="BUYER PROFILE" icon={DollarSign}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField label="Buyer Type">
                                <Select
                                    value={formData.buyer_type}
                                    onValueChange={(value) => handleChange('buyer_type', value)}
                                >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue placeholder="Select type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={BuyerType.FIRST_TIME}>First Time Buyer</SelectItem>
                                        <SelectItem value={BuyerType.INVESTOR}>Investor</SelectItem>
                                        <SelectItem value={BuyerType.RELOCATING}>Relocating</SelectItem>
                                        <SelectItem value={BuyerType.UPGRADING}>Upgrading</SelectItem>
                                        <SelectItem value={BuyerType.DOWNSIZING}>Downsizing</SelectItem>
                                        <SelectItem value={BuyerType.DEVELOPER}>Developer</SelectItem>
                                        <SelectItem value={BuyerType.INSTITUTIONAL}>Institutional</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>

                            <FormField label="Budget Min (GHS)">
                                <Input
                                    type="number"
                                    value={formData.budget_min}
                                    onChange={(e) => handleChange('budget_min', e.target.value)}
                                    placeholder="0"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>

                            <FormField label="Budget Max (GHS)">
                                <Input
                                    type="number"
                                    value={formData.budget_max}
                                    onChange={(e) => handleChange('budget_max', e.target.value)}
                                    placeholder="0"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>
                        </div>
                    </Panel>

                    {/* Lead Information */}
                    <Panel title="LEAD INFORMATION" icon={Tag}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Lead Source">
                                <Select
                                    value={formData.lead_source}
                                    onValueChange={(value) => handleChange('lead_source', value)}
                                >
                                    <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                                        <SelectValue placeholder="Select source..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="website">Website</SelectItem>
                                        <SelectItem value="referral">Referral</SelectItem>
                                        <SelectItem value="social_media">Social Media</SelectItem>
                                        <SelectItem value="walk_in">Walk In</SelectItem>
                                        <SelectItem value="phone_inquiry">Phone Inquiry</SelectItem>
                                        <SelectItem value="email_campaign">Email Campaign</SelectItem>
                                        <SelectItem value="property_listing">Property Listing</SelectItem>
                                        <SelectItem value="event">Event</SelectItem>
                                        <SelectItem value="partner">Partner</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>

                            <FormField label="Tags (comma separated)">
                                <Input
                                    value={formData.tags}
                                    onChange={(e) => handleChange('tags', e.target.value)}
                                    placeholder="e.g. vip, hot-lead, follow-up"
                                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                                />
                            </FormField>
                        </div>
                    </Panel>

                    {/* Notes */}
                    <Panel title="NOTES" icon={FileText}>
                        <FormField label="Additional Notes">
                            <Textarea
                                value={formData.notes}
                                onChange={(e) => handleChange('notes', e.target.value)}
                                placeholder="Enter any additional notes about this contact..."
                                rows={4}
                                className="bg-zinc-800 border-zinc-700 font-mono text-sm resize-none"
                            />
                        </FormField>
                    </Panel>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4">
                        <Link href="/dashboard/deals/contacts">
                            <Button type="button" variant="outline" className="border-zinc-700 text-zinc-400">
                                Cancel
                            </Button>
                        </Link>
                        <Button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-mono"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Create Contact
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}
