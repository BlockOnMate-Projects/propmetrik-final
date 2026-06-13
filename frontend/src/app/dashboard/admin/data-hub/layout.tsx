
import { DataHubTopNav } from '@/components/layout'

export default function DataHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)] bg-background">
      <DataHubTopNav />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
