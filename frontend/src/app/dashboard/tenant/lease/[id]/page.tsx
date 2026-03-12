'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import PortalShell from '@/components/tenant/PortalShell';
import { getLeaseForSigning, signLease, LeaseForSigning } from '@/lib/tenant/api';
import SignatureModal from '@/components/tenant/SignatureModal';
import { useToast } from '@/contexts/TenantToastContext';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  Loader2,
  Calendar,
  DollarSign,
  Building2,
  AlertTriangle,
  Pen,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const T = '/dashboard/tenant';

function LeaseSigningContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { addToast } = useToast();
  const [lease, setLease] = useState<LeaseForSigning | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    loadLease();
  }, [id]);

  const loadLease = async () => {
    try {
      const data = await getLeaseForSigning(id);
      setLease(data);
      if (data.signedAt) setSigned(true);
    } catch {
      addToast('error', 'Failed to load lease details');
    } finally {
      setLoading(false);
    }
  };

  const handleSignatureCapture = useCallback((data: string) => {
    setSignatureData(data);
    setShowSignatureModal(false);
  }, []);

  const handleSign = async () => {
    if (!signatureData || !agreedToTerms || signing) return;
    setSigning(true);
    try {
      await signLease(id, signatureData);
      addToast('success', 'Lease signed successfully!');
      setSigned(true);
      if (lease?.applicationId) {
        router.push(`/application/${lease.applicationId}/status`);
      }
    } catch {
      addToast('error', 'Failed to sign lease');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>;
  }

  if (!lease) {
    return (
      <div className="text-center py-16">
        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">Lease not found</p>
        <Link href={T} className="text-sm text-cyan-600 hover:underline mt-2 inline-block">Back to Dashboard</Link>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 animate-fade-in">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Lease Signed Successfully!</h2>
        <p className="text-sm text-gray-500 mb-6">Your lease agreement has been signed and recorded. You can view it anytime from your documents.</p>
        <div className="flex items-center justify-center gap-3">
          <Link href={T} className="px-4 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 transition-colors">
            Go to Dashboard
          </Link>
          <Link href={`${T}/documents`} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
            View Documents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Link href={T} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>

      <div className="text-center mb-2">
        <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <FileText className="w-6 h-6 text-cyan-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Lease Agreement</h2>
        <p className="text-sm text-gray-500 mt-1">Review and sign your lease agreement</p>
      </div>

      {/* Lease Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lease Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Property</p>
                <p className="text-sm font-medium text-gray-900">{lease.propertyName || 'Property'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <DollarSign className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Monthly Rent</p>
                <p className="text-sm font-medium text-gray-900">{lease.currency || 'GHS'} {lease.rentAmount?.toLocaleString() || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Start Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {lease.startDate ? new Date(lease.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">End Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {lease.endDate ? new Date(lease.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>
            </div>
          </div>
          {lease.securityDeposit && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-xs text-amber-700">
                <Shield className="w-3 h-3 inline mr-1" />
                Security Deposit: {lease.currency || 'GHS'} {lease.securityDeposit.toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Terms */}
      {lease.terms && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
              <div className="prose prose-sm text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{lease.terms}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signature */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Signature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {signatureData ? (
            <div className="space-y-3">
              <div className="border border-gray-200 rounded-xl p-4 bg-white">
                <img src={signatureData} alt="Your signature" className="max-h-20 mx-auto" />
              </div>
              <button onClick={() => setShowSignatureModal(true)} className="text-sm text-cyan-600 hover:underline font-medium">
                <Pen className="w-3.5 h-3.5 inline mr-1" /> Re-sign
              </button>
            </div>
          ) : (
            <button onClick={() => setShowSignatureModal(true)}
              className="w-full py-8 border-2 border-dashed border-gray-200 rounded-xl hover:border-cyan-400 transition-colors flex flex-col items-center justify-center text-gray-400 hover:text-cyan-500">
              <Pen className="w-6 h-6 mb-2" />
              <p className="text-sm font-medium">Click to add your signature</p>
            </button>
          )}

          <div className="flex items-start gap-2 pt-2">
            <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(checked === true)} />
            <Label htmlFor="terms" className="text-sm text-gray-700 leading-relaxed cursor-pointer">
              I have read and agree to the terms and conditions of this lease agreement. I understand that this constitutes a legally binding contract.
            </Label>
          </div>

          {(!signatureData || !agreedToTerms) && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">
                {!signatureData ? 'Please add your signature above' : 'Please agree to the terms to proceed'}
              </p>
            </div>
          )}

          <Button onClick={handleSign} disabled={!signatureData || !agreedToTerms || signing}
            className="w-full bg-cyan-600 hover:bg-cyan-700">
            {signing ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing...</span> : 'Sign Lease Agreement'}
          </Button>
        </CardContent>
      </Card>

      {showSignatureModal && (
        <SignatureModal
          isOpen={showSignatureModal}
          onClose={() => setShowSignatureModal(false)}
          onConfirm={handleSignatureCapture}
          signerName={lease?.tenantName || ''}
        />
      )}
    </div>
  );
}

export default function LeaseSigningPage() {
  return (
    <PortalShell title="Sign Lease">
      <LeaseSigningContent />
    </PortalShell>
  );
}
