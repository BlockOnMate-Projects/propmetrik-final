'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  publicationsApi,
  aiContentApi,
  chartsCatalogApi,
} from '@/lib/publications-api';
import type {
  ContentBlock,
  ChartCatalogItem,
} from '@/lib/publications-api';

// ── Static taxonomy (matches DB enum values) ───────────────
// Category → Type mapping for navigation
const TYPE_CATEGORIES: Record<string, { label: string; description: string; website_path: string }> = {
  insights: { label: 'Insights', description: 'Research & thought leadership', website_path: '/insights' },
  press: { label: 'Press', description: 'Corporate communications & media', website_path: '/press' },
};

const TYPES = [
  { value: 'market_flash', label: 'Market Flash', desc: 'Quick 300-600 word web article', category: 'insights', website_path: '/insights/latest' },
  { value: 'data_brief', label: 'Data Brief', desc: '1-3 page data summary', category: 'insights', website_path: '/insights/latest' },
  { value: 'marketbeat', label: 'MarketBeat', desc: '4-8 page regional quarterly', category: 'insights', website_path: '/insights/marketbeat' },
  { value: 'research_report', label: 'Research Report', desc: '10-30 page deep analysis', category: 'insights', website_path: '/insights/reports' },
  { value: 'special_report', label: 'Special Report', desc: '20-50 page premium report', category: 'insights', website_path: '/insights/special-reports' },
  { value: 'annual_flagship', label: 'Annual Flagship', desc: '50-100+ page annual publication', category: 'insights', website_path: '/insights/reports' },
  { value: 'policy_paper', label: 'Policy Paper', desc: '8-15 page government-focused', category: 'insights', website_path: '/insights/policy-papers' },
  { value: 'podcast', label: 'Podcast Episode', desc: 'Audio + transcript', category: 'insights', website_path: '/insights/podcasts-video' },
  { value: 'video', label: 'Video Commentary', desc: '3-10 min video', category: 'insights', website_path: '/insights/podcasts-video' },
  { value: 'index_update', label: 'Index Update', desc: 'Automated index publication', category: 'insights', website_path: '/insights/indices' },
  { value: 'webinar', label: 'Webinar', desc: 'Live/recorded presentation', category: 'insights', website_path: '/insights/podcasts-video' },
  { value: 'press_release', label: 'Press Release', desc: 'Official announcement', category: 'press', website_path: '/press/releases' },
];

const INSIGHTS_TYPES = TYPES.filter((t) => t.category === 'insights');
const PRESS_TYPES = TYPES.filter((t) => t.category === 'press');

const SECTORS = [
  'Residential', 'Commercial', 'Industrial', 'Hospitality', 'Mixed Use', 'Land',
  'Affordable Housing', 'Luxury', 'Student Housing', 'Healthcare',
];
const TOPICS = [
  'Pricing', 'Construction Costs', 'Market Activity', 'Investment',
  'Affordability', 'Policy & Regulation', 'Infrastructure', 'Demographics',
  'Technology', 'Sustainability', 'Financing', 'Development Pipeline',
];
const REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central',
  'Northern', 'Volta', 'Bono', 'Upper East', 'Upper West',
  'Ahafo', 'Bono East', 'North East', 'Savannah', 'Oti', 'Western North',
];
const ACCESS_TIERS = [
  { value: 'public', label: 'Public', desc: 'Free for all visitors' },
  { value: 'registered', label: 'Registered', desc: 'Requires free account' },
  { value: 'professional', label: 'Professional', desc: 'Paid tier only' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Enterprise tier only' },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TYPES.map((t) => [t.value, t.label])
);

function generateId() {
  return `blk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ── Step Indicator ──────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = ['Type & Meta', 'Taxonomy', 'AI Draft', 'Edit & Charts', 'Review'];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
              i < current
                ? 'bg-green-600 text-white'
                : i === current
                ? 'bg-red-600 text-white'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </div>
          <span
            className={`text-xs font-mono ${
              i === current ? 'text-white' : 'text-zinc-500'
            } hidden md:inline`}
          >
            {s}
          </span>
          {i < steps.length - 1 && (
            <div className="w-6 h-px bg-zinc-700 hidden md:block" />
          )}
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
export default function NewPublicationPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Step 1: Type & Meta
  const [pubType, setPubType] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [accessTier, setAccessTier] = useState('public');

  // Step 2: Taxonomy
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  // Step 3: AI Draft
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [keyFindings, setKeyFindings] = useState<string[]>([]);
  const [excerpt, setExcerpt] = useState('');
  const [aiModel, setAiModel] = useState('');

  // Step 4: Charts
  const [chartsCatalog, setChartsCatalog] = useState<ChartCatalogItem[]>([]);
  const [selectedCharts, setSelectedCharts] = useState<
    Array<{ catalogItem: ChartCatalogItem; title: string; insight: string }>
  >([]);

  // ── Step Navigation ──────────────────────────────────────
  const canAdvance = () => {
    if (step === 0) return pubType && title.trim();
    if (step === 1) return selectedSectors.length > 0;
    return true;
  };

  const next = () => {
    if (step < 4) setStep(step + 1);
    // Load charts catalog when entering Step 4
    if (step === 2) loadChartsCatalog();
  };
  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  // ── AI Draft Generation ──────────────────────────────────
  const generateDraft = useCallback(async () => {
    setAiLoading(true);
    try {
      const result = await aiContentApi.generateDraft({
        type: pubType,
        title,
        sectors: selectedSectors,
        topics: selectedTopics,
        regions: selectedRegions,
      });

      const d = result.data;
      const blocks: ContentBlock[] = d.sections.map((s) => ({
        id: generateId(),
        type: 'text' as const,
        content: `## ${s.heading}\n\n${s.content}`,
        aiGenerated: s.aiGenerated,
      }));

      setContentBlocks(blocks);
      setKeyFindings(d.keyFindings || []);
      setExcerpt(d.excerpt || '');
      setAiModel('gemini-2.5-flash');
    } catch (e) {
      // Fallback: create empty template
      setContentBlocks([
        {
          id: generateId(),
          type: 'heading',
          content: 'Executive Summary',
          aiGenerated: false,
        },
        { id: generateId(), type: 'text', content: '', aiGenerated: false },
        {
          id: generateId(),
          type: 'heading',
          content: 'Key Findings',
          aiGenerated: false,
        },
        { id: generateId(), type: 'text', content: '', aiGenerated: false },
      ]);
      alert('AI generation unavailable. Empty template created.');
    } finally {
      setAiLoading(false);
    }
  }, [pubType, title, selectedSectors, selectedTopics, selectedRegions]);

  // ── Chart Catalog ────────────────────────────────────────
  const loadChartsCatalog = async () => {
    try {
      const res = await chartsCatalogApi.getCatalog();
      setChartsCatalog(res.data?.charts || []);
    } catch {}
  };

  const addChart = (item: ChartCatalogItem) => {
    if (selectedCharts.find((c) => c.catalogItem.id === item.id)) return;
    setSelectedCharts([
      ...selectedCharts,
      { catalogItem: item, title: item.title, insight: '' },
    ]);

    // Insert chart block into content
    setContentBlocks((prev) => [
      ...prev,
      {
        id: generateId(),
        type: 'chart',
        content: item.title,
        metadata: {
          chartId: item.id,
          endpoint: item.endpoint,
          chartType: item.chartType,
          component: item.component,
        },
        aiGenerated: false,
      },
    ]);
  };

  const generateChartInsight = async (chartIdx: number) => {
    const chart = selectedCharts[chartIdx];
    setAiLoading(true);
    try {
      const previewRes = await chartsCatalogApi.preview(
        chart.catalogItem.endpoint
      );
      const insightRes = await aiContentApi.generateChartInsight({
        chartData: previewRes.data as Record<string, unknown>,
        chartType: chart.catalogItem.chartType,
        title: chart.title,
        sector: selectedSectors[0],
        region: selectedRegions[0],
      });
      const insight = insightRes.data?.text || '';
      setSelectedCharts((prev) =>
        prev.map((c, i) => (i === chartIdx ? { ...c, insight } : c))
      );
    } catch {
      alert('Failed to generate chart insight');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Content Block Editor ─────────────────────────────────
  const updateBlock = (blockId: string, content: string) => {
    setContentBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, content, aiGenerated: false } : b
      )
    );
  };

  const removeBlock = (blockId: string) => {
    setContentBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  const addTextBlock = () => {
    setContentBlocks((prev) => [
      ...prev,
      { id: generateId(), type: 'text', content: '', aiGenerated: false },
    ]);
  };

  const addCalloutBlock = () => {
    setContentBlocks((prev) => [
      ...prev,
      { id: generateId(), type: 'callout', content: '', aiGenerated: false },
    ]);
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= contentBlocks.length) return;
    const copy = [...contentBlocks];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setContentBlocks(copy);
  };

  // ── AI Section Regenerator ───────────────────────────────
  const regenerateSection = async (blockId: string) => {
    const block = contentBlocks.find((b) => b.id === blockId);
    if (!block) return;
    setAiLoading(true);
    try {
      const heading = block.content.split('\n')[0]?.replace(/^#+\s*/, '') || '';
      const res = await aiContentApi.generateSection({
        sectionType: heading.toLowerCase().replace(/\s+/g, '_') || 'analysis',
        sector: selectedSectors[0],
        region: selectedRegions[0],
      });
      updateBlock(blockId, `## ${heading}\n\n${res.data?.text || ''}`);
    } catch {
      alert('Failed to regenerate section');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      const payload = {
        title,
        subtitle: subtitle || undefined,
        type: pubType,
        access_tier: accessTier,
        content_json: contentBlocks,
        excerpt,
        key_findings: keyFindings,
        sectors: selectedSectors,
        topics: selectedTopics,
        regions: selectedRegions,
        ai_generated: contentBlocks.some((b) => b.aiGenerated),
        ai_model: aiModel || undefined,
      };

      const res = await publicationsApi.create(payload);

      if (publish && res.data?.id) {
        await publicationsApi.publish(res.data.id);
      }

      // Save charts
      if (res.data?.id && selectedCharts.length > 0) {
        // Charts are saved as part of the content_json blocks;
        // future: use addChart endpoint for snapshot storage
      }

      router.push('/dashboard/admin/publications');
    } catch (e) {
      alert('Failed to save publication');
    } finally {
      setSaving(false);
    }
  };

  // ════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Steps current={step} />

      {/* ── STEP 1: Type & Meta ──────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
              Publication Type
            </label>

            {/* Insights Category */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-blue-900/30 text-blue-400 border border-blue-800 rounded">
                  Insights
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">Research & thought leadership → appears on /insights/*</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {INSIGHTS_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setPubType(t.value)}
                    className={`text-left p-4 border rounded transition-colors ${
                      pubType === t.value
                        ? 'border-red-600 bg-red-900/20'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-sm font-bold text-white">{t.label}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{t.desc}</div>
                    <div className="text-[9px] text-zinc-700 font-mono mt-1">→ {t.website_path}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Press Category */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-amber-900/30 text-amber-400 border border-amber-800 rounded">
                  Press
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">Corporate communications → appears on /press/*</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {PRESS_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setPubType(t.value)}
                    className={`text-left p-4 border rounded transition-colors ${
                      pubType === t.value
                        ? 'border-red-600 bg-red-900/20'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-sm font-bold text-white">{t.label}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{t.desc}</div>
                    <div className="text-[9px] text-zinc-700 font-mono mt-1">→ {t.website_path}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Ghana Housing Affordability Index — Q4 2025"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded text-white placeholder-zinc-600 focus:outline-none focus:border-red-600 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Subtitle (optional)
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="A brief subtitle for the publication"
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded text-white placeholder-zinc-600 focus:outline-none focus:border-red-600 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
              Access Tier
            </label>
            <div className="flex flex-wrap gap-3">
              {ACCESS_TIERS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setAccessTier(t.value)}
                  className={`px-4 py-2 border rounded text-sm transition-colors ${
                    accessTier === t.value
                      ? 'border-red-600 bg-red-900/20 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Taxonomy ─────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <TaxonomyMultiSelect
            label="Sectors"
            options={SECTORS}
            selected={selectedSectors}
            onToggle={(v) =>
              setSelectedSectors((p) =>
                p.includes(v) ? p.filter((x) => x !== v) : [...p, v]
              )
            }
          />
          <TaxonomyMultiSelect
            label="Topics"
            options={TOPICS}
            selected={selectedTopics}
            onToggle={(v) =>
              setSelectedTopics((p) =>
                p.includes(v) ? p.filter((x) => x !== v) : [...p, v]
              )
            }
          />
          <TaxonomyMultiSelect
            label="Regions"
            options={REGIONS}
            selected={selectedRegions}
            onToggle={(v) =>
              setSelectedRegions((p) =>
                p.includes(v) ? p.filter((x) => x !== v) : [...p, v]
              )
            }
          />
        </div>
      )}

      {/* ── STEP 3: AI Draft ─────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded">
            <h3 className="text-sm font-mono text-white font-bold mb-2">
              AI Content Generation
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Gemini 2.5 Flash will generate a structured draft based on your
              title, type, and taxonomy selections. You can edit everything
              afterwards.
            </p>
            <div className="bg-zinc-950 border border-zinc-700 rounded p-4 mb-4">
              <div className="text-xs font-mono text-zinc-400 space-y-1">
                <div>
                  <span className="text-zinc-600">Type:</span>{' '}
                  {TYPE_LABELS[pubType] || pubType}
                </div>
                <div>
                  <span className="text-zinc-600">Title:</span> {title}
                </div>
                <div>
                  <span className="text-zinc-600">Sectors:</span>{' '}
                  {selectedSectors.join(', ') || '-'}
                </div>
                <div>
                  <span className="text-zinc-600">Topics:</span>{' '}
                  {selectedTopics.join(', ') || '-'}
                </div>
                <div>
                  <span className="text-zinc-600">Regions:</span>{' '}
                  {selectedRegions.join(', ') || '-'}
                </div>
              </div>
            </div>

            {contentBlocks.length === 0 ? (
              <button
                onClick={generateDraft}
                disabled={aiLoading}
                className="px-6 py-3 bg-red-600 text-white font-bold rounded hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {aiLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⟳</span> Generating with
                    Gemini…
                  </span>
                ) : (
                  'Generate AI Draft'
                )}
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-green-400 font-mono">
                  ✓ Draft generated ({contentBlocks.length} blocks)
                </span>
                <button
                  onClick={generateDraft}
                  disabled={aiLoading}
                  className="text-xs font-mono text-zinc-500 hover:text-red-400"
                >
                  Regenerate
                </button>
              </div>
            )}
          </div>

          {/* Excerpt + Key Findings */}
          {contentBlocks.length > 0 && (
            <>
              <div>
                <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                  Excerpt
                </label>
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded text-white text-sm focus:outline-none focus:border-red-600 font-mono resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                  Key Findings
                </label>
                {keyFindings.map((kf, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-zinc-600 font-mono w-6">
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      value={kf}
                      onChange={(e) =>
                        setKeyFindings((p) =>
                          p.map((x, j) => (j === i ? e.target.value : x))
                        )
                      }
                      className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-white text-sm focus:outline-none focus:border-red-600 font-mono"
                    />
                    <button
                      onClick={() =>
                        setKeyFindings((p) => p.filter((_, j) => j !== i))
                      }
                      className="text-xs text-red-500 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setKeyFindings((p) => [...p, ''])}
                  className="text-xs font-mono text-zinc-500 hover:text-white"
                >
                  + Add Finding
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 4: Edit & Charts ────────────────────────── */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Content Editor */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                Content Blocks ({contentBlocks.length})
              </span>
              <div className="flex gap-2">
                <button
                  onClick={addTextBlock}
                  className="text-xs font-mono text-zinc-500 hover:text-white border border-zinc-700 px-2 py-1 rounded"
                >
                  + Text
                </button>
                <button
                  onClick={addCalloutBlock}
                  className="text-xs font-mono text-zinc-500 hover:text-white border border-zinc-700 px-2 py-1 rounded"
                >
                  + Callout
                </button>
              </div>
            </div>

            {contentBlocks.map((block, idx) => (
              <div
                key={block.id}
                className={`bg-zinc-900 border rounded p-4 ${
                  block.type === 'chart'
                    ? 'border-blue-800'
                    : block.type === 'callout'
                    ? 'border-amber-800'
                    : 'border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        block.type === 'chart'
                          ? 'bg-blue-900/50 text-blue-400'
                          : block.type === 'callout'
                          ? 'bg-amber-900/50 text-amber-400'
                          : block.type === 'heading'
                          ? 'bg-purple-900/50 text-purple-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {block.type}
                    </span>
                    {block.aiGenerated && (
                      <span className="text-[10px] font-mono text-purple-400">
                        AI
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveBlock(idx, -1)}
                      disabled={idx === 0}
                      className="text-xs text-zinc-600 hover:text-white disabled:opacity-30 px-1"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveBlock(idx, 1)}
                      disabled={idx === contentBlocks.length - 1}
                      className="text-xs text-zinc-600 hover:text-white disabled:opacity-30 px-1"
                    >
                      ↓
                    </button>
                    {block.type === 'text' && (
                      <button
                        onClick={() => regenerateSection(block.id)}
                        disabled={aiLoading}
                        className="text-[10px] font-mono text-purple-400 hover:text-purple-300 px-1"
                      >
                        ⟳ AI
                      </button>
                    )}
                    <button
                      onClick={() => removeBlock(block.id)}
                      className="text-xs text-red-500 hover:text-red-400 px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {block.type === 'chart' ? (
                  <div className="text-sm text-blue-400 font-mono">
                    📊 {block.content}
                    <div className="text-[10px] text-zinc-600 mt-1">
                      {(block.metadata as Record<string, unknown>)?.endpoint as string}
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={block.content}
                    onChange={(e) => updateBlock(block.id, e.target.value)}
                    rows={
                      block.type === 'heading'
                        ? 1
                        : Math.max(3, block.content.split('\n').length + 1)
                    }
                    className="w-full bg-transparent text-white text-sm font-mono focus:outline-none resize-y"
                    placeholder={
                      block.type === 'heading'
                        ? 'Section heading...'
                        : block.type === 'callout'
                        ? 'Key insight or callout...'
                        : 'Write or paste content...'
                    }
                  />
                )}
              </div>
            ))}
          </div>

          {/* Charts Sidebar */}
          <div className="space-y-4">
            <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
              Chart Library
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded max-h-[600px] overflow-y-auto">
              {chartsCatalog.length === 0 ? (
                <div className="p-4 text-xs text-zinc-500 font-mono text-center">
                  Loading chart catalog...
                </div>
              ) : (
                chartsCatalog.map((chart) => {
                  const isAdded = selectedCharts.some(
                    (c) => c.catalogItem.id === chart.id
                  );
                  return (
                    <div
                      key={chart.id}
                      className="p-3 border-b border-zinc-800 last:border-0"
                    >
                      <div className="text-xs text-white font-mono font-bold">
                        {chart.title}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {chart.category} · {chart.chartType}
                      </div>
                      <button
                        onClick={() => addChart(chart)}
                        disabled={isAdded}
                        className={`mt-1 text-[10px] font-mono ${
                          isAdded
                            ? 'text-green-500'
                            : 'text-blue-400 hover:text-blue-300'
                        }`}
                      >
                        {isAdded ? '✓ Added' : '+ Insert Chart'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Chart Insights */}
            {selectedCharts.length > 0 && (
              <div>
                <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                  Chart Insights
                </div>
                {selectedCharts.map((chart, i) => (
                  <div
                    key={i}
                    className="bg-zinc-900 border border-blue-800 rounded p-3 mb-2"
                  >
                    <div className="text-xs font-mono text-white mb-1">
                      {chart.title}
                    </div>
                    {chart.insight ? (
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {chart.insight}
                      </p>
                    ) : (
                      <button
                        onClick={() => generateChartInsight(i)}
                        disabled={aiLoading}
                        className="text-[10px] font-mono text-purple-400 hover:text-purple-300"
                      >
                        ⟳ Generate AI Insight
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 5: Review ───────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4">
            <h3 className="text-sm font-mono text-white font-bold">
              Publication Summary
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-zinc-600">Type:</span>{' '}
                <span className="text-white">
                  {TYPE_LABELS[pubType] || pubType}
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Access:</span>{' '}
                <span className="text-white capitalize">{accessTier}</span>
              </div>
              <div className="col-span-2">
                <span className="text-zinc-600">Title:</span>{' '}
                <span className="text-white">{title}</span>
              </div>
              {subtitle && (
                <div className="col-span-2">
                  <span className="text-zinc-600">Subtitle:</span>{' '}
                  <span className="text-white">{subtitle}</span>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-zinc-600">Sectors:</span>{' '}
                <span className="text-white">
                  {selectedSectors.join(', ')}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-zinc-600">Topics:</span>{' '}
                <span className="text-white">
                  {selectedTopics.join(', ') || '-'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-zinc-600">Regions:</span>{' '}
                <span className="text-white">
                  {selectedRegions.join(', ') || '-'}
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Content Blocks:</span>{' '}
                <span className="text-white">{contentBlocks.length}</span>
              </div>
              <div>
                <span className="text-zinc-600">Charts:</span>{' '}
                <span className="text-white">{selectedCharts.length}</span>
              </div>
              <div>
                <span className="text-zinc-600">Key Findings:</span>{' '}
                <span className="text-white">{keyFindings.length}</span>
              </div>
              <div>
                <span className="text-zinc-600">AI Generated:</span>{' '}
                <span className="text-white">
                  {contentBlocks.some((b) => b.aiGenerated) ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {excerpt && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="text-[10px] font-mono text-zinc-600 uppercase mb-1">
                  Excerpt
                </div>
                <p className="text-sm text-zinc-300">{excerpt}</p>
              </div>
            )}

            {keyFindings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="text-[10px] font-mono text-zinc-600 uppercase mb-2">
                  Key Findings
                </div>
                <ul className="space-y-1">
                  {keyFindings.map((kf, i) => (
                    <li
                      key={i}
                      className="text-xs text-zinc-400 font-mono flex gap-2"
                    >
                      <span className="text-red-500">{i + 1}.</span> {kf}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Content Preview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded p-6">
            <h3 className="text-sm font-mono text-white font-bold mb-4">
              Content Preview
            </h3>
            <div className="prose prose-invert prose-sm max-w-none">
              {contentBlocks.map((block) => (
                <div key={block.id} className="mb-4">
                  {block.type === 'heading' && (
                    <h3 className="text-lg font-bold text-white">
                      {block.content}
                    </h3>
                  )}
                  {block.type === 'text' && (
                    <div className="text-sm text-zinc-300 whitespace-pre-wrap">
                      {block.content}
                    </div>
                  )}
                  {block.type === 'chart' && (
                    <div className="p-4 border border-blue-800 rounded bg-blue-900/10 text-sm text-blue-400 font-mono">
                      📊 {block.content}
                    </div>
                  )}
                  {block.type === 'callout' && (
                    <div className="p-3 border-l-4 border-amber-500 bg-amber-900/10 text-sm text-amber-200">
                      {block.content}
                    </div>
                  )}
                  {block.type === 'quote' && (
                    <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-sm text-zinc-400">
                      {block.content}
                    </blockquote>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────── */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
        <button
          onClick={prev}
          disabled={step === 0}
          className="px-4 py-2 text-sm font-mono text-zinc-400 border border-zinc-700 rounded hover:border-white hover:text-white disabled:opacity-30 transition-colors"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-3">
          {step === 4 && (
            <>
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="px-4 py-2 text-sm font-mono text-zinc-300 border border-zinc-700 rounded hover:border-white hover:text-white disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save as Draft'}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="px-4 py-2 text-sm font-mono font-bold text-white bg-red-600 rounded hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Publishing...' : 'Publish Now'}
              </button>
            </>
          )}

          {step < 4 && (
            <button
              onClick={next}
              disabled={!canAdvance()}
              className="px-4 py-2 text-sm font-mono font-bold text-white bg-red-600 rounded hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Taxonomy Multi-Select Component ─────────────────────────
function TaxonomyMultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
        {label}{' '}
        <span className="text-zinc-700">({selected.length} selected)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
              selected.includes(opt)
                ? 'border-red-600 bg-red-900/20 text-white'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
