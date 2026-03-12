'use client';

import { ToastProvider } from '@/contexts/TenantToastContext';
import { TenantWeb3Provider } from '@/components/tenant/Web3Provider';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <TenantWeb3Provider>
        {children}
      </TenantWeb3Provider>
    </ToastProvider>
  );
}
