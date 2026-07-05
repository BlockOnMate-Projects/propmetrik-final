'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Users, Loader2, Mail, Phone, ArrowLeft,
  Shield, Briefcase, Building2,
  Clock, FileText, DollarSign, Activity,
  AlertCircle, CheckCircle2, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { authedFetch } from '@/lib/authed-fetch'
import { getRoleProfileConfig, TAB_LABELS } from '@/lib/roleProfileConfig'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { subTabsListClass, subTabsTriggerClass } from '@/components/layout/subTabStyles'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

const ROLE_CATEGORY_COLORS: Record<string, string> = {
  internal: 'border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/10',
  professional: 'border-purple-900 text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/10',
  construction: 'border-amber-900 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/10',
  government: 'border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/10',
  stakeholder: 'border-cyan-900 text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/10',
}

export default function MemberProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const memberId = params.memberId as string

  const [profileData, setProfileData] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileTab, setProfileTab] = useState<string>('overview')
  const [tabData, setTabData] = useState<Record<string, any>>({})
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({})
  const [resendingInvite, setResendingInvite] = useState(false)

  useEffect(() => {
    if (!memberId) return
    let cancelled = false
    setProfileLoading(true)
    authedFetch(`${API_BASE}/team/members/${memberId}/profile`)
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load profile')
        const json = await r.json()
        if (!cancelled) setProfileData(json.data)
      })
      .catch(() => { if (!cancelled) setProfileData(null) })
      .finally(() => { if (!cancelled) setProfileLoading(false) })
    return () => { cancelled = true }
  }, [memberId])

  const loadTabData = useCallback(async (tab: string) => {
    if (tabData[tab] || tabLoading[tab]) return
    const endpointMap: Record<string, string> = {
      timesheets: `${API_BASE}/team/members/${memberId}/timesheets`,
      documents: `${API_BASE}/team/members/${memberId}/documents`,
      financials: `${API_BASE}/team/members/${memberId}/financials`,
    }
    const url = endpointMap[tab]
    if (!url) return
    setTabLoading(prev => ({ ...prev, [tab]: true }))
    try {
      const r = await authedFetch(url)
      if (r.ok) {
        const json = await r.json()
        setTabData(prev => ({ ...prev, [tab]: json.data }))
      }
    } catch { /* silent */ }
    finally { setTabLoading(prev => ({ ...prev, [tab]: false })) }
  }, [tabData, tabLoading, memberId])

  useEffect(() => {
    if (memberId && profileTab) loadTabData(profileTab)
  }, [profileTab, memberId, loadTabData])

  const handleResendInvite = useCallback(async () => {
    if (!profileData?.member?.email) {
      toast({ title: 'Missing email', description: 'This member needs an email address before an invite can be sent.', variant: 'destructive' })
      return
    }

    setResendingInvite(true)
    try {
      const res = await authedFetch(`${API_BASE}/team/members/${memberId}/resend-invite`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Failed to resend invitation')

      const inviteUrl = json?.data?.invite_url as string | undefined
      if (inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl).catch(() => undefined)
      }

      toast({
        title: json?.message || 'Invitation sent',
        description: inviteUrl
          ? 'The account setup link has been copied to your clipboard.'
          : 'The account setup email has been sent.',
      })

      setProfileData((prev: any) => prev ? {
        ...prev,
        member: {
          ...prev.member,
          invited_at: new Date().toISOString(),
          status: 'pending',
        },
      } : prev)
    } catch (err: any) {
      toast({ title: 'Resend failed', description: err?.message || 'Failed to resend invitation', variant: 'destructive' })
    } finally {
      setResendingInvite(false)
    }
  }, [memberId, profileData, toast])

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
      </div>
    )
  }

  if (!profileData?.member) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/dashboard/projects/team')}
          className="text-muted-foreground hover:text-foreground font-mono text-xs gap-1.5 px-0">
          <ArrowLeft className="h-3.5 w-3.5" /> BACK TO TEAM
        </Button>
        <div className="text-center py-16 text-muted-foreground font-mono">
          <Users className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
          <p>Member not found</p>
        </div>
      </div>
    )
  }

  const m = profileData.member
  const role = m.role || ''
  const config = getRoleProfileConfig(role)
  const isPending = m.status === 'pending' || (!m.accepted_at && m.invited_at)

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Button variant="ghost" onClick={() => router.push('/dashboard/projects/team')}
        className="text-muted-foreground hover:text-foreground font-mono text-xs gap-1.5 px-0">
        <ArrowLeft className="h-3.5 w-3.5" /> BACK TO TEAM
      </Button>

      {/* ── Profile Header Card ── */}
      <Card className="bg-background border border-border">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <Avatar className="h-20 w-20 border-2 border-border shrink-0">
              <AvatarFallback className="bg-card text-amber-500 font-mono text-xl">
                {m.full_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '??'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold font-mono text-foreground tracking-tight">{m.full_name}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] font-mono uppercase ${ROLE_CATEGORY_COLORS[m.role_category || ''] || 'border-border text-muted-foreground'}`}>
                  {role.replace(/_/g, ' ')}
                </Badge>
                {isPending ? (
                  <Badge variant="outline" className="text-[10px] font-mono uppercase border-yellow-900 text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/10">
                    <AlertCircle className="h-2.5 w-2.5 mr-1" /> Pending
                  </Badge>
                ) : m.is_active ? (
                  <Badge variant="outline" className="text-[10px] font-mono uppercase border-emerald-900 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/10">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-mono uppercase border-red-900 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/10">
                    <XCircle className="h-2.5 w-2.5 mr-1" /> Inactive
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
                {m.email && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Mail className="h-3 w-3 shrink-0" /> {m.email}
                  </div>
                )}
                {m.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Phone className="h-3 w-3 shrink-0" /> {m.phone}
                  </div>
                )}
                {m.company && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Building2 className="h-3 w-3 shrink-0" /> {m.company}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Pending Invitation Banner ── */}
      {isPending && (
        <div className="p-4 bg-yellow-100 dark:bg-yellow-900/10 border border-yellow-900/30 rounded-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 text-xs font-mono font-bold mb-1">
                <AlertCircle className="h-3.5 w-3.5" /> INVITATION PENDING
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Invited on {new Date(m.invited_at).toLocaleDateString('en-GB')}.
                This member has not yet accepted their invitation.
              </p>
            </div>
            <Button onClick={handleResendInvite} disabled={resendingInvite}
              className="bg-amber-600 hover:bg-amber-500 text-foreground font-bold font-mono text-[10px] uppercase">
              {resendingInvite ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Resending...</> : 'Resend Invite'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Metrics Row ── */}
      {profileData.metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {profileData.metrics.activeProjects > 0 && (
            <Card className="bg-background border border-border">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-foreground font-mono">{profileData.metrics.activeProjects}</div>
                <div className="text-[10px] text-muted-foreground font-mono uppercase mt-1">Active Projects</div>
              </CardContent>
            </Card>
          )}
          {profileData.metrics.totalHours > 0 && (
            <Card className="bg-background border border-border">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-foreground font-mono">{profileData.metrics.totalHours.toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground font-mono uppercase mt-1">Total Hours</div>
              </CardContent>
            </Card>
          )}
          {profileData.metrics.documentsUploaded > 0 && (
            <Card className="bg-background border border-border">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-foreground font-mono">{profileData.metrics.documentsUploaded}</div>
                <div className="text-[10px] text-muted-foreground font-mono uppercase mt-1">Documents</div>
              </CardContent>
            </Card>
          )}
          {profileData.metrics.invoicesManaged > 0 && (
            <Card className="bg-background border border-border">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-foreground font-mono">{profileData.metrics.invoicesManaged}</div>
                <div className="text-[10px] text-muted-foreground font-mono uppercase mt-1">Invoices</div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Role-Aware Tabs ── */}
      <Tabs value={profileTab} onValueChange={setProfileTab}>
        <TabsList className={cn(subTabsListClass, 'flex-wrap h-auto')}>
          {config.tabs.map(tab => (
            <TabsTrigger key={tab} value={tab}
              className={subTabsTriggerClass}>
              {TAB_LABELS[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Details */}
            <Card className="bg-background border border-border">
              <CardContent className="p-5">
                <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">Details</h4>
                <div className="space-y-2.5">
                  {m.title && (
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Title</span><span className="text-muted-foreground">{m.title}</span>
                    </div>
                  )}
                  {m.department && (
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Department</span><span className="text-muted-foreground">{m.department}</span>
                    </div>
                  )}
                  {m.company && (
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Company</span><span className="text-muted-foreground">{m.company}</span>
                    </div>
                  )}
                  {m.phone_alt && (
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Alt Phone</span><span className="text-muted-foreground">{m.phone_alt}</span>
                    </div>
                  )}
                  {m.whatsapp && (
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">WhatsApp</span><span className="text-muted-foreground">{m.whatsapp}</span>
                    </div>
                  )}
                  {(m.hourly_rate || m.daily_rate) && (
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Rate</span>
                      <span className="text-muted-foreground">
                        {m.hourly_rate ? `${m.rate_currency || 'GHS'} ${m.hourly_rate}/hr` : ''}
                        {m.daily_rate ? `${m.hourly_rate ? ' · ' : ''}${m.rate_currency || 'GHS'} ${m.daily_rate}/day` : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Added</span>
                    <span className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                  {m.start_date && (
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Start Date</span>
                      <span className="text-muted-foreground">{new Date(m.start_date).toLocaleDateString('en-GB')}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {m.notes && (
              <Card className="bg-background border border-border">
                <CardContent className="p-5">
                  <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">Notes</h4>
                  <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">{m.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Activity */}
          {profileData.activity?.length > 0 && (
            <Card className="bg-background border border-border">
              <CardContent className="p-5">
                <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">
                  {config.activityLabel}
                </h4>
                <div className="space-y-2">
                  {profileData.activity.slice(0, 10).map((a: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs font-mono bg-card/50 border border-border/50 rounded p-2.5">
                      <Activity className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-amber-500/80">{a.action}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-muted-foreground">{a.entity_type}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px] shrink-0">{new Date(a.created_at).toLocaleDateString('en-GB')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Projects Tab ── */}
        <TabsContent value="projects" className="mt-5">
          <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">
            Assigned Projects ({profileData.projects?.length || 0})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profileData.projects?.length > 0 ? (
              profileData.projects.map((p: any) => (
                <Card key={p.membership_id} className="bg-background border border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-mono text-zinc-200 truncate">{p.project_name}</span>
                      </div>
                      <Badge variant="outline" className={`text-[9px] font-mono uppercase ${
                        p.status === 'active' ? 'border-emerald-900 text-emerald-600 dark:text-emerald-400' :
                        p.status === 'completed' ? 'border-blue-900 text-blue-600 dark:text-blue-400' :
                        'border-border text-muted-foreground'
                      }`}>{p.status || 'active'}</Badge>
                    </div>
                    {p.overall_progress != null && (
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                          <span>Progress</span><span>{p.overall_progress}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${p.overall_progress}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                      <span className="capitalize">{p.role?.replace(/_/g, ' ')}</span>
                      {p.start_date && <span>From {new Date(p.start_date).toLocaleDateString('en-GB')}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-2 text-center py-12 text-muted-foreground font-mono text-xs">No project assignments</div>
            )}
          </div>
        </TabsContent>

        {/* ── Timesheets Tab ── */}
        <TabsContent value="timesheets" className="mt-5">
          <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">Time Entries</h4>
          {tabLoading.timesheets ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 text-amber-600 animate-spin" /></div>
          ) : tabData.timesheets?.length > 0 ? (
            <div className="space-y-2">
              {tabData.timesheets.map((t: any) => (
                <Card key={t.id} className="bg-background border border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-mono text-zinc-200">{t.project_name}</span>
                      </div>
                      <span className="text-sm font-mono text-amber-500 font-bold">{t.hours_worked}h</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                      <span>{new Date(t.entry_date).toLocaleDateString('en-GB')}</span>
                      {t.activity_type && <span className="capitalize">{t.activity_type.replace(/_/g, ' ')}</span>}
                      <Badge variant="outline" className={`text-[9px] font-mono uppercase ${
                        t.status === 'approved' ? 'border-emerald-900 text-emerald-600 dark:text-emerald-400' :
                        t.status === 'rejected' ? 'border-red-900 text-red-600 dark:text-red-400' :
                        'border-border text-muted-foreground'
                      }`}>{t.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground font-mono text-xs">No time entries recorded</div>
          )}
        </TabsContent>

        {/* ── Documents Tab ── */}
        <TabsContent value="documents" className="mt-5">
          <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">Uploaded Documents</h4>
          {tabLoading.documents ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 text-amber-600 animate-spin" /></div>
          ) : tabData.documents?.length > 0 ? (
            <div className="space-y-2">
              {tabData.documents.map((d: any) => (
                <Card key={d.id} className="bg-background border border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-mono text-zinc-200 truncate">{d.name}</span>
                      </div>
                      {d.file_size && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {(d.file_size / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                      {d.project_name && <span>{d.project_name}</span>}
                      {d.document_type && <span className="capitalize">{d.document_type.replace(/_/g, ' ')}</span>}
                      <span>{new Date(d.created_at).toLocaleDateString('en-GB')}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground font-mono text-xs">No documents uploaded</div>
          )}
        </TabsContent>

        {/* ── Financials Tab ── */}
        <TabsContent value="financials" className="mt-5 space-y-5">
          {tabLoading.financials ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 text-amber-600 animate-spin" /></div>
          ) : (
            <>
              <div>
                <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">
                  Invoices ({tabData.financials?.invoices?.length || 0})
                </h4>
                <div className="space-y-2">
                  {tabData.financials?.invoices?.length > 0 ? (
                    tabData.financials.invoices.map((inv: any) => (
                      <Card key={inv.id} className="bg-background border border-border">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-mono text-zinc-200">{inv.invoice_number || 'Invoice'}</span>
                            </div>
                            <span className="text-sm font-mono text-amber-500 font-bold">
                              {inv.currency || 'GHS'} {parseFloat(inv.amount || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                            {inv.project_name && <span>{inv.project_name}</span>}
                            <Badge variant="outline" className={`text-[9px] font-mono uppercase ${
                              inv.status === 'paid' ? 'border-emerald-900 text-emerald-600 dark:text-emerald-400' :
                              inv.status === 'overdue' ? 'border-red-900 text-red-600 dark:text-red-400' :
                              'border-border text-muted-foreground'
                            }`}>{inv.status}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground font-mono text-xs">No invoices</div>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">
                  Expenses ({tabData.financials?.expenses?.length || 0})
                </h4>
                <div className="space-y-2">
                  {tabData.financials?.expenses?.length > 0 ? (
                    tabData.financials.expenses.map((exp: any) => (
                      <Card key={exp.id} className="bg-background border border-border">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-mono text-zinc-200">{exp.payee_name || exp.expense_type || 'Expense'}</span>
                            </div>
                            <span className="text-sm font-mono text-red-600 dark:text-red-400 font-bold">
                              {exp.currency || 'GHS'} {parseFloat(exp.amount || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
                            {exp.project_name && <span>{exp.project_name}</span>}
                            <span>{new Date(exp.expense_date).toLocaleDateString('en-GB')}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground font-mono text-xs">No expenses</div>
                  )}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Permissions Tab ── */}
        <TabsContent value="permissions" className="mt-5">
          <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">Permission Flags</h4>
          <Card className="bg-background border border-border">
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                {m.permissions && Object.entries(m.permissions).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className={`h-2.5 w-2.5 rounded-full ${value ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                  </div>
                ))}
                {(!m.permissions || Object.keys(m.permissions).length === 0) && (
                  <div className="col-span-2 text-center py-6 text-muted-foreground font-mono text-xs">No permissions configured</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Activity Tab ── */}
        <TabsContent value="activity" className="mt-5">
          <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mb-3">
            {config.activityLabel}
          </h4>
          {profileData.activity?.length > 0 ? (
            <div className="space-y-2">
              {profileData.activity.map((a: any, i: number) => (
                <Card key={i} className="bg-background border border-border">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2 text-xs font-mono">
                      <Activity className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-amber-500/80">{a.action}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-muted-foreground">{a.entity_type}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px] shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground font-mono text-xs">No recent activity</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
