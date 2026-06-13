'use client'

import { DataQualityIndicator } from '@/components/ui/terminal'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataQualityWidgetProps {
    overallScore: number
    breakdown: {
        completeness: number
        accuracy: number
        timeliness: number
        consistency: number
    }
    trend?: number
    issues?: {
        critical: number
        warning: number
    }
    lastUpdated?: Date | string
}

export function DataQualityWidget({
    overallScore,
    breakdown,
    trend,
    issues,
    lastUpdated
}: DataQualityWidgetProps) {
    return (
        <div className="border border-border bg-card/50 p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                        Data Quality Score
                    </h3>
                    {lastUpdated && (
                        <p className="font-mono text-[9px] text-muted-foreground mt-1">
                            Updated {new Date(lastUpdated).toLocaleTimeString()}
                        </p>
                    )}
                </div>

                {trend !== undefined && (
                    <div className={cn(
                        'flex items-center gap-1 font-mono text-xs',
                        trend > 0 ? 'text-green-600 dark:text-green-400' : trend < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                    )}>
                        {trend > 0 ? <TrendingUp className="w-3 h-3" /> :
                            trend < 0 ? <TrendingDown className="w-3 h-3" /> :
                                <Minus className="w-3 h-3" />}
                        <span>{trend > 0 ? '+' : ''}{trend}%</span>
                    </div>
                )}
            </div>

            {/* Main Quality Indicator */}
            <DataQualityIndicator
                score={overallScore}
                label="Overall Quality"
                showBreakdown={true}
                breakdown={breakdown}
            />

            {/* Issues Summary */}
            {issues && (issues.critical > 0 || issues.warning > 0) && (
                <div className="pt-3 border-t border-border">
                    <div className="grid grid-cols-2 gap-3">
                        {issues.critical > 0 && (
                            <div className="flex items-center gap-2 p-2 bg-red-100 dark:bg-red-900/20 border border-red-500/30">
                                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                <div>
                                    <div className="font-mono text-lg text-red-600 dark:text-red-400">{issues.critical}</div>
                                    <div className="font-mono text-[9px] text-muted-foreground">CRITICAL</div>
                                </div>
                            </div>
                        )}

                        {issues.warning > 0 && (
                            <div className="flex items-center gap-2 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500/30">
                                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                                <div>
                                    <div className="font-mono text-lg text-yellow-600 dark:text-yellow-400">{issues.warning}</div>
                                    <div className="font-mono text-[9px] text-muted-foreground">WARNINGS</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Quality Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border">
                <div className="text-center">
                    <div className={cn(
                        'font-mono text-xl',
                        breakdown.completeness >= 90 ? 'text-green-600 dark:text-green-400' :
                            breakdown.completeness >= 75 ? 'text-blue-600 dark:text-blue-400' :
                                breakdown.completeness >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                    )}>
                        {breakdown.completeness}%
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground">COMPLETE</div>
                </div>

                <div className="text-center">
                    <div className={cn(
                        'font-mono text-xl',
                        breakdown.accuracy >= 90 ? 'text-green-600 dark:text-green-400' :
                            breakdown.accuracy >= 75 ? 'text-blue-600 dark:text-blue-400' :
                                breakdown.accuracy >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                    )}>
                        {breakdown.accuracy}%
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground">ACCURATE</div>
                </div>

                <div className="text-center">
                    <div className={cn(
                        'font-mono text-xl',
                        breakdown.timeliness >= 90 ? 'text-green-600 dark:text-green-400' :
                            breakdown.timeliness >= 75 ? 'text-blue-600 dark:text-blue-400' :
                                breakdown.timeliness >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                    )}>
                        {breakdown.timeliness}%
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground">TIMELY</div>
                </div>

                <div className="text-center">
                    <div className={cn(
                        'font-mono text-xl',
                        breakdown.consistency >= 90 ? 'text-green-600 dark:text-green-400' :
                            breakdown.consistency >= 75 ? 'text-blue-600 dark:text-blue-400' :
                                breakdown.consistency >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                    )}>
                        {breakdown.consistency}%
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground">CONSISTENT</div>
                </div>
            </div>
        </div>
    )
}
