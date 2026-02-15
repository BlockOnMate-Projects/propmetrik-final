"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileCheck, PenTool, Loader2 } from "lucide-react";

interface Property {
  id: string;
  title: string;
}

export default function TenantPortalHome() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch real properties from the backend for testing links
    // Uses the main frontend API proxy
    fetch('/api/v1/pm/properties?limit=5')
      .then(res => res.json())
      .then(data => {
        setProperties(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="text-center mb-10 space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">PROPMETRIK Tenant Portal</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Welcome to the tenant experience. This portal allows you to apply for properties, 
          track your application status, and sign lease agreements completely online.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <Building2 className="h-10 w-10 text-primary mb-2" />
            <CardTitle>Apply for Property</CardTitle>
            <CardDescription>Start a new application for a listing</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">
              Normally, you'll receive a link from a property manager. For testing, select a property below:
            </p>
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : properties.length > 0 ? (
              <div className="space-y-2">
                {properties.slice(0, 3).map(p => (
                  <Button key={p.id} asChild variant="outline" className="w-full justify-start text-left text-sm">
                    <Link href={`/tenant/apply/${p.id}`}>{p.title}</Link>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-600">No properties found. Generate a link from the Dashboard.</p>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <FileCheck className="h-10 w-10 text-primary mb-2" />
            <CardTitle>Track Status</CardTitle>
            <CardDescription>Check the progress of your application</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">
              After submitting, you'll receive a link to track your application status.
            </p>
            <p className="text-sm text-slate-400 italic">
              Submit an application to get your tracking link.
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <PenTool className="h-10 w-10 text-primary mb-2" />
            <CardTitle>Sign Lease</CardTitle>
            <CardDescription>Review and sign your lease agreement</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">
              When approved, you'll receive a link to digitally sign your lease.
            </p>
            <p className="text-sm text-slate-400 italic">
              Lease signing link will be emailed when ready.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 text-center text-sm text-slate-400">
        <p>PROPMETRIK Tenant Portal &copy; {new Date().getFullYear()}</p>
        <p>Development Version 0.1.0</p>
      </div>
    </div>
  );
}
