'use client'

/**
 * Secondary "section" sub-nav for Property Management. Some capabilities are grouped under a parent
 * section instead of each sitting as its own top-level tab (keeps the top nav short and consistent):
 *   PROPERTIES  → Listings · Enquiries
 *   MAINTENANCE → Work Orders · Inspections · Vendors
 *   PORTFOLIOS  → Portfolio · Financials · Reports · Audit · Bulk Ops · Brochure   (the enterprise suite)
 *
 * Rendered once in the PM layout under PMTopNav. It self-selects the relevant group from the current
 * pathname and renders nothing on pages that aren't part of a grouped section. Each item respects the
 * same RBAC sub-tab gating as the top nav (unknown keys default to "allowed", so pages without an
 * explicit RBAC entry — reports/audit/bulk-ops/brochure — stay visible as they were before).
 *
 * This is the single source of truth for PM section sub-navs; the old bespoke `EnterpriseNav`
 * (chunky bordered buttons rendered inside individual pages) has been folded into here.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { canAccessServiceSubTab, canCustomerAccessSubTab } from '@/lib/rbac'

type SubItem = { name: string; href: string; subTabKey: string }

const PM = '/dashboard/property-management'

const SECTIONS: SubItem[][] = [
    [
        { name: 'Listings', href: `${PM}/properties`, subTabKey: 'propmgmt-properties' },
        { name: 'Enquiries', href: `${PM}/enquiries`, subTabKey: 'propmgmt-properties' },
    ],
    [
        { name: 'Work Orders', href: `${PM}/maintenance`, subTabKey: 'propmgmt-maintenance' },
        { name: 'Inspections', href: `${PM}/inspections`, subTabKey: 'propmgmt-inspections' },
        { name: 'Vendors', href: `${PM}/vendors`, subTabKey: 'propmgmt-vendors' },
    ],
    [
        { name: 'Portfolio', href: `${PM}/portfolios`, subTabKey: 'propmgmt-portfolios' },
        { name: 'Financials', href: `${PM}/financials`, subTabKey: 'propmgmt-financials' },
        { name: 'Reports', href: `${PM}/reports`, subTabKey: 'propmgmt-reports' },
        { name: 'Audit', href: `${PM}/audit`, subTabKey: 'propmgmt-audit' },
        { name: 'Bulk Ops', href: `${PM}/bulk-operations`, subTabKey: 'propmgmt-bulk-operations' },
        { name: 'Brochure', href: `${PM}/portfolios/brochure`, subTabKey: 'propmgmt-portfolios' },
    ],
]

/** An item owns the current path when it equals the href or is a parent segment of it. */
function ownsPath(href: string, pathname: string): boolean {
    return pathname === href || pathname.startsWith(href + '/')
}

export function PMSectionNav() {
    const pathname = usePathname()
    const { data: session } = useSession()

    const section = SECTIONS.find((items) => items.some((it) => ownsPath(it.href, pathname)))
    if (!section) return null

    const userRole = session?.user?.role || ''
    const userType = (session?.user as any)?.userType || 'staff'
    const customerServiceRole = (session?.user as any)?.customerServiceRoles?.property_management as string | undefined

    const items = userRole || customerServiceRole
        ? section.filter((it) =>
            userType === 'customer'
                ? canCustomerAccessSubTab(customerServiceRole, 'property-management', it.subTabKey)
                : canAccessServiceSubTab(userRole, 'property-management', it.subTabKey)
          )
        : section

    if (items.length <= 1) return null // nothing to switch between

    // Highlight the MOST specific match so nested routes (e.g. /portfolios/brochure) light up the
    // child item rather than its parent (/portfolios).
    const activeHref = items
        .map((it) => it.href)
        .filter((href) => ownsPath(href, pathname))
        .sort((a, b) => b.length - a.length)[0]

    return (
        <div className="w-full bg-background/60 border-b border-border">
            <div className="flex items-center h-9 px-4 gap-1 overflow-x-auto">
                {items.map((it) => {
                    const isActive = it.href === activeHref
                    return (
                        <Link
                            key={it.href}
                            href={it.href}
                            className={cn(
                                'flex items-center px-3 py-1 text-[11px] font-mono font-medium rounded-sm transition-all min-w-max',
                                isActive
                                    ? 'bg-amber-500/15 text-amber-500 font-bold'
                                    : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-950/20'
                            )}
                        >
                            {it.name}
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
