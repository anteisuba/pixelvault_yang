import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import {
  getCollectionById,
  updateCollection,
  deleteCollection,
} from '@/services/collection.service'
import { ensureUser, getUserByClerkId } from '@/services/user.service'
import { UpdateCollectionSchema } from '@/types'
import {
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'
import type { CollectionDetailResponse } from '@/types'

// GET is intentionally manual: optional-auth with pagination query params
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<CollectionDetailResponse>> {
  const { id } = await params
  const { userId: clerkId } = await auth()

  let viewerUserId: string | null = null
  if (clerkId) {
    const user = await getUserByClerkId(clerkId)
    viewerUserId = user?.id ?? null
  }

  const page = Number(request.nextUrl.searchParams.get('page') ?? '1')
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '20')

  const collection = await getCollectionById(id, viewerUserId, page, limit)

  if (!collection) {
    return NextResponse.json(
      { success: false, error: 'Collection not found' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true, data: collection })
}

export const PUT = createApiPutRoute({
  schema: UpdateCollectionSchema,
  routeName: 'PUT /api/collections/[id]',
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    return updateCollection(id, user.id, data)
  },
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/collections/[id]',
  handler: async (clerkId, id) => {
    const user = await ensureUser(clerkId)
    return deleteCollection(id, user.id)
  },
})
