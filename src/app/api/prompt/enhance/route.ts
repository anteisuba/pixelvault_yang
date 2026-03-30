import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { EnhancePromptRequestSchema } from '@/types'

export const maxDuration = 30
import type { EnhancePromptResponse } from '@/types'
import { enhancePrompt } from '@/services/prompt-enhance.service'
import { rateLimit } from '@/lib/rate-limit'

// ─── POST /api/prompt/enhance ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<EnhancePromptResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = await rateLimit(`enhance:${clerkId}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json<EnhancePromptResponse>(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return NextResponse.json<EnhancePromptResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = EnhancePromptRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<EnhancePromptResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const result = await enhancePrompt(
      clerkId,
      parseResult.data.prompt,
      parseResult.data.style,
      parseResult.data.apiKeyId,
    )

    return NextResponse.json<EnhancePromptResponse>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/prompt/enhance] Error:', error)

    return NextResponse.json<EnhancePromptResponse>(
      { success: false, error: 'Prompt enhancement failed. Please try again.' },
      { status: 500 },
    )
  }
}
