'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface ServiceWorkerState {
  isSupported: boolean
  isRegistered: boolean
  isInstalling: boolean
  isWaiting: boolean
  isActive: boolean
  updateAvailable: boolean
  registration: ServiceWorkerRegistration | null
}

export interface UseServiceWorkerReturn extends ServiceWorkerState {
  register: () => Promise<ServiceWorkerRegistration | null>
  unregister: () => Promise<boolean>
  update: () => Promise<void>
  skipWaiting: () => Promise<void>
}

const SW_PATH = '/sw.js'
const SW_SCOPE = '/'

export function useServiceWorker(): UseServiceWorkerReturn {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    isInstalling: false,
    isWaiting: false,
    isActive: false,
    updateAvailable: false,
    registration: null,
  })

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  // Check support on mount
  useEffect(() => {
    const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator
    setState(prev => ({ ...prev, isSupported }))
  }, [])

  // Update state based on registration
  const updateState = useCallback((reg: ServiceWorkerRegistration) => {
    setState(prev => ({
      ...prev,
      isRegistered: true,
      isInstalling: !!reg.installing,
      isWaiting: !!reg.waiting,
      isActive: !!reg.active,
      updateAvailable: !!reg.waiting,
      registration: reg,
    }))
  }, [])

  // Handle state change events
  const handleStateChange = useCallback((reg: ServiceWorkerRegistration) => {
    return () => updateState(reg)
  }, [updateState])

  // Register service worker
  const register = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!state.isSupported) {
      console.warn('Service workers not supported')
      return null
    }

    try {
      const registration = await navigator.serviceWorker.register(SW_PATH, {
        scope: SW_SCOPE,
      })

      registrationRef.current = registration
      updateState(registration)

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (installing) {
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // New update available
              setState(prev => ({ ...prev, updateAvailable: true, isWaiting: true }))
            }
          })
        }
      })

      // Handle service worker state changes
      if (registration.installing) {
        registration.installing.addEventListener('statechange', handleStateChange(registration))
      }
      if (registration.waiting) {
        registration.waiting.addEventListener('statechange', handleStateChange(registration))
      }
      if (registration.active) {
        registration.active.addEventListener('statechange', handleStateChange(registration))
      }

      // Handle controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Optionally reload the page when new SW takes control
        console.log('New service worker activated')
      })

      console.log('Service worker registered successfully:', registration.scope)
      return registration
    } catch (error) {
      console.error('Service worker registration failed:', error)
      return null
    }
  }, [state.isSupported, updateState, handleStateChange])

  // Unregister service worker
  const unregister = useCallback(async (): Promise<boolean> => {
    if (!registrationRef.current) return false

    try {
      const success = await registrationRef.current.unregister()
      if (success) {
        setState({
          isSupported: true,
          isRegistered: false,
          isInstalling: false,
          isWaiting: false,
          isActive: false,
          updateAvailable: false,
          registration: null,
        })
        registrationRef.current = null
      }
      return success
    } catch (error) {
      console.error('Failed to unregister service worker:', error)
      return false
    }
  }, [])

  // Check for updates
  const update = useCallback(async (): Promise<void> => {
    if (!registrationRef.current) return

    try {
      await registrationRef.current.update()
      console.log('Service worker update check complete')
    } catch (error) {
      console.error('Failed to check for service worker updates:', error)
    }
  }, [])

  // Skip waiting (activate new SW immediately)
  const skipWaiting = useCallback(async (): Promise<void> => {
    const waiting = registrationRef.current?.waiting
    if (!waiting) return

    // Send message to SW to skip waiting
    waiting.postMessage({ type: 'SKIP_WAITING' })

    // Wait for controller change then reload
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    }, { once: true })
  }, [])

  // Auto-register on mount in production
  useEffect(() => {
    if (!state.isSupported) return

    // Only auto-register in production
    if (process.env.NODE_ENV === 'production') {
      register()
    }
  }, [state.isSupported, register])

  return {
    ...state,
    register,
    unregister,
    update,
    skipWaiting,
  }
}

// Hook for online/offline status
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// Hook for push notifications
export interface UsePushNotificationsReturn {
  isSupported: boolean
  permission: NotificationPermission | null
  subscription: PushSubscription | null
  requestPermission: () => Promise<NotificationPermission>
  subscribe: (vapidPublicKey: string) => Promise<PushSubscription | null>
  unsubscribe: () => Promise<boolean>
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission | null>(null)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    const supported = typeof window !== 'undefined' 
      && 'Notification' in window 
      && 'serviceWorker' in navigator
      && 'PushManager' in window

    setIsSupported(supported)

    if (supported) {
      setPermission(Notification.permission)
      
      // Get existing subscription
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setSubscription(sub)
        })
      })
    }
  }, [])

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) return 'denied'

    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [isSupported])

  const subscribe = useCallback(async (vapidPublicKey: string): Promise<PushSubscription | null> => {
    if (!isSupported || permission !== 'granted') return null

    try {
      const registration = await navigator.serviceWorker.ready
      
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      })

      setSubscription(sub)

      // Send subscription to server
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })

      return sub
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      return null
    }
  }, [isSupported, permission])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return false

    try {
      await subscription.unsubscribe()
      setSubscription(null)

      // Notify server
      await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })

      return true
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error)
      return false
    }
  }, [subscription])

  return {
    isSupported,
    permission,
    subscription,
    requestPermission,
    subscribe,
    unsubscribe,
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
