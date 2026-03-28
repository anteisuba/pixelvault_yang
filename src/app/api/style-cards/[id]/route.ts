import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateStyleCardSchema } from '@/types'
import type { StyleCardResponse } from '@/types'
import {
  getStyleCard,
  updateStyleCard,
  deleteStyleCard,
} from '@/services/style-card.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<StyleCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const card = await getStyleCard(clerkId, id)
    if (!card) {
      return NextResponse.json<StyleCardResponse>(
        { success: false, error: 'Not found' },
        { status: 404 },
      )
    }

    return NextResponse.json<StyleCardResponse>({ success: true, data: card })
  } catch (error) {
    console.error('[API /api/style-cards/[id] GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StyleCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<StyleCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<StyleCardResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = UpdateStyleCardSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<StyleCardResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const card = await updateStyleCard(clerkId, id, parseResult.data)
    return NextResponse.json<StyleCardResponse>({ success: true, data: card })
  } catch (error) {
    console.error('[API /api/style-cards/[id] PUT] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StyleCardResponse>(
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
    await deleteStyleCard(clerkId, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /api/style-cards/[id] DELETE] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
