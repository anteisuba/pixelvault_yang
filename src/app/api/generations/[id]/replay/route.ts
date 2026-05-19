import 'server-only'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { logger } from '@/lib/logger'
import { getReplayPayload } from '@/services/generation-replay.service'
import type { ReplayPayload } from '@/types'

interface SuccessBody {
  success: true
  data: ReplayPayload
}
interface ErrorBody {
  success: false
  error: string
  errorCode?: string
}

/**
 * GET /api/generations/[id]/replay
 *
 * Returns the "Use this image" payload — currently just the style
 * codes the viewer can replay, designed to grow into a fuller
 * replay (prompt / seed / model) for the "Use everything" tier.
 *
 * Auth is optional so share links work cold — but private
 * generations and private LoRAs are filtered out of the response.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const startedAt = Date.now()
  try {
    const { id } = await context.params
    const { userId: clerkId } = await auth()

    const payload = await getReplayPayload(id, clerkId ?? null)
    if (!payload) {
      return NextResponse.json<ErrorBody>(
        {
          success: false,
          error: 'Generation not found',
          errorCode: 'NOT_FOUND',
        },
        { status: 404 },
      )
    }

    logger.info('GET /api/generations/[id]/replay', {
      generationId: id,
      viewer: clerkId ?? 'anonymous',
      styleCodeCount: payload.styleCodes.length,
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json<SuccessBody>({ success: true, data: payload })
  } catch (error) {
    logger.error('GET /api/generations/[id]/replay failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to load replay payload' },
      { status: 500 },
    )
  }
}
