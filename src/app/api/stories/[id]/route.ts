import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { UpdateStoryRequestSchema } from '@/types'
import type { StoryResponse } from '@/types'
import {
  getStoryById,
  getPublicStoryById,
  updateStory,
  deleteStory,
} from '@/services/story.service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { userId: clerkId } = await auth()

    // Authenticated owner can see their own story (public or private)
    if (clerkId) {
      const story = await getStoryById(id, clerkId)
      if (story) {
        return NextResponse.json<StoryResponse>({ success: true, data: story })
      }
    }

    // Fallback: anyone can view a public story
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
  } catch (error) {
    console.error('[API /api/stories/[id] GET] Error:', error)
    return NextResponse.json<StoryResponse>(
      { success: false, error: 'Failed to fetch story' },
      { status: 500 },
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<StoryResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<StoryResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = UpdateStoryRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<StoryResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const story = await updateStory(id, clerkId, parseResult.data)
    return NextResponse.json<StoryResponse>({ success: true, data: story })
  } catch (error) {
    console.error('[API /api/stories/[id] PUT] Error:', error)
    return NextResponse.json<StoryResponse>(
      { success: false, error: 'Failed to update story' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await params
    await deleteStory(id, clerkId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[API /api/stories/[id] DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete story' },
      { status: 500 },
    )
  }
}
