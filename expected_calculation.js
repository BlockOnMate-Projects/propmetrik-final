// Expected calculation after currency conversion and GFA fixes

const USD_TO_GHS = 15.7

const apiData = [
  { id: 1, sale_price: 250000, currency: 'USD', gfa: 1280, bedrooms: 3 },
  { id: 2, sale_price: 2900000, currency: 'GHS', gfa: 700, bedrooms: 4 }, 
  { id: 3, sale_price: 250000, currency: 'USD', gfa: 0, bedrooms: 4 },    
  { id: 4, sale_price: 250000, currency: 'USD', gfa: 0, bedrooms: 4 }     
]

console.log('=== EXPECTED CALCULATION AFTER FIXES ===')

const processedComparables = apiData.map((comp, i) => {
  const convertedPrice = comp.currency === 'USD' ? comp.sale_price * USD_TO_GHS : comp.sale_price
  const effectiveGFA = comp.gfa && comp.gfa > 0 ? comp.gfa : comp.bedrooms * 65
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

processedComparables.forEach((comp, i) => {
  console.log(`\nComparable ${i+1}:`)
  console.log(`  Original: ${comp.currency} ${comp.originalPrice.toLocaleString()}`)
  console.log(`  Converted: ₵${comp.convertedPrice.toLocaleString()}`)
  console.log(`  Original GFA: ${comp.originalGFA} sqm`)
  console.log(`  Effective GFA: ${comp.effectiveGFA} sqm`)
  console.log(`  Price per sqm: ₵${Math.round(comp.pricePerSqm).toLocaleString()}`)
})

const avgPricePerSqm = processedComparables.reduce((sum, c) => sum + c.pricePerSqm, 0) / processedComparables.length
const subjectGFA = 800
const indicatedValue = avgPricePerSqm * subjectGFA

console.log('\n=== FINAL CALCULATION ===')
console.log('Average price per sqm: ₵' + Math.round(avgPricePerSqm).toLocaleString())
console.log('Subject GFA:', subjectGFA, 'sqm')  
console.log('EXPECTED Indicated Value: ₵' + Math.round(indicatedValue).toLocaleString())
console.log('\nThis should be around ₵5M, NOT ₵91M!')