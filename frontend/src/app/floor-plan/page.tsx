'use client';

/**
 * Floor Plan Builder Page
 * 
 * Standalone page for creating and editing property floor plans.
 */

import React, { useState } from 'react';
import FloorPlanBuilder, { PropertyMeasurements } from '@/components/valuation/FloorPlanBuilder';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Save, Check } from 'lucide-react';
import Link from 'next/link';

export default function FloorPlanPage() {
  const { toast } = useToast();
  const [measurements, setMeasurements] = useState<PropertyMeasurements | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleMeasurementsChange = (newMeasurements: PropertyMeasurements) => {
    setMeasurements(newMeasurements);
  };

  const handleSave = async () => {
    if (!measurements) {
      toast({
        title: 'No floor plan data',
        description: 'Please draw at least one room before saving.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // In a real app, this would send to the backend
      const response = await fetch('/api/floor-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurements,
          floorPlanData: measurements.floorPlanData,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      toast({
        title: 'Floor plan saved',
        description: `Saved floor plan with ${measurements.roomBreakdown.length} rooms.`,
      });
    } catch (error) {
      toast({
        title: 'Error saving floor plan',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseForValuation = () => {
    if (!measurements) return;

    // Store in session storage for valuation wizard to use
    sessionStorage.setItem('floorPlanMeasurements', JSON.stringify(measurements));
    
    toast({
      title: 'Ready for valuation',
      description: 'Floor plan measurements will be used in your next valuation.',
    });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/properties">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Floor Plan Builder</h1>
            <p className="text-muted-foreground">
              Create accurate floor plans for property valuation
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleUseForValuation} disabled={!measurements}>
            <Check className="h-4 w-4 mr-2" />
            Use for Valuation
          </Button>
          <Button onClick={handleSave} disabled={!measurements || isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Floor Plan'}
          </Button>
        </div>
      </div>

      {/* Floor Plan Builder */}
      <FloorPlanBuilder
        onMeasurementsChange={handleMeasurementsChange}
        width={1000}
        height={700}
      />

      {/* Valuation Integration Info */}
      {measurements && (
        <Card>
          <CardHeader>
            <CardTitle>Valuation Integration</CardTitle>
            <CardDescription>
              These measurements will be automatically used in property valuation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{measurements.builtArea.toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Total Area (m²)</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{measurements.bedrooms}</div>
                <div className="text-sm text-muted-foreground">Bedrooms</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{measurements.bathrooms}</div>
                <div className="text-sm text-muted-foreground">Bathrooms</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{(measurements.buildingEfficiency * 100).toFixed(0)}%</div>
                <div className="text-sm text-muted-foreground">Efficiency</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
