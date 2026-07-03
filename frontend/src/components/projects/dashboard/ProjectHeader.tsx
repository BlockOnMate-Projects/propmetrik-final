import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  MapPin,
  MoreVertical,
  Calendar,
  Building2,
  Users,
  Share2,
  Edit,
  Trash2,
  Phone,
  Mail,
  AlertTriangle,
  BarChart3,
  ListTodo,
  FileText,
  Map,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DevelopmentProject, ProjectStatus } from '@/types/projects'
import { cn } from '@/lib/utils'
import { authedFetch } from '@/lib/authed-fetch'
import { useToast } from '@/hooks/use-toast'

interface ProjectHeaderProps {
  project: DevelopmentProject | null
  isLoading: boolean
  projectManagerName?: string | null
}

// Status color mapping
const statusStyles: Record<ProjectStatus, string> = {
  planning: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  pre_sales: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  under_construction: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  nearing_completion: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  sold_out: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  on_hold: 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
  archived: 'bg-zinc-500/10 text-muted-foreground border-zinc-500/20',
}

export function ProjectHeader({ project, isLoading, projectManagerName }: ProjectHeaderProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  const handleArchive = async () => {
    if (!project) return

    try {
      setIsArchiving(true)
      // Relative /api path via the Next proxy (was baking localhost:4000 + manual /api/v1).
      const response = await authedFetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Failed to archive project')
      }

      toast({
        title: 'Project Archived',
        description: `${project.project_name || project.name} has been archived.`,
      })

      router.push('/dashboard/projects')
    } catch (error) {
      console.error('Failed to archive project:', error)
      toast({
        title: 'Error',
        description: 'Failed to archive project. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsArchiving(false)
      setShowArchiveDialog(false)
    }
  }

  const handleShare = async () => {
    if (!project) return

    try {
      await navigator.clipboard.writeText(window.location.href)
      toast({
        title: 'Link Copied',
        description: 'Project link copied to clipboard.',
      })
    } catch {
      toast({
        title: 'Share',
        description: 'Use your browser share or copy the URL.',
      })
    }
  }

  if (isLoading || !project) {
    return (
      <div className="animate-pulse space-y-4 mb-8">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
          <div className="h-10 w-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8 space-y-4">
      {/* Breadcrumb / Back Navigation */}
      <nav className="flex items-center text-xs text-muted-foreground font-mono">
        <Link
          href="/dashboard/projects"
          className="hover:text-amber-500 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          BACK TO PROJECTS
        </Link>
        <span className="mx-2 text-zinc-700">/</span>
        <span className="text-muted-foreground">{project.project_number}</span>
      </nav>

      {/* Main Header Area */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Title & Meta */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {project.project_name}
            </h1>
            <Badge
              variant="outline"
              className={cn("font-mono uppercase text-[10px] h-6 px-2.5", statusStyles[project.status])}
            >
              {project.status.replace('_', ' ')}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground font-mono">
            {project.city && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{project.city}, {project.region}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="capitalize">{project.project_type.replace('_', ' ')}</span>
            </div>

            {project.planned_start_date && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {new Date(project.planned_start_date).toLocaleDateString('en-GB')}
                  {project.planned_completion_date && ` - ${new Date(project.planned_completion_date).toLocaleDateString('en-GB')}`}
                </span>
              </div>
            )}

            {projectManagerName && (
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span>PM: {projectManagerName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden lg:flex border-border bg-card/50 hover:bg-muted text-muted-foreground"
              onClick={handleShare}
            >
              <Share2 className="h-3.5 w-3.5 mr-2" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-card/50 hover:bg-muted text-muted-foreground"
              onClick={() => router.push(`/dashboard/projects/${project.id}/edit`)}
            >
              <Edit className="h-3.5 w-3.5 mr-2" />
              Edit Project
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="border-border bg-card/50 hover:bg-muted text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-mono uppercase">Manage Project</DropdownMenuLabel>
              <DropdownMenuItem
                className="text-muted-foreground focus:text-foreground focus:bg-muted cursor-pointer"
                onClick={() => router.push(`/dashboard/projects/${project.id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-2" /> Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-muted-foreground focus:text-foreground focus:bg-muted cursor-pointer"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4 mr-2" /> Share Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-muted" />
              <DropdownMenuLabel className="text-muted-foreground text-xs font-mono uppercase">Danger Zone</DropdownMenuLabel>
              <DropdownMenuItem
                className="text-red-600 dark:text-red-400 focus:text-red-300 focus:bg-red-900/20 cursor-pointer"
                onClick={() => setShowArchiveDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Archive Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Archive Project
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to archive <span className="text-foreground font-medium">{project.project_name || project.name}</span>?
              This will hide the project from the active list. You can restore it later from archived projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted text-muted-foreground border-border hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={isArchiving}
              className="bg-red-600 text-foreground hover:bg-red-700"
            >
              {isArchiving ? 'Archiving...' : 'Archive Project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Optional: Ghana Context Info Banner (If available) */}
      {(project.land_tenure || project.traditional_authority) && (
        <div className="flex items-center gap-4 py-2 px-3 bg-card/40 border border-border/60 rounded-md">
          {project.land_tenure && (
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-muted rounded">
                <Map className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground font-mono block">TENURE</span>
                <span className="text-xs text-muted-foreground font-medium capitalize">{project.land_tenure.replace(/_/g, ' ')}</span>
              </div>
            </div>
          )}
          {/* Can expand to show Authority name if we had the name joined */}
        </div>
      )}
    </div>
  )
}
