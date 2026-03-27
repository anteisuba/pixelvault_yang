import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { PromptFeedbackRequestSchema } from '@/types'
import type { PromptFeedbackResponse } from '@/types'
import { getPromptFeedback } from '@/services/prompt-feedback.service'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 30

// ─── POST /api/prompt/feedback ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<PromptFeedbackResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = rateLimit(`prompt-feedback:${clerkId}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<PromptFeedbackResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json<PromptFeedbackResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = PromptFeedbackRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<PromptFeedbackResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const result = await getPromptFeedback(
      clerkId,
      parseResult.data.prompt,
      parseResult.data.context,
      parseResult.data.apiKeyId,
    )

    return NextResponse.json<PromptFeedbackResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/prompt/feedback] Error:', error)

    return NextResponse.json<PromptFeedbackResponse>(
      { success: false, error: 'Prompt feedback failed. Please try again.' },
      { status: 500 },
    )
  }
}
