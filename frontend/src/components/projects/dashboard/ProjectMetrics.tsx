import React from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Home, 
  AlertTriangle,
  CheckCircle2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/utils'
import { BudgetSummary, ProjectStats, UnitStats } from '@/types/projects'
import { cn } from '@/lib/utils'

interface ProjectMetricsProps {
  budget?: BudgetSummary
  stats?: ProjectStats
  units?: UnitStats
  currency?: string
}

export function ProjectMetrics({ 
  budget, 
  stats, 
  units, 
  currency = 'GHS' 
}: ProjectMetricsProps) {
  
  // Calculate Progress Percentages
  const budgetUtilization = budget && budget.total_budget > 0
    ? (budget.total_spent / budget.total_budget) * 100
    : 0
    
  // Determine color based on utilization
  const budgetColor = budgetUtilization > 100 ? 'text-red-500' 
    : budgetUtilization > 90 ? 'text-amber-500' 
    : 'text-emerald-500'
    
  const budgetBarColor = budgetUtilization > 100 ? 'bg-red-500' 
    : budgetUtilization > 90 ? 'bg-amber-500' 
    : 'bg-emerald-500'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      
      {/* 1. HEALTH / OVERVIEW CARD */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider">
            Overall Health
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white mb-1">On Track</div>
          <p className="text-xs text-zinc-500 font-mono">
            No critical issues detected
          </p>
          <div className="mt-4 flex items-center gap-2">
             <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] text-emerald-400 font-medium">Compliance OK</span>
             </div>
             {/* Example alert badge */}
             {budgetUtilization > 95 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/20">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] text-amber-400 font-medium">Budget Risk</span>
                </div>
             )}
          </div>
        </CardContent>
      </Card>

      {/* 2. BUDGET CARD */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider">
            Active Budget
          </CardTitle>
          <DollarSign className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-white">
                {formatCurrency(budget?.total_spent || 0, currency)}
            </div>
            <span className="text-xs text-zinc-500">
                of {formatCurrency(budget?.total_budget || 0, currency)}
            </span>
          </div>
          
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono uppercase">
                <span className={budgetColor}>{budgetUtilization.toFixed(1)}% Utilized</span>
                <span className="text-zinc-500">
                    {formatCurrency((budget?.total_budget || 0) - (budget?.total_spent || 0), currency)} left
                </span>
            </div>
            <Progress value={Math.min(budgetUtilization, 100)} className="h-1.5 bg-zinc-800" indicatorClassName={budgetBarColor} />
          </div>
        </CardContent>
      </Card>

      {/* 3. UNITS / SALES CARD */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider">
            Sales Performance
          </CardTitle>
          <Home className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
           {units ? (
               <>
                <div className="text-2xl font-bold text-white mb-1">
                    {units.sold} <span className="text-zinc-600 text-lg font-normal">/ {units.total}</span>
                </div>
                <p className="text-xs text-zinc-500 font-mono mb-4">
                    Units Sold
                </p>
                <div className="grid grid-cols-2 gap-2">
                     <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase">Available</span>
                        <span className="text-sm font-medium text-white">{units.available}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase">Reserved</span>
                        <span className="text-sm font-medium text-amber-400">{units.reserved}</span>
                     </div>
                </div>
               </>
           ) : (
             <div className="flex flex-col items-center justify-center h-24 text-zinc-600 text-xs text-center p-4">
                Not applicable for this project type
             </div>
           )}
        </CardContent>
      </Card>

      {/* 4. SCHEDULE / TIMELINE CARD */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider">
            Timeline
          </CardTitle>
          <Calendar className="h-4 w-4 text-zinc-500" />
        </CardHeader>
        <CardContent>
           {/* Placeholder for timeline calculation - ideally passed in props */}
          <div className="text-2xl font-bold text-white mb-1">Week 12</div>
          <p className="text-xs text-zinc-500 font-mono">
            Phase 2: Foundation
          </p>
          
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono uppercase">
                <span className="text-blue-400">35% Complete</span>
                <span className="text-zinc-500">Target: 40%</span>
            </div>
            {/* Hardcoded 35% for demo if no props, strictly visual */}
            <Progress value={35} className="h-1.5 bg-zinc-800" indicatorClassName="bg-blue-500" />
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
