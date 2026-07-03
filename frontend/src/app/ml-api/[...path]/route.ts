import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

/**
 * Server-side proxy to the Python valuation engine.
 *
 * Replaces the old next.config `/ml-api/:path*` rewrite. A rewrite cannot inject
 * request headers, but the engine now requires a shared secret (X-Engine-Secret)
 * so it is no longer world-reachable. This handler runs on the server, attaches
 * the secret (kept server-side, never NEXT_PUBLIC), and requires an authenticated
 * session so the compute surface isn't open to anonymous callers.
 *
 * URL mapping is identical to the previous rewrite:
 *   /ml-api/<path>  ->  ${PYTHON_API_URL}/api/v1/<path>
 */
const PY_BASE = process.env.PYTHON_API_URL || 'http://localhost:8001'
const ENGINE_SECRET = process.env.ENGINE_SHARED_SECRET || ''

export const dynamic = 'force-dynamic'

async function forward(req: NextRequest, pathParts: string[]): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const search = req.nextUrl.search || ''
  const target = `${PY_BASE}/api/v1/${pathParts.join('/')}${search}`

  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
  }
  if (ENGINE_SECRET) headers['X-Engine-Secret'] = ENGINE_SECRET

  const init: RequestInit = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text()
  }

  try {
    const resp = await fetch(target, init)
    const body = await resp.text()
    return new NextResponse(body, {
      status: resp.status,
      headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'Valuation engine unreachable' }, { status: 502 })
  }
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  return forward(req, path)
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  return forward(req, path)
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  return forward(req, path)
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  return forward(req, path)
}
