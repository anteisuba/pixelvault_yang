import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { fetchDanbooruImage } from '@/services/research/danbooru-image.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { DanbooruImageQuerySchema } from '@/types/danbooru-catalog'

/**
 * GET /api/danbooru/image?path=/180x180/9b/67/<md5>.jpg
 *
 * 标签库样图浏览器直连被 Danbooru 的 Cloudflare 拦下时的退路（见
 * `fetchDanbooruImage`）。回的是图本身，所以不走 JSON 的路由工厂。
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
    `danbooru-image:${userId}`,
    RATE_LIMIT_CONFIGS.authedRead,
  )
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429 },
    )
  }

  const parsed = DanbooruImageQuerySchema.safeParse({
    path: request.nextUrl.searchParams.get('path'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid path' },
      { status: 400 },
    )
  }

  try {
    const upstream = await fetchDanbooruImage(parsed.data)
    if (!upstream) {
      return NextResponse.json(
        { success: false, error: 'Image unavailable' },
        { status: 502 },
      )
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        // 样图按 md5 命名、内容不变；只让浏览器缓存（带登录态，不进共享缓存）。
        'Cache-Control': 'private, max-age=604800, immutable',
      },
    })
  } catch (error) {
    logger.error('Danbooru image fetch failed', {
      path: parsed.data.path,
      error,
    })
    return NextResponse.json(
      { success: false, error: 'Failed to fetch image' },
      { status: 502 },
    )
  }
}
