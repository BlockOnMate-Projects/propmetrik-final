'use client';

import { Suspense } from 'react';
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
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Marketplace + property-detail render their OWN (forced-light) TopNav in their
          child layout, so skip the parent nav there to avoid a duplicate stacked nav. */}
      {!isMarketplace && !isPropertyDetail && <TopNav />}
      {/* Suspense boundary so child pages using useSearchParams() prerender in Next 15. */}
      <Suspense fallback={null}>
        {children}
      </Suspense>
      {/* Footer hidden on marketplace / property-detail pages.
          The services showcase lives on the home page only — not globally. */}
      {!isMarketplace && !isPropertyDetail && <Footer />}
    </div>
  );
}
