'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { MapPin, FileText, ClipboardCheck, HardHat, Key } from 'lucide-react';

import LifecycleStageCard, { type StageData } from './LifecycleStageCard';
import LifecycleProgressNav, { type LifecycleStageTab } from './LifecycleProgressNav';
import LifecycleLeftColumn from './LifecycleLeftColumn';

// ─── Stage Data ──────────────────────────────────────────────────────────────

const STAGES: StageData[] = [
    {
        id: 'acquisition',
        label: 'Acquisition',
        image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80&fit=crop',
        imageAlt: 'Aerial view of undeveloped land in Ghana at sunrise',
        headline: 'See the Opportunity Before Anyone Else',
        copy: 'PROPMETRIK\'s deal engine aggregates land listings, transaction comps, and soil/flood data to help you evaluate any plot in Ghana within minutes — not months.',
        anchorMetric: {
            value: 'GHS 4.2M',
            descriptor: 'plot asking price — evaluated in 4 minutes',
        },
        ctaLabel: 'Explore Deal Management',
        ctaHref: '/services/deal-management',
        dataTiles: [
            {
                value: '74 / 100',
                label: 'PROPMETRIK Deal Score',
                sub: 'East Legon Hills — Strong Buy',
                color: 'amber',
                position: 'top-right',
                badge: 'AI Score',
            },
            {
                value: '13.2%',
                label: 'Estimated ROC',
                sub: 'Based on verified comps',
                color: 'emerald',
                position: 'bottom-left',
            },
            {
                value: '3 of 7',
                label: 'Due Diligence items cleared',
                sub: 'Phase: Initial Survey ✓',
                color: 'blue',
                position: 'bottom-right',
            },
            {
                value: '31%',
                label: 'Est. Return on Equity',
                sub: '5yr IRR: 19.4%',
                color: 'white',
                position: 'mid-left',
            },
        ],
    },
    {
        id: 'early-planning',
        label: 'Early Planning',
        image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1600&q=80&fit=crop',
        imageAlt: 'Architect reviewing blueprints at a light table',
        headline: 'Plan Every Cedi Before You Break Ground',
        copy: 'AI-powered budget modelling built from Ghana\'s verified construction cost index — not generic industry averages from overseas. Know your numbers before the first shovel.',
        anchorMetric: {
            value: 'GHS 420K',
            descriptor: 'predicted A&E savings — identified in Early Planning',
        },
        ctaLabel: 'Explore Project Management',
        ctaHref: '/services/project-management',
        dataTiles: [
            {
                value: 'GHS 38.6M',
                label: 'Budget Baseline — 12-Storey Commercial',
                sub: 'East Legon, Accra',
                color: 'blue',
                position: 'top-right',
                badge: 'Budget Plan',
            },
            {
                value: 'GHS 310K',
                label: 'AI Savings — Structural Engineering',
                color: 'emerald',
                position: 'bottom-left',
                badge: 'AI Insight',
            },
            {
                value: 'GHS 420K',
                label: 'AI Savings — A&E Consultants',
                color: 'emerald',
                position: 'bottom-right',
                badge: 'AI Insight',
            },
            {
                value: '✓ Concept',
                label: 'Milestone: Concept Approval',
                color: 'amber',
                position: 'mid-left',
            },
        ],
    },
    {
        id: 'pre-development',
        label: 'Pre-Development',
        image: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=1600&q=80&fit=crop',
        imageAlt: 'Development team reviewing documents in a boardroom',
        headline: 'Win the War Before the First Pour',
        copy: 'Bid management, permit tracking, and contract readiness — all connected so nothing falls through the cracks between your desk and the site. Every document. Every approval. In one place.',
        anchorMetric: {
            value: '6 bids',
            descriptor: 'received for structural works — 2 shortlisted by AI',
        },
        ctaLabel: 'Explore Data Intelligence',
        ctaHref: '/services/data',
        dataTiles: [
            {
                value: 'GHS 1.8M',
                label: 'Bid Variance above baseline',
                sub: 'Review flagged — 2 anomalies',
                color: 'red',
                position: 'top-right',
                badge: 'Variance Alert',
            },
            {
                value: '2 of 4',
                label: 'Permits Approved',
                sub: 'EPA & Town Planning: Pending',
                color: 'amber',
                position: 'bottom-left',
            },
            {
                value: 'GHS 3.1M+',
                label: 'Net Available Funds',
                color: 'emerald',
                position: 'bottom-right',
                badge: 'Funds',
            },
            {
                value: 'Q3 2025',
                label: 'Pre-Construction Target',
                sub: 'Schedule buffer: 14 days',
                color: 'blue',
                position: 'mid-left',
            },
        ],
    },
    {
        id: 'construction',
        label: 'Construction',
        image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80&fit=crop',
        imageAlt: 'Active construction site with tower crane and workers',
        headline: 'Real-Time Visibility, From Your Phone to the Top Floor',
        copy: 'Field teams log daily updates. Budgets update automatically. You know before the problem becomes a crisis — whether you\'re on-site in Kumasi or in a boardroom in Accra.',
        anchorMetric: {
            value: 'GHS 22.4M',
            descriptor: 'sample spend vs budget — GHS 1.7M under budget',
        },
        ctaLabel: 'Explore Project Management',
        ctaHref: '/services/project-management',
        dataTiles: [
            {
                value: 'On Track ✓',
                label: 'Budget Health — GHS 22.4M / 24.1M',
                sub: 'Variance: -7.0% favourable',
                color: 'emerald',
                position: 'top-right',
                badge: 'Sample',
            },
            {
                value: 'Floor 6/12',
                label: 'Structural — Concrete Complete',
                sub: 'Finishing week: Week 32',
                color: 'amber',
                position: 'bottom-left',
            },
            {
                value: 'GHS 8.2M',
                label: 'Drawdown 3 of 5 Released',
                sub: 'Next: Milestone sign-off pending',
                color: 'blue',
                position: 'bottom-right',
                badge: 'Tranche',
            },
            {
                value: '+3 days',
                label: 'Delay absorbed',
                sub: 'Buffer remaining: 11 days',
                color: 'white',
                position: 'mid-left',
            },
        ],
    },
    {
        id: 'stabilization',
        label: 'Stabilization',
        image: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=80&fit=crop',
        imageAlt: 'Completed luxury apartment building at dusk with glass facade',
        headline: 'Deliver the Return. Every Time.',
        copy: 'From the first site visit to the final key handover, PROPMETRIK closes the loop — and then opens the next one, automatically feeding your asset into property management and portfolio analytics.',
        anchorMetric: {
            value: '14.1%',
            descriptor: 'final Return on Cost — 0.9% above projection',
        },
        ctaLabel: 'Explore Property Management',
        ctaHref: '/services/property-management',
        dataTiles: [
            {
                value: '33.4%',
                label: 'Final Return on Equity',
                sub: 'Target was 31% — exceeded ✓',
                color: 'emerald',
                position: 'top-right',
                badge: 'Final ROE',
            },
            {
                value: 'GHS 9.2M',
                label: 'Project NPV above projection',
                color: 'amber',
                position: 'bottom-left',
                badge: 'NPV Surplus',
            },
            {
                value: '91%',
                label: 'Occupied — Month 2 post-handover',
                sub: 'Transferred to Property Mgmt ✓',
                color: 'blue',
                position: 'bottom-right',
            },
            {
                value: '✓ Done',
                label: 'Portfolio analytics active',
                sub: 'Auto-valuations every 30 days',
                color: 'white',
                position: 'mid-left',
            },
        ],
    },
];

const STAGE_TABS: LifecycleStageTab[] = [
    { id: 'acquisition', label: 'Acquisition', icon: <MapPin className="w-4 h-4" /> },
    { id: 'early-planning', label: 'Early Planning', icon: <FileText className="w-4 h-4" /> },
    { id: 'pre-development', label: 'Pre-Dev', icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: 'construction', label: 'Construction', icon: <HardHat className="w-4 h-4" /> },
    { id: 'stabilization', label: 'Stabilization', icon: <Key className="w-4 h-4" /> },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProjectLifecycleSection() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeStage, setActiveStage] = useState(0);
    const [manualOverride, setManualOverride] = useState<number | null>(null);
    const [overrideTimeout, setOverrideTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [isHovered, setIsHovered] = useState(false);

    // Scroll progress over the tall container
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ['start start', 'end end'],
    });

    // Map 0–1 scroll progress to 0–4 stage index
    const scrollStage = useTransform(scrollYProgress, [0, 1], [0, STAGES.length - 1]);

    useEffect(() => {
        const unsubscribe = scrollStage.on('change', (val) => {
            if (manualOverride === null) {
                setActiveStage(Math.round(val));
            }
        });
        return unsubscribe;
    }, [scrollStage, manualOverride]);

    // 4-second auto-advance — pauses on hover or manual tab click
    useEffect(() => {
        if (isHovered) return;
        const timer = setInterval(() => {
            setActiveStage((prev) => (prev + 1) % STAGES.length);
        }, 4000);
        return () => clearInterval(timer);
    }, [isHovered]);

    const handleStageChange = (index: number) => {
        if (overrideTimeout) clearTimeout(overrideTimeout);

        setManualOverride(index);
        setActiveStage(index);

        if (containerRef.current) {
            const containerTop = containerRef.current.offsetTop;
            const containerHeight = containerRef.current.offsetHeight;
            const targetScroll =
                containerTop + (index / (STAGES.length - 1)) * (containerHeight - window.innerHeight);
            window.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }

        const t = setTimeout(() => {
            setManualOverride(null);
        }, 900);
        setOverrideTimeout(t);
    };

    return (
        <section ref={containerRef} style={{ height: `${STAGES.length * 100}vh` }} className="relative">
            {/* ── Sticky Viewport ── */}
            <div
                className="sticky top-0 h-screen overflow-hidden bg-zinc-950 flex flex-col"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >

                {/* Section header */}
                <div className="px-6 md:px-10 pt-8 pb-4">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-6"
                    >
                        <div className="inline-block px-3 py-1 mb-4 border border-amber-500/30 rounded-full text-xs font-bold tracking-widest uppercase bg-amber-500/5 text-amber-400">
                            The Full Lifecycle
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                            From First Land Visit to Last Key Handover —{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                                One Platform. Five Stages.
                            </span>
                        </h2>
                    </motion.div>

                    {/* Progress Nav */}
                    <div className="max-w-3xl mx-auto">
                        <LifecycleProgressNav
                            stages={STAGE_TABS}
                            activeStage={activeStage}
                            onStageChange={handleStageChange}
                        />
                    </div>
                </div>

                {/* Body: two-column layout */}
                <div className="flex-1 grid lg:grid-cols-[42%_58%] gap-0 overflow-hidden">

                    {/* Left column */}
                    <div className="flex flex-col justify-center px-6 md:px-10 lg:pl-12 lg:pr-8 py-6 overflow-hidden">
                        <LifecycleLeftColumn
                            stage={STAGES[activeStage]}
                            stageIndex={activeStage}
                            totalStages={STAGES.length}
                        />
                    </div>

                    {/* Right column: diminishing card stack */}
                    <div className="relative flex items-center justify-center py-6 pr-6 md:pr-10 lg:pr-12 overflow-hidden">
                        {/* Card stack container */}
                        <div className="relative w-full h-full max-w-[680px]">
                            {STAGES.map((stage, i) => {
                                // Depth: how far behind the active stage this card is
                                const depth = activeStage - i;
                                // Only render the active card and the 3 behind it (not future cards)
                                if (depth < 0 || depth > 3) return null;

                                return (
                                    <LifecycleStageCard
                                        key={stage.id}
                                        stage={stage}
                                        depth={depth}
                                        isActive={depth === 0}
                                    />
                                );
                            })}

                            {/* Empty state / placeholder for before any card is shown */}
                            {activeStage < 0 && (
                                <div className="absolute inset-0 rounded-2xl bg-zinc-900 border border-zinc-800" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Scroll hint — shown only on stage 0 */}
                <motion.div
                    animate={{ opacity: activeStage === 0 ? 1 : 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
                >
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                        Scroll to advance
                    </span>
                    <motion.div
                        animate={{ y: [0, 6, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-px h-8 bg-gradient-to-b from-zinc-600 to-transparent"
                    />
                </motion.div>
            </div>
        </section>
    );
}
