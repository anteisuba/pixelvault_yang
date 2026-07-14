import 'server-only'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { logger } from '@/lib/logger'
import {
  favoriteExternalLora,
  unfavoriteLora,
} from '@/services/lora-asset.service'
import { FavoriteLoraRequestSchema } from '@/types'
import type { LoraAssetRecord } from '@/types'

interface PostSuccessBody {
  success: true
  data: LoraAssetRecord
}
interface DeleteSuccessBody {
  success: true
  data: { removed: boolean }
}
interface ErrorBody {
  success: false
  error: string
  errorCode?: string
}

/**
 * POST /api/lora-assets/favorite
 *
 * Import an external (Civitai/Hugging Face) LoRA into the viewer's "Favorites".
 * Creates a personal LoraAsset row with source='imported'; idempotent
 * on (userId, loraUrl) so re-favoriting returns the existing row.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<PostSuccessBody | ErrorBody>> {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    const body = (await request.json().catch(() => null)) as unknown
    const parsed = FavoriteLoraRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Invalid body', errorCode: 'INVALID_BODY' },
        { status: 400 },
      )
    }

    const record = await favoriteExternalLora(clerkId, parsed.data)
    return NextResponse.json<PostSuccessBody>({ success: true, data: record })
  } catch (error) {
    logger.error('POST /api/lora-assets/favorite failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to favorite LoRA' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/lora-assets/favorite?assetId=<id>
 *
 * Remove a favorite — only works on imported assets owned by the caller.
 */
export async function DELETE(
  request: Request,
): Promise<NextResponse<DeleteSuccessBody | ErrorBody>> {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    const url = new URL(request.url)
    const assetId = url.searchParams.get('assetId')?.trim()
    if (!assetId) {
      return NextResponse.json<ErrorBody>(
        {
          success: false,
          error: 'assetId required',
          errorCode: 'INVALID_BODY',
        },
        { status: 400 },
      )
    }

    const removed = await unfavoriteLora(clerkId, assetId)
    return NextResponse.json<DeleteSuccessBody>({
      success: true,
      data: { removed },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    const isAuth = message.includes('Only imported favorites')
    logger.error('DELETE /api/lora-assets/favorite failed', { error: message })
    return NextResponse.json<ErrorBody>(
      {
        success: false,
        error: isAuth ? 'Cannot remove this LoRA' : 'Failed to remove favorite',
        errorCode: isAuth ? 'FORBIDDEN' : undefined,
      },
      { status: isAuth ? 403 : 500 },
    )
  }
}
