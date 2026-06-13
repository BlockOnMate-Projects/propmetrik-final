'use client'

import React, { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Clock,
  DollarSign,
  Calendar,
  FileText,
  Shield,
  Bell,
  BellOff,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'

// =====================================================
// TYPES
// =====================================================
export interface ProjectAlert {
  id: string
  projectId: string
  projectName: string
  type: 'budget' | 'timeline' | 'milestone' | 'permit' | 'compliance'
  severity: 'info' | 'warning' | 'critical'
  message: string
  createdAt: string
  isRead: boolean
  metadata?: Record<string, any>
}

interface AlertsPanelProps {
  alerts: ProjectAlert[]
  isLoading?: boolean
  onDismiss?: (alertId: string) => void
  onSnooze?: (alertId: string, hours: number) => void
  onAlertClick?: (alert: ProjectAlert) => void
  maxVisible?: number
  showViewAll?: boolean
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================
const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-500',
    label: 'Critical',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500',
    label: 'Warning',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-500',
    label: 'Info',
  },
}

const TYPE_ICONS = {
  budget: DollarSign,
  timeline: Clock,
  milestone: Calendar,
  permit: FileText,
  compliance: Shield,
}

const SNOOZE_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '4 hours', hours: 4 },
  { label: '1 day', hours: 24 },
  { label: '1 week', hours: 168 },
]

// =====================================================
// ALERT ITEM COMPONENT
// =====================================================
function AlertItem({
  alert,
  onDismiss,
  onSnooze,
  onClick,
}: {
  alert: ProjectAlert
  onDismiss?: (alertId: string) => void
  onSnooze?: (alertId: string, hours: number) => void
  onClick?: (alert: ProjectAlert) => void
}) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const config = SEVERITY_CONFIG[alert.severity]
  const TypeIcon = TYPE_ICONS[alert.type] || Bell
  const SeverityIcon = config.icon

  const timeAgo = formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative p-3 border rounded transition-colors",
        config.bg,
        config.border,
        onClick && "cursor-pointer hover:bg-opacity-20"
      )}
      onClick={() => onClick?.(alert)}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn("p-1.5 rounded-full", config.bg)}>
          <SeverityIcon className={cn("h-4 w-4", config.text)} />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Project name and type */}
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {alert.projectName}
            </span>
            <Badge 
              variant="secondary" 
              className={cn("text-[9px] h-4 px-1.5 text-foreground", config.badge)}
            >
              {config.label}
            </Badge>
          </div>
          
          {/* Message */}
          <p className="font-mono text-xs text-muted-foreground leading-relaxed">
            {alert.message}
          </p>
          
          {/* Timestamp */}
          <p className="font-mono text-[10px] text-muted-foreground mt-1">
            {timeAgo}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Snooze button */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-muted-foreground"
              onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
            >
              <BellOff className="h-3.5 w-3.5" />
            </Button>
            
            {/* Snooze menu */}
            {showSnoozeMenu && (
              <div className="absolute right-0 top-full mt-1 z-10 bg-card border border-border rounded shadow-xl py-1 min-w-[100px]">
                {SNOOZE_OPTIONS.map((option) => (
                  <button
                    key={option.hours}
                    onClick={() => {
                      onSnooze?.(alert.id, option.hours)
                      setShowSnoozeMenu(false)
                    }}
                    className="w-full px-3 py-1.5 text-left font-mono text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-400"
            onClick={() => onDismiss?.(alert.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Click outside to close snooze menu */}
      {showSnoozeMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowSnoozeMenu(false)}
        />
      )}
    </motion.div>
  )
}

// =====================================================
// MAIN ALERTS PANEL COMPONENT
// =====================================================
export function AlertsPanel({
  alerts,
  isLoading = false,
  onDismiss,
  onSnooze,
  onAlertClick,
  maxVisible = 5,
  className,
}: AlertsPanelProps) {
  const [showAll, setShowAll] = useState(false)

  // Sort alerts by severity and date
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity]
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const visibleAlerts = showAll ? sortedAlerts : sortedAlerts.slice(0, maxVisible)
  const hiddenCount = sortedAlerts.length - maxVisible

  // Count by severity
  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
  }

  return (
    <div className={cn("border border-border bg-card/50", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            ALERTS
          </span>
          {alerts.length > 0 && (
            <Badge variant="secondary" className="bg-zinc-700 text-muted-foreground text-[10px]">
              {alerts.length}
            </Badge>
          )}
        </div>
        
        {/* Severity counts */}
        <div className="flex items-center gap-2">
          {counts.critical > 0 && (
            <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px]">
              {counts.critical} Critical
            </Badge>
          )}
          {counts.warning > 0 && (
            <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px]">
              {counts.warning} Warning
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mb-2 opacity-50" />
            <span className="font-mono text-xs">No active alerts</span>
            <span className="font-mono text-[10px]">All projects are on track</span>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {visibleAlerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onDismiss={onDismiss}
                  onSnooze={onSnooze}
                  onClick={onAlertClick}
                />
              ))}
            </AnimatePresence>

            {/* Show more button */}
            {hiddenCount > 0 && !showAll && (
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-muted-foreground"
                onClick={() => setShowAll(true)}
              >
                Show {hiddenCount} more alerts
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}

            {showAll && sortedAlerts.length > maxVisible && (
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-muted-foreground"
                onClick={() => setShowAll(false)}
              >
                Show less
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AlertsPanel
