'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Users,
  Search,
  Mail,
  Phone,
  Loader2,
  HardHat,
  UserCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// Mock team data - in production, fetch from API
const mockTeamMembers = [
  { 
    id: '1', 
    name: 'Kwame Asante', 
    role: 'Site Supervisor', 
    email: 'kwame@example.com', 
    phone: '+233 24 123 4567',
    project: 'Cantonments Heights',
    status: 'active'
  },
  { 
    id: '2', 
    name: 'Ama Serwaa', 
    role: 'Quantity Surveyor', 
    email: 'ama@example.com', 
    phone: '+233 20 234 5678',
    project: 'All Projects',
    status: 'active'
  },
  { 
    id: '3', 
    name: 'Kofi Mensah', 
    role: 'Foreman', 
    email: 'kofi@example.com', 
    phone: '+233 24 345 6789',
    project: 'East Legon Villas',
    status: 'active'
  },
  { 
    id: '4', 
    name: 'Yaa Boatemaa', 
    role: 'Project Engineer', 
    email: 'yaa@example.com', 
    phone: '+233 27 456 7890',
    project: 'Cantonments Heights',
    status: 'active'
  },
  { 
    id: '5', 
    name: 'Emmanuel Osei', 
    role: 'Electrician', 
    email: 'emmanuel@example.com', 
    phone: '+233 24 567 8901',
    project: 'Airport City Tower',
    status: 'on_leave'
  },
  { 
    id: '6', 
    name: 'Abena Konadu', 
    role: 'Health & Safety Officer', 
    email: 'abena@example.com', 
    phone: '+233 20 678 9012',
    project: 'All Projects',
    status: 'active'
  },
]

// =====================================================
// TEAM MEMBER CARD
// =====================================================
function TeamMemberCard({ member }: { member: typeof mockTeamMembers[0] }) {
  const statusColors = {
    active: 'bg-green-500/20 text-green-400',
    on_leave: 'bg-yellow-500/20 text-yellow-400',
    inactive: 'bg-zinc-500/20 text-zinc-400',
  }
  
  return (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-amber-500/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src="" />
            <AvatarFallback className="bg-amber-600 text-black font-mono font-bold">
              {member.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-mono text-sm text-white font-medium">{member.name}</h4>
                <p className="font-mono text-[10px] text-amber-500">{member.role}</p>
              </div>
              <Badge className={cn("font-mono text-[9px]", statusColors[member.status as keyof typeof statusColors])}>
                {member.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            
            <div className="mt-3 space-y-1">
              <a 
                href={`mailto:${member.email}`}
                className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 hover:text-white transition-colors"
              >
                <Mail className="h-3 w-3" />
                {member.email}
              </a>
              <a 
                href={`tel:${member.phone}`}
                className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 hover:text-white transition-colors"
              >
                <Phone className="h-3 w-3" />
                {member.phone}
              </a>
            </div>
            
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <span className="font-mono text-[10px] text-zinc-500">
                {member.project}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =====================================================
// MAIN PAGE
// =====================================================
export default function PMTeamPage() {
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  // Filter team members
  const filteredMembers = mockTeamMembers.filter((member) => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      member.name.toLowerCase().includes(searchLower) ||
      member.role.toLowerCase().includes(searchLower) ||
      member.project.toLowerCase().includes(searchLower)
    )
  })
  
  // Group by role category
  const supervisors = filteredMembers.filter(m => 
    ['Site Supervisor', 'Foreman', 'Project Engineer'].includes(m.role)
  )
  const specialists = filteredMembers.filter(m => 
    ['Quantity Surveyor', 'Electrician', 'Health & Safety Officer'].includes(m.role)
  )
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-mono text-xl font-bold text-white">Team</h1>
        <p className="font-mono text-[10px] text-zinc-500 mt-1">
          View and contact your team members
        </p>
      </div>
      
      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search team members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-zinc-900 border-zinc-800 font-mono text-sm"
        />
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">Total Members</p>
                <h3 className="font-mono text-xl font-bold text-white">{mockTeamMembers.length}</h3>
              </div>
              <Users className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">Active</p>
                <h3 className="font-mono text-xl font-bold text-green-400">
                  {mockTeamMembers.filter(m => m.status === 'active').length}
                </h3>
              </div>
              <UserCircle className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">On Leave</p>
                <h3 className="font-mono text-xl font-bold text-yellow-400">
                  {mockTeamMembers.filter(m => m.status === 'on_leave').length}
                </h3>
              </div>
              <UserCircle className="h-5 w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-zinc-500">Roles</p>
                <h3 className="font-mono text-xl font-bold text-white">
                  {new Set(mockTeamMembers.map(m => m.role)).size}
                </h3>
              </div>
              <HardHat className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      )}
      
      {/* Empty State */}
      {!isLoading && filteredMembers.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="font-mono text-sm text-white mb-2">No team members found</h3>
            <p className="font-mono text-[10px] text-zinc-500">
              Try adjusting your search
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Team Members Grid */}
      {!isLoading && filteredMembers.length > 0 && (
        <div className="space-y-6">
          {/* Supervisors */}
          {supervisors.length > 0 && (
            <div>
              <h2 className="font-mono text-xs text-zinc-500 uppercase mb-3">
                Supervisors & Engineers ({supervisors.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {supervisors.map((member) => (
                  <TeamMemberCard key={member.id} member={member} />
                ))}
              </div>
            </div>
          )}
          
          {/* Specialists */}
          {specialists.length > 0 && (
            <div>
              <h2 className="font-mono text-xs text-zinc-500 uppercase mb-3">
                Specialists ({specialists.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {specialists.map((member) => (
                  <TeamMemberCard key={member.id} member={member} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
