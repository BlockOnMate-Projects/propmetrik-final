'use client'

import { useEffect } from 'react'

/**
 * After a deploy, stale service-worker caches can 404 old CSS/JS chunks.
 * Reload once so users pick up the new build instead of an unstyled broken page.
 */
export function ChunkRecovery() {
  useEffect(() => {
    const reloadOnce = (key: string) => {
      const storageKey = `chunk-reload:${key}:${window.location.pathname}`
      if (sessionStorage.getItem(storageKey)) return
      sessionStorage.setItem(storageKey, '1')
      window.location.reload()
    }

    const onError = (event: ErrorEvent) => {
      const msg = event.message || ''
      if (/Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg)) {
        reloadOnce('error')
      }
    }

    const onReject = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason?.message || event.reason || '')
      if (/Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(reason)) {
        reloadOnce('reject')
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onReject)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onReject)
    }
  }, [])

  return null
}
