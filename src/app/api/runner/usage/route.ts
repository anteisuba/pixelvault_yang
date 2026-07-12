import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { getRunnerUsage } from '@/services/usage.service'
import type { RunnerUsageResult } from '@/types'

interface SuccessBody {
  success: true
  data: RunnerUsageResult
}
interface ErrorBody {
  success: false
  error: string
}

// 全站 runner 月度额度（全局共享）——随每次生成变化，不缓存。
export async function GET(): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const data = await getRunnerUsage()
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    logger.warn('GET /api/runner/usage failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to load runner usage' },
      { status: 502 },
    )
  }
}
