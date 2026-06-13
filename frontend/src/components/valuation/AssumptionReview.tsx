'use client';

/**
 * AssumptionReview Component
 * 
 * Displays surfaced assumptions from LLM design intent for user review.
 * Allows users to accept, modify, or override assumptions.
 * 
 * @module components/valuation/AssumptionReview
 * @version 1.0.0
 * @since 2026-01-14
 */

import React, { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface SurfacedAssumption {
  id: string;
  category: 'dimension' | 'layout' | 'construction' | 'code';
  assumption: string;
  default_value: string | number;
  alternatives: Array<{
    value: string | number;
    impact: string;
  }>;
  confidence: number;
  source: string;
  requires_user_confirmation: boolean;
}

export interface AssumptionOverride {
  assumptionId: string;
  originalValue: string | number;
  newValue: string | number;
  reason?: string;
}

export interface AssumptionReviewProps {
  assumptions: SurfacedAssumption[];
  onAcceptAll?: () => void;
  onOverride?: (overrides: AssumptionOverride[]) => void;
  onRegenerate?: () => void;
  isLoading?: boolean;
  readonly?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getCategoryIcon(category: SurfacedAssumption['category']) {
  switch (category) {
    case 'dimension':
      return '📐';
    case 'layout':
      return '🏠';
    case 'construction':
      return '🧱';
    case 'code':
      return '📋';
    default:
      return '📝';
  }
}

function getCategoryLabel(category: SurfacedAssumption['category']) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 bg-green-50';
  if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.6) return 'Medium';
  return 'Low';
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AssumptionReview({
  assumptions,
  onAcceptAll,
  onOverride,
  onRegenerate,
  isLoading = false,
  readonly = false,
}: AssumptionReviewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, AssumptionOverride>>(new Map());
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');

  // Group assumptions by category
  const groupedAssumptions = assumptions.reduce((acc, assumption) => {
    if (!acc[assumption.category]) {
      acc[assumption.category] = [];
    }
    acc[assumption.category].push(assumption);
    return acc;
  }, {} as Record<string, SurfacedAssumption[]>);

  // Filter by category
  const displayedAssumptions = activeCategory === 'all'
    ? assumptions
    : assumptions.filter(a => a.category === activeCategory);

  // Count requiring confirmation
  const requiresConfirmationCount = assumptions.filter(a => a.requires_user_confirmation).length;
  const overrideCount = overrides.size;

  // Toggle expansion
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Handle value change
  const handleValueChange = useCallback((assumption: SurfacedAssumption, newValue: string | number) => {
    setOverrides(prev => {
      const next = new Map(prev);
      if (newValue === assumption.default_value) {
        next.delete(assumption.id);
      } else {
        next.set(assumption.id, {
          assumptionId: assumption.id,
          originalValue: assumption.default_value,
          newValue,
        });
      }
      return next;
    });
  }, []);

  // Handle accept all
  const handleAcceptAll = useCallback(() => {
    if (onAcceptAll) {
      onAcceptAll();
    }
  }, [onAcceptAll]);

  // Handle apply overrides
  const handleApplyOverrides = useCallback(() => {
    if (onOverride && overrides.size > 0) {
      onOverride(Array.from(overrides.values()));
    }
  }, [onOverride, overrides]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              Design Assumptions
            </CardTitle>
            <CardDescription>
              Review and confirm the assumptions made during layout generation
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {requiresConfirmationCount > 0 && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                <AlertCircle className="h-3 w-3 mr-1" />
                {requiresConfirmationCount} need review
              </Badge>
            )}
            {overrideCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                {overrideCount} modified
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Category Filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Button
            variant={activeCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory('all')}
          >
            All ({assumptions.length})
          </Button>
          {Object.entries(groupedAssumptions).map(([category, items]) => (
            <Button
              key={category}
              variant={activeCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(category)}
            >
              {getCategoryIcon(category as SurfacedAssumption['category'])} {getCategoryLabel(category as SurfacedAssumption['category'])} ({items.length})
            </Button>
          ))}
        </div>

        {/* Assumptions List */}
        <div className="space-y-3">
          {displayedAssumptions.map((assumption) => {
            const isExpanded = expandedIds.has(assumption.id);
            const override = overrides.get(assumption.id);
            const currentValue = override?.newValue ?? assumption.default_value;

            return (
              <Collapsible
                key={assumption.id}
                open={isExpanded}
                onOpenChange={() => toggleExpanded(assumption.id)}
              >
                <div
                  className={cn(
                    'border rounded-lg p-3 transition-colors',
                    assumption.requires_user_confirmation && !override && 'border-yellow-300 bg-yellow-50/50',
                    override && 'border-blue-300 bg-blue-50/50',
                    !assumption.requires_user_confirmation && !override && 'border-border'
                  )}
                >
                  {/* Header Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      
                      <span className="text-lg">{getCategoryIcon(assumption.category)}</span>
                      
                      <div>
                        <p className="font-medium text-sm">{assumption.assumption}</p>
                        <p className="text-xs text-muted-foreground">
                          Source: {assumption.source}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Confidence Badge */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge
                              variant="outline"
                              className={cn('text-xs', getConfidenceColor(assumption.confidence))}
                            >
                              {getConfidenceLabel(assumption.confidence)} ({Math.round(assumption.confidence * 100)}%)
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Confidence level based on available information</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Current Value */}
                      <Badge variant="secondary" className="font-mono">
                        {String(currentValue)}
                      </Badge>

                      {/* Status Indicator */}
                      {override ? (
                        <CheckCircle2 className="h-4 w-4 text-blue-500" />
                      ) : assumption.requires_user_confirmation ? (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  <CollapsibleContent className="mt-3 pt-3 border-t">
                    <div className="space-y-3">
                      {/* Alternatives */}
                      {assumption.alternatives.length > 0 && !readonly && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Alternative values:
                          </p>
                          <Select
                            value={String(currentValue)}
                            onValueChange={(value) => {
                              // Try to parse as number if original was number
                              const parsed = typeof assumption.default_value === 'number'
                                ? parseFloat(value) || value
                                : value;
                              handleValueChange(assumption, parsed);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={String(assumption.default_value)}>
                                {String(assumption.default_value)} (default)
                              </SelectItem>
                              {assumption.alternatives.map((alt, index) => (
                                <SelectItem key={index} value={String(alt.value)}>
                                  {String(alt.value)} - {alt.impact}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Impact descriptions */}
                      {assumption.alternatives.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium mb-1">Impact of alternatives:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {assumption.alternatives.map((alt, index) => (
                              <li key={index}>
                                <span className="font-mono">{String(alt.value)}</span>: {alt.impact}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>

        {/* Actions */}
        {!readonly && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
              Regenerate
            </Button>

            <div className="flex items-center gap-2">
              {overrideCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOverrides(new Map())}
                >
                  Reset Changes
                </Button>
              )}
              
              {overrideCount > 0 ? (
                <Button
                  onClick={handleApplyOverrides}
                  disabled={isLoading}
                >
                  Apply {overrideCount} Override{overrideCount !== 1 ? 's' : ''}
                </Button>
              ) : (
                <Button
                  onClick={handleAcceptAll}
                  disabled={isLoading}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Accept All
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AssumptionReview;
