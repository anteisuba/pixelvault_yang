import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { getCivitaiModelDescription } from '@/services/civitai-lora.service'
import type { CivitaiModelDescriptionResult } from '@/types'

// Author descriptions barely change hour-to-hour; the underlying Civitai fetch
// is also its own retry/withRetry path. 1h CDN + 24h SWR keeps the detail
// panel snappy on repeat opens. Mirrors the mined-prompts route.
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'

const QuerySchema = z.object({
  modelId: z.coerce.number().int().positive(),
})

interface SuccessBody {
  success: true
  data: CivitaiModelDescriptionResult
}
interface ErrorBody {
  success: false
  error: string
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    modelId: searchParams.get('modelId') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Invalid query parameters' },
      { status: 400 },
    )
  }

  try {
    const data = await getCivitaiModelDescription(parsed.data.modelId)
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    logger.warn('GET /api/lora-assets/civitai/description failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      modelId: parsed.data.modelId,
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to fetch Civitai model description' },
      { status: 502 },
    )
  }
}
