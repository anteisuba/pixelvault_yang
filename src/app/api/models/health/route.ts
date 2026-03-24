import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { isAdmin } from '@/lib/admin'
import { getAllModelConfigs } from '@/services/model-config.service'
import {
  checkAllModelsHealth,
  getHealthCache,
} from '@/services/model-health.service'
import { ModelHealthRefreshSchema } from '@/types'
import type { ModelHealthResponse } from '@/types'

/** GET — return cached health status (public) */
export async function GET() {
  const cached = getHealthCache()
  if (cached) {
    return NextResponse.json<ModelHealthResponse>({
      success: true,
      data: cached,
    })
  }

  return NextResponse.json<ModelHealthResponse>({
    success: true,
    data: [],
  })
}

/** POST — trigger a full health refresh (admin only) */
export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId || !isAdmin(clerkId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const parseResult = ModelHealthRefreshSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const configs = await getAllModelConfigs()
    const targets = configs
      .filter((c) => c.available)
      .filter((c) =>
        parseResult.data.modelId
          ? c.modelId === parseResult.data.modelId
          : true,
      )
      .map((c) => ({
        modelId: c.modelId,
        externalModelId: c.externalModelId,
        adapterType: c.adapterType,
        baseUrl: c.providerConfig.baseUrl,
      }))

    const records = await checkAllModelsHealth(targets)

    return NextResponse.json<ModelHealthResponse>({
      success: true,
      data: records,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Health check failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
