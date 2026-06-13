import { NextRequest, NextResponse } from 'next/server';

/**
 * Signup proxy.
 *
 * The client posts to /api/auth/signup, but next.config.js deliberately excludes
 * the whole /api/auth/* namespace from the backend proxy (to protect NextAuth's
 * [...nextauth] handler). Without this route, /api/auth/signup falls through to
 * NextAuth, which has no "signup" action and returns 400 Bad Request.
 *
 * Mirrors /api/auth/credentials-login: a thin proxy to the Express backend.
 */
// This handler runs server-side, so it needs a server-reachable absolute URL —
// NOT NEXT_PUBLIC_API_URL (which is the browser-facing "/api" rewrite path).
// Mirror the rewrites in next.config.js, which proxy to INTERNAL_API_URL.
const API_BASE = process.env.INTERNAL_API_URL || 'http://localhost:4000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({
      success: false,
      message: 'Account creation failed',
    }));

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Signup API error:', error);
    return NextResponse.json(
      { success: false, message: 'An error occurred during signup' },
      { status: 500 }
    );
  }
}
