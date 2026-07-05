import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import {
  REFERENCE_VIDEO_MAX_BYTES,
  uploadReferenceVideo,
  validateReferenceVideo,
} from '@/services/video-reference.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  if (typeof value !== 'object' || value === null) {
    return false
  }

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

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    // Reject obviously oversized payloads before draining the body.
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > REFERENCE_VIDEO_MAX_BYTES * 1.05) {
      return NextResponse.json(
        {
          success: false,
          error: `Video file exceeds the ${Math.round(
            REFERENCE_VIDEO_MAX_BYTES / 1024 / 1024,
          )} MB limit.`,
          errorCode: 'VIDEO_TOO_LARGE',
        },
        { status: 413 },
      )
    }

    const formData = await request.formData()
    const video = formData.get('video')
    if (!isUploadedFile(video)) {
      return NextResponse.json(
        { success: false, error: 'Video file is required' },
        { status: 400 },
      )
    }

    const fileBuffer = Buffer.from(await video.arrayBuffer())
    const error = validateReferenceVideo(fileBuffer, video.type)
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, errorCode: error.code },
        { status: error.code === 'VIDEO_TOO_LARGE' ? 413 : 400 },
      )
    }

    // Optional client-captured poster frame (webp). Ignore anything that isn't a
    // real uploaded file — the video still uploads without it (§9.2 失败兜底).
    const thumbnail = formData.get('thumbnail')
    const thumbnailBuffer = isUploadedFile(thumbnail)
      ? Buffer.from(await thumbnail.arrayBuffer())
      : undefined

    const dbUser = await ensureUser(clerkId)
    const uploaded = await uploadReferenceVideo({
      userId: dbUser.id,
      fileBuffer,
      mimeType: video.type,
      thumbnailBuffer,
    })

    return NextResponse.json({
      success: true,
      data: {
        url: uploaded.url,
        sizeBytes: uploaded.sizeBytes,
        mimeType: uploaded.mimeType,
        thumbnailUrl: uploaded.thumbnailUrl,
        fileName: video.name || `reference.${uploaded.mimeType.split('/')[1]}`,
      },
    })
  } catch (error) {
    logger.error('POST /api/node-workflow/upload-reference-video error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to upload reference video' },
      { status: 500 },
    )
  }
}
