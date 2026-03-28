import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateBackgroundCardSchema } from '@/types'
import type { BackgroundCardsResponse, BackgroundCardResponse } from '@/types'
import {
  listBackgroundCards,
  createBackgroundCard,
} from '@/services/background-card.service'

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<BackgroundCardsResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const projectId = request.nextUrl.searchParams.get('projectId')
    const cards = await listBackgroundCards(clerkId, projectId)
    return NextResponse.json<BackgroundCardsResponse>({
      success: true,
      data: cards,
    })
  } catch (error) {
    console.error('[API /api/background-cards GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<BackgroundCardsResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<BackgroundCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<BackgroundCardResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateBackgroundCardSchema.safeParse(body)
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

    const card = await createBackgroundCard(clerkId, parseResult.data)
    return NextResponse.json<BackgroundCardResponse>({
      success: true,
      data: card,
    })
  } catch (error) {
    console.error('[API /api/background-cards POST] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<BackgroundCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
