import { PMTopNav } from '@/components/layout/PMTopNav'

export default function PropertyManagementLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-col min-h-[calc(100vh-8rem)]">
            <PMTopNav />
            <main className="flex-1 overflow-y-auto p-6 bg-black">
                {children}
            </main>
        </div>
    )
}

