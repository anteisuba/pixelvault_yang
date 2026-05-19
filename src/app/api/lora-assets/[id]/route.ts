import 'server-only'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { setLoraAssetVisibility } from '@/services/lora-asset.service'
import type { LoraAssetRecord } from '@/types'

const PatchSchema = z.object({
  isPublic: z.boolean(),
})

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
 * PATCH /api/lora-assets/[id]
 *
 * Owner-only mutation — currently only `isPublic` is editable.
 * Flipping a LoRA to public makes it appear in /api/lora-assets/discover
 * for everyone else. Flipping back to private removes it but doesn't
 * affect anyone who already pushed it onto their ActiveLoraStack.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const startedAt = Date.now()
  try {
    const { id } = await context.params
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }

    const body = (await request.json().catch(() => null)) as unknown
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Invalid body', errorCode: 'INVALID_BODY' },
        { status: 400 },
      )
    }

    const updated = await setLoraAssetVisibility(
      clerkId,
      id,
      parsed.data.isPublic,
    )
    if (!updated) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Not found', errorCode: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    logger.info('PATCH /api/lora-assets/[id]', {
      id,
      isPublic: parsed.data.isPublic,
      viewer: clerkId,
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json<SuccessBody>({ success: true, data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    const isAuth = message.includes('Not authorized')
    logger.error('PATCH /api/lora-assets/[id] failed', { error: message })
    return NextResponse.json<ErrorBody>(
      {
        success: false,
        error: isAuth ? 'Forbidden' : 'Failed to update LoRA',
        errorCode: isAuth ? 'FORBIDDEN' : undefined,
      },
      { status: isAuth ? 403 : 500 },
    )
  }
}
