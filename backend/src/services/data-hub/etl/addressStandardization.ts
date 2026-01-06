/**
 * Address Standardization Service
 * 
 * Normalizes and standardizes Ghana addresses to a consistent format.
 * Handles various address formats from different data sources.
 */

// Ghana administrative divisions
const GHANA_REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central',
  'Northern', 'Volta', 'Upper East', 'Upper West', 'Bono',
  'Bono East', 'Ahafo', 'Western North', 'Oti', 'Savannah', 'North East'
];

// Region capital cities
const REGION_CAPITALS: Record<string, string> = {
  'Greater Accra': 'Accra',
  'Ashanti': 'Kumasi',
  'Western': 'Takoradi',
  'Eastern': 'Koforidua',
  'Central': 'Cape Coast',
  'Northern': 'Tamale',
  'Volta': 'Ho',
  'Upper East': 'Bolgatanga',
  'Upper West': 'Wa',
  'Bono': 'Sunyani',
  'Bono East': 'Techiman',
  'Ahafo': 'Goaso',
  'Western North': 'Sefwi Wiawso',
  'Oti': 'Dambai',
  'Savannah': 'Damongo',
  'North East': 'Nalerigu'
};

// Common Accra neighborhoods with standardized names
const ACCRA_NEIGHBORHOODS: Record<string, string> = {
  'east legon': 'East Legon',
  'eastlegon': 'East Legon',
  'e. legon': 'East Legon',
  'cantonments': 'Cantonments',
  'cantonment': 'Cantonments',
  'airport residential': 'Airport Residential Area',
  'airport residential area': 'Airport Residential Area',
  'airport': 'Airport Residential Area',
  'ridge': 'Ridge',
  'north ridge': 'North Ridge',
  'west ridge': 'West Ridge',
  'labone': 'Labone',
  'osu': 'Osu',
  'dzorwulu': 'Dzorwulu',
  'roman ridge': 'Roman Ridge',
  'adjiringanor': 'Adjiringanor',
  'tse addo': 'Tse Addo',
  'tseaddo': 'Tse Addo',
  'spintex': 'Spintex Road',
  'spintex road': 'Spintex Road',
  'tema': 'Tema',
  'sakumono': 'Sakumono',
  'community 25': 'Community 25',
  'comm 25': 'Community 25',
  'ashongman': 'Ashongman',
  'dome': 'Dome',
  'kwabenya': 'Kwabenya',
  'madina': 'Madina',
  'adenta': 'Adenta',
  'haatso': 'Haatso',
  'achimota': 'Achimota',
  'lapaz': 'Lapaz',
  'la paz': 'Lapaz',
  'dansoman': 'Dansoman',
  'kasoa': 'Kasoa',
  'weija': 'Weija',
  'gbawe': 'Gbawe',
  'mallam': 'Mallam',
  'kaneshie': 'Kaneshie',
  'circle': 'Kwame Nkrumah Circle',
  'nungua': 'Nungua',
  'teshie': 'Teshie',
  'labadi': 'La',
  'la': 'La',
  'ablekuma': 'Ablekuma',
  'odorkor': 'Odorkor',
  'mamprobi': 'Mamprobi',
  'awudome': 'Awudome',
  'kokomlemle': 'Kokomlemle',
  'adabraka': 'Adabraka',
  'asylum down': 'Asylum Down',
};

// Common abbreviations
const ABBREVIATIONS: Record<string, string> = {
  'st': 'Street',
  'st.': 'Street',
  'rd': 'Road',
  'rd.': 'Road',
  'ave': 'Avenue',
  'ave.': 'Avenue',
  'blvd': 'Boulevard',
  'dr': 'Drive',
  'dr.': 'Drive',
  'ln': 'Lane',
  'ct': 'Court',
  'pl': 'Place',
  'nr': 'Near',
  'opp': 'Opposite',
  'opp.': 'Opposite',
  'adj': 'Adjacent to',
  'nr.': 'Near',
  'b/h': 'Behind',
  'bh': 'Behind',
  'c/o': 'Care of',
};

export interface StandardizedAddress {
  raw: string;
  standardized: string;
  components: {
    streetNumber?: string;
    streetName?: string;
    neighborhood?: string;
    district?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country: string;
    landmark?: string;
  };
  confidence: number;
  issues: string[];
}

export interface AddressStandardizationOptions {
  includeCountry?: boolean;
  formatStyle?: 'full' | 'short' | 'components';
}

export class AddressStandardizationService {

  /**
   * Standardize a single address
   */
  async standardize(
    rawAddress: string,
    options: AddressStandardizationOptions = {}
  ): Promise<StandardizedAddress> {
    const issues: string[] = [];
    
    if (!rawAddress || typeof rawAddress !== 'string') {
      return {
        raw: rawAddress || '',
        standardized: '',
        components: { country: 'Ghana' },
        confidence: 0,
        issues: ['Empty or invalid address']
      };
    }

    // Clean the raw address
    let cleaned = this.cleanAddress(rawAddress);
    
    // Extract components
    const components = this.extractComponents(cleaned);
    
    // Validate and normalize region
    if (components.region) {
      const normalizedRegion = this.normalizeRegion(components.region);
      if (normalizedRegion !== components.region) {
        issues.push(`Region normalized: ${components.region} -> ${normalizedRegion}`);
      }
      components.region = normalizedRegion;
    }
    
    // Normalize neighborhood
    if (components.neighborhood) {
      const normalizedNeighborhood = this.normalizeNeighborhood(components.neighborhood);
      if (normalizedNeighborhood !== components.neighborhood) {
        issues.push(`Neighborhood normalized: ${components.neighborhood} -> ${normalizedNeighborhood}`);
      }
      components.neighborhood = normalizedNeighborhood;
    }
    
    // Infer missing components
    if (!components.city && components.neighborhood) {
      const inferredCity = this.inferCityFromNeighborhood(components.neighborhood);
      if (inferredCity) {
        components.city = inferredCity;
        issues.push(`City inferred from neighborhood: ${inferredCity}`);
      }
    }
    
    if (!components.region && components.city) {
      const inferredRegion = this.inferRegionFromCity(components.city);
      if (inferredRegion) {
        components.region = inferredRegion;
        issues.push(`Region inferred from city: ${inferredRegion}`);
      }
    }
    
    // Set country
    components.country = 'Ghana';
    
    // Build standardized address
    const standardized = this.buildStandardizedAddress(components, options);
    
    // Calculate confidence score
    const confidence = this.calculateConfidence(components);
    
    return {
      raw: rawAddress,
      standardized,
      components,
      confidence,
      issues
    };
  }

  /**
   * Batch standardize multiple addresses
   */
  async standardizeBatch(
    addresses: string[],
    options: AddressStandardizationOptions = {}
  ): Promise<StandardizedAddress[]> {
    return Promise.all(addresses.map(addr => this.standardize(addr, options)));
  }

  /**
   * Clean and normalize raw address text
   */
  private cleanAddress(address: string): string {
    let cleaned = address;
    
    // Remove multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Remove leading/trailing whitespace
    cleaned = cleaned.trim();
    
    // Normalize common punctuation
    cleaned = cleaned.replace(/[,;]+/g, ',');
    cleaned = cleaned.replace(/,+/g, ',');
    cleaned = cleaned.replace(/,\s*,/g, ',');
    
    // Remove Ghana from the address (we'll add it back standardized)
    cleaned = cleaned.replace(/,?\s*ghana\s*$/i, '');
    
    // Expand common abbreviations
    const words = cleaned.split(/\s+/);
    const expanded = words.map(word => {
      const lower = word.toLowerCase().replace(/[.,]/g, '');
      return ABBREVIATIONS[lower] || word;
    });
    cleaned = expanded.join(' ');
    
    return cleaned;
  }

  /**
   * Extract address components from cleaned address
   */
  private extractComponents(address: string): StandardizedAddress['components'] {
    const components: StandardizedAddress['components'] = {
      country: 'Ghana'
    };
    
    // Split by comma
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    
    // Try to identify each part
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const partLower = part.toLowerCase();
      
      // Check if it's a region
      const matchedRegion = GHANA_REGIONS.find(r => 
        partLower.includes(r.toLowerCase()) ||
        partLower === r.toLowerCase().replace(' ', '')
      );
      if (matchedRegion && !components.region) {
        components.region = matchedRegion;
        continue;
      }
      
      // Check if it's a known city (region capital)
      const matchedCity = Object.values(REGION_CAPITALS).find(c =>
        partLower === c.toLowerCase() ||
        partLower.includes(c.toLowerCase())
      );
      if (matchedCity && !components.city) {
        components.city = matchedCity;
        continue;
      }
      
      // Check if it's a known Accra neighborhood
      const normalizedNeighborhood = ACCRA_NEIGHBORHOODS[partLower];
      if (normalizedNeighborhood && !components.neighborhood) {
        components.neighborhood = normalizedNeighborhood;
        components.city = components.city || 'Accra';
        continue;
      }
      
      // Check for street patterns
      if (this.isStreetAddress(part) && !components.streetName) {
        const { number, name } = this.parseStreetAddress(part);
        components.streetNumber = number;
        components.streetName = name;
        continue;
      }
      
      // Check for landmark patterns
      if (this.isLandmark(part) && !components.landmark) {
        components.landmark = part;
        continue;
      }
      
      // If we have city but no neighborhood, this might be the neighborhood
      if (components.city && !components.neighborhood) {
        components.neighborhood = part;
        continue;
      }
      
      // If nothing else matched and we don't have neighborhood
      if (!components.neighborhood && i === 0) {
        components.neighborhood = part;
      }
    }
    
    return components;
  }

  /**
   * Check if a string looks like a street address
   */
  private isStreetAddress(text: string): boolean {
    const streetPatterns = [
      /\d+\s+\w+\s+(street|road|avenue|drive|lane|close|crescent)/i,
      /^(no\.?\s*)?\d+/i,
      /(street|road|avenue|drive|lane|close|crescent)\s*$/i,
    ];
    return streetPatterns.some(p => p.test(text));
  }

  /**
   * Parse street address into number and name
   */
  private parseStreetAddress(text: string): { number?: string; name?: string } {
    const match = text.match(/^(no\.?\s*)?(\d+[a-z]?)\s*,?\s*(.+)$/i);
    if (match) {
      return {
        number: match[2],
        name: match[3]
      };
    }
    return { name: text };
  }

  /**
   * Check if text looks like a landmark reference
   */
  private isLandmark(text: string): boolean {
    const landmarkPatterns = [
      /^(near|opposite|behind|adjacent|next to|by|at)\s+/i,
      /(junction|roundabout|traffic light|church|mosque|school|hospital|market)/i,
    ];
    return landmarkPatterns.some(p => p.test(text));
  }

  /**
   * Normalize region name
   */
  private normalizeRegion(region: string): string {
    const regionLower = region.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // Direct match
    const directMatch = GHANA_REGIONS.find(r => 
      r.toLowerCase() === regionLower
    );
    if (directMatch) return directMatch;
    
    // Partial match
    const partialMatch = GHANA_REGIONS.find(r =>
      regionLower.includes(r.toLowerCase()) ||
      r.toLowerCase().includes(regionLower)
    );
    if (partialMatch) return partialMatch;
    
    // Common variations
    const variations: Record<string, string> = {
      'accra': 'Greater Accra',
      'greater accra region': 'Greater Accra',
      'ashanti region': 'Ashanti',
      'western region': 'Western',
      'eastern region': 'Eastern',
      'central region': 'Central',
      'northern region': 'Northern',
      'volta region': 'Volta',
    };
    
    return variations[regionLower] || region;
  }

  /**
   * Normalize neighborhood name
   */
  private normalizeNeighborhood(neighborhood: string): string {
    const normalized = neighborhood.toLowerCase().replace(/\s+/g, ' ').trim();
    return ACCRA_NEIGHBORHOODS[normalized] || neighborhood;
  }

  /**
   * Infer city from neighborhood
   */
  private inferCityFromNeighborhood(neighborhood: string): string | undefined {
    const normalized = neighborhood.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // If it's a known Accra neighborhood
    if (ACCRA_NEIGHBORHOODS[normalized]) {
      return 'Accra';
    }
    
    // Tema communities
    if (/^community\s*\d+$/i.test(neighborhood) || neighborhood.toLowerCase().includes('tema')) {
      return 'Tema';
    }
    
    return undefined;
  }

  /**
   * Infer region from city
   */
  private inferRegionFromCity(city: string): string | undefined {
    const cityLower = city.toLowerCase();
    
    // Check region capitals
    for (const [region, capital] of Object.entries(REGION_CAPITALS)) {
      if (capital.toLowerCase() === cityLower) {
        return region;
      }
    }
    
    // Accra and Tema are in Greater Accra
    if (['accra', 'tema'].includes(cityLower)) {
      return 'Greater Accra';
    }
    
    return undefined;
  }

  /**
   * Build standardized address string from components
   */
  private buildStandardizedAddress(
    components: StandardizedAddress['components'],
    options: AddressStandardizationOptions
  ): string {
    const parts: string[] = [];
    
    if (components.streetNumber && components.streetName) {
      parts.push(`${components.streetNumber} ${components.streetName}`);
    } else if (components.streetName) {
      parts.push(components.streetName);
    }
    
    if (components.landmark) {
      parts.push(components.landmark);
    }
    
    if (components.neighborhood) {
      parts.push(components.neighborhood);
    }
    
    if (components.district && components.district !== components.neighborhood) {
      parts.push(components.district);
    }
    
    if (components.city) {
      parts.push(components.city);
    }
    
    if (components.region && options.formatStyle !== 'short') {
      parts.push(components.region);
    }
    
    if (options.includeCountry !== false) {
      parts.push('Ghana');
    }
    
    return parts.join(', ');
  }

  /**
   * Calculate confidence score based on components
   */
  private calculateConfidence(components: StandardizedAddress['components']): number {
    let score = 0;
    const maxScore = 100;
    
    // Country (always present)
    score += 10;
    
    // Region
    if (components.region) {
      score += 20;
      // Bonus if it's a valid region
      if (GHANA_REGIONS.includes(components.region)) {
        score += 5;
      }
    }
    
    // City
    if (components.city) {
      score += 20;
      // Bonus if it's a region capital
      if (Object.values(REGION_CAPITALS).includes(components.city)) {
        score += 5;
      }
    }
    
    // Neighborhood
    if (components.neighborhood) {
      score += 20;
    }
    
    // Street
    if (components.streetName) {
      score += 15;
    }
    
    // Street number
    if (components.streetNumber) {
      score += 10;
    }
    
    return Math.min(score / maxScore, 1);
  }
}

// Export singleton instance
export const addressStandardizationService = new AddressStandardizationService();
