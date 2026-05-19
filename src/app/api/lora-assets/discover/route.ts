import 'server-only'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { logger } from '@/lib/logger'
import { listDiscoverLoraAssets } from '@/services/lora-asset.service'
import type { LoraAssetRecord } from '@/types'

interface SuccessBody {
  success: true
  data: LoraAssetRecord[]
}
interface ErrorBody {
  success: false
  error: string
}

/**
 * GET /api/lora-assets/discover
 *
 * Public-feed of trained LoRAs marked `isPublic` by their owners.
 * Excludes the viewer's own assets so they don't double up with
 * `/api/lora-assets`. Anonymous viewers see the same feed (Krea-style
 * public discovery), just without the "your own" filter.
 */
export async function GET(): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const startedAt = Date.now()
  try {
    const { userId: clerkId } = await auth()
    const assets = await listDiscoverLoraAssets(clerkId ?? null)
    logger.info('GET /api/lora-assets/discover', {
      viewer: clerkId ?? 'anonymous',
      count: assets.length,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json<SuccessBody>({ success: true, data: assets })
  } catch (error) {
    logger.error('GET /api/lora-assets/discover failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to load discover feed' },
      { status: 500 },
    )
  }
}
