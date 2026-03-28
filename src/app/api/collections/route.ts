import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import {
  getUserCollections,
  createCollection,
} from '@/services/collection.service'
import { ensureUser } from '@/services/user.service'
import { CreateCollectionSchema } from '@/types'
import type { CollectionsResponse, CollectionResponse } from '@/types'

export async function GET(): Promise<NextResponse<CollectionsResponse>> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const user = await ensureUser(clerkId)
  const collections = await getUserCollections(user.id)

  return NextResponse.json({ success: true, data: collections })
}

export async function POST(
  request: Request,
): Promise<NextResponse<CollectionResponse>> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const user = await ensureUser(clerkId)
  const body = await request.json().catch(() => null)
  const parsed = CreateCollectionSchema.safeParse(body)

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
    const collection = await createCollection(user.id, parsed.data)
    return NextResponse.json({ success: true, data: collection })
  } catch (error) {
    const message =
      error instanceof Error && error.message === 'MAX_COLLECTIONS_EXCEEDED'
        ? 'Maximum collections limit reached'
        : 'Failed to create collection'
    return NextResponse.json(
      { success: false, error: message },
      { status: 422 },
    )
  }
}
