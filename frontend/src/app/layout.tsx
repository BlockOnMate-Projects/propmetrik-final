import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

// PERF: do NOT force every route dynamic from the root. The blanket flag made all
// ~46 public marketing/legal pages pay full server + remote-DB latency on every
// hit. Authenticated pages opt into dynamic rendering automatically via their use
// of dynamic APIs (cookies/headers/auth/searchParams) and dynamic route segments;
// static/marketing pages can now be prerendered. Scope force-dynamic to the
// specific server segments that truly need per-request rendering.

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PROPMETRIK - Real Estate Analytics & Valuations',
  description: 'AI-powered Real Estate Valuation, Property Management, Analytics and Deal Management Platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PROPMETRIK',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
