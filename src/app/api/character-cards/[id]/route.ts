import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateCharacterCardSchema } from '@/types'
import type { CharacterCardResponse } from '@/types'
import {
  getCharacterCard,
  updateCharacterCard,
  deleteCharacterCard,
} from '@/services/character-card.service'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── GET /api/character-cards/[id] ───────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<CharacterCardResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  try {
    const card = await getCharacterCard(clerkId, id)
    if (!card) {
      return NextResponse.json(
        { success: false, error: 'Character card not found' },
        { status: 404 },
      )
    }
    return NextResponse.json({ success: true, data: card })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fetch failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

// ─── PUT /api/character-cards/[id] ───────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<CharacterCardResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const parseResult = UpdateCharacterCardSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: parseResult.error.issues.map((e) => e.message).join(', '),
      },
      { status: 400 },
    )
  }

  try {
    const card = await updateCharacterCard(clerkId, id, parseResult.data)
    if (!card) {
      return NextResponse.json(
        { success: false, error: 'Character card not found' },
        { status: 404 },
      )
    }
    return NextResponse.json({ success: true, data: card })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/character-cards/[id] ────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  try {
    const deleted = await deleteCharacterCard(clerkId, id)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Character card not found' },
        { status: 404 },
      )
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
