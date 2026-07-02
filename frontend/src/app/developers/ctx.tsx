'use client'

import { createContext, useContext } from 'react'
import type { Entitlements } from '@/lib/developer-api'

/** Shared developer-console context: entitlements fetched once by the layout. */
export const DeveloperCtx = createContext<{
  entitlements: Entitlements | null
  loading: boolean
  refresh: () => void
}>({ entitlements: null, loading: true, refresh: () => {} })

export const useDeveloper = () => useContext(DeveloperCtx)
