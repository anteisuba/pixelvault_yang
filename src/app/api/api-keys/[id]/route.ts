import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateApiKeySchema } from '@/types'
import type { ApiKeyResponse } from '@/types'
import { getUserByClerkId } from '@/services/user.service'
import { updateApiKey, deleteApiKey } from '@/services/apiKey.service'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── PUT /api/api-keys/[id] ───────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<ApiKeyResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parseResult = UpdateApiKeySchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: parseResult.error.issues.map((e) => e.message).join(', ') },
      { status: 400 },
    )
  }

  const dbUser = await getUserByClerkId(clerkId)
  if (!dbUser) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  try {
    const record = await updateApiKey(id, dbUser.id, parseResult.data)
    return NextResponse.json({ success: true, data: record })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ success: false, error: message }, { status: 403 })
  }
}

// ─── DELETE /api/api-keys/[id] ────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const dbUser = await getUserByClerkId(clerkId)
  if (!dbUser) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  try {
    await deleteApiKey(id, dbUser.id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ success: false, error: message }, { status: 403 })
  }
}
