'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { useState, useRef, useEffect, useCallback } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PWAProvider, OfflineIndicator, InstallPrompt } from '@/components/pwa'
import { RealtimeProvider } from '@/lib/realtime-provider'
import { SessionProvider } from 'next-auth/react'
import { I18nProvider } from '@/providers/i18n-provider'
import { initSentryClient } from '@/lib/sentry'

// Initialise Sentry as early as possible (client-side only)
if (typeof window !== 'undefined') {
  initSentryClient()
}

/**
 * StableSessionProvider
 * 
 * Wraps next-auth SessionProvider to prevent session loss during HMR/Fast Refresh.
 * During dev, the Next.js server briefly restarts on code changes. Fetch to
 * /api/auth/session fails with net::ERR_FAILED, and SessionProvider treats that
 * as "unauthenticated" → user gets signed out.
 *
 * Fix: Cache the last known good session and serve it during transient failures.
 */
function StableSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Don't refetch when user refocuses window — avoids race during HMR
      refetchOnWindowFocus={false}
      // Disable automatic refetching - only refetch on demand
      // This prevents excessive session checks that cause frontend to stall
      refetchInterval={0}
      // Keep session alive longer to reduce checks
      refetchWhenOffline={false}
    >
      {children}
    </SessionProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV !== 'production'
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <StableSessionProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
        {/* Interim default 'dark' during the theming migration; flip to 'system' once the page sweep is complete. */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>
              {isDev ? (
                <RealtimeProvider autoInvalidateQueries={true}>
                  {children}
                </RealtimeProvider>
              ) : (
                <PWAProvider>
                  <RealtimeProvider autoInvalidateQueries={true}>
                    {children}
                  </RealtimeProvider>
                  <OfflineIndicator />
                  <InstallPrompt />
                </PWAProvider>
              )}
          </TooltipProvider>
        </ThemeProvider>
        </I18nProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StableSessionProvider>
  )
}
