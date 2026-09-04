import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { safeFetch } from '@/lib/url-guard'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  buildContentDisposition,
  createOwnedAssetDownloadUrl,
  resolveDownloadTarget,
} from '@/services/download.service'

const QuerySchema = z.object({
  url: z.string().url(),
  filename: z.string().trim().min(1).optional(),
})

/**
 * GET /api/download
 *
 * Two shapes, decided by who owns the asset:
 *
 * - our own R2 object → `{ success: true, data: { downloadUrl } }`, a
 *   presigned GET the browser follows itself. The bytes never touch a Vercel
 *   function (they used to enter and leave it once per download).
 * - a provider's temporary CDN asset → the bytes streamed through with an
 *   attachment disposition, because those hosts allow neither CORS nor
 *   signing.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { success: allowed } = await rateLimit(
    `download:${userId}`,
    RATE_LIMIT_CONFIGS.outboundProbe,
  )
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429 },
    )
  }

  const parsed = QuerySchema.safeParse({
    url: request.nextUrl.searchParams.get('url'),
    filename: request.nextUrl.searchParams.get('filename') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid download parameters' },
      { status: 400 },
    )
  }

  const target = resolveDownloadTarget(parsed.data.url)
  if (target.kind === 'forbidden') {
    return NextResponse.json(
      { success: false, error: 'Download URL is not allowed' },
      { status: 403 },
    )
  }

  if (target.kind === 'owned') {
    try {
      const downloadUrl = await createOwnedAssetDownloadUrl({
        storageKey: target.storageKey,
        filename: parsed.data.filename,
      })

      return NextResponse.json(
        { success: true, data: { downloadUrl } },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    } catch (error) {
      logger.error('Download presign failed', {
        storageKey: target.storageKey,
        error,
      })
      return NextResponse.json(
        { success: false, error: 'Failed to sign download URL' },
        { status: 500 },
      )
    }
  }

  try {
    const upstreamResponse = await safeFetch(parsed.data.url)
    if (!upstreamResponse.ok) {
      logger.error('Download proxy upstream failed', {
        url: parsed.data.url,
        status: upstreamResponse.status,
      })

      return NextResponse.json(
        {
          success: false,
          error: `Upstream returned ${upstreamResponse.status}`,
        },
        { status: 502 },
      )
    }

    if (!upstreamResponse.body) {
      return NextResponse.json(
        { success: false, error: 'Upstream returned empty body' },
        { status: 502 },
      )
    }

    return new NextResponse(upstreamResponse.body, {
      status: 200,
      headers: {
        'Content-Type':
          upstreamResponse.headers.get('content-type') ??
          'application/octet-stream',
        'Content-Disposition': buildContentDisposition(parsed.data.filename),
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    logger.error('Download proxy failed', { url: parsed.data.url, error })
    return NextResponse.json(
      { success: false, error: 'Failed to fetch download asset' },
      { status: 502 },
    )
  }
}
