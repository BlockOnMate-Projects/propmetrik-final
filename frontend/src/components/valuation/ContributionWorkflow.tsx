'use client';

/**
 * Contribution Workflow Components
 * 
 * Components for displaying gap analysis and contribution prompts
 * during the valuation process.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertTriangle,
  Award,
  CheckCircle,
  Coins,
  Gift,
  HelpCircle,
  Info,
  MapPin,
  Star,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';

// =====================================================
// TYPES
// =====================================================

export interface GapAnalysis {
  hasGap: boolean;
  gapSeverity: 'none' | 'minor' | 'moderate' | 'severe';
  gapReasons: GapReason[];
  requiredComparables: number;
  availableComparables: number;
  missingDataPoints: MissingDataPoint[];
  contributionPrompt: ContributionPrompt | null;
  confidenceImpact: number;
}

export interface GapReason {
  code: string;
  description: string;
  impact: number;
  suggestedAction: string;
}

export interface MissingDataPoint {
  field: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  rewardCredits: number;
}

export interface ContributionPrompt {
  id: string;
  type: 'comparable' | 'property_update' | 'transaction' | 'market_data';
  title: string;
  description: string;
  requiredFields: RequiredField[];
  optionalFields: OptionalField[];
  rewardCredits: number;
  expiresAt: Date;
  propertyReference?: string;
  searchCriteria: ComparableSearchCriteria;
}

export interface RequiredField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'location';
  options?: string[];
  validation?: FieldValidation;
}

export interface OptionalField extends RequiredField {
  bonusCredits: number;
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface ComparableSearchCriteria {
  region: string;
  propertyType: string;
  minArea: number;
  maxArea: number;
  minBedrooms: number;
  maxBedrooms: number;
  priceRange: { min: number; max: number };
  radiusKm: number;
  maxAgeMonths: number;
}

export interface ContributorProfile {
  userId: string;
  totalCredits: number;
  availableCredits: number;
  reputationScore: number;
  contributionCount: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

// =====================================================
// GAP ANALYSIS ALERT
// =====================================================

interface GapAnalysisAlertProps {
  gapAnalysis: GapAnalysis;
  onContribute: () => void;
  onDismiss?: () => void;
}

export function GapAnalysisAlert({ gapAnalysis, onContribute, onDismiss }: GapAnalysisAlertProps) {
  if (!gapAnalysis.hasGap) return null;

  const severityColors = {
    minor: 'border-yellow-200 bg-yellow-50',
    moderate: 'border-orange-200 bg-orange-50',
    severe: 'border-red-200 bg-red-50',
  };

  const severityIcons = {
    minor: <Info className="h-5 w-5 text-yellow-600" />,
    moderate: <AlertTriangle className="h-5 w-5 text-orange-600" />,
    severe: <AlertTriangle className="h-5 w-5 text-red-600" />,
  };

  return (
    <Alert className={severityColors[gapAnalysis.gapSeverity as keyof typeof severityColors]}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {severityIcons[gapAnalysis.gapSeverity as keyof typeof severityIcons]}
          <div className="space-y-1">
            <AlertTitle className="font-semibold">
              Comparable Data Gap Detected
            </AlertTitle>
            <AlertDescription className="text-sm">
              {gapAnalysis.gapReasons[0]?.description || 
                'Additional comparable data would improve valuation accuracy.'}
            </AlertDescription>
            
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span>
                <strong>{gapAnalysis.availableComparables}</strong> / {gapAnalysis.requiredComparables} comparables
              </span>
              <span>
                Confidence impact: <strong>-{gapAnalysis.confidenceImpact.toFixed(0)}%</strong>
              </span>
            </div>

            {gapAnalysis.contributionPrompt && (
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" onClick={onContribute}>
                  <Gift className="h-4 w-4 mr-2" />
                  Contribute Data (+{gapAnalysis.contributionPrompt.rewardCredits} credits)
                </Button>
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                  Skip for now
                </Button>
              </div>
            )}
          </div>
        </div>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Alert>
  );
}

// =====================================================
// CONTRIBUTION DIALOG
// =====================================================

interface ContributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: ContributionPrompt;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  contributorProfile?: ContributorProfile;
}

export function ContributionDialog({
  open,
  onOpenChange,
  prompt,
  onSubmit,
  contributorProfile,
}: ContributionDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attestation, setAttestation] = useState(false);

  const handleFieldChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const calculateTotalCredits = () => {
    let total = prompt.rewardCredits;
    prompt.optionalFields.forEach((field) => {
      if (formData[field.name]) {
        total += field.bonusCredits;
      }
    });
    return total;
  };

  const handleSubmit = async () => {
    // Validate required fields
    const missingRequired = prompt.requiredFields.filter(
      (field) => !formData[field.name]
    );

    if (missingRequired.length > 0) {
      toast({
        title: 'Missing required fields',
        description: `Please fill in: ${missingRequired.map((f) => f.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    if (!attestation) {
      toast({
        title: 'Attestation required',
        description: 'Please confirm that the information is accurate.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      toast({
        title: 'Contribution submitted!',
        description: `You earned ${calculateTotalCredits()} credits.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Submission failed',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: RequiredField | OptionalField, isOptional = false) => {
    const bonusCredits = isOptional ? (field as OptionalField).bonusCredits : 0;

    return (
      <div key={field.name} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={field.name}>
            {field.label}
            {!isOptional && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {bonusCredits > 0 && (
            <Badge variant="secondary" className="text-xs">
              +{bonusCredits} credits
            </Badge>
          )}
        </div>
        
        {field.type === 'text' && (
          <Input
            id={field.name}
            value={(formData[field.name] as string) || ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        )}
        
        {field.type === 'number' && (
          <Input
            id={field.name}
            type="number"
            value={(formData[field.name] as number) || ''}
            onChange={(e) => handleFieldChange(field.name, parseFloat(e.target.value))}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            min={field.validation?.min}
            max={field.validation?.max}
          />
        )}
        
        {field.type === 'date' && (
          <Input
            id={field.name}
            type="date"
            value={(formData[field.name] as string) || ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
          />
        )}
        
        {field.type === 'select' && (
          <Select
            value={(formData[field.name] as string) || ''}
            onValueChange={(value) => handleFieldChange(field.name, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {field.type === 'location' && (
          <div className="flex gap-2">
            <Input
              placeholder="Latitude"
              type="number"
              step="any"
              value={(formData[`${field.name}_lat`] as number) || ''}
              onChange={(e) => handleFieldChange(`${field.name}_lat`, parseFloat(e.target.value))}
            />
            <Input
              placeholder="Longitude"
              type="number"
              step="any"
              value={(formData[`${field.name}_lng`] as number) || ''}
              onChange={(e) => handleFieldChange(`${field.name}_lng`, parseFloat(e.target.value))}
            />
            <Button variant="outline" size="icon" type="button">
              <MapPin className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {prompt.title}
          </DialogTitle>
          <DialogDescription>{prompt.description}</DialogDescription>
        </DialogHeader>

        {/* Reward Preview */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                <span className="font-medium">Potential Reward</span>
              </div>
              <div className="text-2xl font-bold text-primary">
                {calculateTotalCredits()} credits
              </div>
            </div>
            {contributorProfile && (
              <div className="mt-2 text-sm text-muted-foreground">
                Current balance: {contributorProfile.availableCredits} credits |
                Tier: {contributorProfile.tier}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Criteria Info */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              We&apos;re looking for
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 pb-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Property type: <strong>{prompt.searchCriteria.propertyType}</strong></div>
              <div>Region: <strong>{prompt.searchCriteria.region}</strong></div>
              <div>Size: <strong>{prompt.searchCriteria.minArea.toFixed(0)} - {prompt.searchCriteria.maxArea.toFixed(0)} sqm</strong></div>
              <div>Bedrooms: <strong>{prompt.searchCriteria.minBedrooms} - {prompt.searchCriteria.maxBedrooms}</strong></div>
            </div>
          </CardContent>
        </Card>

        {/* Required Fields */}
        <div className="space-y-4">
          <h3 className="font-medium">Required Information</h3>
          {prompt.requiredFields.map((field) => renderField(field, false))}
        </div>

        <Separator />

        {/* Optional Fields */}
        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            Optional Information
            <Badge variant="outline" className="text-xs">Bonus credits</Badge>
          </h3>
          {prompt.optionalFields.map((field) => renderField(field, true))}
        </div>

        <Separator />

        {/* Attestation */}
        <div className="flex items-start gap-2">
          <Checkbox
            id="attestation"
            checked={attestation}
            onCheckedChange={(checked: boolean | 'indeterminate') => setAttestation(checked === true)}
          />
          <Label htmlFor="attestation" className="text-sm leading-relaxed">
            I confirm that the information provided is accurate to the best of my knowledge.
            I understand that providing false information may result in credit penalties.
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : `Submit & Earn ${calculateTotalCredits()} Credits`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// CONTRIBUTOR PROFILE CARD
// =====================================================

interface ContributorProfileCardProps {
  profile: ContributorProfile;
  onViewDetails?: () => void;
}

export function ContributorProfileCard({ profile, onViewDetails }: ContributorProfileCardProps) {
  const tierColors = {
    bronze: 'from-amber-600 to-amber-800',
    silver: 'from-gray-400 to-gray-600',
    gold: 'from-yellow-400 to-yellow-600',
    platinum: 'from-slate-300 to-slate-500',
  };

  const tierIcons = {
    bronze: <Award className="h-5 w-5" />,
    silver: <Award className="h-5 w-5" />,
    gold: <Star className="h-5 w-5" />,
    platinum: <Star className="h-5 w-5" />,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Contributor Profile</CardTitle>
          <Badge 
            className={`bg-gradient-to-r ${tierColors[profile.tier]} text-foreground`}
          >
            {tierIcons[profile.tier]}
            <span className="ml-1 capitalize">{profile.tier}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-bold">{profile.availableCredits}</div>
            <div className="text-sm text-muted-foreground">Available Credits</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{profile.contributionCount}</div>
            <div className="text-sm text-muted-foreground">Contributions</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Reputation Score</span>
            <span className="font-medium">{profile.reputationScore.toFixed(0)}/100</span>
          </div>
          <Progress value={profile.reputationScore} className="h-2" />
        </div>

        {onViewDetails && (
          <Button variant="outline" className="w-full" onClick={onViewDetails}>
            <TrendingUp className="h-4 w-4 mr-2" />
            View Full Profile
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================
// CREDIT REWARD ANIMATION
// =====================================================

interface CreditRewardAnimationProps {
  credits: number;
  onComplete?: () => void;
}

export function CreditRewardAnimation({ credits, onComplete }: CreditRewardAnimationProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/50 z-50">
      <div className="bg-card rounded-2xl p-8 shadow-xl animate-bounce-in text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
        <p className="text-muted-foreground mb-4">Your contribution helps everyone.</p>
        <div className="flex items-center justify-center gap-2 text-3xl font-bold text-primary">
          <Coins className="h-8 w-8" />
          +{credits} Credits
        </div>
      </div>
    </div>
  );
}

// =====================================================
// EXPORTS
// =====================================================

export default {
  GapAnalysisAlert,
  ContributionDialog,
  ContributorProfileCard,
  CreditRewardAnimation,
};
