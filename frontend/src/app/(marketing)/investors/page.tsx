'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, Mail, FileText, Table2 } from 'lucide-react';

/* ============================================================================
 *  EDIT HERE — everything investor-facing lives in this one config block.
 *  Paste your Google Drive links and raise details below. Leave any value as
 *  an empty string ('') and that piece simply won't render (nothing fake shows).
 * ========================================================================== */
const INVESTOR = {
    // Headline. Set this once you're ready to state the raise publicly, e.g.
    // 'We are raising a $1.5M pre-seed round.' Leave '' to show the neutral thesis below.
    raiseHeadline: '',
    summary:
        'PROPMETRIK is building the data and trust infrastructure for real estate in Ghana and West Africa — standardising how property is valued, recorded, and transacted.',

    // Google Drive links come from the frontend env (.env.local / .env.production):
    //   NEXT_PUBLIC_INVESTOR_PITCH_DECK_URL  /  NEXT_PUBLIC_INVESTOR_FINANCIAL_MODEL_URL
    // Paste your "anyone with the link" share URLs there. Blank → "Available on request".
    pitchDeckUrl: process.env.NEXT_PUBLIC_INVESTOR_PITCH_DECK_URL || '',
    financialModelUrl: process.env.NEXT_PUBLIC_INVESTOR_FINANCIAL_MODEL_URL || '',

    // The raise — fill any/all. Empty values are hidden.
    raise: {
        target: '', // e.g. '$1.5M'
        runway: '', // e.g. '18 months'
        stage: '', // e.g. 'Pre-seed'
    },
};

const CONTACT_EMAIL = 'investors@propmetrik.com';
/* ========================================================================== */

const fade = {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5 },
};

function Eyebrow({ children }: { children: React.ReactNode }) {
    return <div className="text-xs font-semibold tracking-[0.2em] uppercase text-amber-500 mb-5">{children}</div>;
}

function DocumentCard({
    eyebrow,
    tag,
    title,
    description,
    url,
    icon,
}: {
    eyebrow: string;
    tag: string;
    title: string;
    description: string;
    url: string;
    icon: React.ReactNode;
}) {
    const inner = (
        <motion.div
            {...fade}
            className="h-full bg-zinc-900 border border-zinc-800 border-l-2 border-l-amber-500 rounded-lg p-7 flex flex-col group-hover:border-zinc-600 group-hover:bg-zinc-900/80 transition-colors"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-amber-500">
                    {icon}
                    <span className="text-xs font-bold tracking-[0.15em] uppercase">{eyebrow}</span>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 border border-zinc-700 rounded px-2 py-0.5">
                    {tag}
                </span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-amber-500 transition-colors">{title}</h3>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6 flex-1">{description}</p>
            {url ? (
                <span className="inline-flex items-center gap-2 text-amber-500 font-semibold text-sm group-hover:gap-3 transition-all">
                    Open in Google Drive <ArrowUpRight className="w-4 h-4" />
                </span>
            ) : (
                <span className="inline-flex items-center gap-2 text-zinc-500 font-semibold text-sm group-hover:text-amber-500 transition-colors">
                    Available on request <Mail className="w-4 h-4" />
                </span>
            )}
        </motion.div>
    );

    // The ENTIRE card is the click target: opens the Drive doc, or an email when not yet linked.
    return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block group">
            {inner}
        </a>
    ) : (
        <a href={`mailto:${CONTACT_EMAIL}`} className="block group">
            {inner}
        </a>
    );
}

export default function InvestorsPage() {
    const raiseStats = [
        { label: 'Raise target', value: INVESTOR.raise.target },
        { label: 'Runway', value: INVESTOR.raise.runway },
        { label: 'Stage', value: INVESTOR.raise.stage },
    ].filter((s) => s.value);

    return (
        <main className="bg-zinc-950 text-white">
            {/* Hero */}
            <section className="pt-40 pb-24 border-b border-zinc-900">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade}>
                        <Eyebrow>Investor materials</Eyebrow>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-8 max-w-4xl">
                            {INVESTOR.raiseHeadline || 'The data and trust layer for African real estate.'}
                        </h1>
                        <p className="text-xl text-zinc-400 leading-relaxed max-w-2xl">{INVESTOR.summary}</p>
                    </motion.div>
                </div>
            </section>

            {/* Documents */}
            <section className="py-24 border-b border-zinc-900">
                <div className="container mx-auto px-6 max-w-5xl">
                    <motion.div {...fade}>
                        <Eyebrow>Documents</Eyebrow>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Access our materials directly.</h2>
                        <p className="text-lg text-zinc-400 mb-12 max-w-2xl">
                            {INVESTOR.pitchDeckUrl && INVESTOR.financialModelUrl
                                ? 'Both documents open in Google Drive. No sign-in required.'
                                : INVESTOR.pitchDeckUrl || INVESTOR.financialModelUrl
                                  ? 'Linked documents open in Google Drive — others are shared with qualified investors on request.'
                                  : 'Materials are shared with qualified investors on request.'}
                        </p>
                    </motion.div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <DocumentCard
                            eyebrow="Pitch Deck"
                            tag="PDF"
                            title="Investor Presentation"
                            description="Overview of the problem, solution, market opportunity, business model, team, and fundraising ask."
                            url={INVESTOR.pitchDeckUrl}
                            icon={<FileText className="w-4 h-4" />}
                        />
                        <DocumentCard
                            eyebrow="Financial Model"
                            tag="EXCEL"
                            title="Financial Model"
                            description="Revenue projections, unit economics, headcount plan, and use-of-funds breakdown."
                            url={INVESTOR.financialModelUrl}
                            icon={<Table2 className="w-4 h-4" />}
                        />
                    </div>
                </div>
            </section>

            {/* The raise — only renders if you've filled in at least one value */}
            {raiseStats.length > 0 && (
                <section className="py-24 border-b border-zinc-900">
                    <div className="container mx-auto px-6 max-w-5xl">
                        <motion.div {...fade}>
                            <Eyebrow>The raise</Eyebrow>
                        </motion.div>
                        <div className="grid sm:grid-cols-3 gap-6">
                            {raiseStats.map((s) => (
                                <motion.div
                                    key={s.label}
                                    {...fade}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-8"
                                >
                                    <div className="text-4xl font-bold text-white mb-2">{s.value}</div>
                                    <div className="text-sm text-zinc-400">{s.label}</div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Contact */}
            <section className="py-28">
                <div className="container mx-auto px-6 max-w-5xl text-center">
                    <motion.div {...fade}>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-5">Ready to talk?</h2>
                        <p className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto">
                            Reach out directly to the founders. We respond to every serious inquiry.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <a
                                href={`mailto:${CONTACT_EMAIL}`}
                                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-amber-500 text-zinc-950 font-semibold rounded-md hover:bg-amber-400 transition-colors"
                            >
                                <Mail className="w-4 h-4" /> {CONTACT_EMAIL}
                            </a>
                            <Link
                                href="/contact"
                                className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-zinc-700 text-white font-semibold rounded-md hover:border-amber-500 hover:text-amber-500 transition-colors"
                            >
                                Contact Us
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>
        </main>
    );
}
