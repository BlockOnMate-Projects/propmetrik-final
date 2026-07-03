/**
 * Per-listing metadata for the public property page (`/apply/[token]`).
 *
 * The page itself is a client component (interactive gallery + application form), so it
 * cannot export metadata. This server-component layout wraps it purely to provide dynamic
 * Open Graph / Twitter tags per property — what social crawlers (WhatsApp, Facebook,
 * X/Twitter, LinkedIn) read when an agent shares a listing link. Without this, every
 * shared listing rendered the generic site title/description.
 *
 * Server-side fetch uses INTERNAL_API_URL (the same server-reachable base as src/auth.ts);
 * the marketplace endpoint is public (no auth). Falls back to generic tags if the property
 * can't be loaded so a bad/expired token never breaks the page.
 */
import type { Metadata } from 'next';

const API_BASE = (process.env.INTERNAL_API_URL || 'http://localhost:4000').replace(/\/api\/v1$/, '');

async function fetchProperty(token: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/marketplace/properties/${token}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function firstAbsoluteImage(images: unknown): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const img = images[0] as string | { url?: string };
  const url = typeof img === 'string' ? img : img?.url;
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : undefined;
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  const property = await fetchProperty(token);

  if (!property) {
    return {
      title: 'Property Listing | PropMetrik',
      description: 'View this property listing on PropMetrik.',
    };
  }

  const priceLabel = property.price
    ? new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: property.currency || 'GHS',
        maximumFractionDigits: 0,
      }).format(property.price)
    : '';
  const dealWord =
    property.transaction_type === 'sale' ? 'For Sale'
    : property.transaction_type === 'lease' ? 'For Lease'
    : 'For Rent';
  const location = [property.city, property.region].filter(Boolean).join(', ');

  const title = `${property.title}${priceLabel ? ` — ${priceLabel}` : ''} | PropMetrik`;
  const summary = [
    dealWord,
    property.property_type,
    location,
    property.bedrooms ? `${property.bedrooms} bed` : '',
    property.bathrooms ? `${property.bathrooms} bath` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const description =
    (typeof property.description === 'string' && property.description.trim().slice(0, 200)) ||
    summary ||
    'View this property listing on PropMetrik.';
  const image = firstAbsoluteImage(property.images);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'PropMetrik',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default function PropertyListingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
