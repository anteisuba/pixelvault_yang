import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import type { UsageSummary } from '@/types'
import { ensureUser } from '@/services/user.service'
import { getUserUsageSummary } from '@/services/usage.service'

export async function GET() {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await ensureUser(clerkId)
  const usageSummary = await getUserUsageSummary(user.id)

  const summary: UsageSummary = usageSummary
    ? {
        ...usageSummary,
        lastRequestAt: usageSummary.lastRequestAt?.toISOString() ?? null,
      }
    : {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        last30DaysRequests: 0,
        lastRequestAt: null,
      }

  return NextResponse.json(summary)
}
