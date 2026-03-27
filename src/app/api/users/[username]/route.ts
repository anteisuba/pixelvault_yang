import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import type { CreatorProfilePageResponse } from '@/types'
import { getCreatorProfile, getUserByClerkId } from '@/services/user.service'
import { PROFILE } from '@/constants/config'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params
    const searchParams = _request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(
      50,
      Math.max(
        1,
        parseInt(
          searchParams.get('limit') ?? String(PROFILE.POLAROID_PAGE_SIZE),
          10,
        ),
      ),
    )

    // Get viewer's DB user ID if authenticated
    let viewerUserId: string | null = null
    const { userId: clerkId } = await auth()
    if (clerkId) {
      const viewer = await getUserByClerkId(clerkId)
      viewerUserId = viewer?.id ?? null
    }

    const profile = await getCreatorProfile(username, viewerUserId, page, limit)

    if (!profile) {
      return NextResponse.json<CreatorProfilePageResponse>(
        { success: false, error: 'Profile not found' },
        { status: 404 },
      )
    }

    if ('private' in profile) {
      return NextResponse.json(
        {
          success: false,
          error: 'private',
          data: {
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        },
        { status: 403 },
      )
    }

    return NextResponse.json<CreatorProfilePageResponse>({
      success: true,
      data: profile,
    })
  } catch (error) {
    console.error('[API /api/users/[username] GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CreatorProfilePageResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
