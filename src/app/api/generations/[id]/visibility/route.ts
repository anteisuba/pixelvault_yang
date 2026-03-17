import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { toggleGenerationVisibility } from '@/services/generation.service'
import { getUserByClerkId } from '@/services/user.service'
import type { ToggleVisibilityResponse } from '@/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<ToggleVisibilityResponse>> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getUserByClerkId(clerkId)

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  const { id } = await params
  const result = await toggleGenerationVisibility(id, user.id)

  if (!result) {
    return NextResponse.json(
      { success: false, error: 'Generation not found or access denied' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true, data: result })
}
