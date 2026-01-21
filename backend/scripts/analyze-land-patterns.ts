import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik'
});

async function main() {
  console.log('=== Analyzing ALL Land Property Titles ===\n');
  
  // Get all land properties to see what patterns exist
  const lands = await pool.query(`
    SELECT 
      id, 
      title,
      description,
      region,
      price,
      land_area_sqm,
      total_area_sqm,
      plot_size_acres
    FROM properties 
    WHERE property_type::text = 'land'
    ORDER BY price DESC NULLS LAST
  `);
  
  console.log(`Total land properties: ${lands.rows.length}\n`);
  
  // Patterns to check
  const patterns = {
    'NxM format (70x100)': /(\d+)\s*[xX×]\s*(\d+)/,
    'Acres (5 acres)': /(\d+(?:\.\d+)?)\s*acres?/i,
    'Plots (2 plots)': /(\d+)\s*plots?/i,
    'Sqm (500 sqm)': /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:sqm|sq\.?\s*m|square\s*met)/i,
    'Sqft (5000 sqft)': /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:sqft|sq\.?\s*ft|square\s*f)/i,
    'Hectares': /(\d+(?:\.\d+)?)\s*(?:hectares?|ha)/i,
  };
  
  const categorized: { [key: string]: any[] } = {
    'NxM format (70x100)': [],
    'Acres (5 acres)': [],
    'Plots (2 plots)': [],
    'Sqm (500 sqm)': [],
    'Sqft (5000 sqft)': [],
    'Hectares': [],
    'No pattern found': [],
  };
  
  for (const row of lands.rows) {
    const text = `${row.title || ''} ${row.description || ''}`;
    let matched = false;
    
    for (const [patternName, regex] of Object.entries(patterns)) {
      const match = text.match(regex);
      if (match) {
        categorized[patternName].push({
          id: row.id,
          title: row.title?.substring(0, 60),
          match: match[0],
          value: match[1],
          price: row.price,
          region: row.region,
        });
        matched = true;
        break; // Only categorize once
      }
    }
    
    if (!matched) {
      categorized['No pattern found'].push({
        id: row.id,
        title: row.title?.substring(0, 80),
        price: row.price,
        region: row.region,
      });
    }
  }
  
  console.log('=== Pattern Analysis ===\n');
  for (const [pattern, items] of Object.entries(categorized)) {
    console.log(`${pattern}: ${items.length} properties`);
    if (items.length > 0 && items.length <= 15) {
      items.forEach((item: any) => {
        console.log(`  - ${item.region}: "${item.title}" ${item.match ? `[${item.match}]` : ''}`);
      });
    } else if (items.length > 15) {
      items.slice(0, 5).forEach((item: any) => {
        console.log(`  - ${item.region}: "${item.title}" ${item.match ? `[${item.match}]` : ''}`);
      });
      console.log(`  ... and ${items.length - 5} more`);
    }
    console.log('');
  }
  
  // Show some "no pattern" examples
  console.log('\n=== Sample "No Pattern" Titles (need manual review) ===\n');
  categorized['No pattern found'].slice(0, 20).forEach((item: any) => {
    console.log(`  ${item.region}: "${item.title}"`);
  });
  
  await pool.end();
}

main().catch(console.error);
