import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import {
  addToCollection,
  removeFromCollection,
} from '@/services/collection.service'
import { ensureUser } from '@/services/user.service'
import { AddToCollectionSchema } from '@/types'
import type { CollectionItemsResponse } from '@/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse<CollectionItemsResponse>> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const user = await ensureUser(clerkId)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = AddToCollectionSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid request',
      },
      { status: 400 },
    )
  }

  try {
    const added = await addToCollection(id, user.id, parsed.data.generationIds)
    return NextResponse.json({ success: true, data: { added } })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message === 'COLLECTION_NOT_FOUND'
          ? 'Collection not found'
          : error.message === 'MAX_ITEMS_EXCEEDED'
            ? 'Collection is full'
            : 'Failed to add items'
        : 'Failed to add items'
    return NextResponse.json(
      { success: false, error: message },
      { status: 422 },
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse<{ success: boolean; error?: string }>> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const user = await ensureUser(clerkId)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const generationId = body?.generationId

  if (!generationId || typeof generationId !== 'string') {
    return NextResponse.json(
      { success: false, error: 'generationId is required' },
      { status: 400 },
    )
  }

  const removed = await removeFromCollection(id, user.id, generationId)

  if (!removed) {
    return NextResponse.json(
      { success: false, error: 'Item not found or access denied' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true })
}
