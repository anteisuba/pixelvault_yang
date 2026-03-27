import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { ToggleLikeSchema } from '@/types'
import type { ToggleLikeResponse } from '@/types'
import { ensureUser } from '@/services/user.service'
import { toggleLike } from '@/services/like.service'

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
    console.error('[API /api/likes POST] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ToggleLikeResponse>(
      { success: false, error: message },
      { status: 400 },
    )
  }
}
