'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PMPreferencesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Preferences</h1>
        <p className="text-zinc-400 text-sm mt-1">Customize dashboard and data views.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Dashboard Defaults</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Default landing page and dashboard widgets.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Data View Preferences</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Table density, sorting, and filters.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Units & Formats</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Measurement units, currency, and date formats.
        </CardContent>
      </Card>
    </div>
  );
}
