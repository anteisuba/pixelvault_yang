import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import {
  LORA_TRAINING_IMAGE_MAX_BYTES,
  uploadTrainingImage,
} from '@/services/lora-training.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

function isUploadedImage(value: FormDataEntryValue | null): value is File {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    arrayBuffer?: unknown
    size?: unknown
    type?: unknown
  }
  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string'
  )
}

/**
 * POST /api/lora-training/uploads
 *
 * Accepts one training image at a time (multipart `image` field). The form
 * fans out across multiple parallel requests so each upload's progress is
 * visible to the user — and so a single bad file doesn't poison the whole
 * batch. The 30-image legacy base64 path used to hit the body-size ceiling
 * here; this route keeps each request under ~8 MB.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    // Short-circuit obviously-oversized payloads before draining the body.
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > LORA_TRAINING_IMAGE_MAX_BYTES * 1.05) {
      return NextResponse.json(
        {
          success: false,
          error: `Image exceeds the ${Math.round(
            LORA_TRAINING_IMAGE_MAX_BYTES / 1024 / 1024,
          )} MB limit`,
          errorCode: 'IMAGE_TOO_LARGE',
        },
        { status: 413 },
      )
    }

    const formData = await request.formData()
    const image = formData.get('image')
    if (!isUploadedImage(image)) {
      return NextResponse.json(
        { success: false, error: 'Image file is required' },
        { status: 400 },
      )
    }

    const dbUser = await ensureUser(clerkId)
    const fileBuffer = Buffer.from(await image.arrayBuffer())
    const uploaded = await uploadTrainingImage({
      userId: dbUser.id,
      fileBuffer,
      claimedMimeType: image.type,
    })

    return NextResponse.json({ success: true, data: uploaded })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to upload training image'
    const isClientError = /limit|format|corrupted|Unsupported/i.test(message)
    logger.error('POST /api/lora-training/uploads error', { error: message })
    return NextResponse.json(
      { success: false, error: message },
      { status: isClientError ? 400 : 500 },
    )
  }
}
