import 'server-only'

import { UpdateStoryRequestSchema } from '@/types'
import {
  getStoryById,
  getPublicStoryById,
  updateStory,
  deleteStory,
} from '@/services/story.service'
import {
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import type { StoryResponse } from '@/types'

// GET is intentionally manual: optional-auth with public fallback
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { userId: clerkId } = await auth()

    if (clerkId) {
      const story = await getStoryById(id, clerkId)
      if (story) {
        return NextResponse.json<StoryResponse>({ success: true, data: story })
      }
    }

    const publicStory = await getPublicStoryById(id)
    if (publicStory) {
      return NextResponse.json<StoryResponse>({
        success: true,
        data: publicStory,
      })
    }

    return NextResponse.json<StoryResponse>(
      { success: false, error: 'Story not found' },
      { status: 404 },
    )
  } catch {
    return NextResponse.json<StoryResponse>(
      { success: false, error: 'Failed to fetch story' },
      { status: 500 },
    )
  }
}

export const PUT = createApiPutRoute({
  schema: UpdateStoryRequestSchema,
  routeName: 'PUT /api/stories/[id]',
  handler: async (clerkId, id, data) => updateStory(id, clerkId, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/stories/[id]',
  handler: async (clerkId, id) => deleteStory(id, clerkId),
})
