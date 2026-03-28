import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import {
  getCollectionById,
  updateCollection,
  deleteCollection,
} from '@/services/collection.service'
import { ensureUser, getUserByClerkId } from '@/services/user.service'
import { UpdateCollectionSchema } from '@/types'
import type { CollectionDetailResponse, CollectionResponse } from '@/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
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

export async function PUT(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse<CollectionResponse>> {
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
  const parsed = UpdateCollectionSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid request',
      },
      { status: 400 },
    )
  }

  const result = await updateCollection(id, user.id, parsed.data)

  if (!result) {
    return NextResponse.json(
      { success: false, error: 'Collection not found or access denied' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true, data: result })
}

export async function DELETE(
  _request: Request,
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

  const deleted = await deleteCollection(id, user.id)

  if (!deleted) {
    return NextResponse.json(
      { success: false, error: 'Collection not found or access denied' },
      { status: 404 },
    )
  }

  return NextResponse.json({ success: true })
}
