'use client'

import React from 'react'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  User,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDeal, useDealActivities, useDealTasks, useDealNotes } from '@/hooks/crm'
import { usePipeline } from '@/hooks/crm'
import type { Deal, DealActivity } from '@/types/crm'

// =====================================================
// MINI ACTIVITY TIMELINE
// =====================================================
function MiniTimeline({ activities }: { activities: DealActivity[] }) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-3 w-3" />
      case 'email': return <Mail className="h-3 w-3" />
      case 'whatsapp': return <MessageSquare className="h-3 w-3" />
      case 'stage_change': return <ChevronRight className="h-3 w-3" />
      case 'document': return <FileText className="h-3 w-3" />
      default: return <Clock className="h-3 w-3" />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'call': return 'bg-blue-500'
      case 'email': return 'bg-purple-500'
      case 'whatsapp': return 'bg-green-500'
      case 'stage_change': return 'bg-cyan-500'
      default: return 'bg-muted-foreground'
    }
  }

  const recent = activities.slice(0, 5)
  if (recent.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
  }

  return (
    <div className="relative">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
      <div className="space-y-3">
        {recent.map((a) => (
          <div key={a.id} className="relative pl-6">
            <div
              className={cn(
                'absolute left-0 top-0.5 w-[15px] h-[15px] rounded-full flex items-center justify-center text-white',
                getActivityColor(a.activity_type)
              )}
            >
              {getActivityIcon(a.activity_type)}
            </div>
            <div>
              <p className="text-xs font-medium text-foreground leading-tight">{a.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {new Date(a.activity_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// DEAL SLIDE-IN PANEL
// =====================================================
export function DealSlideIn({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: deal, isLoading: dealLoading } = useDeal(dealId || '')
  const { data: activities = [] } = useDealActivities(dealId || '')
  const { data: tasks = [] } = useDealTasks(dealId || '')
  const { data: notes = [] } = useDealNotes(dealId || '')
  const { data: pipeline } = usePipeline(deal?.pipeline_id || '')

  const currentStageIndex = pipeline?.stages
    ?.sort((a, b) => a.stage_order - b.stage_order)
    .findIndex((s) => s.id === deal?.stage_id) ?? -1
  const totalStages = pipeline?.stages?.length ?? 0
  const stageProgress = totalStages > 0 ? ((currentStageIndex + 1) / totalStages) * 100 : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        {dealLoading || !deal ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="p-4 pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{deal.deal_number}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      deal.deal_type === 'sale' && 'bg-green-500/10 text-green-500',
                      deal.deal_type === 'rental' && 'bg-blue-500/10 text-blue-500',
                      deal.deal_type === 'development' && 'bg-purple-500/10 text-purple-500'
                    )}
                  >
                    {deal.deal_type?.toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      deal.deal_status === 'active' && 'bg-blue-500/10 text-blue-500',
                      deal.deal_status === 'won' && 'bg-green-500/10 text-green-500',
                      deal.deal_status === 'lost' && 'bg-red-500/10 text-red-500',
                      deal.deal_status === 'on_hold' && 'bg-yellow-500/10 text-yellow-500'
                    )}
                  >
                    {deal.deal_status?.toUpperCase()}
                  </span>
                </div>
                <Link href={`/dashboard/deals/${deal.id}`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Full view
                  </Button>
                </Link>
              </div>
              <SheetTitle className="text-left text-lg font-semibold mt-1">{deal.title}</SheetTitle>
              {deal.description && (
                <p className="text-xs text-muted-foreground mt-1">{deal.description}</p>
              )}
            </SheetHeader>

            {/* Stage Progress Bar */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {deal.stage_name}
                </span>
                {deal.days_in_stage !== undefined && (
                  <span className="text-[10px] text-muted-foreground">
                    {deal.days_in_stage}d in stage
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${stageProgress}%` }}
                />
              </div>
              {pipeline?.stages && (
                <div className="flex justify-between mt-1">
                  {pipeline.stages
                    .sort((a, b) => a.stage_order - b.stage_order)
                    .map((stage, idx) => (
                      <div
                        key={stage.id}
                        className={cn(
                          'w-2 h-2 rounded-full',
                          idx <= currentStageIndex ? 'bg-primary' : 'bg-muted'
                        )}
                        title={stage.stage_name}
                      />
                    ))}
                </div>
              )}
            </div>

            <Separator className="my-3" />

            {/* Key Metrics */}
            <div className="px-4 grid grid-cols-2 gap-3">
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5 uppercase">Deal Value</div>
                  <div className="text-sm font-semibold text-green-500">
                    {deal.deal_value ? formatCurrency(deal.deal_value, deal.currency || 'GHS') : '—'}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5 uppercase">Probability</div>
                  <div className="text-sm font-semibold text-foreground">{deal.probability || 0}%</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5 uppercase">Commission</div>
                  <div className="text-sm font-semibold text-primary">
                    {deal.commission_amount ? formatCurrency(deal.commission_amount, deal.currency || 'GHS') : '—'}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-3">
                  <div className="text-[10px] text-muted-foreground mb-0.5 uppercase">Expected Close</div>
                  <div className="text-sm font-semibold text-foreground">
                    {deal.expected_close_date
                      ? new Date(deal.expected_close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      : '—'}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-3" />

            {/* Contact & Agent */}
            <div className="px-4 space-y-3">
              {deal.primary_contact_id && (
                <Link href={`/dashboard/deals/contacts/${deal.primary_contact_id}`}>
                  <div className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30 border border-border hover:border-primary/50 transition-colors">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{deal.primary_contact_name}</p>
                      <p className="text-[10px] text-muted-foreground">Primary Contact</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              )}

              {deal.assigned_agent_name && (
                <div className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30 border border-border">
                  <div className="w-8 h-8 bg-purple-500/10 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{deal.assigned_agent_name}</p>
                    <p className="text-[10px] text-muted-foreground">Assigned Agent</p>
                  </div>
                </div>
              )}

              {deal.property_names && deal.property_names.length > 0 && (
                <div className="flex items-center gap-3 p-2.5 rounded-md bg-muted/30 border border-border">
                  <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{deal.property_names[0]}</p>
                    {deal.property_names.length > 1 && (
                      <p className="text-[10px] text-muted-foreground">+{deal.property_names.length - 1} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-3" />

            {/* Tasks Summary */}
            <div className="px-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground uppercase tracking-wider">
                  Tasks ({tasks.length})
                </span>
              </div>
              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No tasks</p>
              ) : (
                <div className="space-y-1.5">
                  {tasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border"
                    >
                      <CheckSquare
                        className={cn(
                          'h-3.5 w-3.5 flex-shrink-0',
                          task.status === 'completed' ? 'text-green-500' : 'text-muted-foreground'
                        )}
                      />
                      <span
                        className={cn(
                          'text-xs flex-1 truncate',
                          task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'
                        )}
                      >
                        {task.title}
                      </span>
                      {task.due_date && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  ))}
                  {tasks.length > 3 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{tasks.length - 3} more tasks
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator className="my-3" />

            {/* Recent Activity */}
            <div className="px-4 pb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground uppercase tracking-wider">
                  Recent Activity
                </span>
              </div>
              <MiniTimeline activities={activities} />
            </div>

            {/* Open full page button */}
            <div className="sticky bottom-0 p-4 bg-background border-t border-border">
              <Link href={`/dashboard/deals/${deal.id}`} className="block">
                <Button className="w-full" variant="default">
                  Open Deal Details
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
