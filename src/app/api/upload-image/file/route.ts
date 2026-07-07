import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { USER_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { uploadUserImageFile } from '@/services/upload-image.service'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

function isUploadedFile(value: FormDataEntryValue | null): value is File {
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
 * POST /api/upload-image/file
 *
 * Local-file upload via multipart/form-data (`image` field, optional `note` /
 * `projectId`). Unlike the JSON `/api/upload-image` route, this streams the
 * raw bytes instead of a base64 data URL — no ~33% inflation, so full-quality
 * images fit without the client having to pre-crush them. Mirrors the
 * LoRA-training upload route.
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
    if (contentLength > USER_UPLOAD_MAX_BYTES * 1.05) {
      return NextResponse.json(
        {
          success: false,
          error: `Image exceeds the ${Math.round(
            USER_UPLOAD_MAX_BYTES / 1024 / 1024,
          )} MB limit`,
          errorCode: 'IMAGE_TOO_LARGE',
        },
        { status: 413 },
      )
    }

    const formData = await request.formData()
    const image = formData.get('image')
    if (!isUploadedFile(image)) {
      return NextResponse.json(
        { success: false, error: 'Image file is required' },
        { status: 400 },
      )
    }

    const noteRaw = formData.get('note')
    const projectIdRaw = formData.get('projectId')
    const note = typeof noteRaw === 'string' ? noteRaw : undefined
    const projectId =
      typeof projectIdRaw === 'string' && projectIdRaw.length > 0
        ? projectIdRaw
        : undefined

    const fileBuffer = Buffer.from(await image.arrayBuffer())
    const generation = await uploadUserImageFile(clerkId, {
      fileBuffer,
      claimedMimeType: image.type,
      note,
      projectId,
    })

    return NextResponse.json({ success: true, data: { generation } })
  } catch (error) {
    if (error instanceof GenerateImageServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }
    logger.error('POST /api/upload-image/file error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to upload image' },
      { status: 500 },
    )
  }
}
