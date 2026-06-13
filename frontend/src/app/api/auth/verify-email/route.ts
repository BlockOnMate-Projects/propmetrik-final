import { NextRequest, NextResponse } from 'next/server';

// /api/auth/* is excluded from the backend proxy (NextAuth namespace), so this
// thin server-side proxy forwards email verification to the Express backend.
// Must use INTERNAL_API_URL (server-reachable), NOT NEXT_PUBLIC_API_URL.
const API_BASE = process.env.INTERNAL_API_URL || 'http://localhost:4000';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    const res = await fetch(`${API_BASE}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({ success: false, message: 'Verification failed' }));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('verify-email proxy error:', error);
    return NextResponse.json({ success: false, message: 'Verification error' }, { status: 500 });
  }
}
