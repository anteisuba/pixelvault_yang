import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { StudioGenerateSchema } from '@/types'
import { compileAndGenerate } from '@/services/studio-generate.service'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isGenerateImageServiceError } from '@/services/generate-image.service'

export const maxDuration = 240

// ─── POST /api/studio/generate ─────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = await rateLimit(`studio-generate:${clerkId}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'Retry-After': '60',
          },
        },
      )
    }

    const body = await request.json().catch(() => null)
    const parsed = StudioGenerateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? 'Invalid input',
        },
        { status: 400 },
      )
    }

    const generation = await compileAndGenerate(clerkId, parsed.data)
    return NextResponse.json({ success: true, data: { generation } })
  } catch (err) {
    if (isGenerateImageServiceError(err)) {
      logger.error('[POST /api/studio/generate] Service error', {
        code: err.code,
        message: err.message,
        status: err.status,
      })
      return NextResponse.json(
        { success: false, error: err.message, errorCode: err.code },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : 'Generation failed'
    logger.error('[POST /api/studio/generate] Unhandled error', { err })
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
