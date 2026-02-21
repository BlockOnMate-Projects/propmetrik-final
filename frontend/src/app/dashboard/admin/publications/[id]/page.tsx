'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  publicationsApi,
  aiContentApi,
  chartsCatalogApi,
} from '@/lib/publications-api';
import type {
  Publication,
  ContentBlock,
  ChartCatalogItem,
} from '@/lib/publications-api';

const TYPE_LABELS: Record<string, string> = {
  market_flash: 'Market Flash',
  data_brief: 'Data Brief',
  marketbeat: 'MarketBeat',
  research_report: 'Research Report',
  special_report: 'Special Report',
  annual_flagship: 'Annual Flagship',
  policy_paper: 'Policy Paper',
  podcast: 'Podcast Episode',
  video: 'Video Commentary',
  index_update: 'Index Update',
  webinar: 'Webinar',
  press_release: 'Press Release',
};

// Website category mapping
const TYPE_CATEGORY: Record<string, 'insights' | 'press'> = {
  market_flash: 'insights',
  data_brief: 'insights',
  marketbeat: 'insights',
  research_report: 'insights',
  special_report: 'insights',
  annual_flagship: 'insights',
  policy_paper: 'insights',
  podcast: 'insights',
  video: 'insights',
  index_update: 'insights',
  webinar: 'insights',
  press_release: 'press',
};

const TYPE_WEBSITE_PATH: Record<string, string> = {
  market_flash: '/insights/latest',
  data_brief: '/insights/latest',
  marketbeat: '/insights/marketbeat',
  research_report: '/insights/reports',
  special_report: '/insights/special-reports',
  annual_flagship: '/insights/reports',
  policy_paper: '/insights/policy-papers',
  podcast: '/insights/podcasts-video',
  video: '/insights/podcasts-video',
  index_update: '/insights/indices',
  webinar: '/insights/podcasts-video',
  press_release: '/press/releases',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  review: 'bg-yellow-900/50 text-yellow-400',
  published: 'bg-green-900/50 text-green-400',
  archived: 'bg-red-900/50 text-red-400',
  scheduled: 'bg-blue-900/50 text-blue-400',
};

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
const ACCESS_TIERS = ['public', 'registered', 'professional', 'enterprise'];

function generateId() {
  return `blk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function EditPublicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'meta' | 'charts' | 'seo'>('content');

  // Editable fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [accessTier, setAccessTier] = useState('public');
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [keyFindings, setKeyFindings] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  // Charts
  const [chartsCatalog, setChartsCatalog] = useState<ChartCatalogItem[]>([]);

  // ── Load Publication ─────────────────────────────────────
  const loadPublication = useCallback(async () => {
    if (!isUuid(id)) {
      router.replace('/dashboard/admin/publications');
      return;
    }

    setLoading(true);
    try {
      const res = await publicationsApi.getById(id);
      const pub = res.data;
      setPublication(pub);
      setTitle(pub.title);
      setSubtitle(pub.subtitle || '');
      setExcerpt(pub.excerpt || '');
      setAccessTier(pub.access_tier);
      setContentBlocks(pub.content_json || []);
      setKeyFindings(pub.key_findings || []);
      setSelectedSectors(pub.sectors || []);
      setSelectedTopics(pub.topics || []);
      setSelectedRegions(pub.regions || []);
      setSeoTitle(pub.seo_title || '');
      setSeoDescription(pub.seo_description || '');
    } catch {
      alert('Failed to load publication');
      router.push('/dashboard/admin/publications');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!isUuid(id)) return;
    loadPublication();
    loadChartsCatalog();
  }, [loadPublication]);

  const loadChartsCatalog = async () => {
    try {
      const res = await chartsCatalogApi.getCatalog();
      setChartsCatalog(res.data?.charts || []);
    } catch {}
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      await publicationsApi.update(id, {
        title,
        subtitle: subtitle || undefined,
        excerpt,
        access_tier: accessTier,
        content_json: contentBlocks,
        key_findings: keyFindings,
        sectors: selectedSectors,
        topics: selectedTopics,
        regions: selectedRegions,
        seo_title: seoTitle || undefined,
        seo_description: seoDescription || undefined,
      });
      await loadPublication();
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!confirm('Publish this publication?')) return;
    setSaving(true);
    try {
      await handleSave();
      await publicationsApi.publish(id);
      await loadPublication();
    } catch {
      alert('Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  // ── Content Block Helpers ────────────────────────────────
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

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= contentBlocks.length) return;
    const copy = [...contentBlocks];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setContentBlocks(copy);
  };

  const addBlock = (type: ContentBlock['type']) => {
    setContentBlocks((prev) => [
      ...prev,
      { id: generateId(), type, content: '', aiGenerated: false },
    ]);
  };

  const addChartBlock = (chart: ChartCatalogItem) => {
    setContentBlocks((prev) => [
      ...prev,
      {
        id: generateId(),
        type: 'chart',
        content: chart.title,
        metadata: {
          chartId: chart.id,
          endpoint: chart.endpoint,
          chartType: chart.chartType,
          component: chart.component,
        },
        aiGenerated: false,
      },
    ]);
  };

  // ── AI Helpers ───────────────────────────────────────────
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
      alert('AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const generateSeo = async () => {
    setAiLoading(true);
    try {
      const res = await aiContentApi.generateSeo({ title, excerpt });
      setSeoTitle(res.data?.seoTitle || '');
      setSeoDescription(res.data?.seoDescription || '');
    } catch {
      alert('SEO generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="h-96 bg-zinc-900 border border-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!publication) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white font-mono truncate max-w-[400px]">
            {publication.title}
          </h1>
          <span
            className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded ${
              STATUS_COLORS[publication.status] || 'bg-zinc-700 text-zinc-300'
            }`}
          >
            {publication.status}
          </span>
          <span
            className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase border rounded ${
              TYPE_CATEGORY[publication.type] === 'press'
                ? 'bg-amber-900/30 text-amber-400 border-amber-800'
                : 'bg-blue-900/30 text-blue-400 border-blue-800'
            }`}
            title={`Will appear at ${TYPE_WEBSITE_PATH[publication.type] || '/insights'}`}
          >
            {TYPE_CATEGORY[publication.type] || 'insights'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-mono text-zinc-300 border border-zinc-700 rounded hover:border-white hover:text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          {publication.status !== 'published' && (
            <button
              onClick={handlePublish}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-mono font-bold text-white bg-red-600 rounded hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              Publish
            </button>
          )}
          {publication.status === 'published' && publication.slug && (
            <a
              href={`/insights/${publication.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-mono text-green-400 border border-green-800 rounded hover:bg-green-900/30"
            >
              View Live ({TYPE_WEBSITE_PATH[publication.type] || '/insights'}) →
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800">
        {(['content', 'meta', 'charts', 'seo'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-mono capitalize transition-colors ${
              activeTab === tab
                ? 'text-white border-b-2 border-red-600'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Content Tab ──────────────────────────────────── */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded text-white focus:outline-none focus:border-red-600 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Subtitle
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-white text-sm focus:outline-none focus:border-red-600 font-mono"
            />
          </div>
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

          {/* Key Findings */}
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

          {/* Content Blocks */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                Content Blocks ({contentBlocks.length})
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => addBlock('heading')}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white border border-zinc-700 px-2 py-1 rounded"
                >
                  + Heading
                </button>
                <button
                  onClick={() => addBlock('text')}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white border border-zinc-700 px-2 py-1 rounded"
                >
                  + Text
                </button>
                <button
                  onClick={() => addBlock('callout')}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white border border-zinc-700 px-2 py-1 rounded"
                >
                  + Callout
                </button>
                <button
                  onClick={() => addBlock('quote')}
                  className="text-[10px] font-mono text-zinc-500 hover:text-white border border-zinc-700 px-2 py-1 rounded"
                >
                  + Quote
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {contentBlocks.map((block, idx) => (
                <div
                  key={block.id}
                  className={`bg-zinc-900 border rounded p-4 ${
                    block.type === 'chart'
                      ? 'border-blue-800'
                      : block.type === 'callout'
                      ? 'border-amber-800'
                      : block.type === 'quote'
                      ? 'border-zinc-600'
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
                            : block.type === 'quote'
                            ? 'bg-zinc-700 text-zinc-400'
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
                          ? 'Key insight...'
                          : block.type === 'quote'
                          ? 'Quoted text...'
                          : 'Write content...'
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Meta Tab ─────────────────────────────────────── */}
      {activeTab === 'meta' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4">
            <h3 className="text-sm font-mono text-white font-bold">
              Publication Info
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-zinc-600">Type:</span>{' '}
                <span className="text-white">
                  {TYPE_LABELS[publication.type] || publication.type}
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Category:</span>{' '}
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border rounded ${
                  TYPE_CATEGORY[publication.type] === 'press'
                    ? 'bg-amber-900/30 text-amber-400 border-amber-800'
                    : 'bg-blue-900/30 text-blue-400 border-blue-800'
                }`}>
                  {TYPE_CATEGORY[publication.type] || 'insights'}
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Website Path:</span>{' '}
                <span className="text-zinc-400">
                  {TYPE_WEBSITE_PATH[publication.type] || '/insights'}
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Status:</span>{' '}
                <span className="text-white capitalize">
                  {publication.status}
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Created:</span>{' '}
                <span className="text-white">
                  {new Date(publication.created_at).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Updated:</span>{' '}
                <span className="text-white">
                  {new Date(publication.updated_at).toLocaleString()}
                </span>
              </div>
              {publication.published_at && (
                <div>
                  <span className="text-zinc-600">Published:</span>{' '}
                  <span className="text-white">
                    {new Date(publication.published_at).toLocaleString()}
                  </span>
                </div>
              )}
              <div>
                <span className="text-zinc-600">Words:</span>{' '}
                <span className="text-white">{publication.word_count}</span>
              </div>
              <div>
                <span className="text-zinc-600">Reading Time:</span>{' '}
                <span className="text-white">
                  {publication.reading_time_minutes} min
                </span>
              </div>
              <div>
                <span className="text-zinc-600">Slug:</span>{' '}
                <span className="text-white">{publication.slug}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Access Tier
            </label>
            <div className="flex gap-3">
              {ACCESS_TIERS.map((t) => (
                <button
                  key={t}
                  onClick={() => setAccessTier(t)}
                  className={`px-4 py-2 text-xs font-mono border rounded capitalize transition-colors ${
                    accessTier === t
                      ? 'border-red-600 bg-red-900/20 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <TagSelector
            label="Sectors"
            options={SECTORS}
            selected={selectedSectors}
            onToggle={(v) =>
              setSelectedSectors((p) =>
                p.includes(v) ? p.filter((x) => x !== v) : [...p, v]
              )
            }
          />
          <TagSelector
            label="Topics"
            options={TOPICS}
            selected={selectedTopics}
            onToggle={(v) =>
              setSelectedTopics((p) =>
                p.includes(v) ? p.filter((x) => x !== v) : [...p, v]
              )
            }
          />
          <TagSelector
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

      {/* ── Charts Tab ───────────────────────────────────── */}
      {activeTab === 'charts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
              Embedded Charts ({contentBlocks.filter((b) => b.type === 'chart').length})
            </h3>
            <div className="space-y-2">
              {contentBlocks
                .filter((b) => b.type === 'chart')
                .map((block) => (
                  <div
                    key={block.id}
                    className="bg-zinc-900 border border-blue-800 rounded p-3"
                  >
                    <div className="text-xs text-white font-mono font-bold">
                      📊 {block.content}
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono">
                      {(block.metadata as Record<string, unknown>)?.endpoint as string}
                    </div>
                    <button
                      onClick={() => removeBlock(block.id)}
                      className="text-[10px] font-mono text-red-500 hover:text-red-400 mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              {contentBlocks.filter((b) => b.type === 'chart').length === 0 && (
                <div className="text-xs text-zinc-500 font-mono text-center py-8 bg-zinc-900 border border-zinc-800 rounded">
                  No charts inserted yet. Pick from the catalog →
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
              Chart Catalog
            </h3>
            <div className="bg-zinc-900 border border-zinc-800 rounded max-h-[500px] overflow-y-auto">
              {chartsCatalog.length === 0 ? (
                <div className="p-4 text-xs text-zinc-500 font-mono text-center">
                  Loading catalog...
                </div>
              ) : (
                chartsCatalog.map((chart) => {
                  const isAdded = contentBlocks.some(
                    (b) =>
                      b.type === 'chart' &&
                      (b.metadata as Record<string, unknown>)?.chartId === chart.id
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
                        onClick={() => addChartBlock(chart)}
                        disabled={isAdded}
                        className={`mt-1 text-[10px] font-mono ${
                          isAdded
                            ? 'text-green-500'
                            : 'text-blue-400 hover:text-blue-300'
                        }`}
                      >
                        {isAdded ? '✓ Added' : '+ Insert'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SEO Tab ──────────────────────────────────────── */}
      {activeTab === 'seo' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono text-white font-bold">
              SEO Metadata
            </h3>
            <button
              onClick={generateSeo}
              disabled={aiLoading}
              className="text-xs font-mono text-purple-400 hover:text-purple-300 border border-purple-800 px-3 py-1.5 rounded"
            >
              {aiLoading ? '⟳ Generating...' : '⟳ Auto-generate with AI'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              SEO Title
            </label>
            <input
              type="text"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="Defaults to publication title if left blank"
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded text-white text-sm focus:outline-none focus:border-red-600 font-mono"
            />
            <div className="text-[10px] text-zinc-600 font-mono mt-1">
              {seoTitle.length}/60 characters
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              SEO Description
            </label>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
              placeholder="Defaults to excerpt if left blank"
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded text-white text-sm focus:outline-none focus:border-red-600 font-mono resize-none"
            />
            <div className="text-[10px] text-zinc-600 font-mono mt-1">
              {seoDescription.length}/160 characters
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Google Preview
            </label>
            <div className="bg-white rounded p-4">
              <div className="text-blue-800 text-lg font-medium truncate">
                {seoTitle || title}
              </div>
              <div className="text-green-700 text-xs">
                propmetrik.com/insights/{publication.slug}
              </div>
              <div className="text-zinc-600 text-sm mt-1 line-clamp-2">
                {seoDescription || excerpt || 'No description set'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Bar */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-xs font-mono text-zinc-300 border border-zinc-700 rounded hover:border-white hover:text-white disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {publication.status !== 'published' && (
          <button
            onClick={handlePublish}
            disabled={saving}
            className="px-4 py-2 text-xs font-mono font-bold text-white bg-red-600 rounded hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            Publish
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tag Selector Component ──────────────────────────────────
function TagSelector({
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
      <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
        {label}{' '}
        <span className="text-zinc-700">({selected.length})</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
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
