import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  MODEL_KEYWORD_LORA_QUERY_MIN_LENGTH,
  MODEL_KEYWORD_LORA_RESULT_LIMIT,
} from '@/constants/lora'
import { logger } from '@/lib/logger'
import { searchModelKeywordLoraTags } from '@/services/model-keyword.service'
import type { PromptTagDefinition } from '@/types/prompt-tags'

const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

const QuerySchema = z.object({
  query: z.string().trim().min(MODEL_KEYWORD_LORA_QUERY_MIN_LENGTH).max(80),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(MODEL_KEYWORD_LORA_RESULT_LIMIT),
})

interface SuccessBody {
  success: true
  data: PromptTagDefinition[]
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
    query: searchParams.get('query') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Invalid query parameters' },
      { status: 400 },
    )
  }

  try {
    const data = await searchModelKeywordLoraTags(parsed.data)
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    logger.warn('GET /api/prompt-tags/model-keyword failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      query: parsed.data.query,
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to search model-keyword tags' },
      { status: 502 },
    )
  }
}
