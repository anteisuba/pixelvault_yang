import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { ImageEditStreamRequestSchema } from '@/types'
import { isGenerationError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { streamImageEdit } from '@/services/image/image-edit.service'

export const maxDuration = 300

export async function POST(request: NextRequest): Promise<Response> {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  const limit = await rateLimit(
    `POST /api/image/edit-stream:${userId}`,
    RATE_LIMIT_CONFIGS.imageEdit,
  )
  if (!limit.success)
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429 },
    )
  const parsed = ImageEditStreamRequestSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success)
    return NextResponse.json(
      { success: false, error: 'Invalid image edit request' },
      { status: 400 },
    )
  try {
    return await streamImageEdit(userId, parsed.data, request.signal)
  } catch (error) {
    return NextResponse.json(
      isGenerationError(error)
        ? error.toJSON()
        : { success: false, error: 'Image editing failed.' },
      { status: isGenerationError(error) ? error.httpStatus : 500 },
    )
  }
}
