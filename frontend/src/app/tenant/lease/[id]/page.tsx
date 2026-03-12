"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getLeaseByApplicationId, submitLeaseSignature, LeaseAgreement } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, PenTool, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function LeaseSigningPage() {
  const params = useParams();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lease, setLease] = useState<LeaseAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    async function loadData() {
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
    loadData();
  }, [params.id]);

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    ctx.beginPath();
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const endDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setSignatureData(null);
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
      if (lease) {
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
              <div dangerouslySetInnerHTML={{ __html: lease.content || '' }} />
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
                  <span className="font-medium">{lease.terms?.startDate} - {lease.terms?.endDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Monthly Rent</span>
                  <span className="font-medium">₵{(lease.terms?.rentAmount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Deposit</span>
                  <span className="font-medium">₵{(lease.terms?.securityDeposit || 0).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Signature</CardTitle>
                <CardDescription>Draw your signature below</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative border-2 border-dashed border-slate-300 rounded bg-white">
                  <canvas
                    ref={canvasRef}
                    width={280}
                    height={120}
                    className="w-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={endDrawing}
                    onMouseLeave={endDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={endDrawing}
                  />
                  {signatureData && (
                    <button
                      onClick={clearSignature}
                      className="absolute top-2 right-2 p-1 bg-white/80 rounded hover:bg-slate-100"
                      title="Clear signature"
                    >
                      <RotateCcw className="h-4 w-4 text-slate-500" />
                    </button>
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
                <Button className="w-full" onClick={handleSubmit} disabled={signing || !signatureData}>
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
