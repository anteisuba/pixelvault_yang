import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { UpdateStoryRequestSchema } from '@/types'
import type { StoryResponse } from '@/types'
import {
  getStoryById,
  updateStory,
  deleteStory,
} from '@/services/story.service'

export async function GET(
  _request: NextRequest,
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
    const story = await getStoryById(id, clerkId)

    if (!story) {
      return NextResponse.json<StoryResponse>(
        { success: false, error: 'Story not found' },
        { status: 404 },
      )
    }

    return NextResponse.json<StoryResponse>({ success: true, data: story })
  } catch (error) {
    console.error('[API /api/stories/[id] GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StoryResponse>(
      { success: false, error: message },
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StoryResponse>(
      { success: false, error: message },
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
