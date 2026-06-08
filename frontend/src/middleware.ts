import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication (redirect to /login if no session)
const PROTECTED_PREFIXES = ['/dashboard', '/onboarding'];
// Routes that should redirect to /dashboard if already authenticated
const AUTH_PAGES = ['/login', '/tenant-login'];

// Hostname of the tenant portal subdomain, e.g. "tenant.propmetrik.com" or
// "tenant.localhost". Config-driven so nothing is hardcoded; when unset the app
// behaves as a single host (legacy path-based tenant access still works).
const TENANT_HOST = process.env.NEXT_PUBLIC_TENANT_HOST
  ?.replace(/^https?:\/\//, '')
  .replace(/:\d+$/, '')
  .toLowerCase();

function hasSessionCookie(request: NextRequest): boolean {
  // NextAuth v5 session cookies (dev + production names)
  return (
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token')
  );
}

function isTenantHost(request: NextRequest): boolean {
  if (!TENANT_HOST) return false;
  const host = (request.headers.get('host') || request.nextUrl.hostname || '')
    .replace(/:\d+$/, '')
    .toLowerCase();
  return host === TENANT_HOST;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();

  // Redirect legacy PM Portal routes to unified dashboard/projects
  if (pathname.startsWith('/pm-portal')) {
    const newPath = pathname.replace('/pm-portal', '/dashboard/projects');
    url.pathname = newPath === '/dashboard/projects/dashboard'
      ? '/dashboard/projects'
      : newPath;
    return NextResponse.redirect(url);
  }

  // Redirect legacy Agent Portal routes to unified dashboard/deals
  if (pathname.startsWith('/agent')) {
    const subPath = pathname.replace('/agent', '');
    if (subPath === '' || subPath === '/') {
      url.pathname = '/dashboard/deals';
    } else if (subPath === '/login') {
      url.pathname = '/login';
    } else {
      url.pathname = `/dashboard/deals${subPath}`;
    }
    return NextResponse.redirect(url);
  }

  // ── Tenant subdomain routing ───────────────────────────────────────────
  // On the tenant host, the portal is the whole site: send the root and any
  // staff login to the tenant flow so tenants never see staff routes.
  if (isTenantHost(request)) {
    const loggedIn = hasSessionCookie(request);

    if (pathname === '/' || pathname === '/login') {
      url.pathname = loggedIn ? '/dashboard/tenant' : '/tenant-login';
      return NextResponse.redirect(url);
    }
    if (pathname === '/tenant-login' && loggedIn) {
      url.pathname = '/dashboard/tenant';
      return NextResponse.redirect(url);
    }
    const isProtectedTenant = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
    if (isProtectedTenant && !loggedIn) {
      url.pathname = '/tenant-login';
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Auth guard: redirect unauthenticated users to appropriate login page
  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (isProtected && !hasSessionCookie(request)) {
    // Tenant routes redirect to tenant login
    if (pathname.startsWith('/dashboard/tenant')) {
      url.pathname = '/tenant-login';
    } else {
      url.pathname = '/login';
    }
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Already logged in: redirect auth pages to appropriate dashboard
  // (but don't redirect /onboarding — that's a valid post-auth page)
  const isAuthPage = AUTH_PAGES.some(page => pathname === page);
  if (isAuthPage && hasSessionCookie(request)) {
    // /tenant-login → /dashboard/tenant, /login → /dashboard
    url.pathname = pathname === '/tenant-login' ? '/dashboard/tenant' : '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, fonts, etc.)
     * - API routes
     */
    '/((?!_next/static|_next/image|favicon.ico|icons|images|fonts|api).*)',
  ],
};
