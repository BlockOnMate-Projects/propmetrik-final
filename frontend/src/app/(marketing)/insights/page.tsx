import Link from 'next/link';

const sections = [
  {
    title: 'Ghana Real Estate Outlook',
    description: 'Our flagship research product — monthly, quarterly, and annual deep-dive analysis of Ghana\'s property markets with proprietary indices and forecasts.',
    href: '/insights/outlook',
    icon: '📊',
    badge: 'Flagship',
  },
  {
    title: 'Ghana Property Snapshot',
    description: 'Weekly 400-word briefings — rotating focus on construction, residential, investment, and economy with Chart of the Week.',
    href: '/insights/snapshot',
    icon: '⚡',
    badge: 'Weekly',
  },
  {
    title: 'Indices & Data',
    description: 'Proprietary indices — GHPI, GHAI, CCI, GCPI — with historical time-series and methodology.',
    href: '/insights/indices',
    icon: '📈',
  },
  {
    title: 'Policy Papers',
    description: 'Government and regulatory-focused analysis for policymakers, multilaterals, and embassies.',
    href: '/insights/policy-papers',
    icon: '🏛️',
  },
  {
    title: 'Podcasts & Video',
    description: 'PROPMETRIK Perspectives podcast, webinar recordings, and video market commentary.',
    href: '/insights/podcasts-video',
    icon: '🎙️',
  },
];

export default function InsightsPage() {
  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <section className="pb-14">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">
              INSIGHTS &amp; RESEARCH
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
              Insights
            </h1>
            <p className="text-xl text-zinc-400 leading-relaxed">
              Institutional-grade real estate intelligence — the indices, forecasts,
              and data-driven research that economists, banks, fund managers, and
              government bodies rely on.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sections.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="h-full bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors group relative">
                  {'badge' in item && item.badge && (
                    <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {(item as any).badge}
                    </span>
                  )}
                  <div className="text-2xl mb-3">{item.icon}</div>
                  <h2 className="text-xl font-bold text-white mb-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h2>
                  <p className="text-zinc-400 text-sm leading-relaxed">{item.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
