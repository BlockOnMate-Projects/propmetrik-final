'use client'

import { useState, useEffect } from 'react'
import { usePushNotifications } from '@/hooks/useServiceWorker'
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Settings,
  ChevronRight,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface NotificationPreferences {
  projectUpdates: boolean
  budgetAlerts: boolean
  milestoneReminders: boolean
  teamMessages: boolean
  dailyDigest: boolean
}

// =====================================================
// PUSH NOTIFICATION MANAGER
// =====================================================

export function PushNotificationManager() {
  const {
    isSupported,
    permission,
    subscription,
    requestPermission,
    subscribe,
    unsubscribe,
  } = usePushNotifications()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    projectUpdates: true,
    budgetAlerts: true,
    milestoneReminders: true,
    teamMessages: true,
    dailyDigest: false,
  })

  // VAPID public key - should come from environment
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

  // Load preferences from server
  useEffect(() => {
    if (subscription) {
      fetchPreferences()
    }
  }, [subscription])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/notifications/preferences')
      if (response.ok) {
        const data = await response.json()
        setPreferences(data.preferences || preferences)
      }
    } catch (err) {
      console.error('Failed to fetch notification preferences:', err)
    }
  }

  const savePreferences = async (newPrefs: NotificationPreferences) => {
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: newPrefs }),
      })
      setPreferences(newPrefs)
    } catch (err) {
      console.error('Failed to save preferences:', err)
    }
  }

  const handleEnableNotifications = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Request permission first
      const result = await requestPermission()
      
      if (result !== 'granted') {
        setError('Permission denied. Please enable notifications in your browser settings.')
        return
      }

      // Subscribe to push notifications
      const sub = await subscribe(vapidPublicKey)
      
      if (!sub) {
        setError('Failed to subscribe to notifications. Please try again.')
      }
    } catch (err) {
      console.error('Failed to enable notifications:', err)
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisableNotifications = async () => {
    setIsLoading(true)
    setError(null)

    try {
      await unsubscribe()
    } catch (err) {
      console.error('Failed to disable notifications:', err)
      setError('Failed to disable notifications. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const togglePreference = (key: keyof NotificationPreferences) => {
    const newPrefs = { ...preferences, [key]: !preferences[key] }
    savePreferences(newPrefs)
  }

  // Not supported
  if (!isSupported) {
    return (
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex items-center text-gray-500">
          <BellOff className="h-5 w-5 mr-2" />
          <span className="text-sm">Push notifications are not supported in this browser</span>
        </div>
      </div>
    )
  }

  // Permission denied
  if (permission === 'denied') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 mr-3" />
          <div>
            <h4 className="font-medium text-red-800">Notifications Blocked</h4>
            <p className="text-sm text-red-600 mt-1">
              You&apos;ve blocked notifications. To enable them, update your browser settings for this site.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Not subscribed
  if (!subscription) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start">
            <div className="p-2 bg-amber-100 rounded-lg mr-3">
              <Bell className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Enable Notifications</h4>
              <p className="text-sm text-gray-500 mt-1">
                Get notified about project updates, budget alerts, and team messages.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          onClick={handleEnableNotifications}
          disabled={isLoading}
          className="mt-4 w-full py-2.5 bg-amber-500 text-white font-medium rounded-lg flex items-center justify-center disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <BellRing className="h-5 w-5 mr-2" />
              Enable Push Notifications
            </>
          )}
        </button>
      </div>
    )
  }

  // Subscribed - show settings
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg mr-3">
              <BellRing className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Notifications Enabled</h4>
              <p className="text-sm text-gray-500">Receiving push notifications</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Settings className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Preferences */}
      {showSettings && (
        <div className="divide-y divide-gray-100">
          <PreferenceToggle
            label="Project Updates"
            description="Progress, milestones, and status changes"
            enabled={preferences.projectUpdates}
            onChange={() => togglePreference('projectUpdates')}
          />
          <PreferenceToggle
            label="Budget Alerts"
            description="Over-budget warnings and payment reminders"
            enabled={preferences.budgetAlerts}
            onChange={() => togglePreference('budgetAlerts')}
          />
          <PreferenceToggle
            label="Milestone Reminders"
            description="Upcoming deadlines and completion alerts"
            enabled={preferences.milestoneReminders}
            onChange={() => togglePreference('milestoneReminders')}
          />
          <PreferenceToggle
            label="Team Messages"
            description="Messages from team members"
            enabled={preferences.teamMessages}
            onChange={() => togglePreference('teamMessages')}
          />
          <PreferenceToggle
            label="Daily Digest"
            description="Summary of daily activities"
            enabled={preferences.dailyDigest}
            onChange={() => togglePreference('dailyDigest')}
          />
        </div>
      )}

      {/* Disable button */}
      <div className="p-4 bg-gray-50">
        <button
          onClick={handleDisableNotifications}
          disabled={isLoading}
          className="w-full py-2 text-red-600 text-sm font-medium hover:bg-red-50 rounded-lg transition-colors"
        >
          {isLoading ? 'Disabling...' : 'Disable Notifications'}
        </button>
      </div>
    </div>
  )
}

// =====================================================
// PREFERENCE TOGGLE
// =====================================================

interface PreferenceToggleProps {
  label: string
  description: string
  enabled: boolean
  onChange: () => void
}

function PreferenceToggle({ label, description, enabled, onChange }: PreferenceToggleProps) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-amber-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}

// =====================================================
// NOTIFICATION PROMPT BANNER
// =====================================================

export function NotificationPromptBanner() {
  const { isSupported, permission, subscription } = usePushNotifications()
  const [dismissed, setDismissed] = useState(false)

  // Don't show if not supported, already subscribed, denied, or dismissed
  if (!isSupported || subscription || permission === 'denied' || dismissed) {
    return null
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 bg-white rounded-lg shadow-lg border border-gray-200 p-4 md:left-auto md:right-4 md:max-w-sm">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded"
      >
        <X className="h-4 w-4 text-gray-400" />
      </button>
      
      <div className="flex items-start">
        <div className="p-2 bg-amber-100 rounded-lg mr-3 flex-shrink-0">
          <Bell className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900">Stay Updated</h4>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            Enable notifications to get alerts about project updates and team messages.
          </p>
        </div>
      </div>
      
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setDismissed(true)}
          className="flex-1 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
        >
          Not now
        </button>
        <a
          href="/settings/notifications"
          className="flex-1 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg text-center"
        >
          Enable
        </a>
      </div>
    </div>
  )
}

export default PushNotificationManager
