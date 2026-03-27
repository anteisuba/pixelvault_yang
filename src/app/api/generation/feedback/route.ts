import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { GenerationFeedbackRequestSchema } from '@/types'
import type { GenerationFeedbackResponse } from '@/types'
import { refinePromptFromFeedback } from '@/services/generation-feedback.service'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 30

// ─── POST /api/generation/feedback ─────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<GenerationFeedbackResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = rateLimit(`gen-feedback:${clerkId}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<GenerationFeedbackResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json<GenerationFeedbackResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = GenerationFeedbackRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<GenerationFeedbackResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const result = await refinePromptFromFeedback(
      clerkId,
      parseResult.data.imageUrl,
      parseResult.data.originalPrompt,
      parseResult.data.feedback,
      parseResult.data.apiKeyId,
    )

    return NextResponse.json<GenerationFeedbackResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/generation/feedback] Error:', error)

    return NextResponse.json<GenerationFeedbackResponse>(
      {
        success: false,
        error: 'Generation feedback failed. Please try again.',
      },
      { status: 500 },
    )
  }
}
