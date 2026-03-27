import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateProfileSchema } from '@/types'
import type { UpdateProfileResponse } from '@/types'
import { ensureUser, updateProfile } from '@/services/user.service'

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<UpdateProfileResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const user = await ensureUser(clerkId)
    return NextResponse.json<UpdateProfileResponse>({
      success: true,
      data: {
        username: user.username ?? '',
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isPublic: user.isPublic,
      },
    })
  } catch (error) {
    console.error('[API /api/users/me/profile GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<UpdateProfileResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<UpdateProfileResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<UpdateProfileResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = UpdateProfileSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<UpdateProfileResponse>(
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
    const updated = await updateProfile(user.id, parseResult.data)

    return NextResponse.json<UpdateProfileResponse>({
      success: true,
      data: {
        username: updated.username ?? '',
        displayName: updated.displayName,
        avatarUrl: user.avatarUrl,
        bio: updated.bio,
        isPublic: updated.isPublic,
      },
    })
  } catch (error) {
    console.error('[API /api/users/me/profile PUT] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    // Username conflict
    if (message.includes('already taken') || message.includes('reserved')) {
      return NextResponse.json<UpdateProfileResponse>(
        { success: false, error: message },
        { status: 409 },
      )
    }

    // Validation error
    if (message.includes('must be')) {
      return NextResponse.json<UpdateProfileResponse>(
        { success: false, error: message },
        { status: 400 },
      )
    }

    return NextResponse.json<UpdateProfileResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
