import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { Pool } from 'pg';
import https from 'https';
import http from 'http';

// ============================================================
// 1. PostgreSQL
// ============================================================
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// 2. ClickHouse (via pg wire protocol on port 5433)
// ============================================================
const chPool = new Pool({ connectionString: process.env.CLICKHOUSE_URL });

// ============================================================
// 3. OpenSearch helper
// ============================================================
function opensearchRequest(pathStr: string): Promise<any> {
  const osUrl = process.env.OPENSEARCH_URL;
  if (!osUrl) throw new Error('OPENSEARCH_URL not set');
  const url = new URL(pathStr, osUrl);
  
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(url.toString(), { 
      rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk: any) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function diagnose() {
  console.log('='.repeat(70));
  console.log('PROPMETRIK DATA STORE DIAGNOSTIC');
  console.log('='.repeat(70));
  console.log('PG:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
  console.log('OS:', process.env.OPENSEARCH_URL?.replace(/:[^:@]+@/, ':***@'));
  console.log('CH:', process.env.CLICKHOUSE_URL?.replace(/:[^:@]+@/, ':***@'));
  console.log();

  // ============================================================
  // POSTGRESQL
  // ============================================================
  console.log('='.repeat(70));
  console.log('POSTGRESQL');
  console.log('='.repeat(70));

  try {
    // All schemas
    const schemas = await pgPool.query(`SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`);
    console.log('\nSchemas:', schemas.rows.map((r: any) => r.schema_name).join(', '));

    // Properties count by partition
    const propCount = await pgPool.query(`
      SELECT 'properties (total)' as tbl, COUNT(*) as cnt FROM properties
      UNION ALL SELECT 'properties_greater_accra', COUNT(*) FROM properties_greater_accra
      UNION ALL SELECT 'properties_kumasi_metro', COUNT(*) FROM properties_kumasi_metro
      UNION ALL SELECT 'properties_eastern', COUNT(*) FROM properties_eastern
      UNION ALL SELECT 'properties_western_cluster', COUNT(*) FROM properties_western_cluster
      UNION ALL SELECT 'properties_northern_cluster', COUNT(*) FROM properties_northern_cluster
    `);
    console.log('\n--- Properties by partition ---');
    propCount.rows.forEach((r: any) => console.log(`  ${r.tbl}: ${r.cnt}`));

    // Properties by external_source (scraper source)
    const bySrc = await pgPool.query(`
      SELECT external_source, data_source, COUNT(*) as cnt 
      FROM properties 
      GROUP BY external_source, data_source 
      ORDER BY cnt DESC
    `);
    console.log('\n--- Properties by external_source ---');
    bySrc.rows.forEach((r: any) => console.log(`  ${r.external_source || '(null)'} / ${r.data_source || '(null)'}: ${r.cnt}`));

    // Filter breakdown
    const filters = await pgPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as has_coords,
        COUNT(*) FILTER (WHERE transaction_type = 'sale') as is_sale,
        COUNT(*) FILTER (WHERE COALESCE(inferred_sale_price, price) > 0) as has_price,
        COUNT(*) FILTER (WHERE built_area_sqm IS NOT NULL OR total_area_sqm IS NOT NULL) as has_size,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 months') as recent_24m,
        COUNT(*) FILTER (WHERE 
          latitude IS NOT NULL AND longitude IS NOT NULL 
          AND transaction_type = 'sale'
          AND COALESCE(inferred_sale_price, price) > 0
          AND created_at >= NOW() - INTERVAL '24 months'
        ) as fully_eligible
      FROM properties
    `);
    console.log('\n--- Filter breakdown ---');
    console.log(JSON.stringify(filters.rows[0], null, 2));

    // Check all non-public schemas for property tables
    for (const s of schemas.rows) {
      const sn = s.schema_name;
      if (['information_schema', 'pg_catalog', 'pg_toast', 'public'].includes(sn)) continue;
      const stables = await pgPool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = $1 ORDER BY table_name
      `, [sn]);
      if (stables.rows.length > 0) {
        console.log(`\n--- Schema "${sn}" tables ---`);
        for (const t of stables.rows) {
          try {
            const cnt = await pgPool.query(`SELECT COUNT(*) as cnt FROM "${sn}"."${t.table_name}"`);
            console.log(`  ${sn}.${t.table_name}: ${cnt.rows[0].cnt} rows`);
          } catch (e: any) {
            console.log(`  ${sn}.${t.table_name}: ERROR - ${e.message.split('\n')[0]}`);
          }
        }
      }
    }

    // Check comparable_properties_with_weights
    try {
      const cpw = await pgPool.query(`SELECT COUNT(*) as cnt FROM comparable_properties_with_weights`);
      console.log(`\ncomparable_properties_with_weights: ${cpw.rows[0].cnt} rows`);
      if (parseInt(cpw.rows[0].cnt) > 0) {
        const cpwSample = await pgPool.query(`SELECT * FROM comparable_properties_with_weights LIMIT 3`);
        cpwSample.rows.forEach((r: any, i: number) => {
          console.log(`  Comp ${i+1}:`, JSON.stringify(r).substring(0, 300));
        });
      }
    } catch (e: any) {
      console.log(`comparable_properties_with_weights: ${e.message.split('\n')[0]}`);
    }

  } catch (e: any) {
    console.error('PostgreSQL Error:', e.message);
  }

  // ============================================================
  // OPENSEARCH
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('OPENSEARCH');
  console.log('='.repeat(70));

  try {
    // Cluster health
    const health = await opensearchRequest('/_cluster/health');
    console.log('Cluster:', health.cluster_name, '| Status:', health.status, '| Nodes:', health.number_of_nodes);

    // List all indices
    const catIndices = await opensearchRequest('/_cat/indices?format=json&h=index,docs.count,store.size,health');
    console.log('\n--- All indices ---');
    if (Array.isArray(catIndices)) {
      catIndices
        .sort((a: any, b: any) => (b['docs.count'] || 0) - (a['docs.count'] || 0))
        .forEach((idx: any) => console.log(`  ${idx.index}: ${idx['docs.count']} docs, ${idx['store.size']}`));
    } else {
      console.log('  Response:', JSON.stringify(catIndices).substring(0, 500));
    }

    // Check propmetrik_properties index specifically
    const prefix = process.env.OPENSEARCH_INDEX_PREFIX || 'propmetrik_';
    const propIdx = `${prefix}properties`;
    try {
      const propCount = await opensearchRequest(`/${propIdx}/_count`);
      console.log(`\n--- ${propIdx} index ---`);
      console.log(`  Document count: ${propCount.count}`);

      // Get mapping/schema
      try {
        const mapping = await opensearchRequest(`/${propIdx}/_mapping`);
        const props = mapping[propIdx]?.mappings?.properties || {};
        console.log(`\n  Fields in mapping:`);
        Object.entries(props).forEach(([k, v]: [string, any]) => {
          console.log(`    ${k}: ${v.type || JSON.stringify(v).substring(0, 100)}`);
        });
      } catch (e: any) {
        console.log('  Mapping error:', e.message);
      }

      // Sample documents with ALL fields
      const sample = await opensearchRequest(`/${propIdx}/_search?size=5`);
      if (sample.hits && sample.hits.hits) {
        console.log(`\n  Total hits: ${sample.hits.total?.value || sample.hits.total}`);
        sample.hits.hits.forEach((hit: any, i: number) => {
          const src = hit._source;
          console.log(`\n  Doc ${i+1} (id: ${hit._id}):`);
          Object.entries(src).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '' && v !== 'N/A') {
              const val = typeof v === 'object' ? JSON.stringify(v) : v;
              console.log(`    ${k}: ${val}`);
            }
          });
        });
      }

      // Aggregation: transaction_type distribution
      try {
        const aggBody = JSON.stringify({
          size: 0,
          aggs: {
            tx_types: { terms: { field: "transaction_type", size: 20 } },
            prop_types: { terms: { field: "property_type", size: 20 } },
            regions: { terms: { field: "region", size: 20 } },
            has_coords: { filter: { bool: { must: [
              { exists: { field: "latitude" } },
              { exists: { field: "longitude" } }
            ]}}},
            has_price: { filter: { range: { price: { gt: 0 } } } },
            has_location: { filter: { exists: { field: "location" } } }
          }
        });
        
        const osUrl = process.env.OPENSEARCH_URL;
        const url = new URL(`/${propIdx}/_search`, osUrl!);
        const aggResult: any = await new Promise((resolve, reject) => {
          const mod = url.protocol === 'https:' ? https : http;
          const req = mod.request(url.toString(), {
            method: 'POST',
            rejectUnauthorized: false,
            headers: { 'Content-Type': 'application/json' }
          }, (res) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
          });
          req.on('error', reject);
          req.write(aggBody);
          req.end();
        });

        if (aggResult.aggregations) {
          const aggs = aggResult.aggregations;
          console.log('\n  --- Aggregations ---');
          console.log('  Transaction types:', JSON.stringify(aggs.tx_types?.buckets));
          console.log('  Property types:', JSON.stringify(aggs.prop_types?.buckets));
          console.log('  Regions:', JSON.stringify(aggs.regions?.buckets));
          console.log('  Has coordinates:', aggs.has_coords?.doc_count);
          console.log('  Has price > 0:', aggs.has_price?.doc_count);
          console.log('  Has location field:', aggs.has_location?.doc_count);
        }
      } catch (e: any) {
        console.log('  Aggregation error:', e.message);
      }
    } catch (e: any) {
      console.log(`  ${propIdx}: ${e.message}`);
      // Try listing indices with prefix
      try {
        const prefixIndices = await opensearchRequest(`/_cat/indices/${prefix}*?format=json&h=index,docs.count`);
        console.log(`  Indices with prefix "${prefix}":`);
        if (Array.isArray(prefixIndices)) {
          prefixIndices.forEach((idx: any) => console.log(`    ${idx.index}: ${idx['docs.count']} docs`));
        }
      } catch {}
    }

    // Also check for any other property-related indices
    try {
      const allPropIdx = await opensearchRequest('/_cat/indices/*propert*?format=json&h=index,docs.count');
      if (Array.isArray(allPropIdx) && allPropIdx.length > 0) {
        console.log('\n--- All property-related indices ---');
        allPropIdx.forEach((idx: any) => console.log(`  ${idx.index}: ${idx['docs.count']} docs`));
      }
    } catch {}

  } catch (e: any) {
    console.error('OpenSearch Error:', e.message);
  }

  // ============================================================
  // CLICKHOUSE
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('CLICKHOUSE');
  console.log('='.repeat(70));

  try {
    const chTables = await chPool.query(`
      SELECT name as table_name
      FROM system.tables 
      WHERE database = currentDatabase()
      ORDER BY name
    `);
    console.log('\n--- ClickHouse tables ---');
    for (const t of chTables.rows) {
      try {
        const cnt = await chPool.query(`SELECT count() as cnt FROM "${t.table_name}"`);
        console.log(`  ${t.table_name}: ${cnt.rows[0].cnt} rows`);
      } catch (e: any) {
        console.log(`  ${t.table_name}: ERROR - ${e.message.split('\n')[0]}`);
      }
    }
  } catch (e: any) {
    console.error('ClickHouse Error:', e.message);
  }

  // ============================================================
  // CLEANUP
  // ============================================================
  await pgPool.end().catch(() => {});
  await chPool.end().catch(() => {});
  console.log('\nDone.');
}

diagnose().catch(console.error);
