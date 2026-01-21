'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  Home,
  Landmark,
  Layers,
  Loader2,
  MapPin,
  HardHat,
  Plus,
  Trash2,
  DollarSign,
  Upload,
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
import { projectsApi, phasesApi } from '@/lib/projects-api'
import type { ProjectType, ProjectPhase } from '@/types/projects'
import { formatCurrency } from '@/lib/utils'

// =====================================================
// TYPES
// =====================================================
interface ProjectFormData {
  project_name: string;
  project_type: ProjectType;
  description: string;
  address: string;
  city: string;
  region: string;
  land_area_sqm: string;
  total_built_area_sqm: string;
  planned_start_date: string;
  planned_end_date: string;
  total_budget: string;
  currency: string;
  total_units: string;
  project_manager_id: string;
  hero_image_url: string;
}

interface PhaseInput {
  id: string;
  phase_name: string;
  planned_start_date: string;
  planned_end_date: string;
  budget_amount: string;
}

// =====================================================
// CONSTANTS
// =====================================================
const PROJECT_TYPES: { value: ProjectType; label: string; icon: React.ElementType }[] = [
  { value: 'residential', label: 'Residential', icon: Home },
  { value: 'commercial', label: 'Commercial', icon: Landmark },
  { value: 'mixed_use', label: 'Mixed Use', icon: Layers },
  { value: 'land_development', label: 'Land Development', icon: MapPin },
  { value: 'renovation', label: 'Renovation', icon: HardHat },
  { value: 'infrastructure', label: 'Infrastructure', icon: Building2 },
]

const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Central',
  'Eastern',
  'Volta',
  'Northern',
  'Upper East',
  'Upper West',
  'Brong Ahafo',
  'Oti',
  'Bono East',
  'Ahafo',
  'Savannah',
  'North East',
  'Western North',
]

const STEPS = [
  { id: 1, name: 'Project Details', description: 'Basic information' },
  { id: 2, name: 'Location', description: 'Site location' },
  { id: 3, name: 'Timeline & Budget', description: 'Schedule and costs' },
  { id: 4, name: 'Phases', description: 'Construction phases' },
  { id: 5, name: 'Review', description: 'Confirm details' },
]

// =====================================================
// STEP INDICATOR
// =====================================================
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, index) => {
        const isCompleted = currentStep > step.id
        const isCurrent = currentStep === step.id
        
        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs transition-colors",
                isCompleted && "bg-green-600 text-white",
                isCurrent && "bg-amber-600 text-black",
                !isCompleted && !isCurrent && "bg-zinc-800 text-zinc-500"
              )}>
                {isCompleted ? <Check className="h-4 w-4" /> : step.id}
              </div>
              <div className="ml-3 hidden sm:block">
                <div className={cn(
                  "font-mono text-xs",
                  isCurrent ? "text-amber-500" : isCompleted ? "text-green-400" : "text-zinc-500"
                )}>
                  {step.name}
                </div>
                <div className="font-mono text-[10px] text-zinc-600">{step.description}</div>
              </div>
            </div>
            
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
  title: string; 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// =====================================================
// FORM FIELD COMPONENT
// =====================================================
function FormField({ label, required, error, children }: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs text-zinc-400">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      {children}
      {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
    </div>
  )
}

// =====================================================
// MAIN WIZARD COMPONENT
// =====================================================
export default function NewProjectPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Phase templates
  const [phaseTemplates, setPhaseTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  
  // Form data
  const [formData, setFormData] = useState<ProjectFormData>({
    project_name: '',
    project_type: 'residential',
    description: '',
    address: '',
    city: '',
    region: '',
    land_area_sqm: '',
    total_built_area_sqm: '',
    planned_start_date: '',
    planned_end_date: '',
    total_budget: '',
    currency: 'GHS',
    total_units: '',
    project_manager_id: '',
    hero_image_url: '',
  })
  
  // Phases
  const [phases, setPhases] = useState<PhaseInput[]>([])
  
  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Load phase templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templates = await projectsApi.getPhaseTemplates(formData.project_type)
        setPhaseTemplates(templates || [])
      } catch (err) {
        console.error('Failed to load templates:', err)
      }
    }
    loadTemplates()
  }, [formData.project_type])
  
  // Handle input changes
  const handleChange = (field: keyof ProjectFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }
  
  // Apply template
  const applyTemplate = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = phaseTemplates.find(t => t.id === templateId)
    if (template?.phases) {
      const newPhases: PhaseInput[] = template.phases.map((p: any, i: number) => ({
        id: `temp-${i}`,
        phase_name: p.phase_name,
        planned_start_date: '',
        planned_end_date: '',
        budget_amount: '',
      }))
      setPhases(newPhases)
    }
  }
  
  // Add phase
  const addPhase = () => {
    setPhases(prev => [...prev, {
      id: `temp-${Date.now()}`,
      phase_name: '',
      planned_start_date: '',
      planned_end_date: '',
      budget_amount: '',
    }])
  }
  
  // Update phase
  const updatePhase = (id: string, field: keyof PhaseInput, value: string) => {
    setPhases(prev => prev.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ))
  }
  
  // Remove phase
  const removePhase = (id: string) => {
    setPhases(prev => prev.filter(p => p.id !== id))
  }
  
  // Validate step
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (step === 1) {
      if (!formData.project_name.trim()) {
        newErrors.project_name = 'Project name is required'
      }
    }
    
    if (step === 3) {
      if (!formData.planned_start_date) {
        newErrors.planned_start_date = 'Start date is required'
      }
      if (!formData.planned_end_date) {
        newErrors.planned_end_date = 'End date is required'
      }
      if (formData.planned_start_date && formData.planned_end_date) {
        if (new Date(formData.planned_end_date) <= new Date(formData.planned_start_date)) {
          newErrors.planned_end_date = 'End date must be after start date'
        }
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }
  
  // Navigate steps
  const goNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5))
    }
  }
  
  const goBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }
  
  // Submit project
  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      
      // Create project
      const projectData = {
        project_name: formData.project_name,
        project_type: formData.project_type,
        description: formData.description || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        region: formData.region || undefined,
        land_area_sqm: formData.land_area_sqm ? parseFloat(formData.land_area_sqm) : undefined,
        total_built_area_sqm: formData.total_built_area_sqm ? parseFloat(formData.total_built_area_sqm) : undefined,
        planned_start_date: formData.planned_start_date || undefined,
        planned_end_date: formData.planned_end_date || undefined,
        total_budget: formData.total_budget ? parseFloat(formData.total_budget) : undefined,
        currency: formData.currency,
        total_units: formData.total_units ? parseInt(formData.total_units) : undefined,
        hero_image_url: formData.hero_image_url || undefined,
      }
      
      const project = await projectsApi.create(projectData)
      
      // Create phases if any
      if (phases.length > 0) {
        const phasesToCreate = phases
          .filter(p => p.phase_name.trim())
          .map((p, i) => ({
            phase_name: p.phase_name,
            phase_number: i + 1,
            planned_start_date: p.planned_start_date || undefined,
            planned_end_date: p.planned_end_date || undefined,
            budget_amount: p.budget_amount ? parseFloat(p.budget_amount) : undefined,
          }))
        
        if (phasesToCreate.length > 0) {
          await phasesApi.createBulk(project.id, phasesToCreate)
        }
      }
      
      // Navigate to project detail
      router.push(`/dashboard/deals/projects/${project.id}`)
    } catch (err: any) {
      console.error('Failed to create project:', err)
      setError(err.message || 'Failed to create project')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="mb-6">
        <button 
          onClick={() => router.push('/dashboard/deals/projects')}
          className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 hover:text-amber-500 mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Projects
        </button>
        <h1 className="font-mono text-xl tracking-tight">NEW PROJECT</h1>
        <p className="font-mono text-[10px] text-zinc-500 mt-1">
          Create a new development project
        </p>
      </div>
      
      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} />
      
      {/* Error Message */}
      {error && (
        <div className="border border-red-800 bg-red-900/20 p-3 mb-6">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}
      
      {/* Step Content */}
      <div className="max-w-3xl mx-auto">
        {/* Step 1: Project Details */}
        {currentStep === 1 && (
          <Panel title="PROJECT DETAILS">
            <div className="space-y-4">
              <FormField label="Project Name" required error={errors.project_name}>
                <Input
                  value={formData.project_name}
                  onChange={(e) => handleChange('project_name', e.target.value)}
                  placeholder="e.g., Cantonments Heights Residences"
                  className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                />
              </FormField>
              
              <FormField label="Project Type" required>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {PROJECT_TYPES.map((type) => {
                    const Icon = type.icon
                    const isSelected = formData.project_type === type.value
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => handleChange('project_type', type.value)}
                        className={cn(
                          "p-3 border transition-colors text-left",
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
                          "font-mono text-xs",
                          isSelected ? "text-amber-500" : "text-zinc-300"
                        )}>
                          {type.label}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </FormField>
              
              <FormField label="Description">
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Brief description of the project..."
                  className="bg-zinc-900 border-zinc-800 font-mono text-sm min-h-[100px]"
                />
              </FormField>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Total Units">
                  <Input
                    type="number"
                    value={formData.total_units}
                    onChange={(e) => handleChange('total_units', e.target.value)}
                    placeholder="e.g., 50"
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
                <FormField label="Hero Image URL">
                  <Input
                    value={formData.hero_image_url}
                    onChange={(e) => handleChange('hero_image_url', e.target.value)}
                    placeholder="https://..."
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
              </div>
            </div>
          </Panel>
        )}
        
        {/* Step 2: Location */}
        {currentStep === 2 && (
          <Panel title="LOCATION">
            <div className="space-y-4">
              <FormField label="Address">
                <Input
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Street address"
                  className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                />
              </FormField>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField label="City">
                  <Input
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="e.g., Accra"
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
                <FormField label="Region">
                  <Select 
                    value={formData.region} 
                    onValueChange={(v) => handleChange('region', v)}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {GHANA_REGIONS.map((region) => (
                        <SelectItem key={region} value={region}>{region}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Land Area (sqm)">
                  <Input
                    type="number"
                    value={formData.land_area_sqm}
                    onChange={(e) => handleChange('land_area_sqm', e.target.value)}
                    placeholder="e.g., 5000"
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
                <FormField label="Total Built Area (sqm)">
                  <Input
                    type="number"
                    value={formData.total_built_area_sqm}
                    onChange={(e) => handleChange('total_built_area_sqm', e.target.value)}
                    placeholder="e.g., 10000"
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
              </div>
            </div>
          </Panel>
        )}
        
        {/* Step 3: Timeline & Budget */}
        {currentStep === 3 && (
          <Panel title="TIMELINE & BUDGET">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Planned Start Date" required error={errors.planned_start_date}>
                  <Input
                    type="date"
                    value={formData.planned_start_date}
                    onChange={(e) => handleChange('planned_start_date', e.target.value)}
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
                <FormField label="Planned End Date" required error={errors.planned_end_date}>
                  <Input
                    type="date"
                    value={formData.planned_end_date}
                    onChange={(e) => handleChange('planned_end_date', e.target.value)}
                    className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                  />
                </FormField>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Total Budget">
                  <div className="flex gap-2">
                    <Select 
                      value={formData.currency} 
                      onValueChange={(v) => handleChange('currency', v)}
                    >
                      <SelectTrigger className="w-24 bg-zinc-900 border-zinc-800 font-mono text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHS">GHS</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={formData.total_budget}
                      onChange={(e) => handleChange('total_budget', e.target.value)}
                      placeholder="e.g., 5000000"
                      className="flex-1 bg-zinc-900 border-zinc-800 font-mono text-sm"
                    />
                  </div>
                </FormField>
              </div>
              
              {/* Duration calculation */}
              {formData.planned_start_date && formData.planned_end_date && (
                <div className="bg-zinc-800/50 border border-zinc-700 p-3">
                  <div className="font-mono text-[10px] text-zinc-500 mb-1">ESTIMATED DURATION</div>
                  <div className="font-mono text-sm text-amber-500">
                    {Math.ceil(
                      (new Date(formData.planned_end_date).getTime() - new Date(formData.planned_start_date).getTime()) 
                      / (1000 * 60 * 60 * 24 * 30)
                    )} months
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}
        
        {/* Step 4: Phases */}
        {currentStep === 4 && (
          <Panel title="CONSTRUCTION PHASES">
            <div className="space-y-4">
              {/* Template Selection */}
              {phaseTemplates.length > 0 && phases.length === 0 && (
                <div className="mb-4">
                  <div className="font-mono text-[10px] text-zinc-500 mb-2">USE A TEMPLATE</div>
                  <div className="flex flex-wrap gap-2">
                    {phaseTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template.id)}
                        className="px-3 py-1.5 border border-zinc-700 bg-zinc-800/50 hover:border-amber-500/50 transition-colors"
                      >
                        <span className="font-mono text-xs text-zinc-300">{template.template_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Phase List */}
              {phases.length > 0 ? (
                <div className="space-y-3">
                  {phases.map((phase, index) => (
                    <div key={phase.id} className="p-3 border border-zinc-800 bg-zinc-900/50">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 flex items-center justify-center bg-zinc-800 font-mono text-[10px] text-amber-500 flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 space-y-3">
                          <Input
                            value={phase.phase_name}
                            onChange={(e) => updatePhase(phase.id, 'phase_name', e.target.value)}
                            placeholder="Phase name"
                            className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              type="date"
                              value={phase.planned_start_date}
                              onChange={(e) => updatePhase(phase.id, 'planned_start_date', e.target.value)}
                              placeholder="Start"
                              className="bg-zinc-900 border-zinc-800 font-mono text-xs"
                            />
                            <Input
                              type="date"
                              value={phase.planned_end_date}
                              onChange={(e) => updatePhase(phase.id, 'planned_end_date', e.target.value)}
                              placeholder="End"
                              className="bg-zinc-900 border-zinc-800 font-mono text-xs"
                            />
                            <Input
                              type="number"
                              value={phase.budget_amount}
                              onChange={(e) => updatePhase(phase.id, 'budget_amount', e.target.value)}
                              placeholder="Budget"
                              className="bg-zinc-900 border-zinc-800 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePhase(phase.id)}
                          className="text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-zinc-800">
                  <Layers className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="font-mono text-[10px] text-zinc-500">
                    No phases defined. Add phases to track construction progress.
                  </p>
                </div>
              )}
              
              <Button
                type="button"
                variant="outline"
                onClick={addPhase}
                className="w-full font-mono text-xs"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Phase
              </Button>
            </div>
          </Panel>
        )}
        
        {/* Step 5: Review */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <Panel title="REVIEW PROJECT">
              <div className="space-y-4">
                {/* Project Details */}
                <div>
                  <div className="font-mono text-[10px] text-zinc-500 mb-2">PROJECT DETAILS</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <span className="font-mono text-[10px] text-zinc-600">Name:</span>
                      <span className="font-mono text-xs text-white ml-2">{formData.project_name}</span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-zinc-600">Type:</span>
                      <span className="font-mono text-xs text-white ml-2 capitalize">{formData.project_type.replace('_', ' ')}</span>
                    </div>
                    {formData.total_units && (
                      <div>
                        <span className="font-mono text-[10px] text-zinc-600">Units:</span>
                        <span className="font-mono text-xs text-white ml-2">{formData.total_units}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Location */}
                {(formData.city || formData.region || formData.address) && (
                  <div className="pt-3 border-t border-zinc-800">
                    <div className="font-mono text-[10px] text-zinc-500 mb-2">LOCATION</div>
                    <div className="font-mono text-xs text-white">
                      {[formData.address, formData.city, formData.region].filter(Boolean).join(', ')}
                    </div>
                    {(formData.land_area_sqm || formData.total_built_area_sqm) && (
                      <div className="font-mono text-[10px] text-zinc-500 mt-1">
                        {formData.land_area_sqm && `Land: ${formData.land_area_sqm} sqm`}
                        {formData.land_area_sqm && formData.total_built_area_sqm && ' · '}
                        {formData.total_built_area_sqm && `Built: ${formData.total_built_area_sqm} sqm`}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Timeline & Budget */}
                <div className="pt-3 border-t border-zinc-800">
                  <div className="font-mono text-[10px] text-zinc-500 mb-2">TIMELINE & BUDGET</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <span className="font-mono text-[10px] text-zinc-600">Start:</span>
                      <span className="font-mono text-xs text-white ml-2">
                        {formData.planned_start_date ? new Date(formData.planned_start_date).toLocaleDateString('en-GB') : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-zinc-600">End:</span>
                      <span className="font-mono text-xs text-white ml-2">
                        {formData.planned_end_date ? new Date(formData.planned_end_date).toLocaleDateString('en-GB') : '—'}
                      </span>
                    </div>
                    {formData.total_budget && (
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] text-zinc-600">Budget:</span>
                        <span className="font-mono text-xs text-green-400 ml-2">
                          {formatCurrency(parseFloat(formData.total_budget), formData.currency)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Phases */}
                {phases.length > 0 && (
                  <div className="pt-3 border-t border-zinc-800">
                    <div className="font-mono text-[10px] text-zinc-500 mb-2">PHASES ({phases.length})</div>
                    <div className="space-y-1">
                      {phases.filter(p => p.phase_name).map((phase, i) => (
                        <div key={phase.id} className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-amber-500">{i + 1}.</span>
                          <span className="font-mono text-xs text-white">{phase.phase_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        )}
        
        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
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
              Next
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
