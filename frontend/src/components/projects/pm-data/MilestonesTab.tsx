/**
 * MilestonesTab Component for Client Portal
 * 
 * Displays project milestones and allows clients to:
 * 1. View all milestones organized by phase
 * 2. Approve milestones that require client approval
 * 3. Track overall project progress
 * 
 * Enterprise Architecture: Admin defines framework → PM creates milestones within phases → Client approves required milestones
 */

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Flag,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Calendar,
  Target,
  Shield,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  milestoneApi,
  frameworkApi,
  type Milestone,
  type MilestoneStatus,
  type MilestoneFramework,
  type FrameworkPhase,
} from '@/lib/unified-project-api'

// =====================================================
// CONFIGURATION
// =====================================================

const statusConfig: Record<MilestoneStatus, { bg: string; text: string; label: string; icon: React.ElementType }> = {
  not_started: { bg: 'bg-zinc-700/50', text: 'text-zinc-400', label: 'Not Started', icon: Clock },
  in_progress: { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'In Progress', icon: Target },
  completed: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'Completed', icon: CheckCircle2 },
  blocked: { bg: 'bg-red-900/50', text: 'text-red-400', label: 'Blocked', icon: Lock },
  overdue: { bg: 'bg-orange-900/50', text: 'text-orange-400', label: 'Overdue', icon: AlertCircle },
}

// =====================================================
// PROPS
// =====================================================

interface MilestonesTabProps {
  projectId: string
  organizationId?: string
  frameworkId?: string
  onRefresh?: () => void
  canManage?: boolean
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function MilestonesTab({ projectId, organizationId, frameworkId, onRefresh, canManage = false }: MilestonesTabProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [framework, setFramework] = useState<MilestoneFramework | null>(null)
  const [phases, setPhases] = useState<FrameworkPhase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  // Approval dialog state
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Add milestone dialog state
  const [showAddMilestoneDialog, setShowAddMilestoneDialog] = useState(false)
  const [isAddingMilestone, setIsAddingMilestone] = useState(false)
  const [milestoneForm, setMilestoneForm] = useState({
    name: '',
    description: '',
    target_date: '',
    phase_id: '',
  })
  
  // Load milestones and framework
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Load milestones
      const milestonesData = await milestoneApi.getByProject(projectId)
      setMilestones(milestonesData)
      
      // Load framework if available
      if (frameworkId) {
        try {
          const frameworkData = await frameworkApi.getById(frameworkId)
          setFramework(frameworkData)
          
          const phasesData = await frameworkApi.getPhases(frameworkId)
          setPhases(phasesData)
          
          // Expand all phases by default
          setExpandedPhases(new Set(phasesData.map(p => p.id)))
        } catch (err) {
          console.warn('Failed to load framework:', err)
        }
      }
    } catch (err: any) {
      console.error('Failed to load milestones:', err)
      setError(err.message || 'Failed to load milestones')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, frameworkId])
  
  useEffect(() => {
    loadData()
  }, [loadData])
  
  // Toggle phase expansion
  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phaseId)) {
        next.delete(phaseId)
      } else {
        next.add(phaseId)
      }
      return next
    })
  }
  
  // Open approval dialog
  const openApprovalDialog = (milestone: Milestone) => {
    setSelectedMilestone(milestone)
    setShowApprovalDialog(true)
  }
  
  // Submit approval
  const submitApproval = async () => {
    if (!selectedMilestone) return
    
    try {
      setIsSubmitting(true)
      
      await milestoneApi.approve(projectId, selectedMilestone.id)
      
      // Close dialog and refresh
      setShowApprovalDialog(false)
      setSelectedMilestone(null)
      
      loadData()
      onRefresh?.()
    } catch (err: any) {
      console.error('Failed to approve milestone:', err)
      setError(err.message || 'Failed to approve milestone')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Add milestone (PM only)
  const handleAddMilestone = async () => {
    if (!milestoneForm.name.trim()) return
    try {
      setIsAddingMilestone(true)
      await milestoneApi.create(projectId, {
        name: milestoneForm.name.trim(),
        description: milestoneForm.description || undefined,
        target_date: milestoneForm.target_date ? new Date(milestoneForm.target_date) as any : undefined,
        phase_id: milestoneForm.phase_id || undefined,
      } as any)
      setMilestoneForm({ name: '', description: '', target_date: '', phase_id: '' })
      setShowAddMilestoneDialog(false)
      loadData()
    } catch (err: any) {
      console.error('Failed to create milestone:', err)
      setError(err.message || 'Failed to create milestone')
    } finally {
      setIsAddingMilestone(false)
    }
  }

  // Group milestones by phase
  const milestonesByPhase = React.useMemo(() => {
    const grouped: Record<string, Milestone[]> = {}
    
    milestones.forEach(milestone => {
      const phaseId = milestone.phase_id || 'unassigned'
      if (!grouped[phaseId]) {
        grouped[phaseId] = []
      }
      grouped[phaseId].push(milestone)
    })
    
    return grouped
  }, [milestones])
  
  // Stats
  const stats = {
    total: milestones.length,
    completed: milestones.filter(m => m.status === 'completed').length,
    inProgress: milestones.filter(m => m.status === 'in_progress').length,
    requiresApproval: milestones.filter(m => m.requires_client_approval && !m.approved_by_client && m.status === 'completed').length,
  }
  
  const overallProgress = stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100) 
    : 0
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="grid grid-cols-4 gap-4 flex-1">
          <StatCard label="Total Milestones" value={stats.total} />
          <StatCard label="Completed" value={stats.completed} color="green" />
          <StatCard label="In Progress" value={stats.inProgress} color="blue" />
          <StatCard label="Awaiting Your Approval" value={stats.requiresApproval} color="amber" />
        </div>
        {canManage && (
          <Button
            onClick={() => setShowAddMilestoneDialog(true)}
            className="h-10 font-mono text-xs bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Milestone
          </Button>
        )}
      </div>
      
      {/* Overall Progress */}
      <div className="border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs text-zinc-400">Overall Progress</span>
          <span className="font-mono text-sm text-amber-500">{overallProgress}%</span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        
        {/* Framework Info */}
        {framework && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
            <Shield className="h-4 w-4 text-amber-500" />
            <span className="font-mono text-xs text-zinc-400">
              Framework: <span className="text-white">{framework.name}</span>
            </span>
            {framework.is_locked && (
              <Badge variant="outline" className="font-mono text-[10px] bg-amber-900/50 text-amber-400 border-amber-800/50">
                <Lock className="h-2 w-2 mr-1" />
                Locked
              </Badge>
            )}
          </div>
        )}
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="border border-red-800 bg-red-900/20 p-4 text-center">
          <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
          <p className="font-mono text-sm text-red-400">{error}</p>
        </div>
      )}
      
      {/* Milestones by Phase */}
      {milestones.length === 0 ? (
        <div className="text-center py-12 border border-zinc-800 bg-zinc-900/50">
          <Flag className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="font-mono text-sm text-white mb-2">No Milestones Found</h3>
          <p className="font-mono text-xs text-zinc-500">
            Project milestones will appear here as they are created
          </p>
        </div>
      ) : phases.length > 0 ? (
        // Organized by framework phases
        <div className="space-y-4">
          {phases.map((phase, phaseIndex) => {
            const phaseMilestones = milestonesByPhase[phase.id] || []
            const isExpanded = expandedPhases.has(phase.id)
            const phaseProgress = phaseMilestones.length > 0
              ? Math.round((phaseMilestones.filter(m => m.status === 'completed').length / phaseMilestones.length) * 100)
              : 0
            
            return (
              <div key={phase.id} className="border border-zinc-800 bg-zinc-900/50">
                {/* Phase Header */}
                <div 
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-amber-900/50 text-amber-400 font-mono text-sm">
                    {phaseIndex + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-mono text-sm text-white">
                      {phase.name}
                    </h4>
                    <p className="font-mono text-xs text-zinc-500">
                      {phaseMilestones.length} milestones • {phaseProgress}% complete
                    </p>
                  </div>
                  
                  <div className="w-24">
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${phaseProgress}%` }}
                      />
                    </div>
                  </div>
                  
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  )}
                </div>
                
                {/* Phase Milestones */}
                {isExpanded && phaseMilestones.length > 0 && (
                  <div className="border-t border-zinc-800">
                    {phaseMilestones.map((milestone) => (
                      <MilestoneRow 
                        key={milestone.id}
                        milestone={milestone}
                        projectId={projectId}
                        onApprove={() => openApprovalDialog(milestone)}
                      />
                    ))}
                  </div>
                )}
                
                {isExpanded && phaseMilestones.length === 0 && (
                  <div className="border-t border-zinc-800 p-4 text-center">
                    <p className="font-mono text-xs text-zinc-500">No milestones in this phase yet</p>
                  </div>
                )}
              </div>
            )
          })}
          
          {/* Unassigned milestones */}
          {milestonesByPhase['unassigned']?.length > 0 && (
            <div className="border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-4 p-4 border-b border-zinc-800">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-zinc-700/50 text-zinc-400 font-mono text-sm">
                  -
                </div>
                <div className="flex-1">
                  <h4 className="font-mono text-sm text-zinc-400">Unassigned Milestones</h4>
                </div>
              </div>
              {milestonesByPhase['unassigned'].map((milestone) => (
                <MilestoneRow 
                  key={milestone.id}
                  milestone={milestone}
                  projectId={projectId}
                  onApprove={() => openApprovalDialog(milestone)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        // Simple list (no framework)
        <div className="border border-zinc-800 bg-zinc-900/50">
          {milestones.map((milestone) => (
            <MilestoneRow 
              key={milestone.id}
              milestone={milestone}
              projectId={projectId}
              onApprove={() => openApprovalDialog(milestone)}
            />
          ))}
        </div>
      )}
      
      {/* Add Milestone Dialog (PM only) */}
      {canManage && (
        <Dialog open={showAddMilestoneDialog} onOpenChange={setShowAddMilestoneDialog}>
          <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-mono text-white">Add Milestone</DialogTitle>
              <DialogDescription className="font-mono text-zinc-400">
                Create a new project milestone
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="font-mono text-xs text-zinc-400">Name *</Label>
                <Input
                  value={milestoneForm.name}
                  onChange={e => setMilestoneForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Milestone name"
                  className="mt-1 font-mono text-sm bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div>
                <Label className="font-mono text-xs text-zinc-400">Description</Label>
                <Input
                  value={milestoneForm.description}
                  onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  className="mt-1 font-mono text-sm bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div>
                <Label className="font-mono text-xs text-zinc-400">Target Date</Label>
                <Input
                  type="date"
                  value={milestoneForm.target_date}
                  onChange={e => setMilestoneForm(f => ({ ...f, target_date: e.target.value }))}
                  className="mt-1 font-mono text-sm bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddMilestoneDialog(false)}
                disabled={isAddingMilestone}
                className="font-mono text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddMilestone}
                disabled={isAddingMilestone || !milestoneForm.name.trim()}
                className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isAddingMilestone ? (
                  <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Plus className="h-3 w-3 mr-2" />Create Milestone</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-white">
              Approve Milestone
            </DialogTitle>
            <DialogDescription className="font-mono text-zinc-400">
              {selectedMilestone?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-zinc-800/50 border border-zinc-700 p-4">
              <p className="font-mono text-sm text-zinc-300">
                {selectedMilestone?.description || 'No description provided.'}
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-700">
                <div>
                  <span className="font-mono text-[10px] text-zinc-500">Target Date</span>
                  <p className="font-mono text-sm text-white">
                    {selectedMilestone?.target_date 
                      ? new Date(selectedMilestone.target_date).toLocaleDateString() 
                      : 'Not set'}
                  </p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-zinc-500">Completed Date</span>
                  <p className="font-mono text-sm text-green-400">
                    {selectedMilestone?.completed_date 
                      ? new Date(selectedMilestone.completed_date).toLocaleDateString() 
                      : 'Not completed'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-900/20 border border-amber-800/50 p-4">
              <p className="font-mono text-xs text-amber-400">
                By approving this milestone, you confirm that the work meets your requirements and standards.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApprovalDialog(false)}
              disabled={isSubmitting}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={submitApproval}
              disabled={isSubmitting}
              className="font-mono text-xs bg-green-600 hover:bg-green-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-2" />
                  Approve Milestone
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =====================================================
// MILESTONE ROW
// =====================================================

interface MilestoneRowProps {
  milestone: Milestone
  projectId: string
  onApprove: () => void
}

function MilestoneRow({ milestone, projectId, onApprove }: MilestoneRowProps) {
  const status = statusConfig[milestone.status]
  const StatusIcon = status.icon
  
  const needsApproval = milestone.requires_client_approval && 
                        !milestone.approved_by_client && 
                        milestone.status === 'completed'
  
  return (
    <div className="flex items-center gap-4 p-4 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/30 transition-colors">
      <div className="flex-shrink-0">
        <StatusIcon className={cn("h-5 w-5", status.text)} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h5 className="font-mono text-sm text-white line-clamp-1">
            {milestone.name}
          </h5>
          <Badge variant="outline" className={cn("font-mono text-[10px] border-0", status.bg, status.text)}>
            {status.label}
          </Badge>
          {milestone.is_required && (
            <Badge variant="outline" className="font-mono text-[10px] bg-red-900/30 text-red-400 border border-red-800/50">
              Required
            </Badge>
          )}
          {milestone.requires_client_approval && (
            <Badge variant="outline" className="font-mono text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800/50">
              {milestone.approved_by_client ? (
                <>
                  <CheckCircle2 className="h-2 w-2 mr-1" />
                  Approved
                </>
              ) : (
                <>
                  <Clock className="h-2 w-2 mr-1" />
                  Needs Approval
                </>
              )}
            </Badge>
          )}
        </div>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          {milestone.target_date && (
            <>Target: {new Date(milestone.target_date).toLocaleDateString()}</>
          )}
          {milestone.completed_date && (
            <> • Completed: {new Date(milestone.completed_date).toLocaleDateString()}</>
          )}
        </p>
      </div>
      
      {/* Progress */}
      {milestone.progress !== undefined && (
        <div className="w-20 text-right">
          <span className="font-mono text-xs text-zinc-400">{milestone.progress}%</span>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
            <div 
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${milestone.progress}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Approve Button */}
      {needsApproval && (
        <Button
          size="sm"
          className="h-8 font-mono text-xs bg-green-600 hover:bg-green-700 text-white"
          onClick={(e) => {
            e.stopPropagation()
            onApprove()
          }}
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Approve
        </Button>
      )}
    </div>
  )
}

// =====================================================
// STAT CARD
// =====================================================

function StatCard({ 
  label, 
  value, 
  color = 'zinc' 
}: { 
  label: string
  value: number
  color?: 'zinc' | 'blue' | 'amber' | 'red' | 'green'
}) {
  const colorClasses = {
    zinc: 'text-white',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    green: 'text-green-400',
  }
  
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={cn("font-mono text-2xl", colorClasses[color])}>
        {value}
      </div>
    </div>
  )
}
