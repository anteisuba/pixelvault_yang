import { logger } from '@/lib/logger'
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import {
  getPublicGenerations,
  countPublicGenerations,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { GallerySearchSchema, type GalleryResponse } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = GallerySearchSchema.safeParse(
      Object.fromEntries(searchParams),
    )

    if (!parsed.success) {
      return NextResponse.json<GalleryResponse>(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const { page, limit, search, model, sort, type } = parsed.data

    // If "mine" param is set, return the current user's own generations
    const mine = searchParams.get('mine') === '1'
    let userId: string | undefined
    if (mine) {
      const { userId: clerkId } = await auth()
      if (!clerkId) {
        return NextResponse.json<GalleryResponse>(
          { success: false, error: 'Unauthorized' },
          { status: 401 },
        )
      }
      const user = await ensureUser(clerkId)
      userId = user.id
    }

    const filterOpts = { search, model, type, userId }

    const [generations, total] = await Promise.all([
      getPublicGenerations({ page, limit, search, model, sort, type, userId }),
      countPublicGenerations(filterOpts),
    ])

    return NextResponse.json<GalleryResponse>({
      success: true,
      data: {
        generations,
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    })
  } catch (error) {
    logger.error('[API /api/images] ERROR', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json<GalleryResponse>(
      { success: false, error: 'Failed to fetch gallery' },
      { status: 500 },
    )
  }
}
