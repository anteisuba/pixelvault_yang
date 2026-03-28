import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateModelCardSchema } from '@/types'
import type { ModelCardResponse } from '@/types'
import {
  getModelCard,
  updateModelCard,
  deleteModelCard,
} from '@/services/model-card.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ModelCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const card = await getModelCard(clerkId, id)
    if (!card) {
      return NextResponse.json<ModelCardResponse>(
        { success: false, error: 'Not found' },
        { status: 404 },
      )
    }

    return NextResponse.json<ModelCardResponse>({ success: true, data: card })
  } catch (error) {
    console.error('[API /api/model-cards/[id] GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ModelCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ModelCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<ModelCardResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = UpdateModelCardSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<ModelCardResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const card = await updateModelCard(clerkId, id, parseResult.data)
    return NextResponse.json<ModelCardResponse>({ success: true, data: card })
  } catch (error) {
    console.error('[API /api/model-cards/[id] PUT] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ModelCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    await deleteModelCard(clerkId, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /api/model-cards/[id] DELETE] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
