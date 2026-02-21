'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { publicationsApi } from '@/lib/publications-api';
import type { Publication } from '@/lib/publications-api';

const PublicationChart = dynamic(() => import('@/components/publications/PublicationChart'), { ssr: false });

const PRODUCT_LABELS: Record<string, string> = {
  outlook: 'Ghana Real Estate Outlook',
  snapshot: 'Ghana Property Snapshot',
  policy_paper: 'Policy Paper',
  podcast: 'Podcast',
  press_release: 'Press Release',
};

const EDITION_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  weekly: 'Weekly',
  adhoc: '',
};

/** @deprecated — fallback for pre-migration publications */
const TYPE_LABELS: Record<string, string> = {
  market_flash: 'Market Flash',
  data_brief: 'Data Brief',
  marketbeat: 'MarketBeat',
  research_report: 'Research Report',
  special_report: 'Special Report',
  annual_flagship: 'Annual Flagship',
  policy_paper: 'Policy Paper',
  podcast: 'Podcast',
  index_update: 'Index Update',
  press_release: 'Press Release',
};

const PRODUCT_COLORS: Record<string, string> = {
  outlook: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  snapshot: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  policy_paper: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  podcast: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  press_release: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

/** @deprecated */
const TYPE_COLORS: Record<string, string> = {
  market_flash: 'bg-red-500/10 text-red-400 border-red-500/20',
  data_brief: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  marketbeat: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  research_report: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  special_report: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  annual_flagship: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  policy_paper: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  podcast: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  index_update: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  press_release: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * InterleavedContent — renders text sections with charts embedded inline.
 *
 * Handles 3 scenarios:
 * 1. NEW publications: content_json has mixed text + chart blocks → render in order
 * 2. OLD publications: content_json has text-only blocks + separate publication.charts → distribute charts between sections
 * 3. HTML-only: no content_json, just content_html + publication.charts → split HTML and inject charts
 */
function InterleavedContent({
  contentBlocks,
  charts,
  contentHtml,
  excerpt,
}: {
  contentBlocks: any[];
  charts: any[];
  contentHtml?: string;
  excerpt?: string;
}) {
  // ── Case 1: content_json already has chart blocks interleaved ──
  const hasInlineCharts = contentBlocks.some((b: any) => b.type === 'chart');

  if (hasInlineCharts) {
    return (
      <>
        {contentBlocks.map((block: any, i: number) => {
          if (block.type === 'chart') {
            return (
              <PublicationChart
                key={block.id || `chart-${i}`}
                chart={{
                  chartType: block.chartType,
                  title: block.title,
                  aiInsight: block.aiInsight,
                  snapshotData: block.snapshotData,
                  endpoint: block.endpoint,
                }}
              />
            );
          }
          if (block.type === 'heading') {
            return <h2 key={i} className="text-2xl font-bold text-white mt-10 mb-4">{block.content}</h2>;
          }
          if (block.type === 'text') {
            return <div key={i} dangerouslySetInnerHTML={{ __html: block.content }} />;
          }
          if (block.type === 'callout') {
            return (
              <div key={i} className="bg-primary/5 border-l-4 border-primary p-4 my-6">
                <p className="text-zinc-300">{block.content}</p>
              </div>
            );
          }
          if (block.type === 'quote') {
            return (
              <blockquote key={i} className="border-l-4 border-zinc-700 pl-4 italic text-zinc-400 my-6">
                {block.content}
              </blockquote>
            );
          }
          return <div key={i} dangerouslySetInnerHTML={{ __html: block.content || '' }} />;
        })}
      </>
    );
  }

  // ── Case 2: text-only content_json + separate charts → inject charts between sections ──
  if (contentBlocks.length > 0) {
    const textBlocks = contentBlocks.filter((b: any) => b.type === 'text' || b.type === 'heading');
    const chartInterval = charts.length > 0
      ? Math.max(1, Math.floor(textBlocks.length / (charts.length + 1)))
      : textBlocks.length + 1;
    let chartIdx = 0;
    const elements: React.ReactNode[] = [];

    textBlocks.forEach((block: any, i: number) => {
      if (block.type === 'heading') {
        elements.push(<h2 key={`t-${i}`} className="text-2xl font-bold text-white mt-10 mb-4">{block.content}</h2>);
      } else {
        elements.push(<div key={`t-${i}`} dangerouslySetInnerHTML={{ __html: block.content }} />);
      }

      // Inject a chart after every N text blocks
      if (chartIdx < charts.length && (i + 1) % chartInterval === 0) {
        const chart = charts[chartIdx];
        elements.push(
          <PublicationChart
            key={`c-${chartIdx}`}
            chart={{
              chartType: chart.chart_type || 'bar',
              title: chart.title,
              aiInsight: chart.ai_insight,
              snapshotData: chart.snapshot_data,
              endpoint: chart.endpoint,
            }}
          />
        );
        chartIdx++;
      }
    });

    // Append remaining charts
    while (chartIdx < charts.length) {
      const chart = charts[chartIdx];
      elements.push(
        <PublicationChart
          key={`c-${chartIdx}`}
          chart={{
            chartType: chart.chart_type || 'bar',
            title: chart.title,
            aiInsight: chart.ai_insight,
            snapshotData: chart.snapshot_data,
            endpoint: chart.endpoint,
          }}
        />
      );
      chartIdx++;
    }

    return <>{elements}</>;
  }

  // ── Case 3: content_html only → split at <h2> boundaries and inject charts ──
  if (contentHtml) {
    if (charts.length === 0) {
      return <div dangerouslySetInnerHTML={{ __html: contentHtml }} />;
    }

    // Split on h2 tags to create insertion points
    const sections = contentHtml.split(/(?=<h2[ >])/);
    const chartInterval = Math.max(1, Math.floor(sections.length / (charts.length + 1)));
    let chartIdx = 0;
    const elements: React.ReactNode[] = [];

    sections.forEach((section, i) => {
      if (section.trim()) {
        elements.push(<div key={`h-${i}`} dangerouslySetInnerHTML={{ __html: section }} />);
      }

      if (chartIdx < charts.length && (i + 1) % chartInterval === 0) {
        const chart = charts[chartIdx];
        elements.push(
          <PublicationChart
            key={`c-${chartIdx}`}
            chart={{
              chartType: chart.chart_type || 'bar',
              title: chart.title,
              aiInsight: chart.ai_insight,
              snapshotData: chart.snapshot_data,
              endpoint: chart.endpoint,
            }}
          />
        );
        chartIdx++;
      }
    });

    // Append remaining
    while (chartIdx < charts.length) {
      const chart = charts[chartIdx];
      elements.push(
        <PublicationChart
          key={`c-${chartIdx}`}
          chart={{
            chartType: chart.chart_type || 'bar',
            title: chart.title,
            aiInsight: chart.ai_insight,
            snapshotData: chart.snapshot_data,
            endpoint: chart.endpoint,
          }}
        />
      );
      chartIdx++;
    }

    return <>{elements}</>;
  }

  // ── Fallback: excerpt only ──
  if (excerpt) {
    return <p className="text-zinc-300 leading-relaxed">{excerpt}</p>;
  }

  return null;
}

export default function PublicationPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    publicationsApi.getBySlug(slug)
      .then(r => setPublication(r.data))
      .catch(e => setError(e.message || 'Publication not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <main className="pt-32 pb-24 bg-zinc-950">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl">
          <div className="animate-pulse space-y-6">
            <div className="h-6 w-32 bg-zinc-800 rounded" />
            <div className="h-12 w-3/4 bg-zinc-800 rounded" />
            <div className="h-4 w-1/3 bg-zinc-800 rounded" />
            <div className="space-y-3 mt-8">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-4 bg-zinc-800 rounded" style={{ width: `${85 + Math.random() * 15}%` }} />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !publication) {
    return (
      <main className="pt-32 pb-24 bg-zinc-950">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl text-center py-20">
          <div className="text-6xl mb-4">📄</div>
          <h1 className="text-3xl font-bold text-white mb-4">Publication Not Found</h1>
          <p className="text-zinc-400 mb-8">{error || 'This publication does not exist or has not been published yet.'}</p>
          <Link
            href="/insights"
            className="px-6 py-3 bg-primary text-zinc-950 font-bold rounded-lg hover:bg-primary/90 transition-colors inline-block"
          >
            Browse All Research
          </Link>
        </div>
      </main>
    );
  }

  const contentBlocks = Array.isArray(publication.content_json) ? publication.content_json : [];
  const keyFindings = Array.isArray(publication.key_findings)
    ? publication.key_findings
    : (typeof publication.key_findings === 'string'
      ? JSON.parse(publication.key_findings || '[]')
      : []);

  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <article className="container mx-auto px-4 md:px-6 max-w-4xl">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          {/* Back link */}
          <Link
            href="/insights"
            className="text-sm text-zinc-500 hover:text-primary transition-colors mb-6 inline-block"
          >
            ← Back to Research
          </Link>

          {/* Product badge + edition + date */}
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-3 py-1 text-xs font-bold rounded border ${PRODUCT_COLORS[publication.product] || TYPE_COLORS[publication.type] || 'bg-zinc-800 text-zinc-400'}`}>
              {PRODUCT_LABELS[publication.product] || TYPE_LABELS[publication.type] || publication.type}
            </span>
            {publication.edition && EDITION_LABELS[publication.edition] && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 border border-zinc-700 rounded">
                {EDITION_LABELS[publication.edition]}
              </span>
            )}
            <span className="text-sm text-zinc-500">
              {formatDate(publication.published_at)}
            </span>
            {publication.reading_time_minutes > 0 && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-sm text-zinc-500">{publication.reading_time_minutes} min read</span>
              </>
            )}

          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
            {publication.title}
          </h1>

          {publication.subtitle && (
            <p className="text-xl text-zinc-400">{publication.subtitle}</p>
          )}

          {/* Author */}
          {publication.author_name && (
            <div className="mt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {publication.author_name.charAt(0)}
              </div>
              <div>
                <div className="text-white font-medium">{publication.author_name}</div>
                {publication.author_title && (
                  <div className="text-sm text-zinc-500">{publication.author_title}</div>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="mt-6 flex flex-wrap gap-2">
            {publication.sectors.map(s => (
              <Link key={s} href={`/insights?sector=${s}`}>
                <span className="px-3 py-1 bg-zinc-900 text-zinc-400 text-xs rounded hover:text-primary transition-colors capitalize">
                  {s.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
            {publication.topics.map(t => (
              <Link key={t} href={`/insights?topic=${t}`}>
                <span className="px-3 py-1 bg-zinc-900 text-zinc-400 text-xs rounded hover:text-primary transition-colors capitalize">
                  {t.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
            {publication.regions.map(r => (
              <span key={r} className="px-3 py-1 bg-zinc-900 text-zinc-400 text-xs rounded capitalize">
                {r.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </motion.header>

        {/* Key Findings */}
        {keyFindings.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-12 bg-zinc-900 border border-zinc-800 rounded-lg p-6"
          >
            <h2 className="text-lg font-bold text-primary mb-4">Key Findings</h2>
            <ul className="space-y-2">
              {keyFindings.map((finding: string, i: number) => (
                <li key={i} className="flex items-start gap-3 text-zinc-300">
                  <span className="text-primary font-bold mt-0.5">→</span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* Content with inline charts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="prose prose-invert prose-lg max-w-none
            prose-headings:text-primary prose-headings:font-bold prose-headings:mt-10 prose-headings:mb-4
            prose-h2:text-2xl prose-h2:border-b prose-h2:border-zinc-800 prose-h2:pb-3
            prose-p:text-zinc-300 prose-p:leading-relaxed prose-p:mb-4
            prose-strong:text-zinc-100
            prose-em:text-zinc-400
            prose-ul:my-4 prose-ul:space-y-1
            prose-li:text-zinc-300 prose-li:marker:text-primary
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
        >
          <InterleavedContent
            contentBlocks={contentBlocks}
            charts={publication.charts || []}
            contentHtml={publication.content_html || undefined}
            excerpt={publication.excerpt || undefined}
          />
        </motion.div>

        {/* Disclaimer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-16 pt-8 border-t border-zinc-800"
        >
          <p className="text-xs text-zinc-600 leading-relaxed">
            <strong className="text-zinc-500">Disclaimer:</strong> This publication is provided for informational
            purposes only and does not constitute investment advice. PROPMETRIK makes no representations or
            warranties regarding the accuracy or completeness of the information. Past performance is not
            indicative of future results. © {new Date().getFullYear()} PROPMETRIK Research.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link
              href="/insights"
              className="px-6 py-3 bg-zinc-900 border border-zinc-800 text-white font-medium rounded-lg hover:border-primary hover:text-primary transition-colors text-center"
            >
              Browse More Research
            </Link>
            {publication.pdf_url && (
              <a
                href={publication.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-shadow text-center"
              >
                Download PDF
              </a>
            )}
          </div>
        </motion.footer>
      </article>
    </main>
  );
}
