'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import {
    ArrowLeft,
    Loader2,
    User,
    Phone,
    Mail,
    MapPin,
    Briefcase,
    DollarSign,
    Calendar,
    Edit2,
    Trash2,
    MessageSquare,
    FileText,
    Clock,
    Tag
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { contactsApi } from '@/lib/crm-api'
import type { Contact, Deal, Task, DealActivity } from '@/types/crm'
import { LeadStatus, ContactType } from '@/types/crm'

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({ title, icon: Icon, children, className, action }: { 
    title: string; 
    icon?: React.ElementType;
    children: React.ReactNode; 
    className?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-3 w-3 text-amber-500" />}
                    <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
                </div>
                {action}
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

// =====================================================
// INFO ROW COMPONENT
// =====================================================
function InfoRow({ label, value, icon: Icon }: {
    label: string;
    value?: string | number | null;
    icon?: React.ElementType;
}) {
    if (!value) return null
    return (
        <div className="flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0">
            {Icon && <Icon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
                <p className="font-mono text-sm text-white truncate">{value}</p>
            </div>
        </div>
    )
}

// =====================================================
// LEAD STATUS BADGE
// =====================================================
function LeadStatusBadge({ status }: { status: LeadStatus }) {
    const getStatusColor = (status: LeadStatus) => {
        switch (status) {
            case LeadStatus.NEW: return 'bg-blue-900/50 text-blue-400 border-blue-700'
            case LeadStatus.CONTACTED: return 'bg-purple-900/50 text-purple-400 border-purple-700'
            case LeadStatus.QUALIFIED: return 'bg-green-900/50 text-green-400 border-green-700'
            case LeadStatus.UNQUALIFIED: return 'bg-red-900/50 text-red-400 border-red-700'
            case LeadStatus.NURTURING: return 'bg-yellow-900/50 text-yellow-400 border-yellow-700'
            default: return 'bg-zinc-700/50 text-zinc-400 border-zinc-600'
        }
    }

    return (
        <span className={cn(
            'font-mono text-[10px] px-2 py-1 border',
            getStatusColor(status)
        )}>
            {status?.toUpperCase().replace('_', ' ')}
        </span>
    )
}

// =====================================================
// CONTACT TYPE BADGE
// =====================================================
function ContactTypeBadge({ type }: { type: ContactType }) {
    const formatType = (type: ContactType) => {
        return type?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'
    }

    return (
        <span className="font-mono text-[10px] px-2 py-1 bg-zinc-700/50 text-zinc-300 border border-zinc-600">
            {formatType(type)}
        </span>
    )
}

// =====================================================
// CONTACT DETAIL PAGE
// =====================================================
export default function ContactDetailPage() {
    const params = useParams()
    const router = useRouter()
    const contactId = params.id as string

    const [contact, setContact] = useState<Contact | null>(null)
    const [deals, setDeals] = useState<Deal[]>([])
    const [tasks, setTasks] = useState<Task[]>([])
    const [activities, setActivities] = useState<DealActivity[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        loadContactData()
    }, [contactId])

    const loadContactData = async () => {
        try {
            setIsLoading(true)
            setError(null)

            const [contactData, dealsData, tasksData, activitiesData] = await Promise.all([
                contactsApi.getById(contactId),
                contactsApi.getDeals(contactId).catch(() => []),
                contactsApi.getTasks(contactId).catch(() => []),
                contactsApi.getActivities(contactId).catch(() => [])
            ])

            setContact(contactData)
            setDeals(dealsData || [])
            setTasks(tasksData || [])
            setActivities(activitiesData || [])
        } catch (err: any) {
            console.error('Failed to load contact:', err)
            setError(err.message || 'Failed to load contact')
        } finally {
            setIsLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this contact?')) return

        try {
            setIsDeleting(true)
            await contactsApi.delete(contactId)
            router.push('/dashboard/deals/contacts')
        } catch (err: any) {
            console.error('Failed to delete contact:', err)
            alert('Failed to delete contact: ' + (err.message || 'Unknown error'))
        } finally {
            setIsDeleting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
            </div>
        )
    }

    if (error || !contact) {
        return (
            <div className="min-h-screen bg-zinc-950 p-6">
                <div className="max-w-4xl mx-auto">
                    <Link href="/dashboard/deals/contacts">
                        <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white mb-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Contacts
                        </Button>
                    </Link>
                    <div className="p-6 bg-red-900/20 border border-red-800 text-red-400 font-mono text-sm">
                        {error || 'Contact not found'}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-zinc-950 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/deals/contacts">
                            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>
                        </Link>
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-amber-500/20 rounded-full flex items-center justify-center">
                                <User className="h-7 w-7 text-amber-500" />
                            </div>
                            <div>
                                <h1 className="font-mono text-xl font-bold text-white">
                                    {contact.title && `${contact.title} `}
                                    {contact.first_name} {contact.last_name}
                                </h1>
                                <div className="flex items-center gap-2 mt-1">
                                    <LeadStatusBadge status={contact.lead_status} />
                                    <ContactTypeBadge type={contact.contact_type} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href={`/dashboard/deals/contacts/${contactId}/edit`}>
                            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300">
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                            </Button>
                        </Link>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="border-red-700 text-red-400 hover:bg-red-900/20"
                        >
                            {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Left Column - Contact Details */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Contact Information */}
                        <Panel title="CONTACT INFORMATION" icon={User}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                <InfoRow label="Email" value={contact.email} icon={Mail} />
                                <InfoRow label="Primary Phone" value={contact.phone_primary} icon={Phone} />
                                <InfoRow label="WhatsApp" value={contact.whatsapp_number} icon={MessageSquare} />
                                <InfoRow label="Alternate Phone" value={contact.phone_secondary} icon={Phone} />
                            </div>
                        </Panel>

                        {/* Address */}
                        <Panel title="ADDRESS" icon={MapPin}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                <InfoRow label="Region" value={contact.region} icon={MapPin} />
                                <InfoRow label="City" value={contact.city} icon={MapPin} />
                                <InfoRow label="Digital Address" value={contact.ghana_post_gps} icon={MapPin} />
                                <InfoRow label="Street Address" value={contact.address} icon={MapPin} />
                            </div>
                        </Panel>

                        {/* Professional Information */}
                        <Panel title="PROFESSIONAL INFORMATION" icon={Briefcase}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                <InfoRow label="Occupation" value={contact.occupation} icon={Briefcase} />
                                <InfoRow label="Company" value={contact.company_name} icon={Briefcase} />
                                <InfoRow label="Job Title" value={contact.job_title} icon={Briefcase} />
                                <InfoRow label="Income Range" value={contact.income_range} icon={DollarSign} />
                            </div>
                        </Panel>

                        {/* Buyer Profile */}
                        <Panel title="BUYER PROFILE" icon={DollarSign}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                <InfoRow 
                                    label="Buyer Type" 
                                    value={contact.buyer_type?.replace(/_/g, ' ').toUpperCase()} 
                                    icon={User} 
                                />
                                <InfoRow 
                                    label="Budget Range" 
                                    value={contact.budget_min || contact.budget_max ? 
                                        `${contact.budget_min ? formatCurrency(contact.budget_min) : '—'} - ${contact.budget_max ? formatCurrency(contact.budget_max) : '—'}` : 
                                        undefined
                                    } 
                                    icon={DollarSign} 
                                />
                                <InfoRow 
                                    label="Preferred Regions" 
                                    value={contact.preferred_regions?.join(', ')} 
                                    icon={MapPin} 
                                />
                            </div>
                        </Panel>

                        {/* Notes */}
                        {contact.notes && (
                            <Panel title="NOTES" icon={FileText}>
                                <p className="font-mono text-sm text-zinc-300 whitespace-pre-wrap">
                                    {contact.notes}
                                </p>
                            </Panel>
                        )}
                    </div>

                    {/* Right Column - Sidebar */}
                    <div className="space-y-4">
                        {/* Quick Stats */}
                        <Panel title="QUICK STATS" icon={Tag}>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                                    <span className="font-mono text-[10px] text-zinc-500">LEAD SCORE</span>
                                    <span className="font-mono text-lg font-bold text-amber-500">
                                        {contact.lead_score || 0}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                                    <span className="font-mono text-[10px] text-zinc-500">ACTIVE DEALS</span>
                                    <span className="font-mono text-lg font-bold text-white">
                                        {contact.deal_count || deals.length}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                                    <span className="font-mono text-[10px] text-zinc-500">TOTAL DEAL VALUE</span>
                                    <span className="font-mono text-sm font-bold text-green-400">
                                        {contact.total_deal_value ? formatCurrency(contact.total_deal_value) : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="font-mono text-[10px] text-zinc-500">LEAD SOURCE</span>
                                    <span className="font-mono text-xs text-zinc-300">
                                        {contact.lead_source?.replace(/_/g, ' ').toUpperCase() || '—'}
                                    </span>
                                </div>
                            </div>
                        </Panel>

                        {/* Tags */}
                        {contact.tags && contact.tags.length > 0 && (
                            <Panel title="TAGS" icon={Tag}>
                                <div className="flex flex-wrap gap-1.5">
                                    {contact.tags.map((tag, index) => (
                                        <span 
                                            key={index}
                                            className="font-mono text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </Panel>
                        )}

                        {/* Timeline / Recent Activity */}
                        <Panel title="RECENT ACTIVITY" icon={Clock}>
                            {activities.length === 0 ? (
                                <p className="font-mono text-[10px] text-zinc-500 text-center py-4">
                                    No recent activity
                                </p>
                            ) : (
                                <div className="space-y-3 max-h-64 overflow-y-auto">
                                    {activities.slice(0, 5).map((activity, index) => (
                                        <div key={activity.id || index} className="flex items-start gap-2 py-2 border-b border-zinc-800/50 last:border-0">
                                            <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-mono text-xs text-white truncate">
                                                    {activity.activity_type?.replace(/_/g, ' ')}
                                                </p>
                                                <p className="font-mono text-[10px] text-zinc-500">
                                                    {new Date(activity.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Panel>

                        {/* Metadata */}
                        <Panel title="METADATA" icon={Calendar}>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="font-mono text-[10px] text-zinc-500">Created</span>
                                    <span className="font-mono text-[10px] text-zinc-400">
                                        {new Date(contact.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-mono text-[10px] text-zinc-500">Updated</span>
                                    <span className="font-mono text-[10px] text-zinc-400">
                                        {new Date(contact.updated_at).toLocaleDateString()}
                                    </span>
                                </div>
                                {contact.last_contacted_at && (
                                    <div className="flex justify-between">
                                        <span className="font-mono text-[10px] text-zinc-500">Last Contacted</span>
                                        <span className="font-mono text-[10px] text-zinc-400">
                                            {new Date(contact.last_contacted_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                                {contact.assigned_to_name && (
                                    <div className="flex justify-between">
                                        <span className="font-mono text-[10px] text-zinc-500">Assigned To</span>
                                        <span className="font-mono text-[10px] text-amber-500">
                                            {contact.assigned_to_name}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </Panel>
                    </div>
                </div>

                {/* Deals Section */}
                {deals.length > 0 && (
                    <div className="mt-6">
                        <Panel title={`DEALS (${deals.length})`} icon={Briefcase}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {deals.map((deal) => (
                                    <Link key={deal.id} href={`/dashboard/deals/${deal.id}`}>
                                        <div className="p-3 bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 transition-colors cursor-pointer">
                                            <h4 className="font-mono text-sm text-white truncate">{deal.title}</h4>
                                            <p className="font-mono text-[10px] text-zinc-500 mt-1">
                                                {formatCurrency(deal.deal_value || 0)}
                                            </p>
                                            <span className={cn(
                                                'font-mono text-[9px] px-1.5 py-0.5 mt-2 inline-block',
                                                deal.deal_status === 'won' ? 'bg-green-900/50 text-green-400' :
                                                deal.deal_status === 'lost' ? 'bg-red-900/50 text-red-400' :
                                                'bg-blue-900/50 text-blue-400'
                                            )}>
                                                {deal.deal_status?.toUpperCase()}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </Panel>
                    </div>
                )}
            </div>
        </div>
    )
}
