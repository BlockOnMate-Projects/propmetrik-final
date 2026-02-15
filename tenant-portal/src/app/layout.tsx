import type { Metadata } from 'next'
import { Inter, Dancing_Script } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { ToastProvider } from '@/contexts/ToastContext'
import { Web3Provider } from '@/components/Web3Provider'

const inter = Inter({ subsets: ['latin'] })
const dancingScript = Dancing_Script({
  subsets: ['latin'],
  variable: '--font-dancing-script'
})

export const metadata: Metadata = {
  title: 'PROPMETRIK Tenant Portal',
  description: 'Manage your tenancy with PROPMETRIK',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className={cn(inter.className, dancingScript.variable, "h-full bg-gray-50 dark:bg-zinc-950")}>
        <ToastProvider>
          <Web3Provider>
            <main className="min-h-screen flex flex-col">
              {children}
            </main>
          </Web3Provider>
        </ToastProvider>
      </body>
    </html>
  )
}
