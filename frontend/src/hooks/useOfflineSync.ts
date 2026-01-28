'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  isOnline,
  onOnlineStatusChange,
  performSync,
  getStorageUsage,
  getPendingExpenses,
  getPendingDailyLogs,
  sendToServiceWorker,
  listenToServiceWorker,
  CachedExpense,
  CachedDailyLog,
} from '@/lib/offline-sync'

export interface SyncState {
  isOnline: boolean
  isSyncing: boolean
  lastSyncAt: number | null
  pendingCount: number
  pendingExpenses: CachedExpense[]
  pendingDailyLogs: CachedDailyLog[]
  storageUsage: {
    used: number
    available: number
    percent: number
  }
  syncError: string | null
}

export interface UseOfflineSyncReturn extends SyncState {
  sync: () => Promise<{ synced: number; failed: number }>
  clearCache: () => Promise<void>
  refreshPending: () => Promise<void>
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [state, setState] = useState<SyncState>({
    isOnline: true,
    isSyncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    pendingExpenses: [],
    pendingDailyLogs: [],
    storageUsage: { used: 0, available: 0, percent: 0 },
    syncError: null,
  })

  // Refresh pending items count
  const refreshPending = useCallback(async () => {
    try {
      const [expenses, logs, storage] = await Promise.all([
        getPendingExpenses(),
        getPendingDailyLogs(),
        getStorageUsage(),
      ])

      setState(prev => ({
        ...prev,
        pendingExpenses: expenses,
        pendingDailyLogs: logs,
        pendingCount: expenses.length + logs.length,
        storageUsage: storage,
      }))
    } catch (error) {
      console.error('Failed to refresh pending items:', error)
    }
  }, [])

  // Perform sync
  const sync = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (state.isSyncing) {
      return { synced: 0, failed: 0 }
    }

    setState(prev => ({ ...prev, isSyncing: true, syncError: null }))

    try {
      const result = await performSync()
      
      setState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: Date.now(),
      }))

      // Refresh pending items after sync
      await refreshPending()

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      setState(prev => ({
        ...prev,
        isSyncing: false,
        syncError: message,
      }))
      return { synced: 0, failed: state.pendingCount }
    }
  }, [state.isSyncing, state.pendingCount, refreshPending])

  // Clear all cached data
  const clearCache = useCallback(async () => {
    try {
      await sendToServiceWorker({ type: 'CLEAR_CACHE' })
      await refreshPending()
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }, [refreshPending])

  // Listen for online/offline changes
  useEffect(() => {
    setState(prev => ({ ...prev, isOnline: isOnline() }))

    const unsubscribe = onOnlineStatusChange(online => {
      setState(prev => ({ ...prev, isOnline: online }))
      
      // Auto-sync when coming back online
      if (online && state.pendingCount > 0) {
        sync()
      }
    })

    return unsubscribe
  }, [state.pendingCount, sync])

  // Listen for service worker messages
  useEffect(() => {
    const unsubscribe = listenToServiceWorker((event) => {
      const { type, payload } = event.data || {}
      
      switch (type) {
        case 'SYNC_COMPLETE':
          setState(prev => ({
            ...prev,
            isSyncing: false,
            lastSyncAt: Date.now(),
          }))
          refreshPending()
          break
          
        case 'SYNC_ERROR':
          setState(prev => ({
            ...prev,
            isSyncing: false,
            syncError: payload?.message || 'Sync failed',
          }))
          break
          
        case 'OFFLINE_ACTION_QUEUED':
          refreshPending()
          break
      }
    })

    return unsubscribe
  }, [refreshPending])

  // Initial load of pending items
  useEffect(() => {
    refreshPending()
  }, [refreshPending])

  return {
    ...state,
    sync,
    clearCache,
    refreshPending,
  }
}

// Simple hook for just online status
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(isOnline())
    return onOnlineStatusChange(setOnline)
  }, [])

  return online
}
