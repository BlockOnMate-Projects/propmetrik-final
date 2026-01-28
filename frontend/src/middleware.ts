import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();
  
  // Get the port from the host header
  const host = request.headers.get('host') || '';
  const port = host.split(':')[1] || '3000';

  // PM Portal runs on port 3002
  if (port === '3002') {
    // If accessing root, redirect to PM Portal dashboard
    if (pathname === '/') {
      url.pathname = '/pm-portal/dashboard';
      return NextResponse.redirect(url);
    }
    
    // If trying to access /dashboard (main dashboard), redirect to PM Portal
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
      url.pathname = pathname.replace('/dashboard', '/pm-portal/dashboard');
      return NextResponse.redirect(url);
    }
  }
  
  // Agents Portal runs on port 3003
  if (port === '3003') {
    if (pathname === '/') {
      url.pathname = '/agents-portal/dashboard';
      return NextResponse.redirect(url);
    }
  }

  // Default behavior for port 3000 (main dashboard)
  // Let the page.tsx handle the redirect to /dashboard

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
