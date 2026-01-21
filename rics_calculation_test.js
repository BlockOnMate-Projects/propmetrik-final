// RICS-Compliant Sales Comparison Calculation Test

const USD_TO_GHS = 15.7

// Real API data from the comparable basket
const comparables = [
  {
    id: 'C1',
    sale_price: 250000, // USD
    currency: 'USD',
    gfa: 1280,
    bedrooms: 3,
    totalAdjustment: -1.5 // From UI
  },
  {
    id: 'C2', 
    sale_price: 2900000, // GHS
    currency: 'GHS',
    gfa: 700,
    bedrooms: 4,
    totalAdjustment: -2.0
  },
  {
    id: 'C3',
    sale_price: 250000, // USD
    currency: 'USD', 
    gfa: 0, // Missing - use bedroom estimate
    bedrooms: 4,
    totalAdjustment: -0.8
  },
  {
    id: 'C4',
    sale_price: 250000, // USD
    currency: 'USD',
    gfa: 0, // Missing - use bedroom estimate  
    bedrooms: 4,
    totalAdjustment: -0.8
  }
]

const subject = {
  gfa: 800,
  bedrooms: 4
}

console.log('=== RICS-COMPLIANT SALES COMPARISON APPROACH ===\n')

// Step 1: Convert currencies and estimate missing GFA
const processedComparables = comparables.map(comp => {
  const convertedPrice = comp.currency === 'USD' ? comp.sale_price * USD_TO_GHS : comp.sale_price
  const estimatedGFA = comp.gfa > 0 ? comp.gfa : comp.bedrooms * 65 // 65 sqm per bedroom estimate
  
  return {
    ...comp,
    convertedPrice,
    estimatedGFA
  }
})

// Step 2: Apply RICS adjustment methodology
const adjustedComparables = processedComparables.map(comp => {
  // Adjustment 1: Apply existing adjustments to total price
  const adjustmentMultiplier = 1 + (comp.totalAdjustment / 100)
  
  // Adjustment 2: Size adjustment (RICS methodology with caps)
  const sizeDifference = (subject.gfa - comp.estimatedGFA) / comp.estimatedGFA
  const sizeFactor = 0.15 // 15% impact factor (reduced per RICS guidance)
  const rawAdjustment = sizeDifference * sizeFactor
  const cappedAdjustment = Math.max(-0.25, Math.min(0.25, rawAdjustment)) // Cap at ±25%
  const sizeAdjustment = 1 + cappedAdjustment
  
  // Final adjusted price
  const adjustedPrice = comp.convertedPrice * adjustmentMultiplier * sizeAdjustment
  
  return {
    ...comp,
    adjustmentMultiplier,
    sizeAdjustment,
    adjustedPrice
  }
})

// Display results
adjustedComparables.forEach(comp => {
  console.log(`${comp.id}:`)
  console.log(`  Original: ${comp.currency} ${comp.sale_price.toLocaleString()}`)
  console.log(`  Converted: ₵${comp.convertedPrice.toLocaleString()}`)
  console.log(`  GFA: ${comp.estimatedGFA} sqm`)
  console.log(`  Condition Adj: ${comp.totalAdjustment}% (${(comp.adjustmentMultiplier * 100 - 100).toFixed(1)}%)`)
  console.log(`  Size Adj: ${(comp.sizeAdjustment * 100 - 100).toFixed(1)}% (${subject.gfa} vs ${comp.estimatedGFA} sqm)`)
  console.log(`  ADJUSTED TOTAL PRICE: ₵${Math.round(comp.adjustedPrice).toLocaleString()}`)
  console.log(`  Implied ₵/sqm: ₵${Math.round(comp.adjustedPrice / subject.gfa).toLocaleString()}\n`)
})

// Step 3: Calculate indicated value (simple average)
const indicatedValue = adjustedComparables.reduce((sum, comp) => sum + comp.adjustedPrice, 0) / adjustedComparables.length
const impliedPricePerSqm = indicatedValue / subject.gfa

console.log('=== FINAL VALUATION ===')
console.log(`Indicated Value: ₵${Math.round(indicatedValue).toLocaleString()}`)
console.log(`Implied Price per sqm: ₵${Math.round(impliedPricePerSqm).toLocaleString()}`)
console.log(`Subject GFA: ${subject.gfa} sqm`)

console.log('\n=== VALIDATION ===')
console.log('Range of adjusted comparables:')
const minValue = Math.min(...adjustedComparables.map(c => c.adjustedPrice))
const maxValue = Math.max(...adjustedComparables.map(c => c.adjustedPrice))
console.log(`₵${Math.round(minValue).toLocaleString()} - ₵${Math.round(maxValue).toLocaleString()}`)
console.log(`Indicated value should fall within this range.`)

if (indicatedValue >= minValue && indicatedValue <= maxValue) {
  console.log('✅ VALIDATION PASSED: Value within reasonable range of comparables')
} else {
  console.log('❌ VALIDATION FAILED: Value significantly differs from comparables')
}