'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Redirect /publications/list → /publications (the actual list page) */
export default function PublicationsListRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/admin/publications')
  }, [router])
  return null
}
