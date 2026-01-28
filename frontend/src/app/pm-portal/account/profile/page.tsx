'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';

export default function PMProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">My Profile</h1>
        <p className="text-zinc-400 text-sm mt-1">Personal details and role information.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Personal Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Name</span>
            <span>{user?.name || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Email</span>
            <span>{user?.email || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Role</span>
            <span className="capitalize">{user?.role?.replace('_', ' ') || '—'}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Role & Permissions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          Role-based permissions are managed by your organization administrator.
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Professional Credentials</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400">
          No professional credentials on file.
        </CardContent>
      </Card>
    </div>
  );
}
