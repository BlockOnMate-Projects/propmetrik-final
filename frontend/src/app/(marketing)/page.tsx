import HeroSection from '@/components/marketing/HeroSection';
import FeatureGrid from '@/components/marketing/FeatureGrid';
import StatsSection from '@/components/marketing/StatsSection';
import ServicesFooter from '@/components/marketing/ServicesFooter';

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      <HeroSection />
      <StatsSection />
      <FeatureGrid />
      <ServicesFooter />
    </main>
  );
}
