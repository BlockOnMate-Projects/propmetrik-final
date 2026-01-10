'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PropertyEnrichmentResponse } from '@/types/property';
import { 
  MapPin, Home, Car, Grid, Check, Ruler, Calendar, 
  Building, TrendingUp, Database, Shield, Clock
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ZoneFactsProps {
  property: PropertyEnrichmentResponse['property'];
  dataQuality?: PropertyEnrichmentResponse['property']['data_quality'];
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString();
}

function formatCurrency(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A';
  return `GH₵ ${num.toLocaleString()}`;
}

export function ZoneFacts({ property, dataQuality }: ZoneFactsProps) {
  const conditionColors: Record<string, string> = {
    'excellent': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'good': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'fair': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'needs_renovation': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'poor': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const verificationColors: Record<string, string> = {
    'verified': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'pending': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'unverified': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Property Specifications</h2>
      
      {/* Key Valuation Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1 text-sm font-medium">
            <TrendingUp className="w-4 h-4" /> Price per m²
          </div>
          <div className="text-lg font-bold text-blue-900 dark:text-blue-100">
            {property.price.per_sqm ? formatCurrency(property.price.per_sqm) : 'N/A'}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1 text-sm">
            <Ruler className="w-4 h-4" /> Built Area
          </div>
          <div className="font-semibold">
            {property.built_area_sqm ? `${formatNumber(property.built_area_sqm)} m²` : 'N/A'}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1 text-sm">
            <Grid className="w-4 h-4" /> Land Area
          </div>
          <div className="font-semibold">
            {property.land_area_sqm ? `${formatNumber(property.land_area_sqm)} m²` : 
             property.plot_size_acres ? `${property.plot_size_acres} acres` : 'N/A'}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1 text-sm">
            <Calendar className="w-4 h-4" /> Year Built
          </div>
          <div className="font-semibold">{property.year_built || 'Unknown'}</div>
        </div>
      </div>

      {/* Property Details Grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Property Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <Home className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Type</div>
                <div className="font-medium capitalize">{property.property_type.replace(/_/g, ' ')}</div>
                {property.property_sub_type && (
                  <div className="text-xs text-muted-foreground capitalize">{property.property_sub_type}</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <Building className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Floors</div>
                <div className="font-medium">{property.floors || 'N/A'}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <Car className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Parking</div>
                <div className="font-medium">{property.parking || 'N/A'}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <MapPin className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Region</div>
                <div className="font-medium capitalize">{property.region.replace(/_/g, ' ')}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <Grid className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Transaction</div>
                <div className="font-medium capitalize">
                  {property.transaction_type || 'Sale'}
                  {property.rental_period && ` (${property.rental_period})`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <Shield className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Condition</div>
                {property.condition ? (
                  <Badge className={conditionColors[property.condition] || 'bg-gray-100'}>
                    {property.condition.replace(/_/g, ' ')}
                  </Badge>
                ) : (
                  <span className="font-medium text-muted-foreground">Unknown</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Quality Indicators - Critical for Valuation */}
      {dataQuality && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="w-5 h-5" />
              Data Quality Indicators
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Important metrics for valuation reliability
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Trust Score */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Trust Score</span>
                  <span className="text-sm font-semibold">{Math.round(dataQuality.trust_score * 100)}%</span>
                </div>
                <Progress value={dataQuality.trust_score * 100} className="h-2" />
              </div>

              {/* Completeness Score */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Data Completeness</span>
                  <span className="text-sm font-semibold">
                    {dataQuality.completeness_score !== null ? Math.round(dataQuality.completeness_score * 100) : 'N/A'}%
                  </span>
                </div>
                <Progress value={(dataQuality.completeness_score ?? 0) * 100} className="h-2" />
              </div>

              {/* Verification & Source */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Verification</div>
                  <Badge className={verificationColors[dataQuality.verification_status] || 'bg-gray-100'}>
                    {dataQuality.verification_status}
                  </Badge>
                </div>

                <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Data Source</div>
                  <span className="text-sm font-medium capitalize">{dataQuality.data_source}</span>
                </div>

                <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Location</div>
                  <span className="text-sm font-medium">
                    {property.location.verified ? '✓ Verified' : 'Unverified'}
                  </span>
                </div>

                <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" /> Last Updated
                  </div>
                  <span className="text-sm font-medium">
                    {dataQuality.last_updated 
                      ? new Date(dataQuality.last_updated).toLocaleDateString()
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Digital Address */}
      {property.address.digital_address && (
        <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <MapPin className="w-4 h-4" />
            <span className="text-sm font-medium">Ghana Post Digital Address</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-green-900 dark:text-green-200">
            {property.address.digital_address}
          </div>
        </div>
      )}

      {/* Amenities */}
      {property.amenities.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Amenities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6">
              {property.amenities.map((amenity, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="flex-shrink-0 w-5 h-5 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                    <Check className="w-3 h-3" />
                  </span>
                  <span className="capitalize">{amenity.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
