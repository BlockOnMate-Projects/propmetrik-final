// Debug the valuation calculation - EXPECTED AFTER FIXES
// Based on the ACTUAL API data with proper currency conversion and GFA handling

const USD_TO_GHS = 15.7 // Exchange rate used in frontend

console.log('=== EXPECTED CALCULATION AFTER FIXES ===')
console.log('USD to GHS rate:', USD_TO_GHS)

// Raw data from API
const apiData = [
  { id: 1, sale_price: 250000, currency: 'USD', gfa: 1280, bedrooms: 3 },
  { id: 2, sale_price: 2900000, currency: 'GHS', gfa: 700, bedrooms: 4 }, 
  { id: 3, sale_price: 250000, currency: 'USD', gfa: 0, bedrooms: 4 },    // Missing GFA
  { id: 4, sale_price: 250000, currency: 'USD', gfa: 0, bedrooms: 4 }     // Missing GFA  
]

// Process with frontend logic
const processedComparables = apiData.map((comp, i) => {
  // Currency conversion
  const convertedPrice = comp.currency === 'USD' ? comp.sale_price * USD_TO_GHS : comp.sale_price
  
  // GFA fallback logic
  const effectiveGFA = comp.gfa && comp.gfa > 0 ? comp.gfa : comp.bedrooms * 65  // 65 sqm per bedroom
  
  const pricePerSqm = convertedPrice / effectiveGFA
  
  return {
    id: i + 1,
    originalPrice: comp.sale_price,
    currency: comp.currency,
    convertedPrice,
    originalGFA: comp.gfa,
    effectiveGFA,
    pricePerSqm
  }
})

const subjectGFA = 800 // From screenshot

console.log('\nProcessed Comparables:')
processedComparables.forEach((comp, i) => {
  console.log(`\nComparable ${i+1}:`)
  console.log(`  Original: ${comp.currency} ${comp.originalPrice.toLocaleString()}`)
  console.log(`  Converted: ₵${comp.convertedPrice.toLocaleString()}`)
  console.log(`  Original GFA: ${comp.originalGFA} sqm`)
  console.log(`  Effective GFA: ${comp.effectiveGFA} sqm`)
  console.log(`  Price per sqm: ₵${Math.round(comp.pricePerSqm).toLocaleString()}`)
})

// Calculate averages
const avgPricePerSqm = processedComparables.reduce((sum, c) => sum + c.pricePerSqm, 0) / processedComparables.length
const indicatedValue = avgPricePerSqm * subjectGFA

console.log('\n=== FINAL CALCULATION ===')
console.log('Average price per sqm: ₵' + Math.round(avgPricePerSqm).toLocaleString())
console.log('Subject GFA:', subjectGFA, 'sqm')
console.log('EXPECTED Indicated Value: ₵' + Math.round(indicatedValue).toLocaleString())
console.log('\nThis should be around ₵4.5M - ₵6M, NOT ₵91M!')

const subjectGFA = 800 // From screenshot

console.log('\nProcessed Comparables:')

// Calculate price per sqm for each comparable
comparables.forEach((comp, i) => {
  const pricePerSqm = comp.adjustedPrice / comp.gfa
  console.log(`Comparable ${i+1}:`)
  console.log(`  Sale Price: ₵${comp.sale_price.toLocaleString()}`)
  console.log(`  GFA: ${comp.gfa} sqm`)
  console.log(`  Price per sqm: ₵${pricePerSqm.toLocaleString()}`)
})

// Simple Average Method
const avgPricePerSqm = comparables.reduce((sum, c) => 
  sum + (c.adjustedPrice / c.gfa), 0) / comparables.length

const simpleAverageValue = avgPricePerSqm * subjectGFA

console.log('\n=== SIMPLE AVERAGE METHOD ===')
console.log('Average price per sqm:', avgPricePerSqm.toLocaleString())
console.log('Indicated value:', simpleAverageValue.toLocaleString())

// Median Method
const pricesPerSqm = comparables.map(c => c.adjustedPrice / c.gfa).sort((a, b) => a - b)
const mid = Math.floor(pricesPerSqm.length / 2)
const medianPrice = pricesPerSqm.length % 2 === 0
  ? (pricesPerSqm[mid - 1] + pricesPerSqm[mid]) / 2
  : pricesPerSqm[mid]

const medianValue = medianPrice * subjectGFA

console.log('\n=== MEDIAN METHOD ===')
console.log('Sorted prices per sqm:', pricesPerSqm.map(p => p.toLocaleString()))
console.log('Median price per sqm:', medianPrice.toLocaleString())
console.log('Indicated value:', medianValue.toLocaleString())

// Quality Weighted (simplified - assuming equal quality scores)
console.log('\n=== QUALITY WEIGHTED METHOD ===')
console.log('Using simple average as quality score approximation')
console.log('Indicated value:', simpleAverageValue.toLocaleString())

console.log('\n=== COMPARISON ===')
console.log('Expected range: ₵' + (Math.min(...pricesPerSqm) * subjectGFA).toLocaleString() + ' - ₵' + (Math.max(...pricesPerSqm) * subjectGFA).toLocaleString())
console.log('Current display: ₵91,931,384 (seems incorrect)')