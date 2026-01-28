'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function PMPortalPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/pm-portal/login');
      return;
    }
    router.replace('/pm-portal/dashboard');
  }, [loading, router, user]);

  return null;
}
