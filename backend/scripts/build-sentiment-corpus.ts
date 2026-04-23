/**
 * Ghana News RSS Sentiment Corpus Builder
 *
 * Fetches real-estate related articles from Ghana news RSS feeds,
 * filters by property/market keywords, then submits each article
 * to the ML sentiment analysis endpoint — which scores and persists
 * them in `ml_sentiment_analysis` for downstream trend/confidence use.
 *
 * Sources:
 *   - Myjoyonline Business  (https://www.myjoyonline.com/feed/)
 *   - CitiFM Business       (https://citifmonline.com/feed/)
 *   - GhanaWeb Business     (https://www.ghanaweb.com/GhanaHomePage/business/rss.php)
 *   - Graphic Online        (https://www.graphic.com.gh/business/feed)
 *   - Ghana News Agency     (https://www.ghananewsagency.org/rss)
 *
 * Usage:
 *   npx ts-node scripts/build-sentiment-corpus.ts
 *   npx ts-node scripts/build-sentiment-corpus.ts --days 90 --limit 500
 *   npx ts-node scripts/build-sentiment-corpus.ts --dry-run
 */

import axios from 'axios';

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(getArg('--limit', '300'), 10);
const ML_URL = getArg('--ml-url', 'http://localhost:8000');
const CONCURRENCY = 3;       // simultaneous analyze requests
const DELAY_MS = 800;        // between requests — be nice to local ML server

// ─── RSS Sources ─────────────────────────────────────────────────────────────
interface RssSource {
  name: string;
  url: string;
  region: string;
  source_type: 'news';
}

const SOURCES: RssSource[] = [
  {
    name: 'Myjoyonline',
    url: 'https://www.myjoyonline.com/feed/',
    region: 'greater_accra',
    source_type: 'news',
  },
  {
    name: 'CitiFM',
    url: 'https://citifmonline.com/feed/',
    region: 'greater_accra',
    source_type: 'news',
  },
  {
    name: 'GhanaWeb Business',
    url: 'https://www.ghanaweb.com/GhanaHomePage/business/rss.php',
    region: 'greater_accra',
    source_type: 'news',
  },
  {
    name: 'Graphic Online',
    url: 'https://www.graphic.com.gh/business/feed',
    region: 'greater_accra',
    source_type: 'news',
  },
  {
    name: 'Ghana News Agency',
    url: 'https://ghananewsagency.org/rss',
    region: 'greater_accra',
    source_type: 'news',
  },
];

// ─── Property keyword filter ──────────────────────────────────────────────────
// Articles must contain at least one keyword to be relevant
const KEYWORDS = [
  'property', 'properties', 'real estate', 'housing', 'house', 'apartment', 'flat',
  'mortgage', 'rent', 'rental', 'landlord', 'tenant', 'lease',
  'land', 'plot', 'acre', 'hectare',
  'construction', 'building', 'developer', 'development',
  'accra', 'kumasi', 'takoradi', 'tema',
  'affordable housing', 'ghanaian home', 'property market', 'estate',
  'valuation', 'title deed', 'land bank', 'lands commission', 'stanbic',
  'home loan', 'mortgage bank', 'hfc bank', 'ghb', 'societe generale',
  'price per sqm', 'transaction', 'listing', 'commission',
];

function isPropertyRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Article {
  title: string;
  url: string;
  published: string;
  text: string;
  region: string;
  source_name: string;
}

// ─── Lightweight RSS/Atom parser (no external deps) ──────────────────────────
function extractTag(xml: string, tag: string): string {
  // Handle CDATA and plain content
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))`, 'i');
  const m = re.exec(xml);
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

function parseRssItems(xml: string): Array<{ title: string; link: string; pubDate: string; description: string }> {
  const results: Array<{ title: string; link: string; pubDate: string; description: string }> = [];

  // Match <item> or <entry> blocks
  const itemRe = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
    const description = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content');

    // Link can be <link href="..."/> (Atom) or <link>...</link>
    let link = extractTag(block, 'link');
    if (!link) {
      const hrefMatch = /<link[^>]+href="([^"]+)"/.exec(block);
      link = hrefMatch?.[1] ?? '';
    }

    results.push({ title, link, pubDate, description });
  }
  return results;
}



async function fetchRss(source: RssSource): Promise<Article[]> {
  try {
    const resp = await axios.get(source.url, {
      headers: { 'User-Agent': 'PropMetrik-CorpusBot/1.0 (research; contact@propmetrik.com)' },
      timeout: 15000,
      responseType: 'text',
    });

    const items = parseRssItems(resp.data as string);

    const articles: Article[] = [];
    for (const item of items) {
      const { title, link, pubDate, description } = item;

      // Strip HTML tags for plain text
      const text = (title + ' ' + description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (text.length < 50) continue;
      if (!isPropertyRelated(text)) continue;

      articles.push({
        title,
        url: link,
        published: pubDate,
        text: text.slice(0, 4000),
        region: source.region,
        source_name: source.name,
      });
    }

    return articles;
  } catch (err: any) {
    console.warn(`  [${source.name}] RSS fetch failed: ${err.message}`);
    return [];
  }
}

// ─── Sentiment submit ─────────────────────────────────────────────────────────
interface SubmitResult {
  url: string;
  sentiment: string;
  score: number;
  confidence: number;
}

async function submitToSentimentApi(article: Article): Promise<SubmitResult | null> {
  try {
    const resp = await axios.post(
      `${ML_URL}/api/v1/ml/sentiment/analyze`,
      {
        text: article.text,
        source_type: 'news',
        source_url: article.url,
        region_filter: article.region,
      },
      { timeout: 20000 }
    );
    const r = resp.data;
    return {
      url: article.url,
      sentiment: r.sentiment?.overall || 'neutral',
      score: r.sentiment?.score ?? 0,
      confidence: r.sentiment?.confidence ?? 0,
    };
  } catch (err: any) {
    // 409 conflict = already analyzed (request_id dedup) — not an error
    if (err.response?.status === 409) return null;
    console.warn(`  Analyze failed for ${article.url.slice(0, 60)}: ${err.message}`);
    return null;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Concurrency helper ───────────────────────────────────────────────────────
async function processBatch<T, R>(
  items: T[],
  worker: (item: T) => Promise<R | null>,
  concurrency: number,
  delayMs: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(worker));
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value !== null) {
        results.push(s.value as R);
      }
    }
    await sleep(delayMs);
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Ghana News Sentiment Corpus Builder');
  console.log('═══════════════════════════════════════════════════════');
  console.log(` ML endpoint: ${ML_URL}  |  Limit: ${LIMIT}  |  Dry-run: ${DRY_RUN}\n`);

  // Health check
  try {
    await axios.get(`${ML_URL}/health`, { timeout: 5000 });
    console.log('ML service: online\n');
  } catch {
    console.error(`ML service unreachable at ${ML_URL}. Start it with: bash /tmp/start-ml.sh`);
    process.exit(1);
  }

  // Fetch all RSS sources
  console.log('Fetching RSS feeds...');
  const allArticles: Article[] = [];
  for (const source of SOURCES) {
    const articles = await fetchRss(source);
    console.log(`  ${source.name}: ${articles.length} property-related articles`);
    allArticles.push(...articles);
    await sleep(500);
  }

  // Dedup by URL
  const seen = new Set<string>();
  const unique = allArticles.filter(a => {
    if (!a.url || seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  const toProcess = unique.slice(0, LIMIT);
  console.log(`\n Total after dedup: ${unique.length} | Processing: ${toProcess.length}\n`);

  if (DRY_RUN) {
    console.log('[DRY RUN] Sample articles:');
    toProcess.slice(0, 5).forEach((a, i) => {
      console.log(`  ${i + 1}. [${a.source_name}] ${a.title.slice(0, 70)}`);
    });
    console.log('\n[DRY RUN] No sentiment analysis sent. Re-run without --dry-run.');
    return;
  }

  console.log('Submitting to sentiment analysis...');
  let processed = 0;
  const sentiments: Record<string, number> = {};

  const results = await processBatch<Article, SubmitResult>(
    toProcess,
    async (article) => {
      const result = await submitToSentimentApi(article);
      processed++;
      if (processed % 10 === 0) process.stdout.write(`  ${processed}/${toProcess.length}...\r`);
      return result;
    },
    CONCURRENCY,
    DELAY_MS
  );

  // Tally sentiment distribution
  for (const r of results) {
    sentiments[r.sentiment] = (sentiments[r.sentiment] || 0) + 1;
  }

  console.log(`\n\n═══════════════════════════════════════════════════════`);
  console.log(` Corpus build complete`);
  console.log(`  Articles fetched: ${allArticles.length}`);
  console.log(`  Unique property articles: ${unique.length}`);
  console.log(`  Successfully analyzed: ${results.length}`);
  console.log(`  Sentiment distribution:`);
  for (const [s, n] of Object.entries(sentiments).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${s}: ${n}`);
  }
  const avgScore = results.length > 0
    ? results.reduce((s, r) => s + r.score, 0) / results.length
    : 0;
  console.log(`  Avg sentiment score: ${avgScore.toFixed(3)}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Check if fast-xml-parser is installed
  console.log('Results are stored in ml_sentiment_analysis and feed the market confidence endpoint.');
  console.log('Run again periodically (e.g. daily cron) to keep the corpus current.\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
