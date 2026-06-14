import TopNav from '@/components/marketing/TopNav';

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout overrides parent to exclude ServicesFooter and Footer.
  // The public marketplace storefront always renders LIGHT, regardless of the
  // global light/dark/system toggle — the `light` class forces light tokens.
  return (
    <div className="light [color-scheme:light] flex flex-col min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="flex-1">
        {children}
      </main>
      {/* No ServicesFooter or Footer here */}
    </div>
  );
}
