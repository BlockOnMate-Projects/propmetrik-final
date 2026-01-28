'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PMActivityLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Activity Log</h1>
        <p className="text-zinc-400 text-sm mt-1">Login history and recent actions.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          No activity recorded yet.
        </CardContent>
      </Card>
    </div>
  );
}
