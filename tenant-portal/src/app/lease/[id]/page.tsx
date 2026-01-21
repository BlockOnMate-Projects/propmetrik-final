"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getLeaseByApplicationId, submitLeaseSignature, LeaseAgreement } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, PenTool, CheckCircle, RotateCcw } from "lucide-react";
import SignatureCanvas, { SignatureCanvasHandle } from "@/components/SignatureCanvas";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function LeaseSigningPage() {
  const params = useParams();
  const router = useRouter();
  const [lease, setLease] = useState<LeaseAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const signatureRef = useRef<SignatureCanvasHandle>(null);

  useEffect(() => {
    async function loadLease() {
      try {
        if (!params.id) return;
        const data = await getLeaseByApplicationId(params.id as string);
        setLease(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadLease();
  }, [params.id]);

  const handleClear = () => {
    signatureRef.current?.clear();
  };

  const handleSubmit = async () => {
    const signature = signatureRef.current?.toDataURL();
    if (!signature) {
      alert("Please sign the document before submitting.");
      return;
    }
    if (!agreed) {
      alert("Please accept the terms and conditions.");
      return;
    }

    setSigning(true);
    try {
      if (lease) {
        await submitLeaseSignature(lease.id, signature);
        // Redirect to success or refresh
        alert("Lease signed successfully!");
        router.push(`/application/${lease.applicationId}/status`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to submit signature");
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
                 <CardDescription>Sign in the box below</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SignatureCanvas ref={signatureRef} className="h-40 w-full border-2 border-dashed border-slate-300 rounded bg-slate-50" />
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs">
                    <RotateCcw className="mr-2 h-3 w-3" /> Clear
                  </Button>
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
    </div>
  );
}
