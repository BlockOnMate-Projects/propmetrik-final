'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    ArrowLeft,
    Loader2,
    Save,
    User,
    Phone,
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
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { contactFormSchema, type ContactFormValues } from '@/lib/schemas/crm.schemas'
import { useCreateContact } from '@/hooks/crm/use-contacts'
import { ContactType, LeadStatus, BuyerType } from '@/types/crm'

// =====================================================
// PANEL COMPONENT (themed)
// =====================================================
function Panel({ title, icon: Icon, children, className }: {
    title: string
    icon?: React.ElementType
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn('border border-border rounded-lg bg-card', className)}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border rounded-t-lg">
                {Icon && <Icon className="h-3 w-3 text-primary" />}
                <span className="text-[10px] font-medium text-primary tracking-wider uppercase">{title}</span>
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

// =====================================================
// FORM FIELD COMPONENT
// =====================================================
function FormField({ label, required, error, children, className }: {
    label: string
    required?: boolean
    error?: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {label}
                {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {children}
            {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>
    )
}

// =====================================================
// REGIONS LIST
// =====================================================
const GHANA_REGIONS = [
    'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Northern',
    'Volta', 'Upper East', 'Upper West', 'Brong-Ahafo', 'Bono East', 'Ahafo',
    'Savannah', 'North East', 'Oti', 'Western North'
]

// =====================================================
// NEW CONTACT PAGE
// =====================================================
export default function NewContactPage() {
    const router = useRouter()
    const createContact = useCreateContact()

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<ContactFormValues>({
        resolver: zodResolver(contactFormSchema),
        defaultValues: {
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
            buyer_type: '',
            budget_min: '',
            budget_max: '',
            lead_status: LeadStatus.NEW,
            lead_source: '',
            tags: '',
            notes: '',
        },
    })

    const onSubmit = async (data: ContactFormValues) => {
        try {
            const payload: Record<string, any> = {
                contact_type: data.contact_type,
                first_name: data.first_name.trim(),
                last_name: data.last_name.trim(),
                lead_status: data.lead_status,
                primary_phone: data.phone_primary.trim(),
            }

            if (data.title) payload.title = data.title
            if (data.email) payload.email = data.email.trim()
            if (data.whatsapp_number) payload.whatsapp_number = data.whatsapp_number.trim()
            if (data.ghana_post_gps) payload.digital_address = data.ghana_post_gps.trim()
            if (data.region) payload.region = data.region
            if (data.city) payload.city = data.city.trim()
            if (data.occupation) payload.occupation = data.occupation.trim()
            if (data.budget_min) payload.budget_min = parseFloat(data.budget_min)
            if (data.budget_max) payload.budget_max = parseFloat(data.budget_max)
            if (data.lead_source) payload.lead_source = data.lead_source
            if (data.tags) payload.tags = data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
            if (data.notes) payload.notes = data.notes.trim()

            const contact = await createContact.mutateAsync(payload)
            toast.success('Contact created')
            router.push(`/dashboard/deals/contacts/${contact.id}`)
        } catch (err: any) {
            toast.error(err.message || 'Failed to create contact')
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/deals/contacts">
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Contacts
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">New Contact</h1>
                        <p className="text-xs text-muted-foreground mt-1">Create a new contact record</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Basic Information */}
                <Panel title="BASIC INFORMATION" icon={User}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="Contact Type" required error={errors.contact_type?.message}>
                            <Controller
                                name="contact_type"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
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
                                )}
                            />
                        </FormField>

                        <FormField label="Title">
                            <Controller
                                name="title"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
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
                                )}
                            />
                        </FormField>

                        <FormField label="Lead Status" required error={errors.lead_status?.message}>
                            <Controller
                                name="lead_status"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={LeadStatus.NEW}>New</SelectItem>
                                            <SelectItem value={LeadStatus.CONTACTED}>Contacted</SelectItem>
                                            <SelectItem value={LeadStatus.QUALIFIED}>Qualified</SelectItem>
                                            <SelectItem value={LeadStatus.UNQUALIFIED}>Unqualified</SelectItem>
                                            <SelectItem value={LeadStatus.NURTURING}>Nurturing</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <FormField label="First Name" required error={errors.first_name?.message}>
                            <Input {...register('first_name')} placeholder="Enter first name" className="text-sm" />
                        </FormField>
                        <FormField label="Last Name" required error={errors.last_name?.message}>
                            <Input {...register('last_name')} placeholder="Enter last name" className="text-sm" />
                        </FormField>
                    </div>
                </Panel>

                {/* Contact Details */}
                <Panel title="CONTACT DETAILS" icon={Phone}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Email" error={errors.email?.message}>
                            <Input type="email" {...register('email')} placeholder="email@example.com" className="text-sm" />
                        </FormField>
                        <FormField label="Primary Phone" required error={errors.phone_primary?.message}>
                            <Input {...register('phone_primary')} placeholder="+233 XX XXX XXXX" className="text-sm" />
                        </FormField>
                        <FormField label="Secondary Phone">
                            <Input {...register('phone_secondary')} placeholder="+233 XX XXX XXXX" className="text-sm" />
                        </FormField>
                        <FormField label="WhatsApp Number">
                            <Input {...register('whatsapp_number')} placeholder="+233 XX XXX XXXX" className="text-sm" />
                        </FormField>
                    </div>
                </Panel>

                {/* Address */}
                <Panel title="ADDRESS" icon={MapPin}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Ghana Post GPS">
                            <Input {...register('ghana_post_gps')} placeholder="e.g. GA-XXX-XXXX" className="text-sm" />
                        </FormField>
                        <FormField label="Region">
                            <Controller
                                name="region"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm"><SelectValue placeholder="Select region..." /></SelectTrigger>
                                        <SelectContent>
                                            {GHANA_REGIONS.map(region => (
                                                <SelectItem key={region} value={region}>{region}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </FormField>
                        <FormField label="City">
                            <Input {...register('city')} placeholder="Enter city" className="text-sm" />
                        </FormField>
                        <FormField label="Address">
                            <Input {...register('address')} placeholder="Street address" className="text-sm" />
                        </FormField>
                    </div>
                </Panel>

                {/* Professional Information */}
                <Panel title="PROFESSIONAL INFORMATION" icon={Briefcase}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Occupation">
                            <Input {...register('occupation')} placeholder="Enter occupation" className="text-sm" />
                        </FormField>
                        <FormField label="Company Name">
                            <Input {...register('company_name')} placeholder="Enter company name" className="text-sm" />
                        </FormField>
                        <FormField label="Job Title">
                            <Input {...register('job_title')} placeholder="Enter job title" className="text-sm" />
                        </FormField>
                        <FormField label="Income Range">
                            <Controller
                                name="income_range"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm"><SelectValue placeholder="Select range..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0-5000">GHS 0 - 5,000</SelectItem>
                                            <SelectItem value="5000-10000">GHS 5,000 - 10,000</SelectItem>
                                            <SelectItem value="10000-20000">GHS 10,000 - 20,000</SelectItem>
                                            <SelectItem value="20000-50000">GHS 20,000 - 50,000</SelectItem>
                                            <SelectItem value="50000-100000">GHS 50,000 - 100,000</SelectItem>
                                            <SelectItem value="100000+">GHS 100,000+</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </FormField>
                    </div>
                </Panel>

                {/* Buyer Profile */}
                <Panel title="BUYER PROFILE" icon={DollarSign}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="Buyer Type">
                            <Controller
                                name="buyer_type"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm"><SelectValue placeholder="Select type..." /></SelectTrigger>
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
                                )}
                            />
                        </FormField>
                        <FormField label="Budget Min (GHS)">
                            <Input type="number" {...register('budget_min')} placeholder="0" className="text-sm" />
                        </FormField>
                        <FormField label="Budget Max (GHS)">
                            <Input type="number" {...register('budget_max')} placeholder="0" className="text-sm" />
                        </FormField>
                    </div>
                </Panel>

                {/* Lead Information */}
                <Panel title="LEAD INFORMATION" icon={Tag}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Lead Source">
                            <Controller
                                name="lead_source"
                                control={control}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="text-sm"><SelectValue placeholder="Select source..." /></SelectTrigger>
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
                                )}
                            />
                        </FormField>
                        <FormField label="Tags (comma separated)">
                            <Input {...register('tags')} placeholder="e.g. vip, hot-lead, follow-up" className="text-sm" />
                        </FormField>
                    </div>
                </Panel>

                {/* Notes */}
                <Panel title="NOTES" icon={FileText}>
                    <FormField label="Additional Notes">
                        <Textarea
                            {...register('notes')}
                            placeholder="Enter any additional notes about this contact..."
                            rows={4}
                            className="text-sm resize-none"
                        />
                    </FormField>
                </Panel>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4">
                    <Link href="/dashboard/deals/contacts">
                        <Button type="button" variant="outline">Cancel</Button>
                    </Link>
                    <Button type="submit" disabled={isSubmitting}>
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
    )
}
