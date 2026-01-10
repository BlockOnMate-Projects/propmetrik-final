'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { PropertyEnrichmentResponse } from '@/types/property';
import { TrendingUp, Calculator, Database, Info, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ZoneValuationProps {
  valuation: PropertyEnrichmentResponse['valuation'];
  currency: 'GHS' | 'USD';
  dataQuality?: PropertyEnrichmentResponse['property']['data_quality'];
}

export function ZoneValuation({ valuation, dataQuality }: ZoneValuationProps) {
  const formatPrice = (val: number) => 
    new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(val);

  const confidenceLevel = valuation.confidence >= 0.7 ? 'high' : 
                          valuation.confidence >= 0.5 ? 'medium' : 'low';
  
  const confidenceColors = {
    high: 'text-green-600 dark:text-green-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    low: 'text-red-600 dark:text-red-400'
  };

  // Determine if this is a real AVM estimate or based on listing price
  const isListingBased = valuation.methodology === 'listing_price_adjusted';
  const isAVM = valuation.source === 'redis' || valuation.methodology === 'avm_model';

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
      <CardContent className="p-6 space-y-6">
        
        {/* Main Estimate */}
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold mb-3">
            <TrendingUp className="w-5 h-5" />
            <span>{isAVM ? 'PropMetrik Estimate™' : 'Listed Price Range'}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {isAVM ? (
                    <p>Automated valuation based on comparable sales, neighborhood price per sqm, and property characteristics. Not a formal appraisal.</p>
                  ) : (
                    <p>Price range based on the seller&apos;s listed asking price with market variance adjustment. Independent valuation model coming soon.</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {isListingBased && (
            <Badge variant="outline" className="mb-2 text-yellow-700 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Based on Listing Price
            </Badge>
          )}
          
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {formatPrice(valuation.low)} - {formatPrice(valuation.high)}
          </div>
          
          <p className="text-sm text-muted-foreground">
            {isAVM 
              ? 'Estimated market value range for valuation reference'
              : 'Asking price ± market variance based on data quality'
            }
          </p>
        </div>

        {/* Confidence & Methodology */}
        <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Calculator className="w-4 h-4" />
                Data Confidence
              </span>
              <span className={`text-sm font-bold ${confidenceColors[confidenceLevel]}`}>
                {Math.round(valuation.confidence * 100)}%
              </span>
            </div>
            <Progress value={valuation.confidence * 100} className="h-2.5" />
            <p className="text-xs text-muted-foreground mt-1.5">
              {confidenceLevel === 'high' && 'Verified source - high reliability for comparable analysis'}
              {confidenceLevel === 'medium' && 'Moderate data quality - use with additional verification'}
              {confidenceLevel === 'low' && 'Unverified web listing - requires manual verification'}
            </p>
          </div>

          {/* Data Source Indicator */}
          <div className="flex items-center justify-between text-sm bg-white/60 dark:bg-gray-900/40 rounded-lg p-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Database className="w-4 h-4" />
              Valuation Method
            </span>
            <span className="font-medium">
              {isAVM ? 'AVM Model' : 'Listing Analysis'}
            </span>
          </div>

          {/* Data Quality Summary (if available) */}
          {dataQuality && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Trust Score</div>
                <div className="font-bold text-lg">{Math.round(dataQuality.trust_score * 100)}%</div>
              </div>
              <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Completeness</div>
                <div className="font-bold text-lg">
                  {dataQuality.completeness_score !== null ? Math.round(dataQuality.completeness_score * 100) : 'N/A'}%
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Valuation Note */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
          <strong>For Professional Use:</strong> This automated estimate is provided as a data point for valuation professionals. 
          Final valuations should incorporate site inspection, market analysis, and professional judgment.
        </div>

      </CardContent>
    </Card>
  );
}
