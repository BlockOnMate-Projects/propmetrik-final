"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getLeaseByApplicationId, submitLeaseSignature, getESignEnvelopeByToken, submitESignSignature, LeaseAgreement, ESignField } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, PenTool, CheckCircle, RotateCcw } from "lucide-react";
import { SignatureCapture, SignatureData } from "@propmetrik/e-sign-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function LeaseSigningPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lease, setLease] = useState<LeaseAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // E-Sign specific state
  const [signerToken, setSignerToken] = useState<string | null>(null);
  const [signatureField, setSignatureField] = useState<ESignField | null>(null);
  const [envelopeData, setEnvelopeData] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      try {
        if (!params.id) return;
        
        // Check if this is an e-sign token (from magic link)
        const token = searchParams.get('token');
        
        if (token) {
          // This is an e-sign magic link - use the e-sign service
          setSignerToken(token);
          const esignData = await getESignEnvelopeByToken(token);
          if (esignData) {
            setEnvelopeData(esignData);
            // Find the signature field for this signer
            const sigField = esignData.fields?.find((f: ESignField) => 
              f.type === 'signature' || f.fieldType === 'signature'
            );
            setSignatureField(sigField || null);
            
            // Build lease object from e-sign data
            setLease({
              id: esignData.envelope?.id || params.id as string,
              applicationId: params.id as string,
              content: '', // Will show document image instead
              terms: {
                startDate: esignData.envelope?.metadata?.startDate || '',
                endDate: esignData.envelope?.metadata?.endDate || '',
                rentAmount: esignData.envelope?.metadata?.rentAmount || 0,
                securityDeposit: esignData.envelope?.metadata?.securityDeposit || 0,
              },
              hasSigned: false,
              tenantName: esignData.signer?.name || 'Tenant',
              documentUrl: esignData.documentUrl,
              envelopeId: esignData.envelope?.id,
              signerToken: token,
              signerId: esignData.signer?.id,
              fields: esignData.fields,
            });
          }
        } else {
          // Regular lease fetch by application ID
          const data = await getLeaseByApplicationId(params.id as string);
          setLease(data);
          if (data.signerToken) {
            setSignerToken(data.signerToken);
          }
          if (data.fields) {
            const sigField = data.fields.find((f: ESignField) => 
              f.type === 'signature' || f.fieldType === 'signature'
            );
            setSignatureField(sigField || null);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.id, searchParams]);

  const handleConfirmSignature = (data: SignatureData) => {
    setSignatureData(data.data);
  };

  const handleSubmit = async () => {
    if (!signatureData) {
      alert("Please sign the document before submitting.");
      return;
    }
    if (!agreed) {
      alert("Please accept the terms and conditions.");
      return;
    }

    setSigning(true);
    try {
      if (signerToken && signatureField) {
        // Use e-sign service for signature submission
        const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
        const result = await submitESignSignature(signerToken, signatureField.id, base64Data, 'drawn');
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to submit signature');
        }
        
        alert(`Lease signed successfully!\nSignature ID: ${result.signerId || 'N/A'}\nHash: ${result.signatureHash || 'N/A'}`);
        
        // Redirect based on context
        if (lease?.applicationId) {
          router.push(`/application/${lease.applicationId}/status`);
        } else {
          router.push('/dashboard');
        }
      } else if (lease) {
        // Fallback to old method
        await submitLeaseSignature(lease.id, signatureData);
        alert("Lease signed successfully!");
        router.push(`/application/${lease.applicationId}/status`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to submit signature: " + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!lease) {
    return <div className="p-8 text-center">Lease not found</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Sign Lease Agreement</h1>
            <p className="text-slate-500">Please review the document carefully before signing.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Main Document View */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Lease Document</CardTitle>
            </CardHeader>
            <CardContent className="prose max-w-none text-slate-800 bg-white p-6 rounded-md border text-sm max-h-[600px] overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: lease.content }} />
            </CardContent>
          </Card>

          {/* Sidebar Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Terms Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-medium">{lease.terms.startDate} - {lease.terms.endDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Monthly Rent</span>
                  <span className="font-medium">₵{lease.terms.rentAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Deposit</span>
                  <span className="font-medium">₵{lease.terms.securityDeposit.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Signature</CardTitle>
                <CardDescription>Click below to adopt your signature</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  onClick={() => setShowModal(true)}
                  className="h-40 w-full border-2 border-dashed border-slate-300 rounded bg-slate-50 flex items-center justify-center cursor-pointer hover:border-primary hover:bg-slate-100 transition-all overflow-hidden"
                >
                  {signatureData ? (
                    <img src={signatureData} alt="Your Signature" className="max-h-full max-w-full" />
                  ) : (
                    <div className="text-center">
                      <PenTool className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <span className="text-sm text-slate-400">Click to Sign</span>
                    </div>
                  )}
                </div>

                <div className="flex items-start space-x-2 pt-2">
                  <Checkbox
                    id="terms"
                    checked={agreed}
                    onCheckedChange={(c) => setAgreed(c as boolean)}
                  />
                  <Label htmlFor="terms" className="text-xs text-slate-600 font-normal leading-tight">
                    I have read and agree to the terms of this lease agreement. I understand this is a legally binding contract.
                  </Label>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={handleSubmit} disabled={signing}>
                  {signing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenTool className="mr-2 h-4 w-4" />}
                  Sign & Submit Lease
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      <SignatureCapture
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCapture={handleConfirmSignature}
        signerName={lease.tenantName || 'Tenant'}
        theme="light"
      />
    </div>
  );
}
