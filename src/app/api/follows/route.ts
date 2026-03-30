import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { ToggleFollowSchema } from '@/types'
import type { ToggleFollowResponse } from '@/types'
import { ensureUser } from '@/services/user.service'
import { toggleFollow } from '@/services/follow.service'

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ToggleFollowResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<ToggleFollowResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = ToggleFollowSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<ToggleFollowResponse>(
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
    const result = await toggleFollow(user.id, parseResult.data.targetUserId)

    return NextResponse.json<ToggleFollowResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('[API /api/follows POST] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    const status =
      message.includes('yourself') || message.includes('not found') ? 400 : 500

    return NextResponse.json<ToggleFollowResponse>(
      { success: false, error: message },
      { status },
    )
  }
}
