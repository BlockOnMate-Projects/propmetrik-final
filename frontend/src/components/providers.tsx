'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { useState, useRef, useEffect, useCallback } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PWAProvider, OfflineIndicator, InstallPrompt } from '@/components/pwa'
import { RealtimeProvider } from '@/lib/realtime-provider'
import { AuthProvider } from '@/lib/auth-context'
import { SessionProvider } from 'next-auth/react'

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
  const [basePath] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  )

  return (
    <SessionProvider
      // Don't refetch when user refocuses window — avoids race during HMR
      refetchOnWindowFocus={false}
      // Refetch session every 5 minutes (instead of never)
      refetchInterval={5 * 60}
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
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <AuthProvider>
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
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StableSessionProvider>
  )
}
