import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import {
  addToCollection,
  removeFromCollection,
} from '@/services/collection.service'
import { ensureUser } from '@/services/user.service'
import { AddToCollectionSchema } from '@/types'
import { ApiRequestError } from '@/lib/errors'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const POST = createApiPostByIdRoute({
  schema: AddToCollectionSchema,
  routeName: 'POST /api/collections/[id]/items',
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    try {
      const added = await addToCollection(id, user.id, data.generationIds)
      return { added }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'COLLECTION_NOT_FOUND') {
          throw new ApiRequestError(
            'COLLECTION_NOT_FOUND',
            404,
            'errors.collections.notFound',
            'Collection not found',
          )
        }
        if (error.message === 'MAX_ITEMS_EXCEEDED') {
          throw new ApiRequestError(
            'MAX_ITEMS_EXCEEDED',
            422,
            'errors.collections.maxItems',
            'Collection is full',
          )
        }
      }
      throw error
    }
  },
})

// DELETE is intentionally manual: requires JSON body (generationId), factory does not support this
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
