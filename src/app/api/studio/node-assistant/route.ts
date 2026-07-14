import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { NodeAssistantRequestSchema } from '@/types/node-assistant'
import { createNodeAssistantStream } from '@/services/node/node-assistant.service'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { sanitizeNodeAssistantRequestBody } from '@/lib/node-assistant-request'
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

  const body = sanitizeNodeAssistantRequestBody(
    await request.json().catch(() => null),
  )
  const parsed = NodeAssistantRequestSchema.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((issue) => ({
      path: issue.path.join('.') || '(root)',
      code: issue.code,
      message: issue.message,
    }))
    logger.warn(`${routeName} validation failed`, {
      userId: clerkId,
      issues,
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body',
        errorCode: 'VALIDATION_ERROR',
        // First issue path helps the client/dev tools without dumping full Zod.
        details: issues[0]
          ? `${issues[0].path}: ${issues[0].message}`
          : undefined,
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
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`${routeName} unhandled error`, {
      error: message,
      durationMs: Date.now() - startedAt,
    })

    if (error instanceof ApiRequestError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          errorCode: error.errorCode,
          i18nKey: error.i18nKey,
        },
        { status: error.httpStatus },
      )
    }

    // Surface guard/validation messages (e.g. prompt length) so the dock
    // does not only show a generic "Node assistant failed".
    const isClientRejection =
      message.startsWith('Prompt rejected by guard:') ||
      message.includes('Invalid request')

    return NextResponse.json(
      {
        success: false,
        error: isClientRejection ? message : 'Node assistant failed',
        errorCode: isClientRejection
          ? 'VALIDATION_ERROR'
          : 'NODE_ASSISTANT_FAILED',
      },
      { status: isClientRejection ? 400 : 500 },
    )
  }
}
