import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { FREE_TIER } from '@/constants/config'
import type { UsageSummary } from '@/types'
import { ensureUser } from '@/services/user.service'
import { getUserUsageSummary } from '@/services/usage.service'
import { getFreeGenerationCountToday } from '@/services/generation.service'

export async function GET() {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await ensureUser(clerkId)
  const [usageSummary, freeCount] = await Promise.all([
    getUserUsageSummary(user.id),
    getFreeGenerationCountToday(user.id),
  ])

  const summary: UsageSummary = usageSummary
    ? {
        ...usageSummary,
        lastRequestAt: usageSummary.lastRequestAt?.toISOString() ?? null,
        freeGenerationsToday: freeCount,
        freeGenerationLimit: FREE_TIER.DAILY_LIMIT,
      }
    : {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        last30DaysRequests: 0,
        lastRequestAt: null,
        freeGenerationsToday: freeCount,
        freeGenerationLimit: FREE_TIER.DAILY_LIMIT,
      }

  return NextResponse.json(summary)
}
