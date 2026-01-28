'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PMTeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Team</h1>
        <p className="text-zinc-400 text-sm mt-1">Internal and vendor contacts.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Contacts</CardTitle>
        </CardHeader>
        <CardContent className="text-zinc-400 text-sm">
          Team and vendor directories will appear here.
        </CardContent>
      </Card>
    </div>
  );
}
