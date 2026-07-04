'use client';

import { useState } from 'react';

/**
 * Real brand logos for integration providers. Renders the official full-colour mark (via the
 * Iconify API — api.iconify.design, the widely-used public icon service) inside a white "app
 * tile", so brand colours stay visible in both light and dark themes. Any provider without a
 * brand mark, or a logo that fails to load, falls back to its emoji glyph.
 */

// provider type → Iconify icon ref (verified present in the Iconify sets). Optional `color`
// (hex without '#') tints monochrome (simple-icons) marks to their brand colour.
const ICON: Record<string, { icon: string; color?: string }> = {
  xero:            { icon: 'logos:xero' },
  quickbooks:      { icon: 'simple-icons:quickbooks', color: '2CA01C' },
  facebook:        { icon: 'logos:facebook' },
  instagram:       { icon: 'logos:instagram-icon' },
  tiktok:          { icon: 'logos:tiktok-icon' },
  twitter_x:       { icon: 'logos:x' },
  linkedin:        { icon: 'logos:linkedin-icon' },
  gmail:           { icon: 'logos:google-gmail' },
  google_calendar: { icon: 'logos:google-calendar' },
  google_drive:    { icon: 'logos:google-drive' },
  outlook:         { icon: 'vscode-icons:file-type-outlook' },
  onedrive:        { icon: 'logos:microsoft-onedrive' },
  zapier:          { icon: 'logos:zapier' },
  twilio:          { icon: 'logos:twilio-icon' },
  twilio_voice:    { icon: 'logos:twilio-icon' },
  whatsapp:        { icon: 'logos:whatsapp-icon' },
};

export function ProviderLogo({ type, emoji, size = 40 }: { type: string; emoji: string; size?: number }) {
  const ref = ICON[type];
  const [failed, setFailed] = useState(false);
  const showEmoji = !ref || failed;
  const src = ref
    ? `https://api.iconify.design/${ref.icon}.svg${ref.color ? `?color=%23${ref.color}` : ''}`
    : '';

  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5 shrink-0"
      style={{ width: size, height: size }}
    >
      {showEmoji ? (
        <span style={{ fontSize: size * 0.5 }} aria-hidden>{emoji}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size * 0.6}
          height={size * 0.6}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export default ProviderLogo;
