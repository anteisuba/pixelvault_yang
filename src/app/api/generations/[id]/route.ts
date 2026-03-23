import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { deleteGeneration } from '@/services/generation.service'
import { deleteFromR2 } from '@/services/storage/r2'
import { getUserByClerkId } from '@/services/user.service'
import type { DeleteGenerationResponse } from '@/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<DeleteGenerationResponse>> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const user = await getUserByClerkId(clerkId)

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'User not found' },
      { status: 404 },
    )
  }

  const { id } = await params
  const result = await deleteGeneration(id, user.id)

  if (!result) {
    return NextResponse.json(
      { success: false, error: 'Generation not found or access denied' },
      { status: 404 },
    )
  }

  // Clean up R2 storage in the background (best-effort)
  try {
    await deleteFromR2(result.storageKey)
  } catch (error) {
    console.error('[API DELETE /api/generations] R2 cleanup failed:', error)
  }

  return NextResponse.json({ success: true })
}
