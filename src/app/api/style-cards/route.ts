import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateStyleCardSchema } from '@/types'
import type { StyleCardsResponse, StyleCardResponse } from '@/types'
import { listStyleCards, createStyleCard } from '@/services/style-card.service'

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<StyleCardsResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const projectId = request.nextUrl.searchParams.get('projectId')
    const cards = await listStyleCards(clerkId, projectId)
    return NextResponse.json<StyleCardsResponse>({ success: true, data: cards })
  } catch (error) {
    logger.error('[API /api/style-cards GET] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StyleCardsResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<StyleCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<StyleCardResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateStyleCardSchema.safeParse(body)
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

    const card = await createStyleCard(clerkId, parseResult.data)
    return NextResponse.json<StyleCardResponse>({ success: true, data: card })
  } catch (error) {
    logger.error('[API /api/style-cards POST] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<StyleCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
