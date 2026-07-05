'use client'

/**
 * Top-level "section" tabs for Project Management — the direct counterpart of PMTopNav.
 * Numbered, amber, font-mono tabs (OVERVIEW · CONSTRUCTION · PROCUREMENT · …). Rendered
 * once in the projects layout; each tab links to its group's first page. Tier-locked
 * groups render disabled with a lock, matching the previous behaviour.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVisibleProjectGroups, findActiveGroup } from './projectsNav'

export function ProjectsTopNav() {
    const pathname = usePathname()
    const groups = useVisibleProjectGroups()
    const activeGroup = findActiveGroup(pathname, groups)

    return (
        <div className="w-full bg-background border-b border-border">
            <div className="flex items-center h-10 px-4 gap-1 overflow-x-auto">
                {groups.map((group) => {
                    const isActive = group.label === activeGroup?.label
                    const isLocked = group.locked
                    return (
                        <Link
                            key={group.label}
                            href={isLocked ? '#' : group.items[0].href}
                            onClick={isLocked ? (e) => e.preventDefault() : undefined}
                            className={cn(
                                'flex items-center px-4 py-1.5 text-[11px] font-mono font-medium transition-all min-w-max',
                                isLocked
                                    ? 'text-muted-foreground/40 cursor-not-allowed'
                                    : isActive
                                    ? 'bg-amber-500 text-foreground font-bold'
                                    : 'text-amber-500/70 hover:text-amber-500 hover:bg-amber-950/30'
                            )}
                        >
                            <span className={cn('mr-2 opacity-50', isActive ? 'text-foreground' : 'text-amber-600')}>
                                {group.key}
                            </span>
                            {group.label}
                            {isLocked && <Lock className="h-2.5 w-2.5 ml-1.5" />}
                        </Link>
                    )
                })}
            </div>
            {/* Decorative bar to separate sub-nav from content (identical to PMTopNav). */}
            <div className="h-0.5 w-full bg-gradient-to-r from-amber-900/50 via-amber-500/20 to-amber-900/50" />
        </div>
    )
}
