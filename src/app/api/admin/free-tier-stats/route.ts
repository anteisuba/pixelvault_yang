import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { FREE_TIER } from '@/constants/config'
import { getFreeTierStats } from '@/services/generation.service'

export async function GET() {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stats = await getFreeTierStats()

  return NextResponse.json({
    ...stats,
    dailyPlatformLimit: 500,
    perUserDailyLimit: FREE_TIER.DAILY_LIMIT,
    enabled: FREE_TIER.ENABLED,
  })
}
