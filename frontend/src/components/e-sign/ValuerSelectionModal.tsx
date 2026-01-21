'use client';

/**
 * ValuerSelectionModal Component
 * 
 * Modal for selecting who will sign the valuation report:
 * - Option 1: Current user signs (if qualified valuer)
 * - Option 2: Delegate to another valuer (select from list)
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  User,
  Users,
  PenTool,
  Send,
  CheckCircle,
  AlertCircle,
  Shield,
} from 'lucide-react';

export interface Valuer {
  id: string;
  name: string;
  email: string | null;
  qualifications: string | null;
  license_number: string | null;
  company_name: string | null;
  is_active: boolean;
  can_approve?: boolean;
}

export interface ValuerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    signerId: string;
    signerName: string;
    signerEmail: string;
    isSelf: boolean;
    message?: string;
  }) => void;
  reportName: string;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
  isCurrentUserValuer?: boolean;
  apiBaseUrl?: string;
}

export function ValuerSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  reportName,
  currentUserId,
  currentUserName,
  currentUserEmail,
  isCurrentUserValuer = true,
  apiBaseUrl = '/api',
}: ValuerSelectionModalProps) {
  const [signingMode, setSigningMode] = useState<'self' | 'delegate'>('self');
  const [selectedValuerId, setSelectedValuerId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [valuers, setValuers] = useState<Valuer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch valuers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchValuers();
    }
  }, [isOpen]);

  const fetchValuers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/valuers`);
      if (!response.ok) throw new Error('Failed to fetch valuers');
      const data = await response.json();
      // Filter out current user from delegation list
      setValuers(data.valuers?.filter((v: Valuer) => v.id !== currentUserId && v.is_active) || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      if (signingMode === 'self') {
        onConfirm({
          signerId: currentUserId,
          signerName: currentUserName,
          signerEmail: currentUserEmail,
          isSelf: true,
        });
      } else {
        const selectedValuer = valuers.find(v => v.id === selectedValuerId);
        if (!selectedValuer) {
          throw new Error('Please select a valuer');
        }
        onConfirm({
          signerId: selectedValuer.id,
          signerName: selectedValuer.name,
          signerEmail: selectedValuer.email || '',
          isSelf: false,
          message: message || undefined,
        });
      }
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  const canProceed = signingMode === 'self' 
    ? isCurrentUserValuer 
    : selectedValuerId !== '';

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PenTool className="w-5 h-5 text-amber-500" />
            Sign Valuation Report
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Choose how to sign: <span className="text-white font-medium">{reportName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Signing mode selection */}
          <div className="space-y-3">
            {/* Self-sign option */}
            <div
              className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                signingMode === 'self'
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-700 hover:border-zinc-600'
              }`}
              onClick={() => setSigningMode('self')}
            >
              <input
                type="radio"
                name="signingMode"
                value="self"
                checked={signingMode === 'self'}
                onChange={() => setSigningMode('self')}
                className="mt-1 w-4 h-4 accent-amber-500"
              />
              <div className="flex-1">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <User className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">I will sign this report</span>
                </Label>
                <p className="text-sm text-zinc-400 mt-1">
                  Sign the report now using your digital signature
                </p>
                {!isCurrentUserValuer && (
                  <div className="flex items-center gap-1 mt-2 text-orange-400 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    You may not have valuer credentials configured
                  </div>
                )}
              </div>
              {isCurrentUserValuer && (
                <Badge variant="outline" className="border-green-500 text-green-400 text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Qualified
                </Badge>
              )}
            </div>

            {/* Delegate option */}
            <div
              className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                signingMode === 'delegate'
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-700 hover:border-zinc-600'
              }`}
              onClick={() => setSigningMode('delegate')}
            >
              <input
                type="radio"
                name="signingMode"
                value="delegate"
                checked={signingMode === 'delegate'}
                onChange={() => setSigningMode('delegate')}
                className="mt-1 w-4 h-4 accent-amber-500"
              />
              <div className="flex-1">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Users className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">Send to another valuer</span>
                </Label>
                <p className="text-sm text-zinc-400 mt-1">
                  Delegate signing to a qualified professional valuer
                </p>
              </div>
              <Badge variant="outline" className="border-blue-500 text-blue-400 text-xs">
                <Send className="w-3 h-3 mr-1" />
                Delegate
              </Badge>
            </div>
          </div>

          {/* Valuer selection (when delegating) */}
          {signingMode === 'delegate' && (
            <div className="space-y-4 pl-7">
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">Select Valuer</Label>
                {isLoading ? (
                  <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading valuers...
                  </div>
                ) : (
                  <Select value={selectedValuerId} onValueChange={setSelectedValuerId}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Choose a valuer to sign..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {valuers.length === 0 ? (
                        <div className="p-3 text-center text-zinc-500 text-sm">
                          No other valuers available
                        </div>
                      ) : (
                        valuers.map((valuer) => (
                          <SelectItem
                            key={valuer.id}
                            value={valuer.id}
                            className="text-white hover:bg-zinc-700"
                          >
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-amber-500" />
                              <span>{valuer.name}</span>
                              {valuer.qualifications && (
                                <span className="text-zinc-500 text-xs">
                                  ({valuer.qualifications})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">Message (Optional)</Label>
                <Textarea
                  placeholder="Add a message for the valuer..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 min-h-[80px]"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-zinc-800 pt-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canProceed || isSubmitting}
            className="bg-amber-600 hover:bg-amber-500 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : signingMode === 'self' ? (
              <>
                <PenTool className="w-4 h-4 mr-2" />
                Continue to Sign
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send for Signature
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ValuerSelectionModal;
