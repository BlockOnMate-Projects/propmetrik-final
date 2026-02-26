'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PMDocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Documents & Signatures</h1>
        <p className="text-zinc-400 text-sm mt-1">Uploaded documents and signed agreements.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Documents</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          No documents available.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Signed Agreements</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          No signed agreements found.
        </CardContent>
      </Card>
    </div>
  );
}
