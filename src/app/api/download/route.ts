import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'

const QuerySchema = z.object({
  url: z.string().url(),
  filename: z.string().trim().min(1).optional(),
})

function isAllowedStorageUrl(assetUrl: string): boolean {
  const storageBaseUrl = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  if (!storageBaseUrl) {
    return false
  }

  try {
    const parsedAssetUrl = new URL(assetUrl)
    const parsedStorageBaseUrl = new URL(storageBaseUrl)
    const normalizedBasePath = parsedStorageBaseUrl.pathname.endsWith('/')
      ? parsedStorageBaseUrl.pathname
      : `${parsedStorageBaseUrl.pathname}/`

    return (
      parsedAssetUrl.origin === parsedStorageBaseUrl.origin &&
      (parsedAssetUrl.pathname === parsedStorageBaseUrl.pathname ||
        parsedAssetUrl.pathname.startsWith(normalizedBasePath))
    )
  } catch {
    return false
  }
}

function buildContentDisposition(filename?: string): string {
  const safeFilename = (filename ?? 'download')
    .replace(/[\r\n"]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()

  return `attachment; filename="${safeFilename || 'download'}"`
}

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
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

  if (!isAllowedStorageUrl(parsed.data.url)) {
    return NextResponse.json(
      { success: false, error: 'Download URL is not allowed' },
      { status: 403 },
    )
  }

  try {
    const upstreamResponse = await fetch(parsed.data.url)
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
