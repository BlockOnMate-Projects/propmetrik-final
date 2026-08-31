'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  TerminalPanel,
  Metric,
  StatusBadge,
  PriorityBadge,
  PropertyTypeBadge,
  FilterTabs,
  Currency,
  ConfidenceBar,
  AlertBanner,
  KeyboardShortcut,
} from '@/components/ui/terminal'
import { valuationsApi, type ValuationFilters } from '@/lib/valuation-api'
import { reportsApi } from '@/lib/reports-api'
import { authedFetch } from '@/lib/authed-fetch'
import type { Valuation, ValuationStatsResponse, ValuationStatus } from '@/types/valuation'
import { Plus, Search, Filter, RefreshCw, Download, Loader2, Edit2, Trash2 } from 'lucide-react'

interface OrgMember {
  id: string
  email: string
  firstName: string
  lastName: string
  displayName: string
  role: string
}

interface TeamMember {
  userId: string
  userName: string
  userEmail: string
  teamRole: string
}

// Status filter mapping
const statusFilters = [
  { value: 'all', label: 'ALL' },
  { value: 'draft', label: 'DRAFT' },
  { value: 'in_progress', label: 'IN PROGRESS' },
  { value: 'pending_review', label: 'PENDING' },
  { value: 'completed', label: 'COMPLETED' },
]

// Format relative time (client-only to avoid hydration mismatch)
function formatRelativeTime(dateString: string, isMounted: boolean): string {
  if (!isMounted) return '—'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-GB')
}

export default function ValuationsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isOrganization = !!(session?.user as any)?.organizationId
  const userRole = (session?.user as any)?.role || ''
  // Only management roles can reassign valuers
  const canAssign = ['super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager'].includes(userRole)
  const [filter, setFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [stats, setStats] = useState<ValuationStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Org assignment state
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])
  const [assignMap, setAssignMap] = useState<Record<string, TeamMember | null>>({})
  const [assigning, setAssigning] = useState<string | null>(null) // valuationId being assigned

  // Auth headers for org API calls
  const getOrgHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = (session as any)?.accessToken as string | undefined
    const orgId = (session?.user as any)?.organizationId as string | undefined
    const userId = session?.user?.id

    if (token) headers['Authorization'] = `Bearer ${token}`
    if (orgId) headers['x-organization-id'] = orgId
    if (userId) headers['x-user-id'] = userId
    return headers
  }, [session])

  // Fetch org members for dropdown
  const fetchOrgMembers = useCallback(async () => {
    try {
      const res = await authedFetch('/api/valuation-org/members', { headers: getOrgHeaders() })
      if (res.ok) {
        const data = await res.json()
        setOrgMembers(data.data || [])
      }
    } catch { /* silent */ }
  }, [getOrgHeaders])

  // Fetch lead assignee for a single valuation
  const fetchTeamForValuation = useCallback(async (valuationId: string): Promise<TeamMember | null> => {
    try {
      const res = await authedFetch(`/api/valuation-org/valuations/${valuationId}/team`, { headers: getOrgHeaders() })
      if (res.ok) {
        const data = await res.json()
        const members: TeamMember[] = data.data || []
        // Return the lead_valuer if exists, otherwise the first member
        return members.find(m => m.teamRole === 'lead_valuer') || members[0] || null
      }
    } catch { /* silent */ }
    return null
  }, [getOrgHeaders])

  // Assign valuer to valuation
  const handleAssign = async (valuationId: string, userId: string) => {
    if (!userId) return
    setAssigning(valuationId)
    try {
      const res = await authedFetch(`/api/valuation-org/valuations/${valuationId}/team`, {
        method: 'POST',
        headers: getOrgHeaders(),
        body: JSON.stringify({ userId, teamRole: 'lead_valuer' }),
      })
      if (res.ok) {
        // Refresh this valuation's assignment
        const member = await fetchTeamForValuation(valuationId)
        setAssignMap(prev => ({ ...prev, [valuationId]: member }))
      }
    } catch { /* silent */ }
    setAssigning(null)
  }

  // Set mounted after hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch valuations and stats
  const fetchData = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      // Build filters
      const filters: ValuationFilters = {
        limit: 50,
        sortBy: 'created_at',
        sortOrder: 'desc',
      }

      if (filter !== 'all') {
        filters.status = filter as ValuationStatus
      }

      if (searchQuery) {
        filters.search = searchQuery
      }

      // Fetch both in parallel
      const [valuationsRes, statsRes] = await Promise.all([
        valuationsApi.getAll(filters),
        valuationsApi.getStats(),
      ])

      if (valuationsRes.error) {
        console.warn('Valuations load issue:', valuationsRes.error)
        setValuations([])
        setStats(statsRes.data || null)
        setError(valuationsRes.error)
        return
      }

      setValuations((valuationsRes.data as unknown as Valuation[]) || [])
      setStats(statsRes.data || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load valuations')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [filter])

  // Fetch org members + team assignments once valuations load
  useEffect(() => {
    if (valuations.length === 0) return
    fetchOrgMembers()
    // Fetch team for each valuation
    const loadAssignments = async () => {
      const map: Record<string, TeamMember | null> = {}
      await Promise.all(
        valuations.map(async (v) => {
          map[v.id] = await fetchTeamForValuation(v.id)
        })
      )
      setAssignMap(map)
    }
    loadAssignments()
  }, [valuations, fetchOrgMembers, fetchTeamForValuation])

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== '') {
        fetchData()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Handle row click
  const handleRowClick = (valuation: Valuation) => {
    router.push(`/dashboard/valuations/${valuation.id}`)
  }

  // Handle valuation deletion
  const handleDelete = async (e: React.MouseEvent, valuationId: string) => {
    e.stopPropagation()

    if (!confirm('Are you sure you want to delete this valuation? This action cannot be undone.')) {
      return
    }

    try {
      await valuationsApi.delete(valuationId)
      // Refresh the list
      fetchData()
    } catch (err) {
      alert('Failed to delete valuation. Please try again.')
    }
  }

  // Handle valuation report download
  // A report is downloadable only once it's finalized (valuer-sealed or client-signed).
  const isFinalized = (status?: string) => ['approved', 'completed'].includes(String(status || ''))
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownload = async (e: React.MouseEvent, valuation: Valuation) => {
    e.stopPropagation()
    if (!isFinalized(valuation.status) || downloadingId) return
    setDownloadingId(valuation.id)
    try {
      // Resolve the finalized sealed/signed PDF and download it directly (not the live viewer).
      const res = await reportsApi.downloadFinalForValuation(valuation.id)
      if (!res?.available || !res.download_url) {
        alert(
          res?.reason === 'not_finalized'
            ? 'This report is not finalized yet — approve and seal it first.'
            : 'No finalized report PDF is available for this valuation yet.'
        )
        return
      }
      const a = document.createElement('a')
      a.href = res.download_url
      a.download = res.filename || 'Valuation_Report.pdf'
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      alert('Failed to download report. Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  // Get status counts for filter tabs
  const getStatusCount = (status: string): number | undefined => {
    if (!stats) return undefined
    switch (status) {
      case 'all': return stats.total
      case 'draft': return stats.byStatus?.draft
      case 'in_progress': return stats.byStatus?.in_progress
      case 'pending_review': return stats.byStatus?.pending_review
      case 'completed': return stats.byStatus?.completed
      default: return undefined
    }
  }

  const filterOptions = statusFilters.map(f => ({
    ...f,
    count: getStatusCount(f.value),
  }))

  // Timestamp for header (only calculate after mount to avoid hydration mismatch)
  const timestamp = mounted ? new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  }) : '--:--'

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-mono text-lg sm:text-xl text-foreground">VALUATION TERMINAL</h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            Property Assessment & Pricing Engine • <span className="text-amber-500">{timestamp}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-muted text-muted-foreground font-mono text-xs hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
          <Link
            href="/dashboard/valuations/new"
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
          >
            <Plus className="w-3 h-3" />
            NEW VALUATION
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <AlertBanner
          type="error"
          title="Failed to load valuations"
          message={error}
          action={
            <button
              onClick={() => fetchData()}
              className="font-mono text-xs text-red-600 dark:text-red-400 hover:text-red-300"
            >
              RETRY
            </button>
          }
        />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <TerminalPanel title="TOTAL" status={loading ? 'loading' : 'live'}>
          <Metric
            label="ALL TIME"
            value={stats?.total ?? '—'}
            color="default"
          />
        </TerminalPanel>
        <TerminalPanel title="DRAFT">
          <Metric
            label="AWAITING START"
            value={stats?.byStatus.draft ?? '—'}
            color="default"
          />
        </TerminalPanel>
        <TerminalPanel title="IN PROGRESS">
          <Metric
            label="PROCESSING"
            value={stats?.byStatus.in_progress ?? '—'}
            color="blue"
          />
        </TerminalPanel>
        <TerminalPanel title="PENDING REVIEW">
          <Metric
            label="AWAITING"
            value={stats?.byStatus.pending_review ?? '—'}
            color="amber"
          />
        </TerminalPanel>
        <TerminalPanel title="COMPLETED">
          <Metric
            label="FINISHED"
            value={stats?.byStatus.completed ?? '—'}
            color="green"
          />
        </TerminalPanel>
        <TerminalPanel title="AVG VALUE">
          <Metric
            label="PER PROPERTY"
            value={stats?.avg_value ? `₵${(stats.avg_value / 1000).toFixed(0)}K` : '—'}
            color="green"
          />
        </TerminalPanel>
      </div>

      {/* Search and Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <FilterTabs
          options={filterOptions}
          value={filter}
          onChange={setFilter}
        />
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search valuations..."
              className="w-full sm:w-64 pl-9 pr-3 py-2 bg-card border border-border text-foreground font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-muted text-muted-foreground font-mono text-xs hover:text-foreground transition-colors">
            <Filter className="w-3 h-3" />
            <span className="hidden sm:inline">FILTERS</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-muted text-muted-foreground font-mono text-xs hover:text-foreground transition-colors">
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">EXPORT</span>
          </button>
        </div>
      </div>

      {/* Valuations Table */}
      <TerminalPanel
        title="VALUATION QUEUE"
        status={loading ? 'loading' : undefined}
        timestamp={`${valuations.length} records`}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            <span className="ml-3 font-mono text-xs text-muted-foreground">Loading valuations...</span>
          </div>
        ) : valuations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="font-mono text-xs mb-2">No valuations found</div>
            <Link
              href="/dashboard/valuations/new"
              className="font-mono text-xs text-amber-500 hover:text-amber-400"
            >
              Create your first valuation →
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {valuations.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleRowClick(item)}
                  className="border border-border rounded-lg p-3 hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-amber-500">VAL-{item.id.slice(0, 8).toUpperCase()}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-foreground text-sm font-medium mb-1 truncate">
                    {item.property?.title || item.property?.address || 'Unnamed Property'}
                  </p>
                  <p className="text-muted-foreground text-xs mb-2">
                    {item.property?.city || item.property?.region || '—'}
                    {item.property?.digital_address && (
                      <span className="text-cyan-600 dark:text-cyan-400 ml-2">{item.property.digital_address}</span>
                    )}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <PropertyTypeBadge type={item.property?.property_type || 'residential'} />
                      <span className="text-muted-foreground">Step {Math.min(item.current_step || 1, 8)}/8</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.final_value_ghs ? (
                        <span className="text-green-600 dark:text-green-400 font-mono"><Currency value={item.final_value_ghs} compact /></span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <span className="text-muted-foreground">{formatRelativeTime(item.updated_at || '', mounted)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-border/50">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRowClick(item); }}
                      className="p-1.5 text-muted-foreground hover:text-amber-400 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDownload(e, item)}
                      disabled={!isFinalized(item.status) || downloadingId === item.id}
                      className={`p-1.5 transition-colors ${isFinalized(item.status) ? 'text-muted-foreground hover:text-green-400' : 'text-muted-foreground/30 cursor-not-allowed'}`}
                      title={isFinalized(item.status) ? 'Download signed report' : 'Available once the report is finalized'}
                    >
                      {downloadingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
                  <th className="text-left pb-2 w-28">ID</th>
                  <th className="text-left pb-2 w-40">ASSIGN</th>
                  <th className="text-left pb-2">PROPERTY</th>
                  <th className="text-left pb-2 w-28">DIGITAL ADDR</th>
                  <th className="text-left pb-2 w-28">LOCATION</th>
                  <th className="text-left pb-2 w-24">TYPE</th>
                  <th className="text-right pb-2 w-28">VALUE</th>
                  <th className="text-center pb-2 w-24">CONFIDENCE</th>
                  <th className="text-left pb-2 w-28">STATUS</th>
                  <th className="text-left pb-2 w-16">STEP</th>
                  <th className="text-right pb-2 w-24">UPDATED</th>
                  <th className="text-center pb-2 w-28">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {valuations.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item)}
                    className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer group"
                  >
                    <td className="py-2 text-amber-500 group-hover:text-amber-400">
                      VAL-{item.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-2" onClick={(e) => e.stopPropagation()}>
                      {assigning === item.id ? (
                        <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                      ) : canAssign ? (
                        <select
                          value={assignMap[item.id]?.userId || ''}
                          onChange={(e) => handleAssign(item.id, e.target.value)}
                          className="w-full px-1.5 py-1 bg-card border border-border text-xs font-mono text-foreground focus:outline-none focus:border-amber-500/50 cursor-pointer hover:border-zinc-500 transition-colors"
                        >
                          <option value="">— Unassigned —</option>
                          {orgMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.displayName || `${m.firstName} ${m.lastName}`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground">
                          {assignMap[item.id]?.userName || <span className="text-muted-foreground">— Unassigned —</span>}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-foreground">
                      {item.property?.title || item.property?.address || 'Unnamed Property'}
                    </td>
                    <td className="py-2 text-cyan-600 dark:text-cyan-400 font-mono text-[10px]">
                      {item.property?.digital_address || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {item.property?.city || item.property?.region || '—'}
                    </td>
                    <td className="py-2">
                      <PropertyTypeBadge type={item.property?.property_type || 'residential'} />
                    </td>
                    <td className="py-2 text-right">
                      {item.final_value_ghs ? (
                        <Currency value={item.final_value_ghs} compact />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {item.confidence_score ? (
                        <ConfidenceBar score={item.confidence_score} size="sm" />
                      ) : (
                        <span className="text-muted-foreground text-[10px]">N/A</span>
                      )}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {Math.min(item.current_step || 1, 8)}/8
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {formatRelativeTime(item.updated_at || '', mounted)}
                    </td>
                    <td className="py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(item);
                          }}
                          className="p-1 text-muted-foreground hover:text-amber-400 transition-colors"
                          title="Edit Valuation"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDownload(e, item)}
                          disabled={!isFinalized(item.status) || downloadingId === item.id}
                          className={`p-1 transition-colors ${isFinalized(item.status) ? 'text-muted-foreground hover:text-green-400' : 'text-muted-foreground/30 cursor-not-allowed'}`}
                          title={isFinalized(item.status) ? 'Download signed report' : 'Available once the report is finalized'}
                        >
                          {downloadingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Delete Valuation"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </TerminalPanel>

      {/* Keyboard Shortcuts Footer */}
      <div className="mt-4 hidden sm:flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <KeyboardShortcut keys={['⌘', 'N']} />
          <span className="font-mono text-[10px] text-muted-foreground">New Valuation</span>
        </div>
        <div className="flex items-center gap-2">
          <KeyboardShortcut keys={['⌘', 'K']} />
          <span className="font-mono text-[10px] text-muted-foreground">Search</span>
        </div>
        <div className="flex items-center gap-2">
          <KeyboardShortcut keys={['R']} />
          <span className="font-mono text-[10px] text-muted-foreground">Refresh</span>
        </div>
      </div>
    </div>
  )
}
