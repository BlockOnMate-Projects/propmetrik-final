'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  LayoutGrid,
  Users,
  Building2,
  UserCircle,
  CheckSquare,
  BarChart3,
  Search,
  Plus,
  Settings,
  FileText,
  DollarSign,
  Home,
  ArrowRight,
  Clock,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { dealsApi, contactsApi, companiesApi } from '@/lib/crm-api'
import type { Deal, Contact, Company } from '@/types/crm'
import { formatCurrency } from '@/lib/utils'

// =====================================================
// QUICK ACTIONS
// =====================================================
const QUICK_ACTIONS = [
  { id: 'new_deal', label: 'Create Deal', icon: Plus, href: '/dashboard/deals/new', shortcut: 'N' },
  { id: 'new_contact', label: 'Create Contact', icon: Plus, href: '/dashboard/deals/contacts/new', shortcut: 'C' },
  { id: 'new_company', label: 'Create Company', icon: Plus, href: '/dashboard/deals/companies/new' },
  { id: 'new_task', label: 'Create Task', icon: Plus, href: '/dashboard/deals/tasks/new' },
]

const NAVIGATION = [
  { id: 'nav_deals', label: 'Deals', icon: LayoutGrid, href: '/dashboard/deals', shortcut: 'G D' },
  { id: 'nav_contacts', label: 'Contacts', icon: Users, href: '/dashboard/deals/contacts', shortcut: 'G C' },
  { id: 'nav_companies', label: 'Companies', icon: Building2, href: '/dashboard/deals/companies' },
  { id: 'nav_agents', label: 'Agents', icon: UserCircle, href: '/dashboard/deals/agents' },
  { id: 'nav_tasks', label: 'Tasks', icon: CheckSquare, href: '/dashboard/deals/tasks' },
  { id: 'nav_documents', label: 'Documents', icon: FileText, href: '/dashboard/deals/documents' },
  { id: 'nav_analytics', label: 'Analytics', icon: BarChart3, href: '/dashboard/deals/analytics', shortcut: 'G A' },
  { id: 'nav_financials', label: 'Financials', icon: DollarSign, href: '/dashboard/deals/financials' },
  { id: 'nav_properties', label: 'Properties', icon: Home, href: '/dashboard/deals/properties' },
  { id: 'nav_pipelines', label: 'Pipelines', icon: Settings, href: '/dashboard/deals/pipelines' },
]

// =====================================================
// DEBOUNCE HOOK
// =====================================================
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// =====================================================
// COMMAND PALETTE
// =====================================================
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{
    deals: Deal[]
    contacts: Contact[]
    companies: Company[]
  }>({ deals: [], contacts: [], companies: [] })
  const [isSearching, setIsSearching] = useState(false)
  const router = useRouter()
  const debouncedSearch = useDebouncedValue(search, 300)

  // Global Cmd+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Search across entities when query changes
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setSearchResults({ deals: [], contacts: [], companies: [] })
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)

    Promise.allSettled([
      dealsApi.getAll({ search: debouncedSearch, limit: 5 }),
      contactsApi.getAll({ search: debouncedSearch, limit: 5 }),
      companiesApi.getAll({ search: debouncedSearch, limit: 5 }),
    ]).then(([dealsResult, contactsResult, companiesResult]) => {
      if (cancelled) return
      setSearchResults({
        deals: dealsResult.status === 'fulfilled' ? (dealsResult.value?.data || []) : [],
        contacts: contactsResult.status === 'fulfilled' ? (contactsResult.value?.data || []) : [],
        companies: companiesResult.status === 'fulfilled' ? (companiesResult.value?.data || []) : [],
      })
      setIsSearching(false)
    })

    return () => { cancelled = true }
  }, [debouncedSearch])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      setSearch('')
      router.push(href)
    },
    [router]
  )

  const hasSearchResults =
    searchResults.deals.length > 0 ||
    searchResults.contacts.length > 0 ||
    searchResults.companies.length > 0

  return (
    <>
      {/* Trigger button for header */}
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground bg-muted/50 border border-border rounded-md hover:bg-muted transition-colors w-64"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">Search or jump to...</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Command Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search deals, contacts, companies, or type a command..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : search.length > 0 ? (
              'No results found.'
            ) : (
              'Start typing to search...'
            )}
          </CommandEmpty>

          {/* Search results */}
          {hasSearchResults && (
            <>
              {searchResults.deals.length > 0 && (
                <CommandGroup heading="Deals">
                  {searchResults.deals.map((deal) => (
                    <CommandItem
                      key={deal.id}
                      value={`deal-${deal.id}-${deal.title}`}
                      onSelect={() => navigate(`/dashboard/deals/${deal.id}`)}
                    >
                      <LayoutGrid className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm truncate">{deal.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {deal.deal_number} • {deal.stage_name} • {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                        </span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {searchResults.contacts.length > 0 && (
                <CommandGroup heading="Contacts">
                  {searchResults.contacts.map((contact) => (
                    <CommandItem
                      key={contact.id}
                      value={`contact-${contact.id}-${contact.first_name} ${contact.last_name}`}
                      onSelect={() => navigate(`/dashboard/deals/contacts/${contact.id}`)}
                    >
                      <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm truncate">
                          {contact.first_name} {contact.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {contact.email || contact.phone_primary || 'No contact info'} • {contact.lead_status}
                        </span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {searchResults.companies.length > 0 && (
                <CommandGroup heading="Companies">
                  {searchResults.companies.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={`company-${company.id}-${company.company_name}`}
                      onSelect={() => navigate(`/dashboard/deals/companies/${company.id}`)}
                    >
                      <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm truncate">{company.company_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {company.company_type} • {company.city || 'No location'}
                        </span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandSeparator />
            </>
          )}

          {/* Quick Actions */}
          {!search && (
            <CommandGroup heading="Quick Actions">
              {QUICK_ACTIONS.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.label}
                  onSelect={() => navigate(action.href)}
                >
                  <action.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{action.label}</span>
                  {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Navigation */}
          <CommandGroup heading={search ? 'Pages' : 'Go To'}>
            {NAVIGATION.map((item) => (
              <CommandItem
                key={item.id}
                value={item.label}
                onSelect={() => navigate(item.href)}
              >
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
