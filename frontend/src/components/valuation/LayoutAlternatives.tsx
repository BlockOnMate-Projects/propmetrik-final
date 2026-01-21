'use client';

/**
 * LayoutAlternatives Component
 * 
 * Displays layout alternatives from LLM design intent for side-by-side comparison.
 * Allows users to select their preferred layout option.
 * 
 * @module components/valuation/LayoutAlternatives
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
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Info,
  LayoutGrid,
  Plus,
  RefreshCw,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface LayoutStrategy {
  template_id: string;
  style: 'colonial' | 'modern' | 'compound' | 'apartment' | 'bungalow' | 'split_level';
  circulation_type: 'central_corridor' | 'side_corridor' | 'open_flow' | 'gallery' | 'courtyard';
  primary_orientation?: 'north' | 'south' | 'east' | 'west';
  entrance_position?: 'front_center' | 'front_left' | 'front_right' | 'side';
  kitchen_style?: 'galley' | 'l_shaped' | 'u_shaped' | 'island' | 'open';
}

export interface RoomProgram {
  room_id: string;
  room_type: string;
  room_name?: string;
  target_area_sqm: number;
  importance: 'primary' | 'secondary' | 'ancillary';
}

export interface LayoutAlternative {
  alternative_id: string;
  name: string;
  description: string;
  layout_strategy: LayoutStrategy;
  room_program: RoomProgram[];
  tradeoffs: string[];
  suitability_score: number;
}

export interface LayoutAlternativesProps {
  primaryLayout: {
    name: string;
    strategy: LayoutStrategy;
    roomProgram: RoomProgram[];
    suitabilityScore: number;
  };
  alternatives: LayoutAlternative[];
  selectedId?: string | null;
  onSelect?: (alternativeId: string | null) => void;
  onGenerateMore?: () => void;
  isLoading?: boolean;
  readonly?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStyleIcon(style: LayoutStrategy['style']) {
  switch (style) {
    case 'colonial':
      return '🏛️';
    case 'modern':
      return '🏢';
    case 'compound':
      return '🏘️';
    case 'apartment':
      return '🏬';
    case 'bungalow':
      return '🏡';
    case 'split_level':
      return '📐';
    default:
      return '🏠';
  }
}

function getStyleLabel(style: LayoutStrategy['style']) {
  const labels: Record<string, string> = {
    colonial: 'Colonial',
    modern: 'Modern',
    compound: 'Compound',
    apartment: 'Apartment',
    bungalow: 'Bungalow',
    split_level: 'Split Level',
  };
  return labels[style] || style;
}

function getCirculationLabel(type: LayoutStrategy['circulation_type']) {
  const labels: Record<string, string> = {
    central_corridor: 'Central Corridor',
    side_corridor: 'Side Corridor',
    open_flow: 'Open Flow',
    gallery: 'Gallery',
    courtyard: 'Courtyard',
  };
  return labels[type] || type;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getRoomSummary(rooms: RoomProgram[]): string {
  const bedrooms = rooms.filter(r => r.room_type === 'bedroom' || r.room_type === 'master_bedroom').length;
  const bathrooms = rooms.filter(r => r.room_type === 'bathroom' || r.room_type === 'toilet').length;
  return `${bedrooms} BR, ${bathrooms} BA`;
}

function getTotalArea(rooms: RoomProgram[]): number {
  return rooms.reduce((sum, r) => sum + r.target_area_sqm, 0);
}

// ============================================================================
// LAYOUT CARD COMPONENT
// ============================================================================

interface LayoutCardProps {
  id: string | null;
  name: string;
  description?: string;
  strategy: LayoutStrategy;
  roomProgram: RoomProgram[];
  suitabilityScore: number;
  tradeoffs?: string[];
  isPrimary?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  readonly?: boolean;
}

function LayoutCard({
  id,
  name,
  description,
  strategy,
  roomProgram,
  suitabilityScore,
  tradeoffs = [],
  isPrimary = false,
  isSelected = false,
  onSelect,
  readonly = false,
}: LayoutCardProps) {
  const totalArea = getTotalArea(roomProgram);
  const roomSummary = getRoomSummary(roomProgram);

  return (
    <Card
      className={cn(
        'min-w-[300px] max-w-[350px] flex-shrink-0 transition-all cursor-pointer',
        isSelected && 'ring-2 ring-primary border-primary',
        isPrimary && !isSelected && 'border-yellow-300 bg-yellow-50/30',
        !readonly && 'hover:shadow-md'
      )}
      onClick={readonly ? undefined : onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPrimary && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Crown className="h-4 w-4 text-yellow-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Recommended layout</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <CardTitle className="text-base">{name}</CardTitle>
          </div>
          
          {isSelected && (
            <Badge className="bg-primary">
              <Check className="h-3 w-3 mr-1" />
              Selected
            </Badge>
          )}
        </div>
        
        {description && (
          <CardDescription className="text-xs line-clamp-2">
            {description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Style & Layout */}
        <div className="flex items-center gap-2">
          <span className="text-xl">{getStyleIcon(strategy.style)}</span>
          <div>
            <p className="font-medium text-sm">{getStyleLabel(strategy.style)}</p>
            <p className="text-xs text-muted-foreground">
              {getCirculationLabel(strategy.circulation_type)}
            </p>
          </div>
        </div>

        {/* Room Summary */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1">
            <LayoutGrid className="h-3 w-3 text-muted-foreground" />
            <span>{roomSummary}</span>
          </div>
          <div className="text-right text-muted-foreground">
            ~{Math.round(totalArea)} sqm
          </div>
        </div>

        {/* Suitability Score */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Suitability</span>
            <span className={cn('font-medium', getScoreColor(suitabilityScore))}>
              {suitabilityScore}%
            </span>
          </div>
          <Progress value={suitabilityScore} className="h-1.5" />
        </div>

        {/* Tradeoffs */}
        {tradeoffs.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Tradeoffs:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {tradeoffs.slice(0, 2).map((tradeoff, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="text-yellow-500">•</span>
                  <span className="line-clamp-1">{tradeoff}</span>
                </li>
              ))}
              {tradeoffs.length > 2 && (
                <li className="text-muted-foreground/60">
                  +{tradeoffs.length - 2} more...
                </li>
              )}
            </ul>
          </div>
        )}
      </CardContent>

      {!readonly && (
        <CardFooter className="pt-0">
          <Button
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
          >
            {isSelected ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Selected
              </>
            ) : (
              'Select This Layout'
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LayoutAlternatives({
  primaryLayout,
  alternatives,
  selectedId,
  onSelect,
  onGenerateMore,
  isLoading = false,
  readonly = false,
}: LayoutAlternativesProps) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const allLayouts = [
    {
      id: null,
      ...primaryLayout,
      description: 'AI-recommended layout based on your requirements',
      tradeoffs: [],
      isPrimary: true,
    },
    ...alternatives.map(alt => ({
      id: alt.alternative_id,
      name: alt.name,
      strategy: alt.layout_strategy,
      roomProgram: alt.room_program,
      suitabilityScore: alt.suitability_score,
      description: alt.description,
      tradeoffs: alt.tradeoffs,
      isPrimary: false,
    })),
  ];

  const handleSelect = useCallback((id: string | null) => {
    if (onSelect) {
      onSelect(id);
    }
  }, [onSelect]);

  const scrollLeft = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  }, []);

  const scrollRight = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  }, []);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-blue-500" />
              Layout Options
            </CardTitle>
            <CardDescription>
              Compare layout alternatives and select your preferred design
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {allLayouts.length} option{allLayouts.length !== 1 ? 's' : ''}
            </Badge>
            
            {!readonly && onGenerateMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateMore}
                disabled={isLoading}
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                More Options
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Scroll Controls */}
        <div className="relative">
          {allLayouts.length > 3 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background shadow-md"
                onClick={scrollLeft}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background shadow-md"
                onClick={scrollRight}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Layout Cards */}
          <ScrollArea className="w-full" ref={scrollRef}>
            <div className="flex gap-4 pb-4 px-1">
              {allLayouts.map((layout) => (
                <LayoutCard
                  key={layout.id ?? 'primary'}
                  id={layout.id}
                  name={layout.name}
                  description={layout.description}
                  strategy={layout.strategy}
                  roomProgram={layout.roomProgram}
                  suitabilityScore={layout.suitabilityScore}
                  tradeoffs={layout.tradeoffs}
                  isPrimary={layout.isPrimary}
                  isSelected={selectedId === layout.id}
                  onSelect={() => handleSelect(layout.id)}
                  readonly={readonly}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Selection Info */}
        {selectedId !== undefined && selectedId !== null && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              <p className="text-sm text-blue-800">
                You selected an alternative layout. Click "Apply" to regenerate the floor plan with this design.
              </p>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Crown className="h-3 w-3 text-yellow-500" />
            <span>Recommended</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border-2 border-primary" />
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 text-green-500" />
            <span>80%+ Suitability</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default LayoutAlternatives;
