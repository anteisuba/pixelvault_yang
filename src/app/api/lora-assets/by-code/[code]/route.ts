import 'server-only'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { logger } from '@/lib/logger'
import { getLoraAssetByStyleCode } from '@/services/lora-asset.service'
import type { LoraAssetRecord } from '@/types'

interface SuccessBody {
  success: true
  data: LoraAssetRecord
}
interface ErrorBody {
  success: false
  error: string
  errorCode?: string
}

/**
 * GET /api/lora-assets/by-code/[code]
 *
 * Resolves a style-code share-link to its LoraAsset.
 * Auth is optional — signed-out viewers can still resolve curated /
 * public codes, which is what makes share links work cold. Private
 * codes only resolve when the viewer is the owner.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const startedAt = Date.now()
  try {
    const { code } = await context.params
    const { userId: clerkId } = await auth()

    const asset = await getLoraAssetByStyleCode(code, clerkId ?? null)
    if (!asset) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'LoRA not found', errorCode: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    logger.info('GET /api/lora-assets/by-code/[code]', {
      code,
      assetId: asset.id,
      viewer: clerkId ?? 'anonymous',
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json<SuccessBody>({ success: true, data: asset })
  } catch (error) {
    logger.error('GET /api/lora-assets/by-code/[code] failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to load LoRA asset' },
      { status: 500 },
    )
  }
}
