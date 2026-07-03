'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  Plus,
  Search,
  Filter,
  Phone,
  Mail,
  Video,
  Users,
  FileText,
  MessageCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Calendar,
  User,
  Building2,
  Send,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  communicationApi,
  teamApi,
  vendorApi,
  type CommunicationLog as CommunicationLogType,
  type CommunicationType,
  type TeamMember,
  type Vendor,
} from '@/lib/team-api'

// =====================================================
// TYPES
// =====================================================

interface CommunicationLogProps {
  projectId: string
  className?: string
}

interface ContactOption {
  id: string
  name: string
  type: 'team' | 'vendor'
  role?: string
  email?: string
  phone?: string
}

// =====================================================
// CONSTANTS
// =====================================================

const COMMUNICATION_TYPE_CONFIG: Record<CommunicationType, { 
  label: string; 
  icon: React.ElementType; 
  color: string 
}> = {
  phone_call: { label: 'Phone Call', icon: Phone, color: 'bg-green-100 text-green-800' },
  phone: { label: 'Phone', icon: Phone, color: 'bg-green-100 text-green-800' },
  email: { label: 'Email', icon: Mail, color: 'bg-blue-100 text-blue-800' },
  meeting: { label: 'Meeting', icon: Users, color: 'bg-purple-100 text-purple-800' },
  video_call: { label: 'Video Call', icon: Video, color: 'bg-indigo-100 text-indigo-800' },
  site_visit: { label: 'Site Visit', icon: Building2, color: 'bg-amber-100 text-amber-800' },
  letter: { label: 'Letter', icon: FileText, color: 'bg-muted text-gray-800' },
  sms: { label: 'SMS', icon: MessageCircle, color: 'bg-teal-100 text-teal-800' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-100 text-emerald-800' },
  other: { label: 'Other', icon: MessageSquare, color: 'bg-muted text-gray-800' },
}

// =====================================================
// COMMUNICATION ITEM
// =====================================================

function CommunicationItem({
  log,
  contacts,
  onClick,
  onAction,
}: {
  log: CommunicationLogType
  contacts: ContactOption[]
  onClick: () => void
  onAction: (action: string) => void
}) {
  const config = COMMUNICATION_TYPE_CONFIG[log.communicationType]
  const TypeIcon = config.icon

  const contact = contacts.find(c => 
    (log.teamMemberId && c.id === log.teamMemberId && c.type === 'team') ||
    (log.vendorId && c.id === log.vendorId && c.type === 'vendor')
  )

  const isOverdue = log.followUpDate && 
    !log.followUpCompleted && 
    new Date(log.followUpDate) < new Date()

  const needsFollowUp = log.followUpDate && 
    !log.followUpCompleted && 
    !isOverdue

  return (
    <Card
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-md',
        isOverdue && 'border-red-200',
        log.isIncoming && 'border-l-4 border-l-blue-500'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn('rounded-lg p-2', config.color)}>
              <TypeIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-medium line-clamp-1">{log.subject}</h4>
                {log.isIncoming ? (
                  <ArrowDown className="h-4 w-4 text-blue-500" />
                ) : (
                  <ArrowUp className="h-4 w-4 text-green-500" />
                )}
              </div>
              {contact && (
                <p className="text-sm text-muted-foreground">
                  {contact.type === 'vendor' && '🏢 '}
                  {contact.name}
                </p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {log.followUpDate && !log.followUpCompleted && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('complete-followup'); }}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark Follow-up Complete
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('add-followup'); }}>
                <Calendar className="mr-2 h-4 w-4" />
                Add Follow-up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('reply'); }}>
                <Send className="mr-2 h-4 w-4" />
                Log Reply
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {log.content}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={config.color}>{config.label}</Badge>
          {isOverdue && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Follow-up overdue
            </Badge>
          )}
          {needsFollowUp && (
            <Badge className="flex items-center gap-1 bg-amber-100 text-amber-800">
              <Clock className="h-3 w-3" />
              {new Date(log.followUpDate!).toLocaleDateString('en-GB')}
            </Badge>
          )}
          {log.followUpCompleted && (
            <Badge variant="outline" className="text-green-600">
              <CheckCircle className="mr-1 h-3 w-3" />
              Completed
            </Badge>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {new Date(log.createdAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  )
}

// =====================================================
// ADD COMMUNICATION FORM
// =====================================================

function AddCommunicationForm({
  projectId,
  contacts,
  onSubmit,
  onCancel,
  isSubmitting,
  replyTo,
}: {
  projectId: string
  contacts: ContactOption[]
  onSubmit: (data: Partial<CommunicationLogType>) => void
  onCancel: () => void
  isSubmitting: boolean
  replyTo?: CommunicationLogType
}) {
  const [formData, setFormData] = useState<Partial<CommunicationLogType>>({
    projectId,
    communicationType: replyTo?.communicationType || 'phone_call',
    subject: replyTo ? `Re: ${replyTo.subject}` : '',
    content: '',
    isIncoming: false,
    teamMemberId: replyTo?.teamMemberId,
    vendorId: replyTo?.vendorId,
    followUpDate: undefined,
    followUpNotes: '',
  })

  const [contactType, setContactType] = useState<'team' | 'vendor' | 'none'>(
    replyTo?.teamMemberId ? 'team' : replyTo?.vendorId ? 'vendor' : 'none'
  )
  const [hasFollowUp, setHasFollowUp] = useState(false)

  const teamContacts = contacts.filter(c => c.type === 'team')
  const vendorContacts = contacts.filter(c => c.type === 'vendor')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      followUpDate: hasFollowUp ? formData.followUpDate : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="type">Communication Type *</Label>
          <Select
            value={formData.communicationType}
            onValueChange={(value) => setFormData(prev => ({ 
              ...prev, 
              communicationType: value as CommunicationType 
            }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COMMUNICATION_TYPE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <config.icon className="h-4 w-4" />
                    {config.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Direction</Label>
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="direction"
                checked={!formData.isIncoming}
                onChange={() => setFormData(prev => ({ ...prev, isIncoming: false }))}
                className="h-4 w-4"
              />
              <span className="flex items-center gap-1 text-sm">
                <ArrowUp className="h-4 w-4 text-green-500" />
                Outgoing
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="direction"
                checked={formData.isIncoming}
                onChange={() => setFormData(prev => ({ ...prev, isIncoming: true }))}
                className="h-4 w-4"
              />
              <span className="flex items-center gap-1 text-sm">
                <ArrowDown className="h-4 w-4 text-blue-500" />
                Incoming
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Subject *</Label>
        <Input
          id="subject"
          value={formData.subject}
          onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Contact</Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            value={contactType}
            onValueChange={(value) => {
              setContactType(value as 'team' | 'vendor' | 'none')
              setFormData(prev => ({
                ...prev,
                teamMemberId: undefined,
                vendorId: undefined,
              }))
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Contact type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No contact</SelectItem>
              <SelectItem value="team">Team Member</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
            </SelectContent>
          </Select>

          {contactType === 'team' && (
            <Select
              value={formData.teamMemberId || ''}
              onValueChange={(value) => setFormData(prev => ({ 
                ...prev, 
                teamMemberId: value,
                vendorId: undefined,
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {teamContacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {contactType === 'vendor' && (
            <Select
              value={formData.vendorId || ''}
              onValueChange={(value) => setFormData(prev => ({ 
                ...prev, 
                vendorId: value,
                teamMemberId: undefined,
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendorContacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Content *</Label>
        <Textarea
          id="content"
          placeholder="Describe the communication..."
          value={formData.content}
          onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
          rows={4}
          required
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasFollowUp"
            checked={hasFollowUp}
            onCheckedChange={(checked) => setHasFollowUp(!!checked)}
          />
          <Label htmlFor="hasFollowUp" className="cursor-pointer">
            Schedule follow-up
          </Label>
        </div>

        {hasFollowUp && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="followUpDate">Follow-up Date</Label>
              <Input
                id="followUpDate"
                type="date"
                value={formData.followUpDate ? new Date(formData.followUpDate).toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  followUpDate: e.target.value ? new Date(e.target.value) : undefined
                }))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followUpNotes">Follow-up Notes</Label>
              <Input
                id="followUpNotes"
                placeholder="What needs to be followed up on?"
                value={formData.followUpNotes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, followUpNotes: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !formData.subject || !formData.content}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Log Communication
        </Button>
      </DialogFooter>
    </form>
  )
}

// =====================================================
// COMMUNICATION DETAIL SHEET
// =====================================================

function CommunicationDetail({
  log,
  contacts,
  onClose,
  onFollowUpComplete,
}: {
  log: CommunicationLogType
  contacts: ContactOption[]
  onClose: () => void
  onFollowUpComplete: () => void
}) {
  const config = COMMUNICATION_TYPE_CONFIG[log.communicationType]
  const TypeIcon = config.icon

  const contact = contacts.find(c => 
    (log.teamMemberId && c.id === log.teamMemberId && c.type === 'team') ||
    (log.vendorId && c.id === log.vendorId && c.type === 'vendor')
  )

  const isOverdue = log.followUpDate && 
    !log.followUpCompleted && 
    new Date(log.followUpDate) < new Date()

  return (
    <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
      <SheetHeader>
        <div className="flex items-start gap-4">
          <div className={cn('rounded-lg p-3', config.color)}>
            <TypeIcon className="h-6 w-6" />
          </div>
          <div>
            <SheetTitle className="flex items-center gap-2">
              {log.subject}
              {log.isIncoming ? (
                <ArrowDown className="h-4 w-4 text-blue-500" />
              ) : (
                <ArrowUp className="h-4 w-4 text-green-500" />
              )}
            </SheetTitle>
            <SheetDescription>
              {config.label} • {log.isIncoming ? 'Incoming' : 'Outgoing'}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Contact Info */}
        {contact && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Avatar>
              <AvatarFallback>
                {contact.type === 'vendor' ? '🏢' : contact.name[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{contact.name}</p>
              <p className="text-sm text-muted-foreground">
                {contact.type === 'vendor' ? 'Vendor' : contact.role || 'Team Member'}
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        <div>
          <h4 className="font-medium mb-2">Details</h4>
          <p className="text-sm whitespace-pre-wrap">{log.content}</p>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(log.createdAt).toLocaleString()}
          </div>
          {log.loggedBy && (
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              Logged by {log.loggedBy}
            </div>
          )}
        </div>

        {/* Follow-up */}
        {log.followUpDate && (
          <div className={cn(
            'rounded-lg border p-4',
            isOverdue && 'border-red-200 bg-red-50',
            log.followUpCompleted && 'border-green-200 bg-green-50'
          )}>
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                {isOverdue && !log.followUpCompleted && (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
                {log.followUpCompleted && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                Follow-up
              </h4>
              {!log.followUpCompleted && (
                <Button size="sm" onClick={onFollowUpComplete}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark Complete
                </Button>
              )}
            </div>
            <p className="mt-2 text-sm">
              <strong>Due:</strong> {new Date(log.followUpDate).toLocaleDateString('en-GB')}
            </p>
            {log.followUpNotes && (
              <p className="mt-1 text-sm text-muted-foreground">
                {log.followUpNotes}
              </p>
            )}
          </div>
        )}

        {/* Attachments */}
        {log.attachments && log.attachments.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Attachments</h4>
            <div className="space-y-2">
              {log.attachments.map((attachment, idx) => {
                const url = typeof attachment === 'string' ? attachment : attachment.url;
                const name = typeof attachment === 'string' ? `Attachment ${idx + 1}` : attachment.name;
                return (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {name}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </SheetContent>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function CommunicationLog({
  projectId,
  className,
}: CommunicationLogProps) {
  const [logs, setLogs] = useState<CommunicationLogType[]>([])
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  // PERF: debounce so filtering/fetching runs once the user pauses typing
  // (this fetch also pulls team + vendor lists — expensive against the remote DB).
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const [typeFilter, setTypeFilter] = useState<CommunicationType | 'all'>('all')
  const [showPendingOnly, setShowPendingOnly] = useState(false)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedLog, setSelectedLog] = useState<CommunicationLogType | null>(null)
  const [replyTo, setReplyTo] = useState<CommunicationLogType | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [logsData, teamData, vendorData] = await Promise.all([
        communicationApi.getAll({
          projectId,
          communicationType: typeFilter !== 'all' ? typeFilter as CommunicationType : undefined,
          hasFollowUp: showPendingOnly ? true : undefined,
          search: debouncedSearch || undefined,
        }),
        teamApi.getProjectTeam(projectId),
        vendorApi.getAll().then(r => r.data),
      ])

      setLogs(logsData.data || [])
      
      const contactsList: ContactOption[] = [
        ...teamData.map((tm: TeamMember) => ({
          id: tm.id,
          name: tm.userName || 'Unknown',
          type: 'team' as const,
          role: tm.role,
          email: tm.userEmail || tm.contactEmail,
          phone: tm.contactPhone,
        })),
        ...vendorData.map((v: Vendor) => ({
          id: v.id,
          name: v.name,
          type: 'vendor' as const,
          email: v.email,
          phone: v.phone,
        })),
      ]
      setContacts(contactsList)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load communications')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, typeFilter, showPendingOnly, debouncedSearch])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Add communication
  const handleAddCommunication = async (data: Partial<CommunicationLogType>) => {
    try {
      setIsSubmitting(true)
      await communicationApi.log(data as CommunicationLogType)
      setShowAddDialog(false)
      setReplyTo(undefined)
      await fetchData()
    } catch (err) {
      console.error('Error adding communication:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Actions
  const handleAction = async (logId: string, action: string) => {
    try {
      switch (action) {
        case 'complete-followup':
          await communicationApi.completeFollowUp(logId)
          await fetchData()
          break
        case 'reply':
          const log = logs.find(l => l.id === logId)
          if (log) {
            setReplyTo(log)
            setShowAddDialog(true)
          }
          break
        case 'add-followup':
          // Would open a dialog to add follow-up
          break
      }
    } catch (err) {
      console.error(`Error ${action}:`, err)
    }
  }

  const handleFollowUpComplete = async () => {
    if (!selectedLog) return
    try {
      await communicationApi.completeFollowUp(selectedLog.id)
      setSelectedLog(null)
      await fetchData()
    } catch (err) {
      console.error('Error completing follow-up:', err)
    }
  }

  // Stats
  const pendingFollowUps = logs.filter(l => l.followUpDate && !l.followUpCompleted)
  const overdueFollowUps = pendingFollowUps.filter(l => new Date(l.followUpDate!) < new Date())
  const todayLogs = logs.filter(l => {
    const today = new Date()
    const logDate = new Date(l.createdAt)
    return logDate.toDateString() === today.toDateString()
  })

  // Loading
  if (isLoading && logs.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Communication Log
          </h2>
          <p className="text-muted-foreground">
            {logs.length} communications logged
          </p>
        </div>

        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open)
          if (!open) setReplyTo(undefined)
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Log Communication
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {replyTo ? `Reply to: ${replyTo.subject}` : 'Log Communication'}
              </DialogTitle>
              <DialogDescription>
                Record a communication with team members or vendors.
              </DialogDescription>
            </DialogHeader>
            <AddCommunicationForm
              projectId={projectId}
              contacts={contacts}
              onSubmit={handleAddCommunication}
              onCancel={() => {
                setShowAddDialog(false)
                setReplyTo(undefined)
              }}
              isSubmitting={isSubmitting}
              replyTo={replyTo}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{todayLogs.length}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{pendingFollowUps.length}</p>
                <p className="text-xs text-muted-foreground">Pending Follow-ups</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{overdueFollowUps.length}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {logs.filter(l => l.followUpCompleted).length}
                </p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search communications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as CommunicationType | 'all')}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(COMMUNICATION_TYPE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <config.icon className="h-4 w-4" />
                  {config.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="pendingOnly"
            checked={showPendingOnly}
            onCheckedChange={(checked) => setShowPendingOnly(!!checked)}
          />
          <Label htmlFor="pendingOnly" className="cursor-pointer text-sm">
            Pending follow-ups only
          </Label>
        </div>
      </div>

      {/* Communications List */}
      {logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-medium">No Communications</h3>
            <p className="text-sm text-muted-foreground">
              Log your first communication
            </p>
            <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Log Communication
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {logs.map((log) => (
            <CommunicationItem
              key={log.id}
              log={log}
              contacts={contacts}
              onClick={() => setSelectedLog(log)}
              onAction={(action) => handleAction(log.id, action)}
            />
          ))}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        {selectedLog && (
          <CommunicationDetail
            log={selectedLog}
            contacts={contacts}
            onClose={() => setSelectedLog(null)}
            onFollowUpComplete={handleFollowUpComplete}
          />
        )}
      </Sheet>
    </div>
  )
}

export default CommunicationLog
