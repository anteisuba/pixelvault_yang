import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { ToggleLikeSchema } from '@/types'
import type { ToggleLikeResponse } from '@/types'
import { ensureUser } from '@/services/user.service'
import { toggleLike, getUserLikes } from '@/services/like.service'

/**
 * GET /api/likes?ids=id1,id2,...
 * Batch query which generations the current user has liked.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const ids = request.nextUrl.searchParams.get('ids')
    if (!ids) {
      return NextResponse.json(
        { success: false, error: 'Missing ids parameter' },
        { status: 400 },
      )
    }

    const generationIds = ids.split(',').filter(Boolean)
    if (generationIds.length === 0) {
      return NextResponse.json({ success: true, data: { likedIds: [] } })
    }

    const user = await ensureUser(clerkId)
    const likedSet = await getUserLikes(user.id, generationIds)

    return NextResponse.json({
      success: true,
      data: { likedIds: Array.from(likedSet) },
    })
  } catch (error) {
    logger.error('[API /api/likes GET] Error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to fetch likes' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ToggleLikeResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<ToggleLikeResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = ToggleLikeSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<ToggleLikeResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const user = await ensureUser(clerkId)
    const result = await toggleLike(user.id, parseResult.data.generationId)

    return NextResponse.json<ToggleLikeResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('[API /api/likes POST] Error', {
      error: error instanceof Error ? error.message : String(error),
    })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ToggleLikeResponse>(
      { success: false, error: message },
      { status: 400 },
    )
  }
}
