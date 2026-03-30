import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { CreateStoryRequestSchema } from '@/types'
import type { CreateStoryResponse, StoryListResponse } from '@/types'
import { createStory, listStories } from '@/services/story.service'

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<StoryListResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const stories = await listStories(clerkId)
    return NextResponse.json<StoryListResponse>({
      success: true,
      data: stories,
    })
  } catch (error) {
    logger.error('[API /api/stories GET] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StoryListResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CreateStoryResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<CreateStoryResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateStoryRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<CreateStoryResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const story = await createStory(
      clerkId,
      parseResult.data.title,
      parseResult.data.generationIds,
    )
    return NextResponse.json<CreateStoryResponse>({
      success: true,
      data: story,
    })
  } catch (error) {
    logger.error('[API /api/stories POST] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CreateStoryResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
