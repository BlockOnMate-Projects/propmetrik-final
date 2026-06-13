'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

/**
 * Staff gate for the e-sign workspace.
 *
 * E-sign is no longer a standalone shared service in the top nav — signing is initiated
 * in-context from each domain (lease, valuation, project, deal). These pages remain because
 * the lease flow routes into the envelope designer, but only `user_type === 'staff'` may
 * reach them. External signers (tenants, landlords, clients) sign via the public
 * `/sign/[token]` link and never touch this area.
 */
export default function ESignLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userType = (session?.user as any)?.userType;

  useEffect(() => {
    if (status === 'authenticated' && userType !== 'staff') {
      router.replace('/dashboard');
    }
  }, [status, userType, router]);

  // Don't flash e-sign content to non-staff while resolving / redirecting.
  if (status === 'loading' || (status === 'authenticated' && userType !== 'staff')) {
    return null;
  }

  return <>{children}</>;
}
