import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { assertSafeUrl, safeFetch } from '@/lib/url-guard'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { isOwnedStorageUrl } from '@/services/storage/r2'

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

  // 2. Rate limit (outbound fetch — strict)
  const { success: allowed } = await rateLimit(
    `image-proxy:${userId}`,
    RATE_LIMIT_CONFIGS.outboundProbe,
  )
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429 },
    )
  }

  // 3. Validate
  const url = request.nextUrl.searchParams.get('url')
  const parsed = QuerySchema.safeParse({ url })
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid URL parameter' },
      { status: 400 },
    )
  }

  try {
    assertSafeUrl(parsed.data.url)
  } catch {
    return NextResponse.json(
      { success: false, error: 'URL is not allowed' },
      { status: 400 },
    )
  }

  // 4a. Same-origin short-circuit: if the URL is already in our R2 bucket the
  // proxy doesn't need to fetch+stream it — the browser can hit the CDN
  // directly. Skipping the Lambda hop saves the request a full US-East
  // round-trip (significant for non-US clients). Auth + rate-limit gates
  // above still apply, so the abuse surface is unchanged.
  if (isOwnedStorageUrl(parsed.data.url)) {
    return NextResponse.redirect(parsed.data.url, 302)
  }

  // 4b. Fetch and proxy
  try {
    const res = await safeFetch(parsed.data.url, {
      signal: AbortSignal.timeout(10_000),
    })
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
