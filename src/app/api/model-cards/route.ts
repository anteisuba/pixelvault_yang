import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateModelCardSchema } from '@/types'
import type { ModelCardsResponse, ModelCardResponse } from '@/types'
import { listModelCards, createModelCard } from '@/services/model-card.service'

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ModelCardsResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const projectId = request.nextUrl.searchParams.get('projectId')
    const cards = await listModelCards(clerkId, projectId)
    return NextResponse.json<ModelCardsResponse>({ success: true, data: cards })
  } catch (error) {
    console.error('[API /api/model-cards GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ModelCardsResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ModelCardResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<ModelCardResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateModelCardSchema.safeParse(body)
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

    const card = await createModelCard(clerkId, parseResult.data)
    return NextResponse.json<ModelCardResponse>({ success: true, data: card })
  } catch (error) {
    console.error('[API /api/model-cards POST] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ModelCardResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
