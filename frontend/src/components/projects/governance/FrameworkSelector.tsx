/**
 * FrameworkSelector Component
 * 
 * Enterprise governance component for selecting a milestone framework during project creation.
 * When a framework is selected, it locks the project into a predefined phase structure,
 * ensuring governance compliance.
 * 
 * Architecture:
 * - Admin defines frameworks (phases, milestones, requirements)
 * - Client selects framework when creating project
 * - PM operates within the framework constraints
 */

'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Shield,
  Lock,
  Unlock,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Building2,
  Layers,
  Flag,
  Info,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  frameworkApi,
  type MilestoneFramework,
  type FrameworkPhase,
} from '@/lib/unified-project-api'

// =====================================================
// PROPS
// =====================================================

interface FrameworkSelectorProps {
  organizationId: string
  projectType?: string
  selectedFrameworkId?: string
  onSelect: (frameworkId: string | undefined) => void
  disabled?: boolean
  showDetails?: boolean
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function FrameworkSelector({
  organizationId,
  projectType,
  selectedFrameworkId,
  onSelect,
  disabled = false,
  showDetails = true,
}: FrameworkSelectorProps) {
  const [frameworks, setFrameworks] = useState<MilestoneFramework[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Preview dialog state
  const [showPreview, setShowPreview] = useState(false)
  const [previewFramework, setPreviewFramework] = useState<MilestoneFramework | null>(null)
  const [previewPhases, setPreviewPhases] = useState<FrameworkPhase[]>([])
  const [isLoadingPhases, setIsLoadingPhases] = useState(false)
  
  // Load frameworks
  const loadFrameworks = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const result = await frameworkApi.getAll({
        organizationId,
        projectType,
        isActive: true,
      })
      
      setFrameworks(result)
    } catch (err: any) {
      console.error('Failed to load frameworks:', err)
      setError(err.message || 'Failed to load frameworks')
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, projectType])
  
  useEffect(() => {
    loadFrameworks()
  }, [loadFrameworks])
  
  // Load phases for preview
  const loadPhases = async (framework: MilestoneFramework) => {
    try {
      setIsLoadingPhases(true)
      const phases = await frameworkApi.getPhases(framework.id)
      setPreviewPhases(phases)
    } catch (err) {
      console.error('Failed to load phases:', err)
      setPreviewPhases([])
    } finally {
      setIsLoadingPhases(false)
    }
  }
  
  // Open preview
  const openPreview = async (framework: MilestoneFramework) => {
    setPreviewFramework(framework)
    setShowPreview(true)
    await loadPhases(framework)
  }
  
  // Get selected framework
  const selectedFramework = frameworks.find(f => f.id === selectedFrameworkId)
  
  if (isLoading) {
    return (
      <div className="border border-border bg-card/50 p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500 mx-auto" />
        <p className="font-mono text-xs text-muted-foreground mt-2">Loading frameworks...</p>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="border border-red-800 bg-red-100 dark:bg-red-900/20 p-4 text-center">
        <p className="font-mono text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadFrameworks}
          className="mt-2 font-mono text-xs"
        >
          Retry
        </Button>
      </div>
    )
  }
  
  if (frameworks.length === 0) {
    return (
      <div className="border border-border bg-card/50 p-6 text-center">
        <Shield className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
        <h4 className="font-mono text-sm text-foreground mb-1">No Frameworks Available</h4>
        <p className="font-mono text-xs text-muted-foreground">
          No milestone frameworks have been created for this organization.
        </p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-amber-500" />
        <span className="font-mono text-xs text-muted-foreground">Milestone Framework</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-mono text-xs">
                Select a framework to define the project's phase structure and milestone requirements.
                Once applied, this framework governs the project's timeline and deliverables.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Framework Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* No Framework Option */}
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          disabled={disabled}
          className={cn(
            "flex items-start gap-3 p-4 border transition-all text-left",
            !selectedFrameworkId
              ? "border-amber-500 bg-amber-100 dark:bg-amber-900/20"
              : "border-border bg-card/50 hover:border-border",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className={cn(
            "flex-shrink-0 w-10 h-10 flex items-center justify-center",
            !selectedFrameworkId ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
          )}>
            <Unlock className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-mono text-sm text-foreground">No Framework</h4>
              {!selectedFrameworkId && (
                <CheckCircle2 className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-1">
              Create phases and milestones freely without governance constraints
            </p>
          </div>
        </button>
        
        {/* Framework Options */}
        {frameworks.map((framework) => {
          const isSelected = selectedFrameworkId === framework.id
          
          return (
            <div key={framework.id} className="relative">
              <button
                type="button"
                onClick={() => onSelect(framework.id)}
                disabled={disabled}
                className={cn(
                  "w-full flex items-start gap-3 p-4 border transition-all text-left",
                  isSelected
                    ? "border-amber-500 bg-amber-100 dark:bg-amber-900/20"
                    : "border-border bg-card/50 hover:border-border",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "flex-shrink-0 w-10 h-10 flex items-center justify-center",
                  isSelected ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                )}>
                  <Shield className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono text-sm text-foreground">{framework.name}</h4>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-amber-500" />
                    )}
                    {framework.is_locked && (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground mt-1 line-clamp-2">
                    {framework.description || `For ${framework.project_type} projects`}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge className="font-mono text-[10px] bg-muted text-muted-foreground">
                      v{framework.version}
                    </Badge>
                    {framework.region && (
                      <Badge className="font-mono text-[10px] bg-muted text-muted-foreground">
                        {framework.region}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
              
              {/* Preview Button */}
              {showDetails && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openPreview(framework)
                  }}
                  className="absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-amber-500 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      
      {/* Selected Framework Details */}
      {selectedFramework && showDetails && (
        <div className="border border-amber-800/50 bg-amber-100 dark:bg-amber-900/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-amber-500" />
            <span className="font-mono text-xs text-amber-600 dark:text-amber-400">Selected Framework</span>
          </div>
          <h4 className="font-mono text-sm text-foreground mb-1">{selectedFramework.name}</h4>
          <p className="font-mono text-xs text-muted-foreground mb-3">
            {selectedFramework.description || 'No description provided'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPreview(selectedFramework)}
            className="font-mono text-xs"
          >
            <Layers className="h-3 w-3 mr-1" />
            View Phases & Milestones
          </Button>
        </div>
      )}
      
      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              {previewFramework?.name}
            </DialogTitle>
            <DialogDescription className="font-mono text-muted-foreground">
              {previewFramework?.description || 'Framework phases and milestones'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Framework Info */}
            <div className="grid grid-cols-3 gap-4 bg-muted/50 border border-border p-4">
              <div>
                <span className="font-mono text-[10px] text-muted-foreground">Project Type</span>
                <p className="font-mono text-sm text-foreground capitalize">
                  {previewFramework?.project_type?.replace('_', ' ')}
                </p>
              </div>
              <div>
                <span className="font-mono text-[10px] text-muted-foreground">Version</span>
                <p className="font-mono text-sm text-foreground">
                  v{previewFramework?.version}
                </p>
              </div>
              <div>
                <span className="font-mono text-[10px] text-muted-foreground">Status</span>
                <p className="font-mono text-sm text-foreground flex items-center gap-1">
                  {previewFramework?.is_locked ? (
                    <>
                      <Lock className="h-3 w-3 text-amber-500" />
                      Locked
                    </>
                  ) : (
                    <>
                      <Unlock className="h-3 w-3 text-green-500" />
                      Modifiable
                    </>
                  )}
                </p>
              </div>
            </div>
            
            {/* Phases */}
            <div>
              <h5 className="font-mono text-xs text-muted-foreground mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Phases ({previewPhases.length})
              </h5>
              
              {isLoadingPhases ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500 mx-auto" />
                </div>
              ) : previewPhases.length === 0 ? (
                <div className="text-center py-8 border border-border bg-muted/30">
                  <Layers className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="font-mono text-xs text-muted-foreground">No phases defined</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {previewPhases
                    .sort((a, b) => a.sequence_order - b.sequence_order)
                    .map((phase, index) => (
                      <div key={phase.id} className="border border-border bg-card/50">
                        {/* Phase Header */}
                        <div className="flex items-center gap-4 p-4">
                          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 font-mono text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-mono text-sm text-foreground">
                                {phase.name}
                              </h4>
                              {phase.is_required && (
                                <Badge className="font-mono text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-800/50">
                                  Required
                                </Badge>
                              )}
                            </div>
                            <p className="font-mono text-xs text-muted-foreground mt-1">
                              {phase.description || `${phase.default_duration_days || 0} days default duration`}
                            </p>
                          </div>
                          <div className="text-right">
                            {phase.default_duration_days && (
                              <span className="font-mono text-xs text-muted-foreground">
                                ~{phase.default_duration_days} days
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Phase Milestones */}
                        {phase.milestone_templates && phase.milestone_templates.length > 0 && (
                          <div className="border-t border-border p-4 pl-16">
                            <div className="space-y-2">
                              {phase.milestone_templates.map((template) => (
                                <div key={template.id} className="flex items-center gap-3">
                                  <Flag className={cn(
                                    "h-3 w-3",
                                    template.is_required ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                                  )} />
                                  <span className="font-mono text-xs text-muted-foreground flex-1">
                                    {template.name}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {template.requires_client_approval && (
                                      <Badge className="font-mono text-[8px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                        Client Approval
                                      </Badge>
                                    )}
                                    {template.requires_inspection && (
                                      <Badge className="font-mono text-[8px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                        Inspection
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPreview(false)}
              className="font-mono text-xs"
            >
              Close
            </Button>
            {previewFramework && selectedFrameworkId !== previewFramework.id && (
              <Button
                onClick={() => {
                  onSelect(previewFramework.id)
                  setShowPreview(false)
                }}
                className="font-mono text-xs bg-amber-600 hover:bg-amber-700 text-foreground"
              >
                <CheckCircle2 className="h-3 w-3 mr-2" />
                Select This Framework
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FrameworkSelector
