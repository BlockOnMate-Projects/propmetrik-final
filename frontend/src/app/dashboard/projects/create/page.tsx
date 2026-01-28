'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  Home,
  Landmark,
  Layers,
  Loader2,
  MapPin,
  HardHat,
  DollarSign,
  Save,
  Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { projectsApi, wizardApi } from '@/lib/projects-api'
import { teamApi, TeamMember } from '@/lib/team-api'
import type { ProjectType } from '@/types/projects'
import { formatCurrency } from '@/lib/utils'

// Import Phase 1 components
import { LocationSelector, type LocationData } from '@/components/projects/LocationSelector'
import { HeroImageUpload } from '@/components/projects/HeroImageUpload'
import { UnitMixConfig, type UnitType } from '@/components/projects/UnitMixConfig'
import { FundingSourcesSelect } from '@/components/projects/FundingSourcesSelect'
import { FrameworkSelector } from '@/components/projects/governance'

// =====================================================
// TYPES
// =====================================================
interface ProjectFormData {
  projectName: string
  projectType: ProjectType
  description: string
  projectManagerId: string
  milestoneFrameworkId: string
  location: LocationData | null
  landTenure: 'freehold' | 'leasehold' | 'customary' | 'vested'
  traditionalAuthority?: string
  assembly?: string
  landAreaSqm: number
  totalBuiltAreaSqm: number
  plannedStartDate: string
  plannedEndDate: string
  totalBudget: number
  currency: string
  unitMix: UnitType[]
  fundingSources: string[]
  heroImage: File | null
  heroImageUrl: string
}

interface WizardDraft {
  id: string
  step: number
  data: Partial<ProjectFormData>
  lastSaved: string
}

// =====================================================
// CONSTANTS
// =====================================================
const PROJECT_TYPES: { value: ProjectType; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'residential_single', label: 'Residential (Single)', icon: Home, description: 'Single-family homes, townhouses' },
  { value: 'residential_multi', label: 'Residential (Multi)', icon: Home, description: 'Apartments, multi-family units' },
  { value: 'commercial', label: 'Commercial', icon: Landmark, description: 'Offices, retail, warehouses' },
  { value: 'mixed_use', label: 'Mixed Use', icon: Layers, description: 'Combined residential & commercial' },
  { value: 'industrial', label: 'Industrial', icon: Building2, description: 'Factories, manufacturing facilities' },
  { value: 'land_development', label: 'Land Development', icon: MapPin, description: 'Subdivisions, site prep' },
  { value: 'renovation', label: 'Renovation', icon: HardHat, description: 'Upgrades, refurbishments' },
]

const STEPS = [
  { id: 1, name: 'Basics', description: 'Project info & type' },
  { id: 2, name: 'Location', description: 'Site & GPS' },
  { id: 3, name: 'Land', description: 'Tenure & Specs' },
  { id: 4, name: 'Units', description: 'Scope & Mix' },
  { id: 5, name: 'Financials', description: 'Budget & Cost' },
  { id: 6, name: 'Review', description: 'Confirm & create' },
]

// =====================================================
// STEP INDICATOR
// =====================================================
function StepIndicator({ currentStep, onStepClick }: { currentStep: number; onStepClick: (step: number) => void }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, index) => {
        const isCompleted = currentStep > step.id
        const isCurrent = currentStep === step.id
        const isClickable = currentStep > step.id

        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={cn(
                "flex items-center transition-opacity",
                isClickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs transition-colors",
                isCompleted && "bg-green-600 text-white",
                isCurrent && "bg-amber-600 text-black",
                !isCompleted && !isCurrent && "bg-zinc-800 text-zinc-500"
              )}>
                {isCompleted ? <Check className="h-4 w-4" /> : step.id}
              </div>
              <div className="ml-3 hidden sm:block text-left">
                <div className={cn(
                  "font-mono text-xs",
                  isCurrent ? "text-amber-500" : isCompleted ? "text-green-400" : "text-zinc-500"
                )}>
                  {step.name}
                </div>
                <div className="font-mono text-[10px] text-zinc-600">{step.description}</div>
              </div>
            </button>

            {index < STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-px mx-4",
                isCompleted ? "bg-green-600" : "bg-zinc-800"
              )} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// =====================================================
// PANEL COMPONENT
// =====================================================
function Panel({ title, children, className }: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-xs text-amber-500 tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// =====================================================
// FORM FIELD COMPONENT
// =====================================================
function FormField({ label, required, error, hint, children }: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs text-zinc-400">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="font-mono text-[10px] text-zinc-500">{hint}</p>}
      {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
    </div>
  )
}

// =====================================================
// AUTO-SAVE INDICATOR
// =====================================================
function AutoSaveIndicator({ lastSaved, isSaving }: { lastSaved: string | null; isSaving: boolean }) {
  if (isSaving) {
    return (
      <div className="flex items-center gap-1.5 text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="font-mono text-[10px]">Saving...</span>
      </div>
    )
  }

  if (lastSaved) {
    return (
      <div className="flex items-center gap-1.5 text-green-500">
        <Check className="h-3 w-3" />
        <span className="font-mono text-[10px]">
          Saved {new Date(lastSaved).toLocaleTimeString()}
        </span>
      </div>
    )
  }

  return null
}

// =====================================================
// MAIN ENHANCED WIZARD COMPONENT
// =====================================================
export default function EnhancedProjectWizard() {
  const router = useRouter()
  const { toast } = useToast()

  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form data
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: '',
    projectType: 'residential_single',
    description: '',
    projectManagerId: '',
    milestoneFrameworkId: '',
    location: null,
    landTenure: 'leasehold',
    landAreaSqm: 0,
    totalBuiltAreaSqm: 0,
    plannedStartDate: '',
    plannedEndDate: '',
    totalBudget: 0,
    currency: 'GHS',
    unitMix: [],
    fundingSources: [],
    heroImage: null,
    heroImageUrl: '',
  })

  // Data for Selects
  const [authorities, setAuthorities] = useState<{id: string, name: string}[]>([])
  const [assemblies, setAssemblies] = useState<{id: string, assembly_name: string}[]>([])
  
  // Fetch lists on region change
  useEffect(() => {
    async function fetchData() {
       if (formData.location?.region) {
          try {
             const [auths, assems] = await Promise.all([
                 projectsApi.getTraditionalAuthorities(formData.location.region),
                 projectsApi.getAssemblies(formData.location.region)
             ])
             setAuthorities(auths || [])
             setAssemblies(assems || [])
          } catch(e) { console.error("Failed to fetch regulatory data", e) }
       }
    }
    fetchData()
  }, [formData.location?.region])

  // Project managers list
  const [projectManagers, setProjectManagers] = useState<TeamMember[]>([])

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Auto-save draft
  const saveDraft = useCallback(async () => {
    if (!formData.projectName && currentStep === 1) return null

    try {
      setIsSaving(true)
      
      // Map step to backend key
      const stepKeyMap: Record<number, string> = {
        1: 'step1_basics',
        2: 'step2_location',
        3: 'step3_land',
        4: 'step4_scope',
        5: 'step5_budget',
        6: 'step5_budget'
      }
      const stepKey = stepKeyMap[currentStep]
      
      if (!stepKey) return null;

      // Map data to backend structure
      let stepData = {}
      if (currentStep === 1) {
         stepData = { 
            name: formData.projectName, 
            project_type: formData.projectType, 
          description: formData.description,
          project_manager_id: formData.projectManagerId || undefined,
          milestone_framework_id: formData.milestoneFrameworkId || undefined
         }
      } else if (currentStep === 2) {
         stepData = {
            ghana_post_gps: formData.location?.gpsCode,
            latitude: formData.location?.coordinates?.lat,
            longitude: formData.location?.coordinates?.lng,
            region: formData.location?.region,
            ghana_district: formData.location?.district, // Frontend has district
            address_line1: formData.location?.address
         }
      } else if (currentStep === 3) {
         // Map 'customary' to valid backend enum if needed, or update backend to accept 'customary'
         // Backend accepts: 'government_lease' | 'stool_land_lease' | 'family_land' | 'freehold' | 'leasehold'
         let tenure = formData.landTenure as string;
         if (tenure === 'customary') tenure = 'stool_land_lease';
         
         stepData = {
            land_size_sqm: formData.landAreaSqm,
            land_tenure_type: tenure,
            assembly_id: formData.assembly,
            traditional_authority_id: formData.traditionalAuthority
         }
      } else if (currentStep === 4) {
         stepData = {
            unit_mix: formData.unitMix.map(u => ({ type: u.unitType, count: u.count })),
            total_sqm: formData.totalBuiltAreaSqm
         }
      } else if (currentStep === 5) {
         stepData = {
            total_budget: formData.totalBudget,
            display_currency: formData.currency,
            planned_start_date: formData.plannedStartDate,
            planned_completion_date: formData.plannedEndDate,
            // Simple mapping for funding sources
            funding_sources: formData.fundingSources.map(s => ({ type: 'equity', amount: 0, currency: formData.currency, provider: s }))
         }
      }

      const draft = await wizardApi.saveDraft({
        draftId: draftId || undefined,
        step: stepKey, // Send string key
        data: stepData,
      })
      setDraftId(draft.id)
      setLastSaved(new Date().toISOString())
      return draft.id
    } catch (err) {
      console.error('Failed to save draft:', err)
      return null
    } finally {
      setIsSaving(false)
    }
  }, [formData, currentStep, draftId])

  useEffect(() => {
    const loadProjectManagers = async () => {
      try {
        const response = await teamApi.getMembers({
          role: 'project_manager',
          isActive: true,
          limit: 200,
        })
        setProjectManagers(response.data || [])
      } catch (err) {
        console.error('Failed to load project managers:', err)
        setProjectManagers([])
      }
    }

    loadProjectManagers()
  }, [])

  // Auto-save on step change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.projectName) {
        saveDraft()
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [formData, saveDraft])

  // Handle form field changes
  const handleChange = <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Validate step
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.projectName.trim()) {
        newErrors.projectName = 'Project name is required'
      }
    }

    if (step === 2) {
      if (!formData.location) {
        newErrors.location = 'Location is required'
      }
    }

    if (step === 3) {
      if (!formData.landTenure) {
        newErrors.landTenure = 'Land tenure is required'
      }
    }

    if (step === 5) {
      if (!formData.plannedStartDate) {
        newErrors.plannedStartDate = 'Start date is required'
      }
      if (!formData.plannedEndDate) {
        newErrors.plannedEndDate = 'End date is required'
      }
      if (formData.plannedStartDate && formData.plannedEndDate) {
        if (new Date(formData.plannedEndDate) <= new Date(formData.plannedStartDate)) {
          newErrors.plannedEndDate = 'End date must be after start date'
        }
      }
      if (!formData.totalBudget || formData.totalBudget <= 0) {
        newErrors.totalBudget = 'Budget is required'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Navigate steps
  const goNext = async () => {
    if (validateStep(currentStep)) {
      // Save current step data before moving to next step
      await saveDraft()
      setCurrentStep(prev => Math.min(prev + 1, 6))
      window.scrollTo(0, 0)
    }
  }

  const goBack = async () => {
    // Save current step data before moving back
    await saveDraft()
    setCurrentStep(prev => Math.max(prev - 1, 1))
    window.scrollTo(0, 0)
  }

  const goToStep = async (step: number) => {
    if (step < currentStep) {
      // Save current step data before jumping
      await saveDraft()
      setCurrentStep(step)
      window.scrollTo(0, 0)
    }
  }

  // Submit project
  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      setError(null)

      // Ensure latest changes are saved
      const savedDraftId = await saveDraft()
      const targetDraftId = savedDraftId || draftId
      
      if (!targetDraftId) {
        throw new Error("Could not save project draft. Please check your connection.")
      }

      const project = await wizardApi.createFromDraft(targetDraftId)
      
      toast({
        title: 'Project Created',
        description: `${formData.projectName} has been created successfully.`,
      })

      router.push(`/dashboard/projects/${project.id}`)
    } catch (err: any) {
      console.error('Failed to create project:', err)
      setError(err.message || 'Failed to create project')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Send resume link
  const sendResumeLink = async () => {
    if (!draftId) return

    try {
      await wizardApi.sendResumeLink(draftId)
      toast({
        title: 'Link Sent',
        description: 'A resume link has been sent to your email.',
      })
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: 'Could not send the resume link.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/dashboard/projects')}
              className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 hover:text-amber-500 mb-4"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Projects
            </button>
            <h1 className="font-mono text-xl tracking-tight">CREATE NEW PROJECT</h1>
            <p className="font-mono text-[10px] text-zinc-500 mt-1">
              Step {currentStep} of {STEPS.length}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <AutoSaveIndicator lastSaved={lastSaved} isSaving={isSaving} />
            {draftId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={sendResumeLink}
                className="font-mono text-xs text-zinc-400"
              >
                <Mail className="h-3 w-3 mr-1.5" />
                Email Resume Link
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} onStepClick={goToStep} />

      {/* Error Message */}
      {error && (
        <div className="border border-red-800 bg-red-900/20 p-3 mb-6 max-w-4xl mx-auto">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Step Content */}
      <div className="max-w-4xl mx-auto">
        {/* Step 1: Basics */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <Panel title="PROJECT INFORMATION">
              <div className="space-y-4">
                <FormField label="Project Name" required error={errors.projectName}>
                  <Input
                    value={formData.projectName}
                    onChange={(e) => handleChange('projectName', e.target.value)}
                    placeholder="e.g., Cantonments Heights Residences"
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>

                <FormField label="Project Type" required>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {PROJECT_TYPES.map((type) => {
                      const Icon = type.icon
                      const isSelected = formData.projectType === type.value
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => handleChange('projectType', type.value)}
                          className={cn(
                            "p-4 border transition-colors text-left",
                            isSelected
                              ? "border-amber-500 bg-amber-900/20"
                              : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                          )}
                        >
                          <Icon className={cn(
                            "h-5 w-5 mb-2",
                            isSelected ? "text-amber-500" : "text-zinc-500"
                          )} />
                          <div className={cn(
                            "font-mono text-xs font-medium",
                            isSelected ? "text-amber-500" : "text-zinc-300"
                          )}>
                            {type.label}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                            {type.description}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </FormField>

                <FormField label="Description" hint="Brief overview of the project scope and objectives">
                  <Textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Describe the project..."
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm min-h-[100px]"
                  />
                </FormField>

                <FormField label="Project Manager" hint="Assign a project manager (optional)">
                  <Select
                    value={formData.projectManagerId || 'unassigned'}
                    onValueChange={(value) => handleChange('projectManagerId', value === 'unassigned' ? '' : value)}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                      <SelectValue placeholder="Select project manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {projectManagers
                        .filter((pm) => pm.userId)
                        .map((pm) => (
                          <SelectItem key={pm.userId} value={pm.userId as string}>
                            {pm.fullName || pm.userName || pm.email || pm.userEmail || pm.contactEmail || 'Unnamed'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </Panel>

            <Panel title="HERO IMAGE">
              <HeroImageUpload
                value={formData.heroImageUrl || null}
                onChange={(url: string | null, file?: File) => {
                  handleChange('heroImageUrl', url || '')
                  handleChange('heroImage', file || null)
                }}
              />
            </Panel>

            <Panel title="MILESTONE FRAMEWORK (GOVERNANCE)">
              <FrameworkSelector
                organizationId="default"
                projectType={formData.projectType}
                selectedFrameworkId={formData.milestoneFrameworkId || undefined}
                onSelect={(frameworkId) => handleChange('milestoneFrameworkId', frameworkId || '')}
                showDetails={true}
              />
            </Panel>
          </div>
        )}

        {/* Step 2: Location */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <Panel title="SITE LOCATION">
              <LocationSelector
                value={formData.location}
                onChange={(loc) => handleChange('location', loc)}
                error={errors.location}
              />
            </Panel>
          </div>
        )}

        {/* Step 3: Land Details */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <Panel title="LEGAL & REGULATORY">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Land Tenure" required error={errors.landTenure}>
                  <Select
                    value={formData.landTenure}
                    onValueChange={(value) => handleChange('landTenure', value as any)}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                      <SelectValue placeholder="Select tenure type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="freehold">Freehold</SelectItem>
                      <SelectItem value="leasehold">Leasehold</SelectItem>
                      <SelectItem value="customary">Customary/Stool Land</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="District/Municipal Assembly">
                  <Select
                     value={formData.assembly}
                     onValueChange={(v) => handleChange('assembly', v)}
                     disabled={!assemblies.length}
                  >
                     <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                        <SelectValue placeholder={assemblies.length ? "Select Assembly" : "Select Region first"} />
                     </SelectTrigger>
                     <SelectContent>
                        {assemblies.map(a => (
                           <SelectItem key={a.id} value={a.id}>{a.assembly_name}</SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Traditional Authority">
                  <Select
                     value={formData.traditionalAuthority}
                     onValueChange={(v) => handleChange('traditionalAuthority', v)}
                     disabled={!authorities.length}
                  >
                     <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                        <SelectValue placeholder={authorities.length ? "Select Authority" : "Select Region first"} />
                     </SelectTrigger>
                     <SelectContent>
                        {authorities.map(a => (
                           <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                </FormField>
              </div>
            </Panel>

            <Panel title="LAND SPECIFICATIONS">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Land Area (sqm)" hint="Total plot size">
                  <Input
                    type="number"
                    value={formData.landAreaSqm || ''}
                    onChange={(e) => handleChange('landAreaSqm', parseFloat(e.target.value) || 0)}
                    placeholder="e.g., 5000"
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
                <FormField label="Total Built Area (sqm)" hint="Gross floor area">
                  <Input
                    type="number"
                    value={formData.totalBuiltAreaSqm || ''}
                    onChange={(e) => handleChange('totalBuiltAreaSqm', parseFloat(e.target.value) || 0)}
                    placeholder="e.g., 10000"
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
              </div>
            </Panel>
          </div>
        )}

        {/* Step 5: Financials */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <Panel title="PROJECT TIMELINE">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Planned Start Date" required error={errors.plannedStartDate}>
                  <Input
                    type="date"
                    value={formData.plannedStartDate}
                    onChange={(e) => handleChange('plannedStartDate', e.target.value)}
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
                <FormField label="Planned End Date" required error={errors.plannedEndDate}>
                  <Input
                    type="date"
                    value={formData.plannedEndDate}
                    onChange={(e) => handleChange('plannedEndDate', e.target.value)}
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
              </div>
            </Panel>

            <Panel title="PROJECT BUDGET">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Total Budget" required error={errors.totalBudget}>
                    <div className="flex gap-2">
                      <Select
                        value={formData.currency}
                        onValueChange={(v) => handleChange('currency', v)}
                      >
                        <SelectTrigger className="w-24 bg-zinc-900 border-zinc-800 font-mono text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GHS">GH₵</SelectItem>
                          <SelectItem value="USD">$</SelectItem>
                          <SelectItem value="EUR">€</SelectItem>
                          <SelectItem value="GBP">£</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={formData.totalBudget || ''}
                        onChange={(e) => handleChange('totalBudget', parseFloat(e.target.value) || 0)}
                        placeholder="e.g., 5000000"
                        className="flex-1 bg-zinc-900 border-zinc-800 font-mono text-sm"
                      />
                    </div>
                  </FormField>
                </div>
                <p className="text-xs text-zinc-500 font-mono">
                  Enter your estimated total project budget. This will be used for budget tracking and reporting.
                </p>
              </div>
            </Panel>

            <Panel title="FUNDING SOURCES">
              <FundingSourcesSelect
                value={formData.fundingSources}
                onChange={(sources) => handleChange('fundingSources', sources)}
                maxSelections={5}
              />
            </Panel>
          </div>
        )}

        {/* Step 4: Units */}
        {currentStep === 4 && (
          <Panel title="UNIT CONFIGURATION">
            <UnitMixConfig
              value={formData.unitMix}
              onChange={(units) => handleChange('unitMix', units)}
              currency={formData.currency}
            />
          </Panel>
        )}

        {/* Step 6: Review */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <Panel title="REVIEW PROJECT DETAILS">
              <div className="space-y-6">
                {/* Project Info */}
                <div>
                  <h3 className="font-mono text-xs text-amber-500 mb-3">PROJECT INFORMATION</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-mono text-[10px] text-zinc-500">Project Name</span>
                      <p className="font-mono text-zinc-200">{formData.projectName}</p>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-zinc-500">Type</span>
                      <p className="font-mono text-zinc-200 capitalize">{formData.projectType.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>

                {/* Location */}
                {formData.location && (
                  <div>
                    <h3 className="font-mono text-xs text-amber-500 mb-3">LOCATION</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">Region</span>
                        <p className="font-mono text-zinc-200">{formData.location.region}</p>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">District</span>
                        <p className="font-mono text-zinc-200">{formData.location.district}</p>
                      </div>
                      {formData.location.gpsCode && (
                        <div>
                          <span className="font-mono text-[10px] text-zinc-500">GPS Code</span>
                          <p className="font-mono text-zinc-200">{formData.location.gpsCode}</p>
                        </div>
                      )}
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">Land Tenure</span>
                        <p className="font-mono text-zinc-200 capitalize">{formData.landTenure}</p>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">District Assembly</span>
                        <p className="font-mono text-zinc-200">
                          {assemblies.find(a => a.id === formData.assembly)?.assembly_name || formData.assembly || '-'}
                        </p>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500">Traditional Authority</span>
                        <p className="font-mono text-zinc-200">
                          {authorities.find(a => a.id === formData.traditionalAuthority)?.name || formData.traditionalAuthority || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Financials */}
                <div>
                  <h3 className="font-mono text-xs text-amber-500 mb-3">FINANCIALS</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-mono text-[10px] text-zinc-500">Total Budget</span>
                      <p className="font-mono text-green-400">{formatCurrency(formData.totalBudget, formData.currency)}</p>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-zinc-500">Timeline</span>
                      <p className="font-mono text-zinc-200">
                        {formData.plannedStartDate && formData.plannedEndDate
                          ? `${new Date(formData.plannedStartDate).toLocaleDateString()} - ${new Date(formData.plannedEndDate).toLocaleDateString()}`
                          : 'Not set'
                        }
                      </p>
                    </div>
                    {formData.fundingSources.length > 0 && (
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-zinc-500">Funding Sources</span>
                        <p className="font-mono text-zinc-200">{formData.fundingSources.join(', ')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Units */}
                {formData.unitMix.length > 0 && (
                  <div>
                    <h3 className="font-mono text-xs text-amber-500 mb-3">UNIT MIX</h3>
                    <div className="space-y-2">
                      {formData.unitMix.map((unit, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-800">
                          <span className="font-mono text-sm text-zinc-300">{unit.unitType}</span>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="font-mono text-zinc-500">{unit.count} units</span>
                            <span className="font-mono text-zinc-500">{unit.avgSizeSqm} sqm</span>
                            <span className="font-mono text-green-400">{formatCurrency(unit.basePrice ?? 0, formData.currency)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 font-medium">
                        <span className="font-mono text-sm text-amber-500">Total Units</span>
                        <span className="font-mono text-sm text-amber-500">
                          {formData.unitMix.reduce((sum, u) => sum + u.count, 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={currentStep === 1}
            className="font-mono text-xs"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {currentStep < 5 ? (
            <Button
              onClick={goNext}
              className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-white font-mono text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create Project
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
