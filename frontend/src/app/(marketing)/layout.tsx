import TopNav from '@/components/marketing/TopNav';
import ServicesFooter from '@/components/marketing/ServicesFooter';
import Footer from '@/components/marketing/Footer';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      <TopNav />
      {children}
      <ServicesFooter />
      <Footer />
    </div>
  );
}
