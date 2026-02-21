const {Pool} = require('pg');
const p = new Pool({connectionString:'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik'});
const PUB_ID='d6df132f-0518-4d9d-9823-71c924fc9d2e';
p.query('SELECT content_html FROM publications WHERE id=$1',[PUB_ID]).then(r=>{
  const html=r.rows[0].content_html;

  // Find all SVG tags
  const svgMatches = html.match(/<svg[^>]*>/g) || [];
  console.log('Total <svg> tags:', svgMatches.length);

  // Find chart containers with data-chart-type
  const chartTypeMatches = html.match(/data-chart-type="([^"]*)"/g) || [];
  console.log('\ndata-chart-type count:', chartTypeMatches.length);
  const types = {};
  chartTypeMatches.forEach(t => {
    const type = t.match(/"([^"]*)"/)[1];
    types[type] = (types[type] || 0) + 1;
  });
  console.log('Types:', types);
  console.log('Distinct types:', Object.keys(types).length);

  // Find chart titles from h4 or data-chart-title
  const titleMatches = html.match(/data-chart-title="([^"]*)"/g) || [];
  const h4Matches = html.match(/<h4[^>]*>([^<]*)<\/h4>/g) || [];
  console.log('\nChart titles (data-attr):', titleMatches.length);
  titleMatches.forEach(t => console.log('  ', t));
  console.log('H4 titles near charts:', h4Matches.length);
  h4Matches.forEach(t => console.log('  ', t));

  // Find publication-chart divs and extract nearby context
  const chartDivRegex = /class="publication-chart"[^>]*>[\s\S]{0,500}/g;
  const chartDivs = html.match(chartDivRegex) || [];
  console.log('\npublication-chart divs:', chartDivs.length);
  chartDivs.forEach((d, i) => {
    const typeM = d.match(/data-chart-type="([^"]*)"/);
    const titleM = d.match(/data-chart-title="([^"]*)"/);
    const metricM = d.match(/data-metric="([^"]*)"/);
    console.log('  Chart ' + (i+1) + ': type=' + (typeM?typeM[1]:'?') + ' title=' + (titleM?titleM[1]:'?') + ' metric=' + (metricM?metricM[1]:'?'));
  });

  // Rental mentions
  const rentalRe=/rental|rent |cap.?rate|yield|noi|vacancy|lease|benchmark/gi;
  const rentalMatches=html.match(rentalRe)||[];
  console.log('\nRental mentions:', rentalMatches.length);

  // URL leaks
  const urlRe=/localhost|127\.0\.0\.1|\/api\/v1\//g;
  const urlMatches=html.match(urlRe)||[];
  console.log('URL leaks:', urlMatches.length);

  // AI-Synth
  const aiSynth=html.match(/AI.?SYNTH/gi)||[];
  console.log('AI-Synth badges:', aiSynth.length);

  // Rental in chart types/titles
  const rentalCharts = chartTypeMatches.map((t, i) => {
    const div = chartDivs[i] || '';
    return { type: t, div };
  }).filter(c => /rent|cap.?rate|yield|benchmark|vacancy/i.test(c.div));
  console.log('\nRental charts:', rentalCharts.length);
  rentalCharts.forEach(c => console.log('  * ' + c.type));

  p.end();
});
