import { PMTopNav } from '@/components/layout/PMTopNav'

export default function PropertyManagementLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="dark flex flex-col min-h-[calc(100vh-8rem)] bg-black text-white">
            <PMTopNav />
            <main className="flex-1 overflow-y-auto p-6 bg-black">
                {children}
            </main>
        </div>
    )
}

