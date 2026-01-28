'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PWAProvider, OfflineIndicator, InstallPrompt } from '@/components/pwa'
import { RealtimeProvider } from '@/lib/realtime-provider'
import { AuthProvider } from '@/lib/auth-context'
import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
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
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <AuthProvider>
              <PWAProvider>
                <RealtimeProvider autoInvalidateQueries={true}>
                  {children}
                </RealtimeProvider>
                <OfflineIndicator />
                <InstallPrompt />
              </PWAProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </SessionProvider>
  )
}
