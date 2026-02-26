'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PMReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Reports</h1>
        <p className="text-zinc-400 text-sm mt-1">KPIs, cost, and risk analytics.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Analytics</CardTitle>
        </CardHeader>
        <CardContent className="text-zinc-400 text-sm">
          Reports and analytics dashboards will appear here.
        </CardContent>
      </Card>
    </div>
  );
}
