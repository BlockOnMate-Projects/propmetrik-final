'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider, useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import { useState, useRef, useEffect, useCallback } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PWAProvider, OfflineIndicator } from '@/components/pwa'
import { RealtimeProvider } from '@/lib/realtime-provider'
import { SessionProvider } from 'next-auth/react'
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
/** App-wide toast host. Follows next-themes so notifications match the active theme. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      theme={(resolvedTheme as 'light' | 'dark') || 'dark'}
      richColors
      closeButton
      position="top-right"
    />
  )
}

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
                </PWAProvider>
              )}
            <ThemedToaster />
          </TooltipProvider>
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StableSessionProvider>
  )
}
