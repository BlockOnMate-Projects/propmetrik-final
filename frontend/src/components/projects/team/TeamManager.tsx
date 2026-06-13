'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Mail,
  Phone,
  Shield,
  Star,
  UserPlus,
  UserMinus,
  Settings,
  MessageSquare,
  Calendar,
  Briefcase,
  Loader2,
  ChevronDown,
  CheckCircle,
  XCircle,
  Info,
  UserCheck,
  Globe,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  teamApi,
  rolesApi,
  type TeamMember,
  type TeamMemberPermissions,
  type GhanaTeamRole,
  type RoleInfo,
  type RoleCategory,
} from '@/lib/team-api'

// =====================================================
// TYPES
// =====================================================

interface TeamManagerProps {
  projectId: string
  organizationId: string
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================

const ROLE_CATEGORY_LABELS: Record<RoleCategory, { label: string; color: string }> = {
  construction: { label: 'Construction', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-700/50' },
  professional: { label: 'Professional', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-700/50' },
  government: { label: 'Government', color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 border border-purple-700/50' },
  stakeholder: { label: 'Stakeholder', color: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 border border-green-700/50' },
  internal: { label: 'Internal', color: 'bg-muted text-muted-foreground border border-border' },
  contractor: { label: 'Contractor', color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 border border-orange-700/50' },
  consultant: { label: 'Consultant', color: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 border border-cyan-700/50' },
  vendor: { label: 'Vendor', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-700/50' },
  other: { label: 'Other', color: 'bg-muted text-muted-foreground border border-border' },
}

const DEFAULT_PERMISSIONS: TeamMemberPermissions = {
  canViewBudget: false,
  canEditBudget: false,
  canApproveExpenses: false,
  canManageTeam: false,
  canViewDocuments: true,
  canUploadDocuments: false,
  canCreateTasks: false,
  canAssignTasks: false,
}

const PERMISSION_LABELS: Record<keyof TeamMemberPermissions, string> = {
  canViewBudget: 'View Budget',
  canEditBudget: 'Edit Budget',
  canApproveExpenses: 'Approve Expenses',
  canManageTeam: 'Manage Team',
  canViewDocuments: 'View Documents',
  canUploadDocuments: 'Upload Documents',
  canCreateTasks: 'Create Tasks',
  canAssignTasks: 'Assign Tasks',
}

// =====================================================
// ROLE SELECTOR
// =====================================================

function RoleSelector({
  roles,
  selectedRole,
  onSelect,
}: {
  roles: RoleInfo[]
  selectedRole?: GhanaTeamRole
  onSelect: (role: GhanaTeamRole) => void
}) {
  const groupedRoles = roles.reduce((acc, role) => {
    if (!acc[role.category]) {
      acc[role.category] = []
    }
    acc[role.category].push(role)
    return acc
  }, {} as Record<RoleCategory, RoleInfo[]>)

  return (
    <div className="space-y-2">
      {Object.entries(groupedRoles).map(([category, categoryRoles]) => {
        const config = ROLE_CATEGORY_LABELS[category as RoleCategory]
        return (
          <Collapsible key={category} defaultOpen={categoryRoles.some(r => r.role === selectedRole)}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-muted">
              <div className="flex items-center gap-2">
                <Badge className={config.color}>{config.label}</Badge>
                <span className="text-sm text-muted-foreground">
                  {categoryRoles.length} roles
                </span>
              </div>
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1 pl-4">
              {categoryRoles.map((role) => (
                <button
                  key={role.role}
                  type="button"
                  onClick={() => onSelect(role.role)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted',
                    selectedRole === role.role && 'bg-amber-100 dark:bg-amber-900/30 ring-1 ring-amber-600'
                  )}
                >
                  <div>
                    <p className="font-medium">{role.displayName}</p>
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  </div>
                  {selectedRole === role.role && (
                    <CheckCircle className="h-4 w-4 text-amber-500" />
                  )}
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

// =====================================================
// PERMISSIONS EDITOR
// =====================================================

function PermissionsEditor({
  permissions,
  onChange,
  disabled,
}: {
  permissions: TeamMemberPermissions
  onChange: (permissions: TeamMemberPermissions) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
        <div key={key} className="flex items-center space-x-2">
          <Checkbox
            id={key}
            disabled={disabled}
            checked={permissions[key as keyof TeamMemberPermissions]}
            onCheckedChange={(checked) =>
              onChange({
                ...permissions,
                [key]: checked,
              })
            }
          />
          <Label htmlFor={key} className="text-sm font-normal">
            {label}
          </Label>
        </div>
      ))}
    </div>
  )
}

// =====================================================
// TEAM MEMBER CARD
// =====================================================

function TeamMemberCard({
  member,
  onClick,
  onAction,
  canManage,
}: {
  member: TeamMember
  onClick: () => void
  onAction: (action: string) => void
  canManage: boolean
}) {
  const roleCategory = ROLE_CATEGORY_LABELS[member.roleCategory]
  const initials = member.userName
    ? member.userName.split(' ').map(n => n[0]).join('').toUpperCase()
    : 'U'

  return (
    <Card
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-md',
        !member.isActive && 'opacity-60'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={member.userAvatar} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium truncate">
                  {member.userName || 'Unknown User'}
                </h4>
                <p className="text-sm text-muted-foreground truncate">
                  {member.title || member.role.replace(/_/g, ' ')}
                </p>
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('permissions'); }}>
                      <Shield className="mr-2 h-4 w-4" />
                      Edit Permissions
                    </DropdownMenuItem>
                    {member.isActive ? (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('deactivate'); }}>
                        <UserMinus className="mr-2 h-4 w-4" />
                        Deactivate
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('reactivate'); }}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Reactivate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={(e) => { e.stopPropagation(); onAction('remove'); }}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={roleCategory.color}>
                {roleCategory.label}
              </Badge>
              {!member.isActive && (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              {member.contactEmail && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <span className="truncate max-w-24">{member.contactEmail}</span>
                </div>
              )}
              {member.contactPhone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span>{member.contactPhone}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// ADD MEMBER FORM
// =====================================================

function AddMemberForm({
  roles,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  roles: RoleInfo[]
  onSubmit: (data: Partial<TeamMember>) => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  const [formData, setFormData] = useState<Partial<TeamMember>>({
    role: undefined,
    title: '',
    department: '',
    contactEmail: '',
    contactPhone: '',
    permissions: DEFAULT_PERMISSIONS,
    notes: '',
  })

  const [selectedUserId, setSelectedUserId] = useState('')
  const [fullName, setFullName] = useState('')
  // Relationship to the org — independent of discipline. Defaults from the
  // chosen role's category (only 'internal' roles default to staff); overridable.
  const [memberType, setMemberType] = useState<'staff' | 'external'>('external')

  const handleRoleSelect = (role: string) => {
    setFormData(prev => ({ ...prev, role: role as GhanaTeamRole }))
    const cat = roles.find(r => r.role === role)?.category
    if (cat) setMemberType(cat === 'internal' ? 'staff' : 'external')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Map to the fields the backend expects (name/email/phone/member_type),
    // not the TeamMember display field names.
    onSubmit({
      name: fullName,
      email: formData.contactEmail,
      phone: formData.contactPhone,
      role: formData.role,
      member_type: memberType,
      title: formData.title,
      department: formData.department,
      permissions: formData.permissions,
      notes: formData.notes,
      userId: selectedUserId || undefined,
    } as any)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
      {/* Member type: internal staff vs external collaborator */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label>Member type *</Label>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="What's the difference?">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                <p className="mb-1"><span className="font-semibold text-amber-600 dark:text-amber-400">Internal staff</span> — an employee of your firm. Gets a full staff login, scoped to the projects they're on.</p>
                <p><span className="font-semibold text-cyan-600 dark:text-cyan-400">External collaborator</span> — an outside party (contractor, architect, consultant). Gets a limited, invite-based login that shows only their assigned project(s) and the items awaiting them.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMemberType('staff')}
            className={cn(
              'flex items-center gap-2 rounded-lg border p-3 text-left transition-colors',
              memberType === 'staff' ? 'border-amber-500 bg-amber-500/10' : 'border-border hover:border-zinc-500'
            )}
          >
            <UserCheck className={cn('h-4 w-4', memberType === 'staff' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} />
            <div>
              <div className="text-sm font-medium">Internal staff</div>
              <div className="text-[11px] text-muted-foreground">Employee · full access</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMemberType('external')}
            className={cn(
              'flex items-center gap-2 rounded-lg border p-3 text-left transition-colors',
              memberType === 'external' ? 'border-cyan-500 bg-cyan-500/10' : 'border-border hover:border-zinc-500'
            )}
          >
            <Globe className={cn('h-4 w-4', memberType === 'external' ? 'text-cyan-600 dark:text-cyan-400' : 'text-muted-foreground')} />
            <div>
              <div className="text-sm font-medium">External collaborator</div>
              <div className="text-[11px] text-muted-foreground">Invited · scoped view</div>
            </div>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name *</Label>
        <Input
          id="fullName"
          placeholder="e.g., Ama Mensah"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Role *</Label>
        <div className="max-h-64 overflow-y-auto rounded-lg border p-2">
          <RoleSelector
            roles={roles}
            selectedRole={formData.role}
            onSelect={handleRoleSelect}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="userId">Link to existing user (optional)</Label>
        <Input
          id="userId"
          placeholder="User ID — leave blank to invite by email"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            placeholder="e.g., Senior Project Manager"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Input
            id="department"
            placeholder="e.g., Engineering"
            value={formData.department}
            onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactEmail">Email{memberType === 'external' ? ' *' : ''}</Label>
          <Input
            id="contactEmail"
            type="email"
            placeholder="email@example.com"
            value={formData.contactEmail}
            onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
          />
          <p className="text-[11px] text-muted-foreground">
            {memberType === 'external'
              ? 'An invite to set a password + access this project is sent here.'
              : 'Used to send their account invite (optional for a contact-only record).'}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">Contact Phone</Label>
          <Input
            id="contactPhone"
            placeholder="+233 XX XXX XXXX"
            value={formData.contactPhone}
            onChange={(e) => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Permissions</Label>
        <div className="rounded-lg border p-3">
          <PermissionsEditor
            permissions={formData.permissions || DEFAULT_PERMISSIONS}
            onChange={(permissions) => setFormData(prev => ({ ...prev, permissions }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Any additional notes..."
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !formData.role || !fullName || (memberType === 'external' && !formData.contactEmail)}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {memberType === 'external' ? 'Add & Send Invite' : 'Add Member'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// =====================================================
// MEMBER DETAIL SHEET
// =====================================================

function MemberDetail({
  member,
  onClose,
  onUpdatePermissions,
  canManage,
}: {
  member: TeamMember
  onClose: () => void
  onUpdatePermissions: (permissions: TeamMemberPermissions) => void
  canManage: boolean
}) {
  const [permissions, setPermissions] = useState(member.permissions)
  const [hasChanges, setHasChanges] = useState(false)

  const roleCategory = ROLE_CATEGORY_LABELS[member.roleCategory]
  const initials = member.userName
    ? member.userName.split(' ').map(n => n[0]).join('').toUpperCase()
    : 'U'

  return (
    <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
      <SheetHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={member.userAvatar} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <SheetTitle>{member.userName || 'Unknown User'}</SheetTitle>
            <SheetDescription>
              {member.title || member.role.replace(/_/g, ' ')}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Status & Role */}
        <div className="flex flex-wrap gap-2">
          <Badge className={roleCategory.color}>
            {roleCategory.label}
          </Badge>
          <Badge variant="outline">
            {member.role.replace(/_/g, ' ')}
          </Badge>
          {!member.isActive && (
            <Badge variant="destructive">Inactive</Badge>
          )}
        </div>

        {/* Contact Info */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Contact Information
          </h4>
          {member.contactEmail && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${member.contactEmail}`} className="hover:underline">
                {member.contactEmail}
              </a>
            </div>
          )}
          {member.contactPhone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${member.contactPhone}`} className="hover:underline">
                {member.contactPhone}
              </a>
            </div>
          )}
          {member.department && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {member.department}
            </div>
          )}
        </div>

        {/* Dates */}
        {(member.startDate || member.endDate) && (
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Assignment Period
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {member.startDate && (
                <div>
                  <p className="text-muted-foreground">Start Date</p>
                  <p>{new Date(member.startDate).toLocaleDateString('en-GB')}</p>
                </div>
              )}
              {member.endDate && (
                <div>
                  <p className="text-muted-foreground">End Date</p>
                  <p>{new Date(member.endDate).toLocaleDateString('en-GB')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rate */}
        {member.hourlyRate && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Rate
            </h4>
            <p className="text-sm">
              {member.rateCurrency} {member.hourlyRate.toLocaleString()} / hour
            </p>
          </div>
        )}

        {/* Permissions */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Permissions
          </h4>
          <div className="rounded-lg border p-3">
            <PermissionsEditor
              permissions={permissions}
              disabled={!canManage}
              onChange={(newPerms) => {
                setPermissions(newPerms)
                setHasChanges(true)
              }}
            />
          </div>
          {canManage && hasChanges && (
            <Button
              size="sm"
              onClick={() => {
                onUpdatePermissions(permissions)
                setHasChanges(false)
              }}
            >
              Save Permissions
            </Button>
          )}
        </div>

        {/* Notes */}
        {member.notes && (
          <div className="space-y-2">
            <h4 className="font-medium">Notes</h4>
            <p className="text-sm text-muted-foreground">{member.notes}</p>
          </div>
        )}
      </div>
    </SheetContent>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function TeamManager({
  projectId,
  organizationId,
  className,
}: TeamManagerProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<RoleCategory | 'all'>('all')
  const [showInactive, setShowInactive] = useState(false)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Whether the current user may manage this project's team (add/edit/remove).
  // Resolved server-side: org-admins + the project owner/PM + members granted
  // can_manage_team. Drives whether the Add/management controls are shown.
  const [canManageTeam, setCanManageTeam] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [teamData, rolesData] = await Promise.all([
        teamApi.getProjectTeamWithAccess(projectId),
        rolesApi.getAll(),
      ])

      setMembers(teamData.members)
      setCanManageTeam(teamData.canManageTeam)
      setRoles(rolesData)
    } catch (err) {
      console.error('Error fetching team:', err)
      setError('Failed to load team data')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filter members
  const filteredMembers = members.filter(member => {
    if (!showInactive && !member.isActive) return false
    if (categoryFilter !== 'all' && member.roleCategory !== categoryFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        member.userName?.toLowerCase().includes(query) ||
        member.title?.toLowerCase().includes(query) ||
        member.role.toLowerCase().includes(query) ||
        member.contactEmail?.toLowerCase().includes(query)
      )
    }
    return true
  })

  // Group by category
  const groupedMembers = filteredMembers.reduce((acc, member) => {
    if (!acc[member.roleCategory]) {
      acc[member.roleCategory] = []
    }
    acc[member.roleCategory].push(member)
    return acc
  }, {} as Record<RoleCategory, TeamMember[]>)

  // Add member — sends the backend's field names (project_id snake-case; the
  // route auto-creates the login invite when an email is present).
  const handleAddMember = async (data: Partial<TeamMember>) => {
    try {
      setIsSubmitting(true)
      await teamApi.addMember({
        ...data,
        project_id: projectId,
      } as any)
      setShowAddDialog(false)
      await fetchData()
    } catch (err) {
      console.error('Error adding member:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Member actions
  const handleMemberAction = async (memberId: string, action: string) => {
    try {
      switch (action) {
        case 'deactivate':
          await teamApi.deactivate(memberId)
          break
        case 'reactivate':
          await teamApi.reactivate(memberId)
          break
        case 'remove':
          if (confirm('Are you sure you want to remove this team member?')) {
            await teamApi.remove(memberId)
          }
          break
        case 'permissions':
          const member = members.find(m => m.id === memberId)
          if (member) setSelectedMember(member)
          return
      }
      await fetchData()
    } catch (err) {
      console.error(`Error ${action} member:`, err)
    }
  }

  // Update permissions
  const handleUpdatePermissions = async (permissions: TeamMemberPermissions) => {
    if (!selectedMember) return
    try {
      await teamApi.updatePermissions(selectedMember.id, permissions)
      await fetchData()
      // Update selected member with new data
      const updated = await teamApi.getMemberById(selectedMember.id)
      setSelectedMember(updated)
    } catch (err) {
      console.error('Error updating permissions:', err)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  // Stats
  const activeCount = members.filter(m => m.isActive).length
  const categoryStats = Object.entries(groupedMembers).map(([cat, mems]) => ({
    category: cat as RoleCategory,
    count: mems.length,
  }))

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Project Team
          </h2>
          <p className="text-muted-foreground">
            {activeCount} active members across {Object.keys(groupedMembers).length} categories
          </p>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          {canManageTeam && (
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Add a new member to the project team with Ghana-specific roles.
              </DialogDescription>
            </DialogHeader>
            <AddMemberForm
              roles={roles}
              onSubmit={handleAddMember}
              onCancel={() => setShowAddDialog(false)}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Stats */}
      <div className="flex flex-wrap gap-2">
        {categoryStats.map(({ category, count }) => {
          const config = ROLE_CATEGORY_LABELS[category]
          return (
            <Badge
              key={category}
              variant="outline"
              className={cn('cursor-pointer', categoryFilter === category && config.color)}
              onClick={() => setCategoryFilter(
                categoryFilter === category ? 'all' : category
              )}
            >
              {config.label}: {count}
            </Badge>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search team members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="showInactive"
            checked={showInactive}
            onCheckedChange={(checked) => setShowInactive(!!checked)}
          />
          <Label htmlFor="showInactive" className="text-sm font-normal">
            Show inactive
          </Label>
        </div>
      </div>

      {/* Team Grid */}
      {Object.keys(groupedMembers).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-medium">No Team Members</h3>
            <p className="text-sm text-muted-foreground">
              {canManageTeam ? 'Add team members to get started' : 'No team members have been added to this project yet'}
            </p>
            {canManageTeam && (
              <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add First Member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMembers).map(([category, categoryMembers]) => {
            const config = ROLE_CATEGORY_LABELS[category as RoleCategory]
            return (
              <div key={category}>
                <h3 className="mb-3 flex items-center gap-2">
                  <Badge className={config.color}>{config.label}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {categoryMembers.length} member{categoryMembers.length !== 1 ? 's' : ''}
                  </span>
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryMembers.map((member) => (
                    <TeamMemberCard
                      key={member.id}
                      member={member}
                      canManage={canManageTeam}
                      onClick={() => setSelectedMember(member)}
                      onAction={(action) => handleMemberAction(member.id, action)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Member Detail Sheet */}
      <Sheet open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        {selectedMember && (
          <MemberDetail
            member={selectedMember}
            canManage={canManageTeam}
            onClose={() => setSelectedMember(null)}
            onUpdatePermissions={handleUpdatePermissions}
          />
        )}
      </Sheet>
    </div>
  )
}

export default TeamManager
