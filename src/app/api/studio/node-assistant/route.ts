import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { NodeAssistantRequestSchema } from '@/types/node-assistant'
import { createNodeAssistantStream } from '@/services/node-assistant.service'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export async function POST(request: NextRequest): Promise<Response> {
  const startedAt = Date.now()
  const routeName = 'POST /api/studio/node-assistant'
  const authResult = await auth()
  const clerkId = authResult?.userId ?? null

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
      { status: 401 },
    )
  }

  const limit = RATE_LIMIT_CONFIGS.nodeAssistant
  const rateLimitResult = await rateLimit(`${routeName}:${clerkId}`, limit)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
      { status: 429 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = NodeAssistantRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body',
        errorCode: 'VALIDATION_ERROR',
      },
      { status: 400 },
    )
  }

  try {
    const stream = await createNodeAssistantStream(clerkId, parsed.data)

    logger.info(routeName, {
      userId: clerkId,
      durationMs: Date.now() - startedAt,
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error(`${routeName} unhandled error`, {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Node assistant failed',
        errorCode: 'NODE_ASSISTANT_FAILED',
      },
      { status: 500 },
    )
  }
}
