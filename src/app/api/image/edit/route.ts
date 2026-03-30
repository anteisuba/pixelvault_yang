import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { removeBackground, upscaleImage } from '@/services/image-edit.service'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getSystemApiKey } from '@/lib/platform-keys'
import { rateLimit } from '@/lib/rate-limit'

const ImageEditSchema = z.object({
  action: z.enum(['upscale', 'remove-background']),
  imageUrl: z.string().url(),
})

export const maxDuration = 120

// ─── POST /api/image/edit ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { success: allowed } = await rateLimit(`image-edit:${clerkId}`, {
      limit: 10,
      windowSeconds: 60,
    })
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = ImageEditSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues.map((e) => e.message).join(', '),
        },
        { status: 400 },
      )
    }

    const user = await ensureUser(clerkId)

    // Resolve fal.ai API key: user's saved key first, then platform key
    const userKeyRecord = await findActiveKeyForAdapter(
      user.id,
      AI_ADAPTER_TYPES.FAL,
    )
    const apiKey =
      userKeyRecord?.keyValue ?? getSystemApiKey(AI_ADAPTER_TYPES.FAL)

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'No fal.ai API key available. Add one in API Routes.',
        },
        { status: 400 },
      )
    }

    const { action, imageUrl } = parseResult.data

    const result =
      action === 'upscale'
        ? await upscaleImage(imageUrl, apiKey)
        : await removeBackground(imageUrl, apiKey)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API /api/image/edit] Error:', error)
    const message =
      error instanceof Error ? error.message : 'Image editing failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    )
  }
}
