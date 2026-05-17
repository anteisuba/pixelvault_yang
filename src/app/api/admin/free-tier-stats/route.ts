import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { FREE_TIER } from '@/constants/config'
import { isAdmin } from '@/lib/admin'
import { getFreeTierStats } from '@/services/generation.service'

export async function GET() {
  const { userId: clerkId } = await auth()

  if (!clerkId || !isAdmin(clerkId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const stats = await getFreeTierStats()

  return NextResponse.json({
    ...stats,
    dailyPlatformLimit: 500,
    perUserDailyLimit: FREE_TIER.DAILY_LIMIT,
    enabled: FREE_TIER.ENABLED,
  })
}
