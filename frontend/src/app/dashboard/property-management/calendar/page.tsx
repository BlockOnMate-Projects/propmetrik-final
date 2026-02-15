'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PMCalendarRedirect() {
    const router = useRouter()
    useEffect(() => {
        router.replace('/dashboard/calendar')
    }, [router])
    return null
}
