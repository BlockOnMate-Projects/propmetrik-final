'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import {
  FileText,
  Download,
  Calendar,
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Mock reports
const reports = [
  { 
    id: '1', 
    name: 'Weekly Progress Report',
    description: 'Summary of all project progress for the week',
    type: 'progress',
    lastGenerated: '2026-01-20',
    frequency: 'weekly'
  },
  { 
    id: '2', 
    name: 'Monthly Budget Summary',
    description: 'Detailed budget vs actual spending analysis',
    type: 'budget',
    lastGenerated: '2026-01-01',
    frequency: 'monthly'
  },
  { 
    id: '3', 
    name: 'Milestone Status Report',
    description: 'Current status of all milestones across projects',
    type: 'milestone',
    lastGenerated: '2026-01-19',
    frequency: 'weekly'
  },
  { 
    id: '4', 
    name: 'Team Performance Report',
    description: 'Team productivity and task completion metrics',
    type: 'team',
    lastGenerated: '2026-01-15',
    frequency: 'bi-weekly'
  },
]

const recentReports = [
  { name: 'Weekly Progress - Week 3', date: '2026-01-19', size: '245 KB' },
  { name: 'Milestone Status - Jan 19', date: '2026-01-19', size: '128 KB' },
  { name: 'Budget Summary - December', date: '2026-01-01', size: '512 KB' },
  { name: 'Weekly Progress - Week 2', date: '2026-01-12', size: '234 KB' },
]

// =====================================================
// REPORT CARD
// =====================================================
function ReportCard({ report }: { report: typeof reports[0] }) {
  const typeIcons: Record<string, React.ElementType> = {
    progress: TrendingUp,
    budget: BarChart3,
    milestone: CheckCircle2,
    team: Clock,
  }
  
  const Icon = typeIcons[report.type] || FileText
  
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 bg-amber-500/10 rounded-lg flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-amber-500" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-mono text-sm text-white font-medium">{report.name}</h4>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{report.description}</p>
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                <Badge className="font-mono text-[9px] bg-zinc-700 text-zinc-300">
                  {report.frequency}
                </Badge>
                <span className="font-mono text-[10px] text-zinc-500">
                  Last: {new Date(report.lastGenerated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <Button size="sm" variant="ghost" className="h-6 font-mono text-xs text-amber-500">
                Generate
              </Button>
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
export default function PMReportsPage() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-mono text-xl font-bold text-white">Reports</h1>
          <p className="font-mono text-[10px] text-zinc-500 mt-1">
            Generate and download project reports
          </p>
        </div>
        <Button className="bg-amber-600 hover:bg-amber-700 text-black font-mono text-xs">
          <FileText className="h-4 w-4 mr-2" />
          Custom Report
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Reports */}
        <div className="lg:col-span-2">
          <h2 className="font-mono text-sm text-white mb-4">Available Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        </div>
        
        {/* Recent Reports */}
        <div>
          <h2 className="font-mono text-sm text-white mb-4">Recent Downloads</h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              {recentReports.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                  <p className="font-mono text-[10px] text-zinc-500">No recent reports</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentReports.map((report, i) => (
                    <div 
                      key={i}
                      className="flex items-center justify-between p-2 bg-zinc-800/50 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-zinc-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-white truncate">{report.name}</p>
                          <p className="font-mono text-[10px] text-zinc-500">{report.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] text-zinc-500">{report.size}</span>
                        <Download className="h-3 w-3 text-amber-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Quick Stats */}
          <Card className="bg-zinc-900 border-zinc-800 mt-4">
            <CardContent className="p-4">
              <h3 className="font-mono text-xs text-zinc-500 uppercase mb-3">This Month</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-zinc-400">Reports Generated</span>
                  <span className="font-mono text-sm text-white">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-zinc-400">Downloads</span>
                  <span className="font-mono text-sm text-white">8</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-zinc-400">Scheduled</span>
                  <span className="font-mono text-sm text-white">4</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
