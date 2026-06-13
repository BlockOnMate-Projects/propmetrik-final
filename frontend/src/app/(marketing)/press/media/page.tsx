import Link from 'next/link';

export default function InTheMediaPage() {
  return (
    <main className="pt-32 pb-24 bg-background">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">External Coverage</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-5">In the Media</h1>
            <p className="text-muted-foreground text-lg">
              PROPMETRIK in the news — external coverage, interviews, and media mentions from national and international outlets.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6">
          <div className="bg-card border border-border rounded-lg p-10 text-center">
            <div className="text-4xl mb-4">📺</div>
            <h3 className="text-foreground font-bold text-lg mb-2">Media coverage coming soon</h3>
            <p className="text-muted-foreground mb-6">
              As PROPMETRIK publishes research and indices, media mentions will be aggregated here.
            </p>
            <Link
              href="/press"
              className="inline-block px-6 py-3 bg-primary text-zinc-950 font-bold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Back to Press Room
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
