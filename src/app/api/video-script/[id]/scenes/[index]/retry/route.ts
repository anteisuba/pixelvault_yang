import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { isGenerateImageServiceError } from '@/services/image/generate-image.service'
import { retryScene } from '@/services/video-scene-orchestrator.service'
import { VideoScriptNotFoundError } from '@/services/video-script.service'
import { ensureUser } from '@/services/user.service'

interface RetrySceneContext {
  params: Promise<{ id: string; index: string }>
}

export async function POST(
  _request: NextRequest,
  context: RetrySceneContext,
): Promise<NextResponse> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
        errorCode: 'AUTH_REQUIRED',
      },
      { status: 401 },
    )
  }

  const { id, index } = await context.params
  const sceneIndex = Number(index)

  if (!Number.isInteger(sceneIndex) || sceneIndex < 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid scene index',
        errorCode: 'VALIDATION_ERROR',
      },
      { status: 400 },
    )
  }

  try {
    const dbUser = await ensureUser(clerkId)
    await retryScene(id, sceneIndex, dbUser.id)

    return NextResponse.json({ success: true, data: null })
  } catch (err) {
    if (err instanceof VideoScriptNotFoundError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Video script not found',
          errorCode: 'NOT_FOUND',
        },
        { status: 404 },
      )
    }

    if (isGenerateImageServiceError(err)) {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          errorCode: err.code,
        },
        { status: err.status },
      )
    }

    const message = err instanceof Error ? err.message : 'Unexpected error'

    return NextResponse.json(
      {
        success: false,
        error: message,
        errorCode: 'INTERNAL_ERROR',
      },
      { status: 500 },
    )
  }
}
