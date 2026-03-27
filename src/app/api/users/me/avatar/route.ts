import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UploadProfileImageSchema } from '@/types'
import type { UploadProfileImageResponse } from '@/types'
import { ensureUser, uploadAvatar } from '@/services/user.service'

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<UploadProfileImageResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<UploadProfileImageResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parsed = UploadProfileImageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json<UploadProfileImageResponse>(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? 'Invalid input',
        },
        { status: 400 },
      )
    }

    const user = await ensureUser(clerkId)
    const result = await uploadAvatar(user.id, parsed.data.imageData)

    return NextResponse.json<UploadProfileImageResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/users/me/avatar] Error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to upload avatar'
    return NextResponse.json<UploadProfileImageResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
