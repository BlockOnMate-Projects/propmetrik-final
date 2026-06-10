'use client';

import TopNav from '@/components/marketing/TopNav';
import Footer from '@/components/marketing/Footer';
import { usePathname } from 'next/navigation';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isMarketplace = pathname?.startsWith('/marketplace');
  const isPropertyDetail = pathname?.startsWith('/apply');

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      <TopNav />
      {children}
      {/* Footer hidden on marketplace / property-detail pages.
          The services showcase lives on the home page only — not globally. */}
      {!isMarketplace && !isPropertyDetail && <Footer />}
    </div>
  );
}
