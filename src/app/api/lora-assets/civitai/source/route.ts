import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { resolveCivitaiModelPageUrlByVersion } from '@/services/civitai-lora.service'

const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

const CivitaiSourceQuerySchema = z.object({
  modelVersionId: z.coerce.number().int().positive(),
})

interface ErrorBody {
  success: false
  error: string
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ErrorBody> | NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = CivitaiSourceQuerySchema.safeParse({
      modelVersionId: searchParams.get('modelVersionId') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const sourceUrl = await resolveCivitaiModelPageUrlByVersion(
      parsed.data.modelVersionId,
    )
    if (!sourceUrl) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Civitai source page not found' },
        { status: 404 },
      )
    }

    const response = NextResponse.redirect(new URL(sourceUrl), 302)
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    logger.error('GET /api/lora-assets/civitai/source failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to resolve Civitai source page' },
      { status: 502 },
    )
  }
}
