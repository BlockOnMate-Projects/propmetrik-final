'use client'

import { useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { clearSessionCache } from '@/lib/session-cache'

/**
 * When the backend JWT refresh fails, Auth.js sets session.error = RefreshTokenError.
 * Without handling this, clients can enter retry loops against /api/auth/session.
 */
export function SessionErrorHandler() {
  const { data: session } = useSession()
  const handled = useRef(false)

  useEffect(() => {
    const err = (session as { error?: string } | null)?.error
    if (err === 'RefreshTokenError' && !handled.current) {
      handled.current = true
      clearSessionCache()
      void signOut({ callbackUrl: '/login' })
    }
  }, [session])

  return null
}
