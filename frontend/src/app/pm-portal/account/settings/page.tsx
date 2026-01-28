'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PMAccountSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Account Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">Security, notifications, and language preferences.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Password & Security</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Configure password updates and security controls.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Two-Factor Authentication</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Two-factor authentication is not configured.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Manage email and in-app notification settings.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Language & Timezone</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Set your preferred language and timezone.
        </CardContent>
      </Card>
    </div>
  );
}
