'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import { TeamManager } from '@/components/projects/team/TeamManager'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ProjectTeamPage() {
  const params = useParams()
  const projectId = params.id as string
  
  // For now, use a default org ID - in production this comes from auth context
  const organizationId = '00000000-0000-0000-0000-000000000001'
  
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
        <h1 className="font-mono text-xl tracking-tight">PROJECT TEAM</h1>
        <p className="font-mono text-[10px] text-zinc-500 mt-1">
          Manage team members, assign roles, and set permissions
        </p>
      </div>
      
      {/* Team Manager Component */}
      <TeamManager 
        projectId={projectId} 
        organizationId={organizationId}
        className="max-w-6xl"
      />
    </div>
  )
}
