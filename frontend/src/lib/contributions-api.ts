/**
 * PROPMETRIK Contributions API Client
 * 
 * Client for managing property contributions via contributionService.ts
 * Integrates with the backend contribution workflow for user-submitted data.
 */

import { fetchApi } from '@/lib/api'
import { type ComprehensivePropertyData } from '@/types/comprehensiveProperty'

// Use relative path so requests go through Next.js proxy (/api/* → /api/v1/*)
// Backend route is mounted at /api/v1/data-hub/contributions
const CONTRIBUTIONS_BASE = '/api/data-hub/contributions'

export interface ContributionInput {
  type: 'comparable' | 'property_update' | 'transaction' | 'market_data'
  data: Record<string, unknown>
  subject_property_id?: string
  location?: {
    latitude: number
    longitude: number
  }
  source?: string
  notes?: string
}

export interface Contribution {
  id: string
  contributor_id: string
  type: string
  data: Record<string, unknown>
  subject_property_id?: string
  trust_score: number
  status: 'pending' | 'approved' | 'rejected' | 'integrated'
  created_at: string
  updated_at: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  metadata?: {
    trust_score?: number
    similar_contributions?: number
    data_quality_score?: number
  }
}

/**
 * Submit a new property contribution
 */
export const submitContribution = async (input: ContributionInput): Promise<ApiResponse<Contribution>> => {
  try {
    // Map comprehensive property data to contribution format
    const contributionData: ContributionInput = {
      type: input.type,
      data: input.data,
      subject_property_id: input.subject_property_id,
      location: input.location,
      source: input.source || 'user_manual',
      notes: input.notes,
    }

    console.log('Submitting contribution:', contributionData)

    const response = await fetch(`${CONTRIBUTIONS_BASE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth header if available
        ...(typeof window !== 'undefined' && localStorage.getItem('auth_token') && {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        })
      },
      body: JSON.stringify(contributionData),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.message || `HTTP error! status: ${response.status}`
      }
    }

    return {
      success: true,
      data: result.data,
      metadata: result.metadata
    }

  } catch (error) {
    console.error('Contribution submission error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Submit a comparable property
 */
export const submitComparable = async (
  propertyData: Partial<ComprehensivePropertyData>,
  subjectPropertyId?: string,
  notes?: string
): Promise<ApiResponse<Contribution>> => {
  return submitContribution({
    type: 'comparable',
    data: {
      // Map comprehensive property data to backend format
      property_type: propertyData.property_type,
      address_street: propertyData.address,
      address_city: propertyData.city,
      region: propertyData.region,
      digital_address: propertyData.digital_address,
      
      // Physical characteristics
      gfa: propertyData.gfa,
      plot_size: propertyData.plot_size,
      land_area: propertyData.land_area,
      bedrooms: propertyData.bedrooms,
      bathrooms: propertyData.bathrooms,
      total_floors: propertyData.total_floors,
      floor_number: propertyData.floor_number,
      parking_spaces: propertyData.parking_spaces,
      year_built: propertyData.year_built,
      
      // Quality & Condition
      quality_rating: propertyData.quality_rating,
      condition: propertyData.condition,
      
      // Amenities
      has_pool: propertyData.has_pool,
      has_garden: propertyData.has_garden,
      has_security: propertyData.has_security,
      has_elevator: propertyData.has_elevator,
      has_balcony: propertyData.has_balcony,
      has_terrace: propertyData.has_terrace,
      has_gym: propertyData.has_gym,
      has_generator: propertyData.has_generator,
      has_solar: propertyData.has_solar,
      has_borehole: propertyData.has_borehole,
      
      // Location Quality
      view_quality: propertyData.view_quality,
      neighborhood_rating: propertyData.neighborhood_rating,
      accessibility_rating: propertyData.accessibility_rating,
      
      // Legal & Tenure
      tenure_type: propertyData.tenure_type,
      lease_years_remaining: propertyData.lease_years_remaining,
      
      // Transaction Details
      sale_price: propertyData.sale_price,
      sale_date: propertyData.sale_date,
      transaction_type: propertyData.transaction_type,
      
      // Store original comprehensive data for future reference
      comprehensive_data: propertyData
    },
    subject_property_id: subjectPropertyId,
    notes: notes
  })
}

/**
 * Get contributions for a specific property
 */
export const getContributionsForProperty = async (propertyId: string): Promise<ApiResponse<Contribution[]>> => {
  try {
    const response = await fetch(`${CONTRIBUTIONS_BASE}?property_id=${propertyId}`, {
      headers: {
        ...(typeof window !== 'undefined' && localStorage.getItem('auth_token') && {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        })
      }
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.message || `HTTP error! status: ${response.status}`
      }
    }

    return {
      success: true,
      data: result.data
    }

  } catch (error) {
    console.error('Error fetching contributions:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Get user's contribution history
 */
export const getUserContributions = async (): Promise<ApiResponse<Contribution[]>> => {
  try {
    const response = await fetch(`${CONTRIBUTIONS_BASE}/my-contributions`, {
      headers: {
        ...(typeof window !== 'undefined' && localStorage.getItem('auth_token') && {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        })
      }
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.message || `HTTP error! status: ${response.status}`
      }
    }

    return {
      success: true,
      data: result.data
    }

  } catch (error) {
    console.error('Error fetching user contributions:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export const contributionsApi = {
  submit: submitContribution,
  submitComparable,
  getForProperty: getContributionsForProperty,
  getUserContributions
}