import TopNav from '@/components/marketing/TopNav';

export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The public application flow always renders LIGHT, regardless of the global
    // light/dark/system toggle — the `light` class forces light tokens.
    <div className="light [color-scheme:light] flex flex-col min-h-screen bg-background text-foreground">
      <TopNav />
      {children}
    </div>
  );
}
