import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { uploadGenerationPoster } from '@/services/generation-poster.service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

/**
 * POST /api/generations/[id]/poster
 *
 * Body: raw image bytes (Content-Type header carries the mime type).
 * Used by `<ModelViewer>` to upload a client-rendered poster PNG once
 * the GLB renders, so the asset browser can show a real thumbnail.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Generation id is required' },
        { status: 400 },
      )
    }

    const mimeType = request.headers.get('content-type') ?? 'image/png'
    const arrayBuffer = await request.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const generation = await uploadGenerationPoster(
      clerkId,
      id,
      buffer,
      mimeType,
    )

    return NextResponse.json({ success: true, data: { generation } })
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error
        ? (error as { status: number }).status
        : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('POST /api/generations/[id]/poster failed', {
      message,
      status,
    })
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
