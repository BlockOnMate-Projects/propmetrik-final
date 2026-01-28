'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PMSupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Help & Support</h1>
        <p className="text-zinc-400 text-sm mt-1">Knowledge base and support tickets.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Knowledge Base</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Documentation and guides are available in the support portal.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Support Tickets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-zinc-400">
          <span>No open tickets.</span>
          <Button className="bg-amber-600 hover:bg-amber-700 w-fit">Open a Ticket</Button>
        </CardContent>
      </Card>
    </div>
  );
}
