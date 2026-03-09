'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Users, UserPlus, Search, MoreVertical, Loader2, Mail, Phone,
  Shield, Star, Briefcase, Building2, Filter, UserX, UserCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { authedFetch } from '@/lib/authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

interface TeamMember {
  id: string
  user_id?: string
  project_id?: string
  project_name?: string
  name: string
  email?: string
  phone?: string
  role: string
  role_category?: string
  is_active: boolean
  permissions?: Record<string, boolean>
  organization_id?: string
  notes?: string
  created_at: string
  updated_at?: string
}

interface Vendor {
  id: string
  company_name: string
  contact_name?: string
  email?: string
  phone?: string
  category?: string
  rating?: number
  is_approved?: boolean
  is_preferred?: boolean
  projects_count?: number
  created_at: string
}

const ROLE_CATEGORIES = [
  { key: 'internal', label: 'Internal', icon: Building2 },
  { key: 'professional', label: 'Professional', icon: Briefcase },
  { key: 'construction', label: 'Construction', icon: Users },
  { key: 'government', label: 'Government', icon: Shield },
  { key: 'stakeholder', label: 'Stakeholder', icon: Star },
]

const ROLE_CATEGORY_COLORS: Record<string, string> = {
  internal: 'border-blue-900 text-blue-400 bg-blue-900/10',
  professional: 'border-purple-900 text-purple-400 bg-purple-900/10',
  construction: 'border-amber-900 text-amber-400 bg-amber-900/10',
  government: 'border-emerald-900 text-emerald-400 bg-emerald-900/10',
  stakeholder: 'border-cyan-900 text-cyan-400 bg-cyan-900/10',
}

export default function TeamManagementPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('members')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25

  // Add member dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newMember, setNewMember] = useState({ name: '', email: '', phone: '', role: 'project_manager', project_id: '' })
  const [adding, setAdding] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  // Member detail
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    authedFetch(`${API_BASE}/projects?limit=100`).then(async r => {
      if (r.ok) {
        const data = await r.json()
        setProjects((data.data || data.projects || []).map((p: any) => ({ id: p.id, name: p.project_name || p.name })))
      }
    }).catch(() => {})
  }, [])

  const loadMembers = useCallback(async () => {
    try {
      setIsLoading(true); setError(null)
      const params = new URLSearchParams({ limit: String(limit), offset: String((page - 1) * limit) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (roleFilter !== 'all') params.set('role', roleFilter)

      const res = await authedFetch(`${API_BASE}/team/members?${params}`)
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`)
      const data = await res.json()
      setMembers(data.data || data.members || data || [])
      setTotal(data.total || data.pagination?.total || (data.data || data.members || data || []).length)
    } catch (err: any) {
      setError(err?.message || 'Failed to load team members')
    } finally {
      setIsLoading(false)
    }
  }, [page, debouncedSearch, roleFilter])

  const loadVendors = useCallback(async () => {
    try {
      setIsLoading(true); setError(null)
      const params = new URLSearchParams({ limit: String(limit), offset: String((page - 1) * limit) })
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await authedFetch(`${API_BASE}/vendors?${params}`)
      if (!res.ok) throw new Error(`Failed to load vendors: ${res.status}`)
      const data = await res.json()
      setVendors(data.data || data.vendors || data || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load vendors')
    } finally {
      setIsLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => {
    if (activeTab === 'members') loadMembers()
    else loadVendors()
  }, [activeTab, loadMembers, loadVendors])

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.role) return
    setAdding(true)
    try {
      const res = await authedFetch(`${API_BASE}/team/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      })
      if (!res.ok) throw new Error('Failed to add member')
      setAddOpen(false)
      setNewMember({ name: '', email: '', phone: '', role: 'project_manager', project_id: '' })
      loadMembers()
    } catch (err) { console.error('Add member failed:', err) }
    finally { setAdding(false) }
  }

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this team member?')) return
    try {
      await authedFetch(`${API_BASE}/team/members/${id}/deactivate`, { method: 'POST' })
      loadMembers()
    } catch (err) { console.error('Deactivate failed:', err) }
  }

  const handleReactivate = async (id: string) => {
    try {
      await authedFetch(`${API_BASE}/team/members/${id}/reactivate`, { method: 'POST' })
      loadMembers()
    } catch (err) { console.error('Reactivate failed:', err) }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this team member permanently?')) return
    try {
      await authedFetch(`${API_BASE}/team/members/${id}`, { method: 'DELETE' })
      loadMembers()
    } catch (err) { console.error('Remove failed:', err) }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const activeCount = members.filter(m => m.is_active).length
  const inactiveCount = members.length - activeCount

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">TEAM & VENDORS</h1>
          <p className="text-sm text-zinc-500 font-mono">Manage team members, roles, and vendor directory</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs uppercase">
              <UserPlus className="mr-2 h-3 w-3" /> Add Member
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle className="font-mono text-amber-500">ADD TEAM MEMBER</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs font-mono">Add a new member to the team</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-400 uppercase">Name *</Label>
                <Input value={newMember.name} onChange={e => setNewMember(m => ({ ...m, name: e.target.value }))}
                  placeholder="Full name" className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs text-zinc-400 uppercase">Email</Label>
                  <Input value={newMember.email} onChange={e => setNewMember(m => ({ ...m, email: e.target.value }))}
                    placeholder="email@example.com" className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs text-zinc-400 uppercase">Phone</Label>
                  <Input value={newMember.phone} onChange={e => setNewMember(m => ({ ...m, phone: e.target.value }))}
                    placeholder="+233..." className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-400 uppercase">Role *</Label>
                <Select value={newMember.role} onValueChange={v => setNewMember(m => ({ ...m, role: v }))}>
                  <SelectTrigger className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-[300px]">
                    {['project_manager', 'site_engineer', 'architect', 'quantity_surveyor', 'structural_engineer',
                      'electrical_engineer', 'plumber', 'mason', 'carpenter', 'foreman',
                      'safety_officer', 'surveyor', 'contractor', 'sub_contractor', 'consultant'].map(r => (
                      <SelectItem key={r} value={r} className="text-zinc-300 font-mono text-xs capitalize">
                        {r.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-xs text-zinc-400 uppercase">Project</Label>
                <Select value={newMember.project_id} onValueChange={v => setNewMember(m => ({ ...m, project_id: v }))}>
                  <SelectTrigger className="bg-black border-zinc-800 text-zinc-300 font-mono text-xs"><SelectValue placeholder="Select project..." /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-zinc-300 font-mono text-xs">{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)} className="font-mono text-xs border-zinc-700 text-zinc-400">Cancel</Button>
              <Button onClick={handleAddMember} disabled={adding || !newMember.name} className="bg-amber-600 hover:bg-amber-500 text-black font-mono text-xs font-bold">
                {adding ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Adding...</> : 'Add Member'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Total Members</CardTitle>
            <Users className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-white font-mono">{isLoading ? '—' : total}</div></CardContent>
        </Card>
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-400 font-mono">{isLoading ? '—' : activeCount}</div></CardContent>
        </Card>
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Inactive</CardTitle>
            <UserX className="h-4 w-4 text-zinc-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-zinc-400 font-mono">{isLoading ? '—' : inactiveCount}</div></CardContent>
        </Card>
        <Card className="bg-black border border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-500">Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-white font-mono">{isLoading ? '—' : vendors.length}</div></CardContent>
        </Card>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1) }}>
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="members" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">Team Members</TabsTrigger>
            <TabsTrigger value="vendors" className="data-[state=active]:bg-black data-[state=active]:text-amber-500 text-zinc-500 font-mono text-xs uppercase">Vendors</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          {activeTab === 'members' && (
            <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px] bg-black border-zinc-800 text-zinc-300 font-mono text-xs h-8">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all" className="text-zinc-300 font-mono text-xs">All Roles</SelectItem>
                {['project_manager', 'architect', 'engineer', 'contractor', 'surveyor', 'foreman'].map(r => (
                  <SelectItem key={r} value={r} className="text-zinc-300 font-mono text-xs capitalize">{r.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-3 w-3 text-zinc-500" />
            <Input placeholder="SEARCH..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 bg-black border-zinc-800 text-zinc-300 focus:border-amber-500 font-mono text-xs uppercase h-8" />
          </div>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm font-mono p-3 bg-red-900/10 border border-red-900/30 rounded">{error}</div>}

      {/* Members List */}
      {activeTab === 'members' && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-amber-600 animate-spin" /></div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 font-mono">
              <Users className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p>No team members found</p>
            </div>
          ) : (
            members.map(member => (
              <Card key={member.id} className="bg-black border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
                onClick={() => setSelectedMember(member)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-zinc-800">
                        <AvatarFallback className="bg-zinc-900 text-amber-500 font-mono text-xs">
                          {member.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-mono text-zinc-200 font-medium">{member.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className={`text-[10px] font-mono uppercase ${ROLE_CATEGORY_COLORS[member.role_category || ''] || 'border-zinc-700 text-zinc-400 bg-zinc-800/50'}`}>
                            {member.role?.replace(/_/g, ' ')}
                          </Badge>
                          {!member.is_active && (
                            <Badge variant="outline" className="text-[10px] font-mono uppercase border-red-900 text-red-400 bg-red-900/10">Inactive</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {member.email && <div className="hidden md:flex items-center gap-1 text-[10px] text-zinc-500 font-mono"><Mail className="h-3 w-3" />{member.email}</div>}
                      {member.phone && <div className="hidden lg:flex items-center gap-1 text-[10px] text-zinc-500 font-mono"><Phone className="h-3 w-3" />{member.phone}</div>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" className="h-6 w-6 p-0 text-zinc-500 hover:text-white"><MoreVertical className="h-3 w-3" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-black border-zinc-800 text-zinc-300">
                          <DropdownMenuLabel className="text-xs font-mono uppercase text-zinc-500">Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedMember(member) }} className="hover:bg-zinc-900 cursor-pointer text-xs font-mono">
                            View Details
                          </DropdownMenuItem>
                          {member.is_active ? (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeactivate(member.id) }} className="hover:bg-zinc-900 cursor-pointer text-xs font-mono text-amber-400">
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleReactivate(member.id) }} className="hover:bg-zinc-900 cursor-pointer text-xs font-mono text-emerald-400">
                              Reactivate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRemove(member.id) }} className="text-red-500 hover:bg-zinc-900 cursor-pointer text-xs font-mono">
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-500 font-mono">SHOWING {(page - 1) * limit + 1}–{Math.min(page * limit, total)} OF {total}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-7 px-3 text-[10px] font-mono border-zinc-800 text-zinc-400 hover:text-white">PREV</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-7 px-3 text-[10px] font-mono border-zinc-800 text-zinc-400 hover:text-white">NEXT</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vendors List */}
      {activeTab === 'vendors' && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 text-amber-600 animate-spin" /></div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 font-mono">
              <Building2 className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p>No vendors found</p>
            </div>
          ) : (
            vendors.map(vendor => (
              <Card key={vendor.id} className="bg-black border border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-zinc-800">
                        <AvatarFallback className="bg-zinc-900 text-amber-500 font-mono text-xs">
                          {vendor.company_name?.slice(0, 2).toUpperCase() || '??'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-mono text-zinc-200 font-medium">{vendor.company_name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {vendor.category && (
                            <Badge variant="outline" className="text-[10px] font-mono uppercase border-zinc-700 text-zinc-400 bg-zinc-800/50">
                              {vendor.category}
                            </Badge>
                          )}
                          {vendor.is_approved && (
                            <Badge variant="outline" className="text-[10px] font-mono uppercase border-emerald-900 text-emerald-400 bg-emerald-900/10">Approved</Badge>
                          )}
                          {vendor.is_preferred && (
                            <Badge variant="outline" className="text-[10px] font-mono uppercase border-amber-900 text-amber-400 bg-amber-900/10">
                              <Star className="h-2.5 w-2.5 mr-1" /> Preferred
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {vendor.contact_name && <span className="hidden md:block text-[10px] text-zinc-500 font-mono">{vendor.contact_name}</span>}
                      {vendor.rating && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-amber-400">
                          <Star className="h-3 w-3 fill-amber-400" /> {vendor.rating.toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Member Detail Sheet */}
      <Sheet open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <SheetContent className="bg-zinc-900 border-zinc-800 text-white w-[400px] sm:w-[500px]">
          <SheetHeader>
            <SheetTitle className="font-mono text-amber-500">{selectedMember?.name}</SheetTitle>
            <SheetDescription className="text-zinc-400 font-mono text-xs">Team member details</SheetDescription>
          </SheetHeader>
          {selectedMember && (
            <div className="space-y-6 mt-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-zinc-800">
                  <AvatarFallback className="bg-zinc-900 text-amber-500 font-mono text-lg">
                    {selectedMember.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-mono text-lg text-white">{selectedMember.name}</div>
                  <Badge variant="outline" className={`text-[10px] font-mono uppercase ${ROLE_CATEGORY_COLORS[selectedMember.role_category || ''] || 'border-zinc-700 text-zinc-400'}`}>
                    {selectedMember.role?.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
              <div className="space-y-3">
                {selectedMember.email && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                    <Mail className="h-4 w-4 text-zinc-600" /> {selectedMember.email}
                  </div>
                )}
                {selectedMember.phone && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                    <Phone className="h-4 w-4 text-zinc-600" /> {selectedMember.phone}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                  <Shield className="h-4 w-4 text-zinc-600" /> Status: {selectedMember.is_active ? 'Active' : 'Inactive'}
                </div>
                {selectedMember.project_name && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                    <Briefcase className="h-4 w-4 text-zinc-600" /> {selectedMember.project_name}
                  </div>
                )}
              </div>
              {selectedMember.permissions && Object.keys(selectedMember.permissions).length > 0 && (
                <div>
                  <Label className="font-mono text-xs text-zinc-500 uppercase mb-2 block">Permissions</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selectedMember.permissions).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 text-[10px] font-mono">
                        <div className={`h-2 w-2 rounded-full ${value ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                        <span className="text-zinc-400">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[10px] text-zinc-600 font-mono">
                Added: {new Date(selectedMember.created_at).toLocaleDateString()}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
