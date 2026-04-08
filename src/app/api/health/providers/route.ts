import 'server-only'

import { NextResponse } from 'next/server'

import { getAllModelConfigs } from '@/services/model-config.service'
import { checkAllModelsHealth } from '@/services/model-health.service'
import type { ModelHealthResponse } from '@/types'

/**
 * POST /api/health/providers — trigger a full AI provider health refresh.
 *
 * Authenticated via `Authorization: Bearer <HEALTH_CHECK_TOKEN>`.
 * Designed for CI pipelines, n8n workflows, and cron monitors
 * that cannot use Clerk session auth.
 */
export async function POST(request: Request) {
  try {
    const token = process.env.HEALTH_CHECK_TOKEN
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'HEALTH_CHECK_TOKEN not configured' },
        { status: 503 },
      )
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${token}`) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing token' },
        { status: 401 },
      )
    }

    const configs = await getAllModelConfigs()
    const targets = configs
      .filter((c) => c.available)
      .map((c) => ({
        modelId: c.modelId,
        externalModelId: c.externalModelId,
        adapterType: c.adapterType,
        baseUrl: c.providerConfig.baseUrl,
      }))

    const records = await checkAllModelsHealth(targets)

    const summary = {
      total: records.length,
      available: records.filter((r) => r.status === 'available').length,
      degraded: records.filter((r) => r.status === 'degraded').length,
      unavailable: records.filter((r) => r.status === 'unavailable').length,
    }

    return NextResponse.json<ModelHealthResponse & { summary: typeof summary }>(
      {
        success: true,
        data: records,
        summary,
      },
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Health check failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
