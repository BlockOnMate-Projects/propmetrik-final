'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    Wallet,
    BarChart3,
    Activity,
    Package,
    FileText,
    Briefcase
} from 'lucide-react'
import { cn } from '@/lib/utils'

const enterpriseLinks = [
    { name: 'Portfolio', href: '/dashboard/property-management/portfolios', icon: Briefcase },
    { name: 'Financials', href: '/dashboard/property-management/financials', icon: Wallet },
    { name: 'Reports', href: '/dashboard/property-management/reports', icon: BarChart3 },
    { name: 'Audit', href: '/dashboard/property-management/audit', icon: Activity },
    { name: 'Bulk Ops', href: '/dashboard/property-management/bulk-operations', icon: Package },
    { name: 'Brochure', href: '/dashboard/property-management/portfolios/brochure', icon: FileText },
]

export function EnterpriseNav() {
    const pathname = usePathname()

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {enterpriseLinks.map((link) => {
                const Icon = link.icon
                const isActive = pathname === link.href || 
                    (link.href !== '/dashboard/property-management/portfolios' && pathname.startsWith(link.href))

                return (
                    <Link key={link.href} href={link.href}>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "border-zinc-800 bg-black font-mono text-xs uppercase h-8",
                                isActive
                                    ? "border-amber-600 text-amber-500 bg-amber-950/30"
                                    : "text-zinc-400 hover:text-amber-500 hover:border-amber-900"
                            )}
                        >
                            <Icon className="mr-2 h-3 w-3" />
                            {link.name}
                        </Button>
                    </Link>
                )
            })}
        </div>
    )
}
