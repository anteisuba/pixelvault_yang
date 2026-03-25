import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import type { ApiKeyVerifyResponse } from '@/types'
import { ensureUser } from '@/services/user.service'
import { verifyApiKey } from '@/services/apiKey.service'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── POST /api/api-keys/[id]/verify ──────────────────────────────

export async function POST(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<ApiKeyVerifyResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  const dbUser = await ensureUser(clerkId)

  try {
    const result = await verifyApiKey(id, dbUser.id)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 403 },
    )
  }
}
