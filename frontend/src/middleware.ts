import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication (redirect to /login if no session)
const PROTECTED_PREFIXES = ['/dashboard'];
// Routes that should redirect to /dashboard if already authenticated
const AUTH_PAGES = ['/login', '/tenant-login'];

function hasSessionCookie(request: NextRequest): boolean {
  // NextAuth v5 session cookies (dev + production names)
  return (
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token')
  );
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
