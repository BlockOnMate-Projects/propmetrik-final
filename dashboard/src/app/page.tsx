import HeroSection from '@/components/HeroSection';
import FeatureGrid from '@/components/FeatureGrid';
import StatsSection from '@/components/StatsSection';

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      <HeroSection />
      <StatsSection />
      <FeatureGrid />
    </main>
  );
}
