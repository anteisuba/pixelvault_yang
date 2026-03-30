import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { ensureUser } from '@/services/user.service'
import { getGenerationsByCharacterCombination } from '@/services/generation.service'

const QuerySchema = z.object({
  cardIds: z
    .string()
    .min(1)
    .transform((s) => s.split(',')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

// ─── GET /api/character-cards/generations?cardIds=a,b ────────────

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const query = QuerySchema.safeParse(searchParams)
    if (!query.success) {
      return NextResponse.json(
        { success: false, error: 'cardIds is required (comma-separated)' },
        { status: 400 },
      )
    }

    const dbUser = await ensureUser(clerkId)
    const { generations, total } = await getGenerationsByCharacterCombination(
      query.data.cardIds,
      dbUser.id,
      { page: query.data.page, limit: query.data.limit },
    )

    return NextResponse.json({
      success: true,
      data: {
        generations,
        total,
        hasMore: query.data.page * query.data.limit < total,
      },
    })
  } catch (error) {
    logger.error('[API /api/character-cards/generations] Error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { success: false, error: 'Failed to fetch generations' },
      { status: 500 },
    )
  }
}
