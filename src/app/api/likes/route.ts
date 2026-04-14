import 'server-only'

import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { ToggleLikeSchema } from '@/types'
import { ensureUser } from '@/services/user.service'
import { toggleLike, getUserLikes } from '@/services/like.service'
import { createApiRoute } from '@/lib/api-route-factory'

// GET is intentionally manual: custom comma-separated `ids` query param
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

export const POST = createApiRoute({
  schema: ToggleLikeSchema,
  routeName: 'POST /api/likes',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    return toggleLike(user.id, data.generationId)
  },
})
