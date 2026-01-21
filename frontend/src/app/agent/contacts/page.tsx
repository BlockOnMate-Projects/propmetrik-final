'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    User,
    Phone,
    Mail,
    MessageSquare,
    Search,
    Loader2,
    Building2,
    Star
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface Contact {
    id: string
    first_name: string
    last_name: string
    full_name: string
    email: string
    phone_primary: string
    phone_secondary: string
    contact_type: string
    company_name: string
    job_title: string
    is_primary: boolean
    deal_id: string
    deal_title: string
}

export default function AgentContactsPage() {
    const router = useRouter()
    const [contacts, setContacts] = useState<Contact[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [contactTypeFilter, setContactTypeFilter] = useState('')

    useEffect(() => {
        const loadContacts = async () => {
            try {
                const storedContext = localStorage.getItem('agentContext')
                if (!storedContext) {
                    router.push('/agent/login')
                    return
                }

                const context = JSON.parse(storedContext)
                
                // Fetch agent's contacts
                const res = await fetch(`${API_BASE}/crm/contacts?assigned_to=${context.userId}&limit=200`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Id': context.userId,
                        'X-Organization-Id': context.orgId
                    }
                })

                if (res.ok) {
                    const data = await res.json()
                    const contactsList = data.contacts || data.data || data || []
                    setContacts(Array.isArray(contactsList) ? contactsList : [])
                }
            } catch (err) {
                console.error('Failed to load contacts:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadContacts()
    }, [router])

    const filteredContacts = contacts.filter(contact => {
        const fullName = contact.full_name || `${contact.first_name} ${contact.last_name}`
        const matchesSearch = !searchTerm || 
            fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            contact.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            contact.phone_primary?.includes(searchTerm)
        
        const matchesType = !contactTypeFilter || 
            contact.contact_type === contactTypeFilter
        
        return matchesSearch && matchesType
    })

    const contactTypes = Array.from(new Set(contacts.map(c => c.contact_type).filter(Boolean)))

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-lg text-white">MY CONTACTS</h1>
                    <p className="font-mono text-xs text-zinc-500">Contacts from your deals</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                        placeholder="Search contacts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-zinc-900 border-zinc-800 text-white font-mono text-xs"
                    />
                </div>
                <select
                    value={contactTypeFilter}
                    onChange={(e) => setContactTypeFilter(e.target.value)}
                    className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-xs min-w-[150px]"
                >
                    <option value="">All Types</option>
                    {contactTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">TOTAL CONTACTS</div>
                    <div className="font-mono text-xl text-white">{contacts.length}</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">BUYERS</div>
                    <div className="font-mono text-xl text-green-400">
                        {contacts.filter(c => c.contact_type === 'buyer').length}
                    </div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-3">
                    <div className="font-mono text-[10px] text-zinc-500">SELLERS</div>
                    <div className="font-mono text-xl text-blue-400">
                        {contacts.filter(c => c.contact_type === 'seller').length}
                    </div>
                </div>
            </div>

            {/* Contact Grid */}
            {filteredContacts.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-zinc-700 rounded">
                    <User className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                    <p className="font-mono text-sm text-zinc-500">No contacts found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredContacts.map((contact) => {
                        const fullName = contact.full_name || `${contact.first_name} ${contact.last_name}`
                        return (
                            <div 
                                key={contact.id}
                                className="border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors"
                            >
                                {/* Contact Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                                            <span className="font-mono text-sm text-amber-500">
                                                {fullName.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <h3 className="font-mono text-sm text-white">{fullName}</h3>
                                            {contact.job_title && (
                                                <p className="font-mono text-[10px] text-zinc-500">{contact.job_title}</p>
                                            )}
                                        </div>
                                    </div>
                                    {contact.is_primary && (
                                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                    )}
                                </div>

                                {/* Contact Type */}
                                {contact.contact_type && (
                                    <span className={cn(
                                        'inline-block font-mono text-[9px] px-1.5 py-0.5 mb-3',
                                        contact.contact_type === 'buyer' && 'bg-green-900/50 text-green-400',
                                        contact.contact_type === 'seller' && 'bg-blue-900/50 text-blue-400',
                                        contact.contact_type === 'tenant' && 'bg-purple-900/50 text-purple-400',
                                        contact.contact_type === 'landlord' && 'bg-orange-900/50 text-orange-400',
                                        !['buyer', 'seller', 'tenant', 'landlord'].includes(contact.contact_type) && 'bg-zinc-800 text-zinc-400'
                                    )}>
                                        {contact.contact_type.toUpperCase()}
                                    </span>
                                )}

                                {/* Company */}
                                {contact.company_name && (
                                    <div className="flex items-center gap-2 mb-3">
                                        <Building2 className="h-3 w-3 text-zinc-500" />
                                        <span className="font-mono text-[10px] text-zinc-400">{contact.company_name}</span>
                                    </div>
                                )}

                                {/* Contact Actions */}
                                <div className="flex gap-2 pt-3 border-t border-zinc-800">
                                    {contact.phone_primary && (
                                        <a 
                                            href={`tel:${contact.phone_primary}`}
                                            className="flex-1 flex items-center justify-center gap-2 p-2 bg-green-900/30 hover:bg-green-900/50 transition-colors"
                                        >
                                            <Phone className="h-4 w-4 text-green-500" />
                                            <span className="font-mono text-[10px] text-green-400">Call</span>
                                        </a>
                                    )}
                                    {contact.email && (
                                        <a 
                                            href={`mailto:${contact.email}`}
                                            className="flex-1 flex items-center justify-center gap-2 p-2 bg-blue-900/30 hover:bg-blue-900/50 transition-colors"
                                        >
                                            <Mail className="h-4 w-4 text-blue-500" />
                                            <span className="font-mono text-[10px] text-blue-400">Email</span>
                                        </a>
                                    )}
                                    {contact.phone_primary && (
                                        <a 
                                            href={`https://wa.me/${contact.phone_primary.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-1 flex items-center justify-center gap-2 p-2 bg-emerald-900/30 hover:bg-emerald-900/50 transition-colors"
                                        >
                                            <MessageSquare className="h-4 w-4 text-emerald-500" />
                                            <span className="font-mono text-[10px] text-emerald-400">WhatsApp</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
