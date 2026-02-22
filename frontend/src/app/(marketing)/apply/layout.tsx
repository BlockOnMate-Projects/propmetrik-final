import TopNav from '@/components/marketing/TopNav';

export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white">
      <TopNav />
      {children}
    </div>
  );
}
