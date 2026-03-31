import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const QuerySchema = z.object({
  url: z.string().url(),
})

/**
 * GET /api/image/proxy?url=<encoded-url>
 *
 * Proxies an image fetch server-side to bypass CORS restrictions.
 * Used by the Studio reference image feature to convert R2 URLs to base64.
 * Auth-gated to prevent abuse.
 */
export async function GET(request: NextRequest) {
  // 1. Auth
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  // 2. Validate
  const url = request.nextUrl.searchParams.get('url')
  const parsed = QuerySchema.safeParse({ url })
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid URL parameter' },
      { status: 400 },
    )
  }

  // 3. Fetch and proxy
  try {
    const res = await fetch(parsed.data.url)
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Upstream returned ${res.status}` },
        { status: 502 },
      )
    }

    const contentType = res.headers.get('content-type') ?? 'image/png'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'URL does not point to an image' },
        { status: 400 },
      )
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch (err) {
    logger.error('Image proxy failed', { url: parsed.data.url, error: err })
    return NextResponse.json(
      { success: false, error: 'Failed to fetch image' },
      { status: 502 },
    )
  }
}
