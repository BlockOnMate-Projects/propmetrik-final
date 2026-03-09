'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
    Layers,
    Building2,
    CheckCircle,
    Clock,
    ShoppingCart,
    Loader2,
    AlertTriangle,
    ArrowUpRight,
    Home,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { projectsApi } from '@/lib/projects-api'
import { formatCurrency } from '@/lib/utils'

interface ProjectSummaryRow {
    id: string
    project_number: string
    name: string
    project_type: string
    status: string
    city?: string
    region?: string
    total_units: number
    units_available: number
    units_reserved: number
    units_sold: number
    units_handed_over: number
    overall_progress: number
    construction_progress: number
    sales_progress: number
    total_budget: number
    total_spent: number
    cover_image_url?: string
}

export default function ProjectsUnitsPage() {
    const [projects, setProjects] = useState<ProjectSummaryRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadProjects()
    }, [])

    const loadProjects = async () => {
        try {
            setLoading(true)
            setError(null)
            const res = await projectsApi.getSummaries()
            setProjects((res as any) || [])
        } catch (err: any) {
            console.error('Failed to load projects:', err)
            setError(err.message || 'Failed to load projects')
        } finally {
            setLoading(false)
        }
    }

    const totalUnits = projects.reduce((sum, p) => sum + (p.total_units || 0), 0)
    const totalAvailable = projects.reduce((sum, p) => sum + (p.units_available || 0), 0)
    const totalReserved = projects.reduce((sum, p) => sum + (p.units_reserved || 0), 0)
    const totalSold = projects.reduce((sum, p) => sum + (p.units_sold || 0), 0)
    const underConstruction = totalUnits - totalAvailable - totalReserved - totalSold

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <AlertTriangle className="h-10 w-10 text-red-500" />
                <p className="text-sm font-mono text-zinc-400">{error}</p>
                <Button
                    onClick={loadProjects}
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                    Retry
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-mono font-bold text-white tracking-tight">
                    UNITS OVERVIEW
                </h1>
                <p className="text-zinc-500 font-mono text-xs mt-1">
                    Aggregate unit statistics across all projects
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">TOTAL UNITS</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{totalUnits}</p>
                            </div>
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Layers className="h-5 w-5 text-amber-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <Building2 className="h-3 w-3 mr-1 text-zinc-600" />
                            <span>Across {projects.length} projects</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">AVAILABLE</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{totalAvailable}</p>
                            </div>
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <CheckCircle className="h-5 w-5 text-emerald-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>Ready for sale/lease</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">RESERVED / SOLD</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{totalReserved + totalSold}</p>
                            </div>
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <ShoppingCart className="h-5 w-5 text-blue-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>{totalReserved} reserved · {totalSold} sold</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-mono text-zinc-500 tracking-wider">UNDER CONSTRUCTION</p>
                                <p className="text-2xl font-mono font-bold text-white mt-1">{underConstruction > 0 ? underConstruction : 0}</p>
                            </div>
                            <div className="p-2 bg-orange-500/10 rounded-lg">
                                <Clock className="h-5 w-5 text-orange-500" />
                            </div>
                        </div>
                        <div className="flex items-center mt-2 text-[10px] font-mono text-zinc-500">
                            <span>In progress</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Projects table */}
            <Card className="bg-zinc-900/80 border-zinc-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-white">PROJECTS WITH UNITS</CardTitle>
                    <CardDescription className="text-[10px] font-mono text-zinc-500">
                        Click a project to view detailed unit information
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {projects.length === 0 ? (
                        <div className="py-12 text-center">
                            <Home className="h-10 w-10 mx-auto mb-2 text-zinc-700 opacity-50" />
                            <p className="text-xs font-mono text-zinc-600">No projects found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-800">
                                        <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">PROJECT</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">LOCATION</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">TOTAL UNITS</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">AVAILABLE</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">SOLD</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider">STATUS</th>
                                        <th className="text-right px-4 py-3 text-[10px] font-mono text-zinc-500 tracking-wider"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projects.map((project) => (
                                        <tr key={project.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-mono text-white">{project.name}</p>
                                                <p className="text-[10px] font-mono text-zinc-600">{project.project_number}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs font-mono text-zinc-400">
                                                    {[project.city, project.region].filter(Boolean).join(', ') || '—'}
                                                </p>
                                            </td>
                                            <td className="text-right px-4 py-3">
                                                <p className="text-sm font-mono text-white">{project.total_units}</p>
                                            </td>
                                            <td className="text-right px-4 py-3">
                                                <p className="text-sm font-mono text-emerald-400">{project.units_available}</p>
                                            </td>
                                            <td className="text-right px-4 py-3">
                                                <p className="text-sm font-mono text-blue-400">{project.units_sold}</p>
                                            </td>
                                            <td className="text-right px-4 py-3">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        project.status === 'under_construction' || project.status === 'nearing_completion'
                                                            ? 'border-emerald-500/30 text-emerald-400 text-[10px] font-mono'
                                                            : project.status === 'planning' || project.status === 'pre_sales'
                                                            ? 'border-amber-500/30 text-amber-400 text-[10px] font-mono'
                                                            : 'border-zinc-600 text-zinc-400 text-[10px] font-mono'
                                                    }
                                                >
                                                    {project.status}
                                                </Badge>
                                            </td>
                                            <td className="text-right px-4 py-3">
                                                <Link href={`/dashboard/projects/${project.id}`}>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 text-[10px] font-mono"
                                                    >
                                                        View
                                                        <ArrowUpRight className="h-3 w-3 ml-1" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
