'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Leases have been consolidated into the Tenants page
// This redirect ensures old bookmarks/links still work
export default function LeasesPage() {
    const router = useRouter()
    
    useEffect(() => {
        router.replace('/dashboard/property-management/tenants')
    }, [router])
    
    return (
        <div className="flex flex-col items-center justify-center py-24">
            <p className="text-muted-foreground font-mono text-sm">Redirecting to Tenants...</p>
        </div>
    )
}
