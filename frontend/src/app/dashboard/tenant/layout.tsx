'use client';

import { ToastProvider } from '@/contexts/TenantToastContext';
import { TenantWeb3Provider } from '@/components/tenant/Web3Provider';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <TenantWeb3Provider>
        {/*
         * The tenant portal is designed LIGHT (white sidebar/cards via bg-card, dark
         * text via text-gray-900, cyan accents) — same as the /tenant-login page. Its
         * structural backgrounds use theme tokens, so under the global DARK/system theme
         * the backgrounds go dark while the hardcoded dark text stays dark → unreadable.
         * Force light tokens for the whole portal (a nested `.light` scope overrides the
         * inherited `.dark`), matching the login/apply pages. Full token-sweep is later polish.
         *
         * `text-foreground` is REQUIRED here (not just `.light`): Tailwind preflight sets
         * `color: inherit` on inputs/selects/textareas, and several portal inputs set no
         * explicit text color. Without a foreground color on this wrapper they inherit the
         * global <body> color (the dark theme's near-white) and render white-on-white inside
         * the color-scheme:light fields. Setting text-foreground gives them a dark inherited
         * color within the light scope. Same as the login/apply wrapper.
         */}
        <div className="light [color-scheme:light] text-foreground">
          {children}
        </div>
      </TenantWeb3Provider>
    </ToastProvider>
  );
}
