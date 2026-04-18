import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import type { ProjectHistoryResponse } from '@/types'
import { getProjectHistory } from '@/services/project.service'
import { PROJECT } from '@/constants/config'
import { logger } from '@/lib/logger'
import { isDatabaseQuotaExceededError } from '@/lib/database-utils'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── GET /api/projects/[id]/history ──────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<ProjectHistoryResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const limit = Math.min(
    Number(searchParams.get('limit')) || PROJECT.HISTORY_PAGE_SIZE,
    50,
  )
  const typeParam = searchParams.get('type')
  const outputType =
    typeParam === 'image'
      ? ('IMAGE' as const)
      : typeParam === 'video'
        ? ('VIDEO' as const)
        : typeParam === 'audio'
          ? ('AUDIO' as const)
          : undefined

  // "unassigned" is a special value for generations without a project
  const projectId = id === 'unassigned' ? null : id

  try {
    const result = await getProjectHistory(
      clerkId,
      projectId,
      cursor,
      limit,
      outputType,
    )
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch history'

    if (isDatabaseQuotaExceededError(err)) {
      logger.error('GET /api/projects/[id]/history database quota exceeded', {
        error: message,
      })

      return NextResponse.json(
        {
          success: false,
          error:
            'Database service is temporarily unavailable. The project database quota has been exceeded.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
