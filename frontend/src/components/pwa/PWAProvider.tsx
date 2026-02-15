'use client';

import { useEffect, useState, createContext, useContext, ReactNode } from 'react';

interface PWAContextType {
  isOnline: boolean;
  isInstalled: boolean;
  isInstallable: boolean;
  isUpdating: boolean;
  registration: ServiceWorkerRegistration | null;
  promptInstall: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  subscribeToPush: () => Promise<PushSubscription | null>;
}

const PWAContext = createContext<PWAContextType>({
  isOnline: true,
  isInstalled: false,
  isInstallable: false,
  isUpdating: false,
  registration: null,
  promptInstall: async () => {},
  checkForUpdates: async () => {},
  subscribeToPush: async () => null,
});

export function usePWA() {
  return useContext(PWAContext);
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service worker registered');
          setRegistration(reg);

          // Check for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content available
                  setIsUpdating(true);
                  console.log('[PWA] New content available');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[PWA] Service worker registration failed:', error);
        });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const checkForUpdates = async () => {
    if (registration) {
      try {
        await registration.update();
      } catch (error) {
        console.error('[PWA] Update check failed:', error);
      }
    }
  };

  const subscribeToPush = async (): Promise<PushSubscription | null> => {
    if (!registration) return null;

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('[PWA] Push permission denied');
        return null;
      }

      // Get VAPID public key from server
      const response = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await response.json();

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      // Send subscription to server
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      console.log('[PWA] Push subscription successful');
      return subscription;
    } catch (error) {
      console.error('[PWA] Push subscription failed:', error);
      return null;
    }
  };

  return (
    <PWAContext.Provider
      value={{
        isOnline,
        isInstalled,
        isInstallable,
        isUpdating,
        registration,
        promptInstall,
        checkForUpdates,
        subscribeToPush,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Offline indicator component
export function OfflineIndicator() {
  const { isOnline, isUpdating } = usePWA();

  if (isOnline && !isUpdating) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {!isOnline && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-black font-mono text-xs rounded">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          You're offline
        </div>
      )}
      {isUpdating && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white font-mono text-xs rounded">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Updating...
        </div>
      )}
    </div>
  );
}

// Install prompt component
export function InstallPrompt() {
  const { isInstallable, promptInstall, isInstalled } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  if (!isInstallable || isInstalled || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-mono text-sm text-white">Install PROPMETRIK</h3>
            <p className="font-mono text-xs text-zinc-400 mt-1">
              Install for quick access and offline support
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={promptInstall}
                className="px-3 py-1.5 bg-amber-500 text-black font-mono text-xs rounded hover:bg-amber-400 transition-colors"
              >
                Install
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 bg-zinc-700 text-zinc-300 font-mono text-xs rounded hover:bg-zinc-600 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
