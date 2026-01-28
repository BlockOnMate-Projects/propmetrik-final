'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/pm-portal/account/profile');
  }, [router]);

  return null;
}
