import TopNav from '@/components/marketing/TopNav';

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout overrides parent to exclude ServicesFooter and Footer
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white">
      <TopNav />
      <main className="flex-1">
        {children}
      </main>
      {/* No ServicesFooter or Footer here */}
    </div>
  );
}
