import { AdminTopNav } from '@/components/layout/AdminTopNav'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO: Add server-side role check to protect admin routes
  // Redirect non-admin users to dashboard
  
  return (
    <div className="min-h-screen bg-black">
      <AdminTopNav />
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}
