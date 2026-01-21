'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import {
    Plus,
    Search,
    Loader2,
    User,
    Phone,
    Mail,
    MapPin,
    Filter,
    MoreVertical
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { contactsApi } from '@/lib/crm-api'
import type { Contact, ContactStats, PaginatedResponse } from '@/types/crm'
import { LeadStatus, ContactType } from '@/types/crm'

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({ title, children, className }: { 
    title: string; 
    children: React.ReactNode; 
    className?: string;
}) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-3">{children}</div>
        </div>
    )
}

// =====================================================
// CONTACT CARD
// =====================================================
function ContactCard({ contact }: { contact: Contact }) {
    const getLeadStatusColor = (status: LeadStatus) => {
        switch (status) {
            case LeadStatus.NEW: return 'bg-blue-900/50 text-blue-400'
            case LeadStatus.CONTACTED: return 'bg-purple-900/50 text-purple-400'
            case LeadStatus.QUALIFIED: return 'bg-green-900/50 text-green-400'
            case LeadStatus.UNQUALIFIED: return 'bg-red-900/50 text-red-400'
            case LeadStatus.NURTURING: return 'bg-yellow-900/50 text-yellow-400'
            default: return 'bg-zinc-700/50 text-zinc-400'
        }
    }

    return (
        <Link href={`/dashboard/deals/contacts/${contact.id}`}>
            <div className="bg-zinc-800/50 border border-zinc-700 p-4 hover:border-amber-500/50 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                            <h4 className="font-mono text-sm text-white group-hover:text-amber-500 transition-colors">
                                {contact.first_name} {contact.last_name}
                            </h4>
                            {contact.company_name && (
                                <p className="font-mono text-[10px] text-zinc-500">{contact.company_name}</p>
                            )}
                        </div>
                    </div>
                    <span className={cn('font-mono text-[9px] px-1.5 py-0.5', getLeadStatusColor(contact.lead_status))}>
                        {contact.lead_status?.toUpperCase()}
                    </span>
                </div>

                <div className="space-y-1.5">
                    {contact.phone_primary && (
                        <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[10px] text-zinc-400">{contact.phone_primary}</span>
                        </div>
                    )}
                    {contact.email && (
                        <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[10px] text-zinc-400 truncate">{contact.email}</span>
                        </div>
                    )}
                    {contact.city && (
                        <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[10px] text-zinc-400">{contact.city}, {contact.region}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-700/50">
                    <div className="flex items-center gap-4">
                        <div>
                            <span className="font-mono text-[10px] text-zinc-600">DEALS</span>
                            <span className="font-mono text-xs text-white ml-1">{contact.deal_count || 0}</span>
                        </div>
                        {contact.lead_score !== undefined && (
                            <div>
                                <span className="font-mono text-[10px] text-zinc-600">SCORE</span>
                                <span className="font-mono text-xs text-amber-500 ml-1">{contact.lead_score}</span>
                            </div>
                        )}
                    </div>
                    {contact.budget_max && (
                        <span className="font-mono text-[10px] text-green-400">
                            Budget: {formatCurrency(contact.budget_max, 'GHS')}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([])
    const [stats, setStats] = useState<ContactStats | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    // Load contacts
    useEffect(() => {
        const loadContacts = async () => {
            try {
                setIsLoading(true)
                setError(null)

                const [contactsData, statsData] = await Promise.all([
                    contactsApi.getAll({
                        page,
                        limit: 24,
                        search: searchTerm || undefined,
                        lead_status: leadStatusFilter !== 'all' ? leadStatusFilter as LeadStatus : undefined
                    }),
                    contactsApi.getStats()
                ])

                setContacts(contactsData.data || [])
                setTotalPages(contactsData.pagination?.totalPages || 1)
                setStats(statsData)
            } catch (err) {
                console.error('Failed to load contacts:', err)
                setError('Failed to load contacts')
            } finally {
                setIsLoading(false)
            }
        }
        loadContacts()
    }, [page, searchTerm, leadStatusFilter])

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-xl text-white">CONTACTS</h1>
                    <p className="font-mono text-[10px] text-zinc-500">Manage leads, clients, and prospects</p>
                </div>
                <Link href="/dashboard/deals/contacts/new">
                    <Button className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs">
                        <Plus className="h-4 w-4 mr-2" />
                        NEW CONTACT
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-3 md:grid-cols-5">
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL CONTACTS</div>
                        <div className="font-mono text-xl text-white">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.totalContacts || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">NEW THIS MONTH</div>
                        <div className="font-mono text-xl text-green-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.newThisMonth || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">QUALIFIED</div>
                        <div className="font-mono text-xl text-amber-500">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.byLeadStatus?.qualified || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">NURTURING</div>
                        <div className="font-mono text-xl text-purple-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.byLeadStatus?.nurturing || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-black border-zinc-800">
                    <CardContent className="p-3">
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">UNQUALIFIED</div>
                        <div className="font-mono text-xl text-red-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.byLeadStatus?.unqualified || 0}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Panel title="FILTERS" className="!p-0">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                        <Input
                            placeholder="Search contacts..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value)
                                setPage(1)
                            }}
                            className="pl-8 bg-zinc-800 border-zinc-700 text-white font-mono text-xs h-9"
                        />
                    </div>

                    <Select value={leadStatusFilter} onValueChange={(v) => {
                        setLeadStatusFilter(v)
                        setPage(1)
                    }}>
                        <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                            <SelectValue placeholder="Lead Status" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                            <SelectItem value="all" className="font-mono text-xs text-white">All Statuses</SelectItem>
                            <SelectItem value="new" className="font-mono text-xs text-white">New</SelectItem>
                            <SelectItem value="contacted" className="font-mono text-xs text-white">Contacted</SelectItem>
                            <SelectItem value="qualified" className="font-mono text-xs text-white">Qualified</SelectItem>
                            <SelectItem value="unqualified" className="font-mono text-xs text-white">Unqualified</SelectItem>
                            <SelectItem value="nurturing" className="font-mono text-xs text-white">Nurturing</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </Panel>

            {/* Error State */}
            {error && (
                <div className="border border-red-900 bg-red-900/20 p-4 text-center">
                    <p className="font-mono text-xs text-red-400">{error}</p>
                    <Button 
                        variant="link" 
                        onClick={() => window.location.reload()} 
                        className="text-amber-500 mt-2"
                    >
                        Retry
                    </Button>
                </div>
            )}

            {/* Loading State */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
            ) : (
                <>
                    {/* Contacts Grid */}
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {contacts.map((contact) => (
                            <ContactCard key={contact.id} contact={contact} />
                        ))}
                    </div>

                    {/* Empty State */}
                    {contacts.length === 0 && !error && (
                        <div className="text-center py-12 border border-zinc-800 bg-zinc-900/50">
                            <User className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                            <p className="font-mono text-sm text-zinc-500">No contacts found</p>
                            <p className="font-mono text-xs text-zinc-600 mt-1">
                                {searchTerm ? 'Try adjusting your search' : 'Add your first contact to get started'}
                            </p>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="border-zinc-700 text-zinc-300"
                            >
                                Previous
                            </Button>
                            <span className="font-mono text-xs text-zinc-500">
                                Page {page} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="border-zinc-700 text-zinc-300"
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
