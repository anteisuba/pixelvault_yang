import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { refreshAvatarFromClerk } from '@/services/user.service'

export async function POST() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const user = await refreshAvatarFromClerk(clerkId)
    return NextResponse.json({
      success: true,
      data: { avatarUrl: user?.avatarUrl ?? null },
    })
  } catch (error) {
    logger.error('[API /api/users/me/avatar-sync] Error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { success: false, error: 'Failed to sync avatar' },
      { status: 500 },
    )
  }
}
