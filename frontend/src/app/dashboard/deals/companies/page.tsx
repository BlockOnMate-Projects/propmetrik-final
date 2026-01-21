'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    Plus,
    Search,
    Loader2,
    Building2,
    Phone,
    Mail,
    Globe,
    MapPin
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
import { companiesApi } from '@/lib/crm-api'
import type { Company, PaginatedResponse } from '@/types/crm'
import { CompanyType } from '@/types/crm'
import { formatCurrency } from '@/lib/utils'

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
            </div>
            <div className="p-3">{children}</div>
        </div>
    )
}

function CompanyCard({ company }: { company: Company }) {
    const getCompanyTypeColor = (type: CompanyType) => {
        switch (type) {
            case CompanyType.DEVELOPER: return 'bg-blue-900/50 text-blue-400'
            case CompanyType.AGENCY: return 'bg-purple-900/50 text-purple-400'
            case CompanyType.INVESTOR: return 'bg-green-900/50 text-green-400'
            case CompanyType.CORPORATE: return 'bg-orange-900/50 text-orange-400'
            case CompanyType.GOVERNMENT: return 'bg-red-900/50 text-red-400'
            default: return 'bg-zinc-700/50 text-zinc-400'
        }
    }

    return (
        <Link href={`/dashboard/deals/companies/${company.id}`}>
            <div className="bg-zinc-800/50 border border-zinc-700 p-4 hover:border-amber-500/50 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                            <h4 className="font-mono text-sm text-white group-hover:text-amber-500 transition-colors">
                                {company.company_name}
                            </h4>
                            {company.industry && (
                                <p className="font-mono text-[10px] text-zinc-500">{company.industry}</p>
                            )}
                        </div>
                    </div>
                    <span className={cn('font-mono text-[9px] px-1.5 py-0.5', getCompanyTypeColor(company.company_type))}>
                        {company.company_type?.replace('_', ' ').toUpperCase()}
                    </span>
                </div>

                <div className="space-y-1.5">
                    {company.phone && (
                        <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[10px] text-zinc-400">{company.phone}</span>
                        </div>
                    )}
                    {company.email && (
                        <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[10px] text-zinc-400 truncate">{company.email}</span>
                        </div>
                    )}
                    {company.website && (
                        <div className="flex items-center gap-2">
                            <Globe className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[10px] text-zinc-400 truncate">{company.website}</span>
                        </div>
                    )}
                    {company.city && (
                        <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-zinc-500" />
                            <span className="font-mono text-[10px] text-zinc-400">{company.city}, {company.region}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-700/50">
                    <div className="flex items-center gap-4">
                        <div>
                            <span className="font-mono text-[10px] text-zinc-600">CONTACTS</span>
                            <span className="font-mono text-xs text-white ml-1">{company.contact_count || 0}</span>
                        </div>
                        <div>
                            <span className="font-mono text-[10px] text-zinc-600">DEALS</span>
                            <span className="font-mono text-xs text-amber-500 ml-1">{company.deal_count || 0}</span>
                        </div>
                    </div>
                    {company.total_deal_value && company.total_deal_value > 0 && (
                        <span className="font-mono text-[10px] text-green-400">
                            {formatCurrency(company.total_deal_value, 'GHS')}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    )
}

export default function CompaniesPage() {
    const [companies, setCompanies] = useState<Company[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    useEffect(() => {
        const loadCompanies = async () => {
            try {
                setIsLoading(true)
                setError(null)

                const data = await companiesApi.getAll({
                    page,
                    limit: 24,
                    search: searchTerm || undefined,
                    company_type: typeFilter !== 'all' ? typeFilter : undefined
                })

                setCompanies(data.data || [])
                setTotalPages(data.pagination?.totalPages || 1)
            } catch (err) {
                console.error('Failed to load companies:', err)
                setError('Failed to load companies')
            } finally {
                setIsLoading(false)
            }
        }
        loadCompanies()
    }, [page, searchTerm, typeFilter])

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-mono text-xl text-white">COMPANIES</h1>
                    <p className="font-mono text-[10px] text-zinc-500">Corporate clients, developers, and agencies</p>
                </div>
                <Link href="/dashboard/deals/companies/new">
                    <Button className="bg-amber-500 text-black hover:bg-amber-400 font-mono text-xs">
                        <Plus className="h-4 w-4 mr-2" />
                        NEW COMPANY
                    </Button>
                </Link>
            </div>

            <Panel title="FILTERS" className="!p-0">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                        <Input
                            placeholder="Search companies..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value)
                                setPage(1)
                            }}
                            className="pl-8 bg-zinc-800 border-zinc-700 text-white font-mono text-xs h-9"
                        />
                    </div>

                    <Select value={typeFilter} onValueChange={(v) => {
                        setTypeFilter(v)
                        setPage(1)
                    }}>
                        <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-white font-mono text-xs">
                            <SelectValue placeholder="Company Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                            <SelectItem value="all" className="font-mono text-xs text-white">All Types</SelectItem>
                            <SelectItem value="developer" className="font-mono text-xs text-white">Developer</SelectItem>
                            <SelectItem value="agency" className="font-mono text-xs text-white">Agency</SelectItem>
                            <SelectItem value="investor" className="font-mono text-xs text-white">Investor</SelectItem>
                            <SelectItem value="corporate" className="font-mono text-xs text-white">Corporate</SelectItem>
                            <SelectItem value="government" className="font-mono text-xs text-white">Government</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </Panel>

            {error && (
                <div className="border border-red-900 bg-red-900/20 p-4 text-center">
                    <p className="font-mono text-xs text-red-400">{error}</p>
                    <Button variant="link" onClick={() => window.location.reload()} className="text-amber-500 mt-2">Retry</Button>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
            ) : (
                <>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {companies.map((company) => (
                            <CompanyCard key={company.id} company={company} />
                        ))}
                    </div>

                    {companies.length === 0 && !error && (
                        <div className="text-center py-12 border border-zinc-800 bg-zinc-900/50">
                            <Building2 className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                            <p className="font-mono text-sm text-zinc-500">No companies found</p>
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="border-zinc-700 text-zinc-300">Previous</Button>
                            <span className="font-mono text-xs text-zinc-500">Page {page} of {totalPages}</span>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="border-zinc-700 text-zinc-300">Next</Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
