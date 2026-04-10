import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { AuthError, isGenerationError } from '@/lib/errors'
import { isGenerateImageServiceError } from '@/services/generate-image.service'
import { checkAudioGenerationStatus } from '@/services/generate-audio.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export const maxDuration = 120

const AudioStatusRequestSchema = z.object({
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
  adapterType: z.nativeEnum(AI_ADAPTER_TYPES),
  apiKey: z.string().min(1),
  modelId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) throw new AuthError()

    const body = await request.json()
    const parseResult = AudioStatusRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues.map((e) => e.message).join(', '),
        },
        { status: 400 },
      )
    }

    const { statusUrl, responseUrl, adapterType, apiKey, modelId } =
      parseResult.data

    const data = await checkAudioGenerationStatus(
      clerkId,
      statusUrl,
      responseUrl,
      adapterType,
      apiKey,
      modelId,
    )

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (isGenerationError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }
    if (isGenerateImageServiceError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    logger.error('POST /api/generate-audio/status unhandled error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
