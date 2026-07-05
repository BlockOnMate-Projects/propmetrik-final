'use client'

/**
 * Secondary "section" sub-nav for Project Management — the direct counterpart of PMSectionNav.
 * Renders the ITEMS of the active top-level group (e.g. CONSTRUCTION → Schedule · Drawings ·
 * Issues · …) as a clean amber pill row. Self-selects the group from the current pathname and
 * renders nothing when the active group has a single page (nothing to switch between).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useVisibleProjectGroups, findActiveGroup, isItemActive } from './projectsNav'

export function ProjectsSectionNav() {
    const pathname = usePathname()
    const groups = useVisibleProjectGroups()
    const activeGroup = findActiveGroup(pathname, groups)

    if (!activeGroup || activeGroup.items.length <= 1) return null

    return (
        <div className="w-full bg-background/60 border-b border-border">
            <div className="flex items-center h-9 px-4 gap-1 overflow-x-auto">
                {activeGroup.items.map((item) => {
                    const active = isItemActive(item, pathname)
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center px-3 py-1 text-[11px] font-mono font-medium rounded-sm transition-all min-w-max',
                                active
                                    ? 'bg-amber-500/15 text-amber-500 font-bold'
                                    : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-950/20'
                            )}
                        >
                            {item.label}
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
