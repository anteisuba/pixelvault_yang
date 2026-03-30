import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateCharacterCardSchema } from '@/types'
import type { CharacterCardsResponse, CharacterCardResponse } from '@/types'
import {
  listCharacterCards,
  createCharacterCard,
} from '@/services/character-card.service'

// ─── GET /api/character-cards ────────────────────────────────────

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CharacterCardsResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const cards = await listCharacterCards(clerkId)
    return NextResponse.json<CharacterCardsResponse>({
      success: true,
      data: cards,
    })
  } catch (error) {
    logger.error('[API /api/character-cards GET] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CharacterCardsResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

// ─── POST /api/character-cards ───────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<CharacterCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<CharacterCardResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateCharacterCardSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<CharacterCardResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const card = await createCharacterCard(clerkId, parseResult.data)
    return NextResponse.json<CharacterCardResponse>({
      success: true,
      data: card,
    })
  } catch (error) {
    logger.error('[API /api/character-cards POST] Error', { error: error instanceof Error ? error.message : String(error) })
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<CharacterCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
