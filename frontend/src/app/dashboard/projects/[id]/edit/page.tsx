'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Building2,
  Calendar,
  Home,
  Landmark,
  Layers,
  Loader2,
  MapPin,
  HardHat,
  Save,
  Trash2,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { projectsApi } from '@/lib/projects-api'
import { teamApi, TeamMember } from '@/lib/team-api'
import type { ProjectType, DevelopmentProject, ProjectStatus } from '@/types/projects'

// =====================================================
// CONSTANTS
// =====================================================
const PROJECT_TYPES: { value: ProjectType; label: string; icon: React.ElementType }[] = [
  { value: 'residential_single', label: 'Residential (Single)', icon: Home },
  { value: 'residential_multi', label: 'Residential (Multi)', icon: Home },
  { value: 'commercial', label: 'Commercial', icon: Landmark },
  { value: 'mixed_use', label: 'Mixed Use', icon: Layers },
  { value: 'industrial', label: 'Industrial', icon: Building2 },
  { value: 'land_development', label: 'Land Development', icon: MapPin },
  { value: 'renovation', label: 'Renovation', icon: HardHat },
]

const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'pre_sales', label: 'Pre-Sales' },
  { value: 'under_construction', label: 'Under Construction' },
  { value: 'nearing_completion', label: 'Nearing Completion' },
  { value: 'completed', label: 'Completed' },
  { value: 'sold_out', label: 'Sold Out' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
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
// MAIN EDIT PAGE
// =====================================================
export default function EditProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectManagers, setProjectManagers] = useState<TeamMember[]>([])
  const [initialProjectManagerId, setInitialProjectManagerId] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    project_type: 'residential_single' as ProjectType,
    status: 'planning' as ProjectStatus,
    description: '',
    project_manager_id: '',
    address_line1: '',
    city: '',
    region: '',
    land_size_sqm: '',
    total_built_area_sqm: '',
    planned_start_date: '',
    planned_completion_date: '',
    total_budget: '',
    currency: 'GHS',
    total_units: '',
    cover_image_url: '',
  })
  
  // Load project data
  useEffect(() => {
    const loadProject = async () => {
      try {
        setIsLoading(true)
        const project = await projectsApi.getById(projectId)

        setOrganizationId(project.organization_id || null)
        setInitialProjectManagerId(project.project_manager_id || null)
        
        setFormData({
          name: project.project_name || project.name || '',
          project_type: project.project_type || 'residential_single',
          status: project.status || 'planning',
          description: project.description || '',
          project_manager_id: project.project_manager_id || '',
          address_line1: project.address || project.address_line1 || '',
          city: project.city || '',
          region: project.region || '',
          land_size_sqm: project.land_area_sqm?.toString() || project.land_size_sqm?.toString() || '',
          total_built_area_sqm: project.total_built_area_sqm?.toString() || '',
          planned_start_date: project.planned_start_date?.split('T')[0] || '',
          planned_completion_date: project.planned_end_date?.split('T')[0] || project.planned_completion_date?.split('T')[0] || '',
          total_budget: project.total_budget?.toString() || '',
          currency: project.currency || 'GHS',
          total_units: project.total_units?.toString() || '',
          cover_image_url: project.hero_image_url || project.cover_image_url || '',
        })
      } catch (err: any) {
        console.error('Failed to load project:', err)
        setError(err.message || 'Failed to load project')
      } finally {
        setIsLoading(false)
      }
    }
    
    if (projectId) {
      loadProject()
    }
  }, [projectId])

  // Load project managers
  useEffect(() => {
    const loadProjectManagers = async () => {
      try {
        const response = await teamApi.getMembers({
          organizationId: organizationId || undefined,
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

    if (organizationId) {
      loadProjectManagers()
    }
  }, [organizationId])
  
  // Handle input changes
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }
  
  // Save project
  const handleSave = async () => {
    try {
      setIsSaving(true)
      setError(null)
      
      // Only include fields that backend UpdateProjectInput accepts
      const updateData: Record<string, any> = {}
      
      if (formData.name) updateData.name = formData.name
      if (formData.project_type) updateData.project_type = formData.project_type
      if (formData.status) updateData.status = formData.status
      if (formData.description) updateData.description = formData.description
      if (formData.address_line1) updateData.address_line1 = formData.address_line1
      if (formData.city) updateData.city = formData.city
      if (formData.region) updateData.region = formData.region
      if (formData.land_size_sqm) updateData.land_size_sqm = parseFloat(formData.land_size_sqm)
      if (formData.total_budget) updateData.total_budget = parseFloat(formData.total_budget)
      if (formData.cover_image_url) updateData.cover_image_url = formData.cover_image_url

      if (formData.project_manager_id !== initialProjectManagerId) {
        updateData.project_manager_id = formData.project_manager_id || null
      }
      
      // Convert date strings to ISO format for backend
      if (formData.planned_start_date) {
        updateData.planned_start_date = new Date(formData.planned_start_date).toISOString()
      }
      if (formData.planned_completion_date) {
        updateData.planned_completion_date = new Date(formData.planned_completion_date).toISOString()
      }
      
      await projectsApi.update(projectId, updateData)
      router.push(`/dashboard/projects/${projectId}`)
    } catch (err: any) {
      console.error('Failed to update project:', err)
      setError(err.message || 'Failed to update project')
    } finally {
      setIsSaving(false)
    }
  }
  
  // Delete project
  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      await projectsApi.delete(projectId)
      router.push('/dashboard/projects')
    } catch (err: any) {
      console.error('Failed to delete project:', err)
      setError(err.message || 'Failed to delete project')
      setIsDeleting(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href={`/dashboard/projects/${projectId}`}
          className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 hover:text-amber-500 mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Project
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-xl tracking-tight">EDIT PROJECT</h1>
            <p className="font-mono text-[10px] text-zinc-500 mt-1">
              Update project details and settings
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="font-mono text-xs text-red-400 border-red-800 hover:bg-red-900/20">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-mono">Delete Project?</AlertDialogTitle>
                  <AlertDialogDescription className="font-mono text-xs text-zinc-400">
                    This action cannot be undone. This will permanently delete the project
                    and all associated data including phases, units, and documents.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700 font-mono text-xs"
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete Project
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </div>
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="border border-red-800 bg-red-900/20 p-3 mb-6">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}
      
      {/* Form */}
      <div className="max-w-4xl space-y-6">
        {/* Project Details */}
        <Panel title="PROJECT DETAILS">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Project Name" required>
              <Input
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Project name"
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
            </FormField>
            
            <FormField label="Status">
              <Select 
                value={formData.status} 
                onValueChange={(v) => handleChange('status', v)}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Project Manager">
              <Select
                value={formData.project_manager_id || 'unassigned'}
                onValueChange={(v) => handleChange('project_manager_id', v === 'unassigned' ? '' : v)}
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
                        {pm.userName || pm.userEmail || pm.contactEmail || 'Unnamed'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>
            
            <FormField label="Project Type">
              <Select 
                value={formData.project_type} 
                onValueChange={(v) => handleChange('project_type', v)}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            
            <FormField label="Total Units">
              <Input
                type="number"
                value={formData.total_units}
                onChange={(e) => handleChange('total_units', e.target.value)}
                placeholder="e.g., 50"
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
            </FormField>
            
            <div className="md:col-span-2">
              <FormField label="Description">
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Project description..."
                  className="bg-zinc-900 border-zinc-800 font-mono text-sm min-h-[80px]"
                />
              </FormField>
            </div>
          </div>
        </Panel>
        
        {/* Location */}
        <Panel title="LOCATION">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FormField label="Address">
                <Input
                  value={formData.address_line1}
                  onChange={(e) => handleChange('address_line1', e.target.value)}
                  placeholder="Street address"
                  className="bg-zinc-900 border-zinc-800 font-mono text-sm"
                />
              </FormField>
            </div>
            
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
            
            <FormField label="Land Area (sqm)">
              <Input
                type="number"
                value={formData.land_size_sqm}
                onChange={(e) => handleChange('land_size_sqm', e.target.value)}
                placeholder="e.g., 5000"
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
            </FormField>
            
            <FormField label="Built Area (sqm)">
              <Input
                type="number"
                value={formData.total_built_area_sqm}
                onChange={(e) => handleChange('total_built_area_sqm', e.target.value)}
                placeholder="e.g., 15000"
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
            </FormField>
          </div>
        </Panel>
        
        {/* Timeline & Budget */}
        <Panel title="TIMELINE & BUDGET">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Planned Start Date">
              <Input
                type="date"
                value={formData.planned_start_date}
                onChange={(e) => handleChange('planned_start_date', e.target.value)}
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
            </FormField>
            
            <FormField label="Planned Completion Date">
              <Input
                type="date"
                value={formData.planned_completion_date}
                onChange={(e) => handleChange('planned_completion_date', e.target.value)}
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
            </FormField>
            
            <FormField label="Total Budget">
              <Input
                type="number"
                value={formData.total_budget}
                onChange={(e) => handleChange('total_budget', e.target.value)}
                placeholder="e.g., 5000000"
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
            </FormField>
            
            <FormField label="Currency">
              <Select 
                value={formData.currency} 
                onValueChange={(v) => handleChange('currency', v)}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GHS">GHS (Ghana Cedi)</SelectItem>
                  <SelectItem value="USD">USD (US Dollar)</SelectItem>
                  <SelectItem value="EUR">EUR (Euro)</SelectItem>
                  <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </Panel>
        
        {/* Media */}
        <Panel title="MEDIA">
          <FormField label="Cover Image URL">
            <Input
              value={formData.cover_image_url}
              onChange={(e) => handleChange('cover_image_url', e.target.value)}
              placeholder="https://..."
              className="bg-zinc-900 border-zinc-800 font-mono text-sm"
            />
          </FormField>
          
          {formData.cover_image_url && (
            <div className="mt-4">
              <img 
                src={formData.cover_image_url} 
                alt="Cover preview"
                className="max-w-xs rounded border border-zinc-800"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
