'use client'

import React, { useState, useMemo, useCallback, useRef } from 'react'
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
    Upload,
    CheckCircle2,
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
import { useContacts, useContactStats, useDeleteContact } from '@/hooks/crm/use-contacts'
import type { Contact } from '@/types/crm'
import { LeadStatus } from '@/types/crm'
import { EmptyState } from '@/components/crm/EmptyState'
import { FilterBuilder } from '@/components/crm/FilterBuilder'
import { SavedViewsPicker } from '@/components/crm/SavedViewsPicker'
import { useBulkSelection, BulkActionBar, SelectionCheckbox } from '@/components/crm/BulkActions'
import { ImportWizard } from '@/components/crm/ImportWizard'
import { useKeyboardShortcuts } from '@/components/crm/KeyboardShortcuts'
import { CONTACT_FILTER_FIELDS } from '@/types/crm-filters'
import type { FilterGroup } from '@/types/crm-filters'
import { toast } from 'sonner'

// =====================================================
// CONTACT CARD
// =====================================================
function ContactCard({ contact, isSelected, onToggleSelect }: {
    contact: Contact
    isSelected?: boolean
    onToggleSelect?: (id: string) => void
}) {
    const getLeadStatusColor = (status: LeadStatus) => {
        switch (status) {
            case LeadStatus.NEW: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            case LeadStatus.CONTACTED: return 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
            case LeadStatus.QUALIFIED: return 'bg-green-500/10 text-green-600 dark:text-green-400'
            case LeadStatus.UNQUALIFIED: return 'bg-red-500/10 text-red-600 dark:text-red-400'
            case LeadStatus.NURTURING: return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
            default: return 'bg-muted text-muted-foreground'
        }
    }

    return (
        <div className="relative group/card">
            {onToggleSelect && (
                <div className={cn(
                    'absolute top-2 right-2 z-10 transition-opacity',
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'
                )}>
                    <SelectionCheckbox
                        checked={!!isSelected}
                        onChange={() => onToggleSelect(contact.id)}
                    />
                </div>
            )}
            <Link href={`/dashboard/deals/contacts/${contact.id}`}>
                <Card className={cn(
                    'p-4 hover:border-primary/50 transition-colors cursor-pointer group bg-card border-border shadow-sm',
                    isSelected && 'border-primary/50 bg-primary/5'
                )}>
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors">
                                {contact.first_name} {contact.last_name}
                            </h4>
                            {contact.company_name && (
                                <p className="text-xs text-muted-foreground">{contact.company_name}</p>
                            )}
                        </div>
                    </div>
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', getLeadStatusColor(contact.lead_status))}>
                        {contact.lead_status?.replace('_', ' ')}
                    </span>
                </div>

                <div className="space-y-1.5">
                    {contact.phone_primary && (
                        <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{contact.phone_primary}</span>
                        </div>
                    )}
                    {contact.email && (
                        <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
                        </div>
                    )}
                    {contact.city && (
                        <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{contact.city}, {contact.region}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-4">
                        <div>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Deals</span>
                            <span className="text-xs font-medium text-foreground ml-1">{contact.deal_count || 0}</span>
                        </div>
                        {contact.lead_score !== undefined && (
                            <div>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</span>
                                <span className="text-xs font-medium text-primary ml-1">{contact.lead_score}</span>
                            </div>
                        )}
                    </div>
                    {contact.budget_max && (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                            Budget: {formatCurrency(contact.budget_max, 'GHS')}
                        </span>
                    )}
                </div>
            </Card>
        </Link>
        </div>
    )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function ContactsPage() {
    const [searchTerm, setSearchTerm] = useState('')
    const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all')
    const [page, setPage] = useState(1)
    const [filterGroup, setFilterGroup] = useState<FilterGroup>({ id: 'root', conjunction: 'and', conditions: [] })
    const [importWizardOpen, setImportWizardOpen] = useState(false)
    const searchRef = useRef<HTMLInputElement>(null)

    const { data: contactsData, isLoading, error: contactsError } = useContacts({
        page,
        limit: 24,
        search: searchTerm || undefined,
        lead_status: leadStatusFilter !== 'all' ? leadStatusFilter as LeadStatus : undefined,
    })
    const { data: stats } = useContactStats()
    const deleteContactMutation = useDeleteContact()

    const contacts = contactsData?.data || []
    const totalPages = contactsData?.pagination?.totalPages || 1
    const error = contactsError ? 'Failed to load contacts' : null

    // Bulk selection
    const bulkSelection = useBulkSelection(contacts)

    // Keyboard shortcuts
    useKeyboardShortcuts({
        onFocusSearch: () => searchRef.current?.focus(),
    })

    // Bulk action handler
    const handleBulkAction = useCallback(async (actionId: string, value?: string) => {
        const ids = Array.from(bulkSelection.selectedIds)
        switch (actionId) {
            case 'delete': {
                const results = await Promise.allSettled(ids.map(id => deleteContactMutation.mutateAsync(id)))
                const succeeded = results.filter(r => r.status === 'fulfilled').length
                toast.success(`Deleted ${succeeded} contact${succeeded !== 1 ? 's' : ''}`)
                bulkSelection.clearSelection()
                break
            }
            case 'change_status': {
                if (!value) return
                toast.info(`Status change to ${value} for ${ids.length} contacts (batch API not implemented)`)
                bulkSelection.clearSelection()
                break
            }
            case 'export': {
                const exportContacts = contacts.filter(c => ids.includes(c.id))
                const csvRows = [
                    ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Lead Status', 'City', 'Region'].join(','),
                    ...exportContacts.map(c =>
                        [c.first_name, c.last_name, c.email || '', c.phone_primary || '', c.company_name || '', c.lead_status || '', c.city || '', c.region || ''].join(',')
                    )
                ]
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`
                a.click()
                URL.revokeObjectURL(url)
                toast.success(`Exported ${exportContacts.length} contacts`)
                break
            }
            default:
                toast.info(`Action "${actionId}" not yet implemented`)
        }
    }, [contacts, deleteContactMutation, bulkSelection])

    // Saved views handler
    const handleApplyView = useCallback((filters: FilterGroup) => {
        setFilterGroup(filters)
    }, [])

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contacts</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage leads, clients, and prospects</p>
                </div>
                <Link href="/dashboard/deals/contacts/new">
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-9 px-4 rounded-md shadow-sm">
                        <Plus className="h-4 w-4 mr-2" />
                        New Contact
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-5">
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Total Contacts</div>
                        <div className="text-2xl font-bold text-foreground">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.totalContacts || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">New This Month</div>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.newThisMonth || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Qualified</div>
                        <div className="text-2xl font-bold text-primary">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.byLeadStatus?.qualified || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Nurturing</div>
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.byLeadStatus?.nurturing || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Unqualified</div>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.byLeadStatus?.unqualified || 0}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card className="border-border shadow-sm">
                <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                ref={searchRef}
                                placeholder="Search contacts... (press /)"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value)
                                    setPage(1)
                                }}
                                className="pl-9 h-9 text-sm"
                            />
                        </div>

                        <Select value={leadStatusFilter} onValueChange={(v) => {
                            setLeadStatusFilter(v)
                            setPage(1)
                        }}>
                            <SelectTrigger className="w-40 h-9 text-sm">
                                <SelectValue placeholder="Lead Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="qualified">Qualified</SelectItem>
                                <SelectItem value="unqualified">Unqualified</SelectItem>
                                <SelectItem value="nurturing">Nurturing</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex-1" />

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setImportWizardOpen(true)}
                            className="h-9"
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Import CSV
                        </Button>
                    </div>

                    {/* Phase 3: Filter Builder + Saved Views */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <FilterBuilder
                            fields={CONTACT_FILTER_FIELDS}
                            value={filterGroup}
                            onChange={setFilterGroup}
                        />
                        <SavedViewsPicker
                            entityType="contacts"
                            currentFilters={filterGroup}
                            onApply={handleApplyView}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Error State */}
            {error && (
                <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="p-4 text-center">
                        <p className="text-sm text-destructive">{error}</p>
                        <Button variant="link" onClick={() => window.location.reload()} className="text-primary mt-2">
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Loading State */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    {/* Contacts Grid */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {contacts.map((contact) => (
                            <ContactCard
                                key={contact.id}
                                contact={contact}
                                isSelected={bulkSelection.isSelected(contact.id)}
                                onToggleSelect={bulkSelection.toggleOne}
                            />
                        ))}
                    </div>

                    {/* Empty State */}
                    {contacts.length === 0 && !error && (
                        <EmptyState
                            icon={User}
                            title={searchTerm ? 'No contacts match your search' : 'No contacts yet'}
                            description={searchTerm 
                                ? 'Try adjusting your search or filters to find what you\'re looking for.'
                                : 'Start building your network by adding your first contact. You can also import contacts from a CSV file.'
                            }
                            actions={searchTerm ? [] : [
                                { label: 'New Contact', href: '/dashboard/deals/contacts/new', icon: Plus },
                                { label: 'Import CSV', icon: Upload, variant: 'outline' as const, onClick: () => setImportWizardOpen(true) },
                            ]}
                        />
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </>
            )}

            {/* Bulk Action Bar */}
            <BulkActionBar
                entityType="contact"
                selectedCount={bulkSelection.selectedCount}
                onAction={handleBulkAction}
                onClear={bulkSelection.clearSelection}
            />

            {/* Import Wizard */}
            <ImportWizard
                open={importWizardOpen}
                onOpenChange={setImportWizardOpen}
            />
        </div>
    )
}
