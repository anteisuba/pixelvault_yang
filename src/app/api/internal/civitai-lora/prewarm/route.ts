import 'server-only'

import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import {
  prewarmCivitaiLoraLibrary,
  type CivitaiLoraPrewarmResult,
} from '@/services/civitai-lora.service'

export const dynamic = 'force-dynamic'

interface SuccessBody {
  success: true
  data: CivitaiLoraPrewarmResult
}

interface ErrorBody {
  success: false
  error: string
  data?: CivitaiLoraPrewarmResult
}

export async function GET(
  request: Request,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 503 },
    )
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Invalid or missing token' },
      { status: 401 },
    )
  }

  try {
    const data = await prewarmCivitaiLoraLibrary()
    if (data.successCount === 0) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Civitai LoRA prewarm failed', data },
        { status: 502 },
      )
    }

    if (data.failureCount > 0) {
      return NextResponse.json<ErrorBody>(
        {
          success: false,
          error: 'Civitai LoRA prewarm completed with failures',
          data,
        },
        { status: 502 },
      )
    }

    return NextResponse.json<SuccessBody>({ success: true, data })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Civitai LoRA prewarm failed'
    logger.error('GET /api/internal/civitai-lora/prewarm failed', {
      error: message,
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
