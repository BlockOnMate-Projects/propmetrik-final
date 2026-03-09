'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
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
  Search,
  Plus,
  FileText,
  DollarSign,
  Home,
  ArrowRight,
  Loader2,
  BarChart3,
  HardHat,
  MapPin,
  Settings,
  Bell,
  Clipboard,
  ShieldCheck,
  Receipt,
  UserCircle,
  CheckSquare,
  Hammer,
} from 'lucide-react'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

// ── Quick Actions (no search needed) ───────────────
const QUICK_ACTIONS = [
  { id: 'new_project', label: 'Create Project', icon: Plus, href: '/dashboard/projects', shortcut: 'N P' },
  { id: 'new_valuation', label: 'New Valuation', icon: Plus, href: '/dashboard/valuations', shortcut: 'N V' },
  { id: 'new_deal', label: 'Create Deal', icon: Plus, href: '/dashboard/deals/new', shortcut: 'N D' },
  { id: 'new_contact', label: 'Create Contact', icon: Plus, href: '/dashboard/deals/contacts/new' },
]

// ── Navigation targets ─────────────────────────────
const NAVIGATION = [
  { id: 'nav_overview', label: 'Overview', icon: LayoutGrid, href: '/dashboard', shortcut: 'G O' },
  { id: 'nav_valuations', label: 'Valuations', icon: ShieldCheck, href: '/dashboard/valuations', shortcut: 'G V' },
  { id: 'nav_deals', label: 'Deals / CRM', icon: DollarSign, href: '/dashboard/deals', shortcut: 'G D' },
  { id: 'nav_projects', label: 'Projects', icon: HardHat, href: '/dashboard/projects', shortcut: 'G P' },
  { id: 'nav_properties', label: 'Properties', icon: Home, href: '/dashboard/property-management' },
  { id: 'nav_marketplace', label: 'Marketplace', icon: MapPin, href: '/dashboard/marketplace' },
  { id: 'nav_analytics', label: 'Analytics', icon: BarChart3, href: '/dashboard/analytics' },
  { id: 'nav_notifications', label: 'Notifications', icon: Bell, href: '/dashboard/notifications' },
  { id: 'nav_team', label: 'Team', icon: Users, href: '/dashboard/projects/team' },
  { id: 'nav_documents', label: 'Documents', icon: FileText, href: '/dashboard/projects/documents' },
  { id: 'nav_budget', label: 'Budget', icon: Receipt, href: '/dashboard/projects/budget' },
  { id: 'nav_rfis', label: 'RFIs', icon: Clipboard, href: '/dashboard/projects/rfis' },
  { id: 'nav_schedule', label: 'Schedule', icon: CheckSquare, href: '/dashboard/projects/schedule' },
  { id: 'nav_admin', label: 'Admin', icon: Settings, href: '/dashboard/admin' },
]

// ── Debounce hook ──────────────────────────────────
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ── Global Search Component ────────────────────────
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<{
    projects: any[]
    properties: any[]
    deals: any[]
    contacts: any[]
    companies: any[]
  }>({ projects: [], properties: [], deals: [], contacts: [], companies: [] })
  const router = useRouter()
  const debouncedSearch = useDebouncedValue(search, 300)

  // Cmd+K listener
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

  // Multi-entity search
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setResults({ projects: [], properties: [], deals: [], contacts: [], companies: [] })
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)

    const fetchJson = async (url: string) => {
      try {
        const res = await authedFetch(url)
        if (!res.ok) return []
        const json = await res.json()
        return json.data || json.projects || json.properties || json || []
      } catch { return [] }
    }

    Promise.allSettled([
      fetchJson(`${API_BASE}/v1/projects?search=${encodeURIComponent(debouncedSearch)}&limit=5`),
      fetchJson(`${API_BASE}/v1/properties?search=${encodeURIComponent(debouncedSearch)}&limit=5`),
      fetchJson(`${API_BASE}/v1/crm/deals?search=${encodeURIComponent(debouncedSearch)}&limit=5`),
      fetchJson(`${API_BASE}/v1/crm/contacts?search=${encodeURIComponent(debouncedSearch)}&limit=5`),
      fetchJson(`${API_BASE}/v1/crm/companies?search=${encodeURIComponent(debouncedSearch)}&limit=5`),
    ]).then(([projectsR, propertiesR, dealsR, contactsR, companiesR]) => {
      if (cancelled) return
      const extract = (r: PromiseSettledResult<any[]>) => r.status === 'fulfilled' ? (Array.isArray(r.value) ? r.value.slice(0, 5) : []) : []
      setResults({
        projects: extract(projectsR),
        properties: extract(propertiesR),
        deals: extract(dealsR),
        contacts: extract(contactsR),
        companies: extract(companiesR),
      })
      setIsSearching(false)
    })

    return () => { cancelled = true }
  }, [debouncedSearch])

  const navigate = useCallback((href: string) => {
    setOpen(false)
    setSearch('')
    router.push(href)
  }, [router])

  const hasResults = Object.values(results).some(arr => arr.length > 0)

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search projects, properties, deals, contacts…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching ? (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Searching…</span>
            </div>
          ) : search.length > 0 ? (
            'No results found.'
          ) : (
            'Type to search across all modules…'
          )}
        </CommandEmpty>

        {/* Search results */}
        {hasResults && (
          <>
            {results.projects.length > 0 && (
              <CommandGroup heading="Projects">
                {results.projects.map((p: any) => (
                  <CommandItem
                    key={p.id}
                    value={`project-${p.id}-${p.name || p.project_name}`}
                    onSelect={() => navigate(`/dashboard/projects/${p.id}`)}
                  >
                    <HardHat className="mr-2 h-4 w-4 text-amber-500" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm truncate">{p.name || p.project_name}</span>
                      <span className="text-xs text-muted-foreground">{p.status} • {p.location || '—'}</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.properties.length > 0 && (
              <CommandGroup heading="Properties">
                {results.properties.map((p: any) => (
                  <CommandItem
                    key={p.id}
                    value={`property-${p.id}-${p.address || p.name}`}
                    onSelect={() => navigate(`/dashboard/property-management/${p.id}`)}
                  >
                    <Home className="mr-2 h-4 w-4 text-green-500" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm truncate">{p.address || p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.property_type} • {p.city || '—'}</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.deals.length > 0 && (
              <CommandGroup heading="Deals">
                {results.deals.map((d: any) => (
                  <CommandItem
                    key={d.id}
                    value={`deal-${d.id}-${d.title}`}
                    onSelect={() => navigate(`/dashboard/deals/${d.id}`)}
                  >
                    <DollarSign className="mr-2 h-4 w-4 text-cyan-500" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm truncate">{d.title}</span>
                      <span className="text-xs text-muted-foreground">{d.stage_name} • {d.deal_number || '—'}</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.contacts.length > 0 && (
              <CommandGroup heading="Contacts">
                {results.contacts.map((c: any) => (
                  <CommandItem
                    key={c.id}
                    value={`contact-${c.id}-${c.first_name} ${c.last_name}`}
                    onSelect={() => navigate(`/dashboard/deals/contacts/${c.id}`)}
                  >
                    <UserCircle className="mr-2 h-4 w-4 text-purple-400" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm truncate">{c.first_name} {c.last_name}</span>
                      <span className="text-xs text-muted-foreground">{c.email || c.phone_primary || 'No info'}</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.companies.length > 0 && (
              <CommandGroup heading="Companies">
                {results.companies.map((c: any) => (
                  <CommandItem
                    key={c.id}
                    value={`company-${c.id}-${c.company_name}`}
                    onSelect={() => navigate(`/dashboard/deals/companies/${c.id}`)}
                  >
                    <Building2 className="mr-2 h-4 w-4 text-blue-400" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm truncate">{c.company_name}</span>
                      <span className="text-xs text-muted-foreground">{c.company_type} • {c.city || '—'}</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground ml-2" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
          </>
        )}

        {/* Quick Actions (only when empty) */}
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
  )
}
