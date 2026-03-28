import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateArenaEntryRequestSchema } from '@/types'
import type { ArenaEntryRecord } from '@/types'
import { generateArenaEntry } from '@/services/arena.service'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 240

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── POST /api/arena/matches/[id]/entries — Generate one entry ──

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = rateLimit(`arena-entry:${clerkId}`, {
      limit: 20,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      )
    }

    const { id: matchId } = await context.params

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateArenaEntryRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const entry = await generateArenaEntry(matchId, clerkId, {
      modelId: parseResult.data.modelId,
      apiKeyId: parseResult.data.apiKeyId,
      slotIndex: parseResult.data.slotIndex,
      advancedParams: parseResult.data.advancedParams,
    })

    return NextResponse.json<{ success: true; data: ArenaEntryRecord }>({
      success: true,
      data: entry,
    })
  } catch (error) {
    console.error('[API /api/arena/matches/entries] Error:', error)
    const message =
      error instanceof Error ? error.message : 'Entry generation failed'
    const status =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status: number }).status
        : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
