'use client'

/**
 * Offline Sync Service
 * IndexedDB storage + Background sync for offline-first PWA
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'

// =====================================================
// DATABASE SCHEMA
// =====================================================

interface PROPMETRIKDB extends DBSchema {
  'offline-actions': {
    key: string
    value: OfflineAction
    indexes: {
      'by-timestamp': number
      'by-type': string
      'by-status': SyncStatus
    }
  }
  'cached-projects': {
    key: string
    value: CachedProject
    indexes: {
      'by-updated': number
    }
  }
  'cached-expenses': {
    key: string
    value: CachedExpense
    indexes: {
      'by-project': string
      'by-sync-status': SyncStatus
    }
  }
  'cached-daily-logs': {
    key: string
    value: CachedDailyLog
    indexes: {
      'by-project': string
      'by-date': string
      'by-sync-status': SyncStatus
    }
  }
  'cached-photos': {
    key: string
    value: CachedPhoto
    indexes: {
      'by-entity': string
      'by-sync-status': SyncStatus
    }
  }
  'sync-metadata': {
    key: string
    value: SyncMetadata
  }
}

// =====================================================
// TYPES
// =====================================================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'

export interface OfflineAction {
  id: string
  type: 'expense' | 'daily-log' | 'progress-update' | 'photo' | 'document'
  entityId?: string
  projectId: string
  data: unknown
  timestamp: number
  status: SyncStatus
  retryCount: number
  lastError?: string
}

export interface CachedProject {
  id: string
  data: unknown
  updatedAt: number
  expiresAt: number
}

export interface CachedExpense {
  id: string
  projectId: string
  offlineId: string
  data: {
    description: string
    amount: number
    currency: string
    expenseType: string
    expenseDate: string
    receiptDataUrl?: string
    location?: { latitude: number; longitude: number }
    vendorName?: string
    notes?: string
  }
  createdAt: number
  syncStatus: SyncStatus
  lastSyncAttempt?: number
  syncError?: string
}

export interface CachedDailyLog {
  id: string
  projectId: string
  offlineId: string
  data: {
    logDate: string
    weather: string
    temperature?: number
    workersOnSite: number
    workDescription: string
    materialsUsed?: string
    issues?: string
    safetyObservations?: string
    photos?: string[]
    voiceNoteUrl?: string
    location?: { latitude: number; longitude: number }
  }
  createdAt: number
  syncStatus: SyncStatus
  lastSyncAttempt?: number
  syncError?: string
}

export interface CachedPhoto {
  id: string
  entityType: 'expense' | 'daily-log' | 'progress'
  entityId: string
  dataUrl: string
  mimeType: string
  filename: string
  size: number
  createdAt: number
  syncStatus: SyncStatus
  uploadedUrl?: string
}

export interface SyncMetadata {
  key: string
  value: unknown
  updatedAt: number
}

// =====================================================
// DATABASE SINGLETON
// =====================================================

const DB_NAME = 'propmetrik-offline'
const DB_VERSION = 1

let dbInstance: IDBPDatabase<PROPMETRIKDB> | null = null

async function getDB(): Promise<IDBPDatabase<PROPMETRIKDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<PROPMETRIKDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Offline actions store
      if (!db.objectStoreNames.contains('offline-actions')) {
        const store = db.createObjectStore('offline-actions', { keyPath: 'id' })
        store.createIndex('by-timestamp', 'timestamp')
        store.createIndex('by-type', 'type')
        store.createIndex('by-status', 'status')
      }

      // Cached projects store
      if (!db.objectStoreNames.contains('cached-projects')) {
        const store = db.createObjectStore('cached-projects', { keyPath: 'id' })
        store.createIndex('by-updated', 'updatedAt')
      }

      // Cached expenses store
      if (!db.objectStoreNames.contains('cached-expenses')) {
        const store = db.createObjectStore('cached-expenses', { keyPath: 'id' })
        store.createIndex('by-project', 'projectId')
        store.createIndex('by-sync-status', 'syncStatus')
      }

      // Cached daily logs store
      if (!db.objectStoreNames.contains('cached-daily-logs')) {
        const store = db.createObjectStore('cached-daily-logs', { keyPath: 'id' })
        store.createIndex('by-project', 'projectId')
        store.createIndex('by-date', 'data.logDate')
        store.createIndex('by-sync-status', 'syncStatus')
      }

      // Cached photos store
      if (!db.objectStoreNames.contains('cached-photos')) {
        const store = db.createObjectStore('cached-photos', { keyPath: 'id' })
        store.createIndex('by-entity', 'entityId')
        store.createIndex('by-sync-status', 'syncStatus')
      }

      // Sync metadata store
      if (!db.objectStoreNames.contains('sync-metadata')) {
        db.createObjectStore('sync-metadata', { keyPath: 'key' })
      }
    },
  })

  return dbInstance
}

// =====================================================
// OFFLINE ACTIONS
// =====================================================

export async function queueOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp' | 'status' | 'retryCount'>): Promise<string> {
  const db = await getDB()
  const id = `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const fullAction: OfflineAction = {
    ...action,
    id,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
  }
  
  await db.put('offline-actions', fullAction)
  
  // Register for background sync if available
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      if ('sync' in registration) {
        await (registration as any).sync.register('sync-offline-actions')
      }
    } catch (err) {
      console.warn('Background sync registration failed:', err)
    }
  }
  
  return id
}

export async function getPendingActions(): Promise<OfflineAction[]> {
  const db = await getDB()
  return db.getAllFromIndex('offline-actions', 'by-status', 'pending')
}

export async function updateActionStatus(id: string, status: SyncStatus, error?: string): Promise<void> {
  const db = await getDB()
  const action = await db.get('offline-actions', id)
  if (action) {
    action.status = status
    if (error) {
      action.lastError = error
      action.retryCount += 1
    }
    await db.put('offline-actions', action)
  }
}

export async function removeAction(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('offline-actions', id)
}

// =====================================================
// EXPENSE CACHING
// =====================================================

export async function saveExpenseOffline(expense: Omit<CachedExpense, 'id' | 'createdAt' | 'syncStatus'>): Promise<string> {
  const db = await getDB()
  const id = `expense-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const cachedExpense: CachedExpense = {
    ...expense,
    id,
    createdAt: Date.now(),
    syncStatus: 'pending',
  }
  
  await db.put('cached-expenses', cachedExpense)
  
  // Queue for sync
  await queueOfflineAction({
    type: 'expense',
    entityId: id,
    projectId: expense.projectId,
    data: expense.data,
  })
  
  return id
}

export async function getOfflineExpenses(projectId?: string): Promise<CachedExpense[]> {
  const db = await getDB()
  if (projectId) {
    return db.getAllFromIndex('cached-expenses', 'by-project', projectId)
  }
  return db.getAll('cached-expenses')
}

export async function getPendingExpenses(): Promise<CachedExpense[]> {
  const db = await getDB()
  return db.getAllFromIndex('cached-expenses', 'by-sync-status', 'pending')
}

export async function markExpenseSynced(id: string): Promise<void> {
  const db = await getDB()
  const expense = await db.get('cached-expenses', id)
  if (expense) {
    expense.syncStatus = 'synced'
    expense.lastSyncAttempt = Date.now()
    await db.put('cached-expenses', expense)
  }
}

// =====================================================
// DAILY LOG CACHING
// =====================================================

export async function saveDailyLogOffline(log: Omit<CachedDailyLog, 'id' | 'createdAt' | 'syncStatus'>): Promise<string> {
  const db = await getDB()
  const id = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const cachedLog: CachedDailyLog = {
    ...log,
    id,
    createdAt: Date.now(),
    syncStatus: 'pending',
  }
  
  await db.put('cached-daily-logs', cachedLog)
  
  // Queue for sync
  await queueOfflineAction({
    type: 'daily-log',
    entityId: id,
    projectId: log.projectId,
    data: log.data,
  })
  
  return id
}

export async function getOfflineDailyLogs(projectId: string): Promise<CachedDailyLog[]> {
  const db = await getDB()
  return db.getAllFromIndex('cached-daily-logs', 'by-project', projectId)
}

export async function getPendingDailyLogs(): Promise<CachedDailyLog[]> {
  const db = await getDB()
  return db.getAllFromIndex('cached-daily-logs', 'by-sync-status', 'pending')
}

export async function markDailyLogSynced(id: string): Promise<void> {
  const db = await getDB()
  const log = await db.get('cached-daily-logs', id)
  if (log) {
    log.syncStatus = 'synced'
    log.lastSyncAttempt = Date.now()
    await db.put('cached-daily-logs', log)
  }
}

// =====================================================
// PHOTO CACHING
// =====================================================

export async function cachePhoto(photo: Omit<CachedPhoto, 'id' | 'createdAt' | 'syncStatus'>): Promise<string> {
  const db = await getDB()
  const id = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const cachedPhoto: CachedPhoto = {
    ...photo,
    id,
    createdAt: Date.now(),
    syncStatus: 'pending',
  }
  
  await db.put('cached-photos', cachedPhoto)
  return id
}

export async function getPhotosForEntity(entityId: string): Promise<CachedPhoto[]> {
  const db = await getDB()
  return db.getAllFromIndex('cached-photos', 'by-entity', entityId)
}

export async function markPhotoUploaded(id: string, uploadedUrl: string): Promise<void> {
  const db = await getDB()
  const photo = await db.get('cached-photos', id)
  if (photo) {
    photo.syncStatus = 'synced'
    photo.uploadedUrl = uploadedUrl
    await db.put('cached-photos', photo)
  }
}

// =====================================================
// PROJECT CACHING
// =====================================================

export async function cacheProject(projectId: string, data: unknown, ttlMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  const db = await getDB()
  await db.put('cached-projects', {
    id: projectId,
    data,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  })
}

export async function getCachedProject(projectId: string): Promise<unknown | null> {
  const db = await getDB()
  const cached = await db.get('cached-projects', projectId)
  
  if (!cached) return null
  if (cached.expiresAt < Date.now()) {
    // Expired, but return stale data
    console.warn('Returning stale cached project:', projectId)
  }
  
  return cached.data
}

export async function getCachedProjects(): Promise<CachedProject[]> {
  const db = await getDB()
  return db.getAll('cached-projects')
}

// =====================================================
// SYNC METADATA
// =====================================================

export async function setSyncMetadata(key: string, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put('sync-metadata', {
    key,
    value,
    updatedAt: Date.now(),
  })
}

export async function getSyncMetadata<T = unknown>(key: string): Promise<T | null> {
  const db = await getDB()
  const metadata = await db.get('sync-metadata', key)
  return metadata?.value as T | null
}

// =====================================================
// BACKGROUND SYNC
// =====================================================

export async function performSync(): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0

  // Sync expenses
  const pendingExpenses = await getPendingExpenses()
  for (const expense of pendingExpenses) {
    try {
      const response = await fetch('/api/budget/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...expense.data,
          projectId: expense.projectId,
          offlineId: expense.offlineId,
        }),
      })
      
      if (response.ok) {
        await markExpenseSynced(expense.id)
        synced++
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to sync expense:', expense.id, error)
      failed++
    }
  }

  // Sync daily logs
  const pendingLogs = await getPendingDailyLogs()
  for (const log of pendingLogs) {
    try {
      const response = await fetch('/api/projects/daily-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...log.data,
          projectId: log.projectId,
          offlineId: log.offlineId,
        }),
      })
      
      if (response.ok) {
        await markDailyLogSynced(log.id)
        synced++
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to sync daily log:', log.id, error)
      failed++
    }
  }

  return { synced, failed }
}

// =====================================================
// ONLINE/OFFLINE STATUS
// =====================================================

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

// =====================================================
// SERVICE WORKER MESSAGES
// =====================================================

export function listenToServiceWorker(handler: (message: MessageEvent) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  navigator.serviceWorker.addEventListener('message', handler)
  
  return () => {
    navigator.serviceWorker.removeEventListener('message', handler)
  }
}

export async function sendToServiceWorker(message: { type: string; payload?: unknown }): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const registration = await navigator.serviceWorker.ready
  registration.active?.postMessage(message)
}

// =====================================================
// STORAGE USAGE
// =====================================================

export async function getStorageUsage(): Promise<{ used: number; available: number; percent: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { used: 0, available: 0, percent: 0 }
  }

  const estimate = await navigator.storage.estimate()
  const used = estimate.usage || 0
  const available = estimate.quota || 0
  const percent = available > 0 ? Math.round((used / available) * 100) : 0

  return { used, available, percent }
}

export async function clearAllOfflineData(): Promise<void> {
  const db = await getDB()
  await db.clear('offline-actions')
  await db.clear('cached-expenses')
  await db.clear('cached-daily-logs')
  await db.clear('cached-photos')
  await db.clear('cached-projects')
  await db.clear('sync-metadata')
}
