import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateBackgroundCardSchema } from '@/types'
import type { BackgroundCardResponse } from '@/types'
import {
  getBackgroundCard,
  updateBackgroundCard,
  deleteBackgroundCard,
} from '@/services/background-card.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<BackgroundCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const card = await getBackgroundCard(clerkId, id)
    if (!card) {
      return NextResponse.json<BackgroundCardResponse>(
        { success: false, error: 'Not found' },
        { status: 404 },
      )
    }

    return NextResponse.json<BackgroundCardResponse>({
      success: true,
      data: card,
    })
  } catch (error) {
    logger.error('[API /api/background-cards/[id] GET] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<BackgroundCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<BackgroundCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<BackgroundCardResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = UpdateBackgroundCardSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<BackgroundCardResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const card = await updateBackgroundCard(clerkId, id, parseResult.data)
    return NextResponse.json<BackgroundCardResponse>({
      success: true,
      data: card,
    })
  } catch (error) {
    logger.error('[API /api/background-cards/[id] PUT] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<BackgroundCardResponse>(
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
    await deleteBackgroundCard(clerkId, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('[API /api/background-cards/[id] DELETE] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
