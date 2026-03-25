import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { toggleGenerationVisibility } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import type { ToggleVisibilityResponse } from '@/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse<ToggleVisibilityResponse>> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const user = await ensureUser(clerkId)

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const field = body.field === 'isPromptPublic' ? 'isPromptPublic' : 'isPublic'
  const result = await toggleGenerationVisibility(id, user.id, field)

  if (!result) {
    return NextResponse.json(
      { success: false, error: 'Generation not found or access denied' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true, data: result })
}
