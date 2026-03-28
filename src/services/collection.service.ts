import 'server-only'

import { db } from '@/lib/db'
import { COLLECTION } from '@/constants/config'
import type {
  CollectionRecord,
  CollectionDetailRecord,
  GenerationRecord,
} from '@/types'

// ─── List ───────────────────────────────────────────────────────

export async function getUserCollections(
  userId: string,
): Promise<CollectionRecord[]> {
  const collections = await db.collection.findMany({
    where: { userId, isDeleted: false },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { items: true } } },
  })

  return collections.map(mapToRecord)
}

// ─── Get by ID ──────────────────────────────────────────────────

export async function getCollectionById(
  id: string,
  viewerUserId: string | null,
  page = 1,
  limit: number = COLLECTION.PAGE_SIZE,
): Promise<CollectionDetailRecord | null> {
  const collection = await db.collection.findUnique({
    where: { id, isDeleted: false },
    include: {
      _count: { select: { items: true } },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  })

  if (!collection) return null

  // Access control: private collections only visible to owner
  const isOwner = viewerUserId === collection.userId
  if (!collection.isPublic && !isOwner) return null

  const offset = (page - 1) * limit
  const items = await db.collectionItem.findMany({
    where: { collectionId: id },
    orderBy: { orderIndex: 'asc' },
    skip: offset,
    take: limit,
    include: { generation: true },
  })

  const total = collection._count.items
  const generations = items.map((item) => item.generation as GenerationRecord)

  return {
    ...mapToRecord(collection),
    generations,
    total,
    hasMore: offset + limit < total,
    owner: collection.user?.username
      ? {
          username: collection.user.username,
          displayName: collection.user.displayName,
          avatarUrl: collection.user.avatarUrl,
        }
      : undefined,
  }
}

// ─── Get public collection (for permalink) ──────────────────────

export async function getPublicCollection(
  id: string,
  page = 1,
  limit = COLLECTION.PAGE_SIZE,
): Promise<CollectionDetailRecord | null> {
  return getCollectionById(id, null, page, limit)
}

// ─── Create ─────────────────────────────────────────────────────

export async function createCollection(
  userId: string,
  input: { name: string; description?: string; isPublic?: boolean },
): Promise<CollectionRecord> {
  // Enforce per-user limit
  const count = await db.collection.count({
    where: { userId, isDeleted: false },
  })
  if (count >= COLLECTION.MAX_COLLECTIONS_PER_USER) {
    throw new Error('MAX_COLLECTIONS_EXCEEDED')
  }

  const collection = await db.collection.create({
    data: {
      userId,
      name: input.name,
      description: input.description,
      isPublic: input.isPublic ?? false,
    },
    include: { _count: { select: { items: true } } },
  })

  return mapToRecord(collection)
}

// ─── Update ─────────────────────────────────────────────────────

export async function updateCollection(
  id: string,
  userId: string,
  input: { name?: string; description?: string | null; isPublic?: boolean },
): Promise<CollectionRecord | null> {
  const collection = await db.collection.findUnique({
    where: { id, isDeleted: false },
    select: { userId: true },
  })

  if (!collection || collection.userId !== userId) return null

  const updated = await db.collection.update({
    where: { id },
    data: input,
    include: { _count: { select: { items: true } } },
  })

  return mapToRecord(updated)
}

// ─── Soft delete ────────────────────────────────────────────────

export async function deleteCollection(
  id: string,
  userId: string,
): Promise<boolean> {
  const collection = await db.collection.findUnique({
    where: { id, isDeleted: false },
    select: { userId: true },
  })

  if (!collection || collection.userId !== userId) return false

  await db.collection.update({
    where: { id },
    data: { isDeleted: true },
  })

  return true
}

// ─── Add items ──────────────────────────────────────────────────

export async function addToCollection(
  collectionId: string,
  userId: string,
  generationIds: string[],
): Promise<number> {
  // Verify ownership
  const collection = await db.collection.findUnique({
    where: { id: collectionId, isDeleted: false },
    select: { userId: true, _count: { select: { items: true } } },
  })

  if (!collection || collection.userId !== userId) {
    throw new Error('COLLECTION_NOT_FOUND')
  }

  // Enforce item limit
  const remaining =
    COLLECTION.MAX_ITEMS_PER_COLLECTION - collection._count.items
  if (remaining <= 0) {
    throw new Error('MAX_ITEMS_EXCEEDED')
  }

  // Only add generations that belong to this user and are not already in collection
  const existingItems = await db.collectionItem.findMany({
    where: { collectionId, generationId: { in: generationIds } },
    select: { generationId: true },
  })
  const existingSet = new Set(existingItems.map((i) => i.generationId))

  const ownedGenerations = await db.generation.findMany({
    where: { id: { in: generationIds }, userId },
    select: { id: true },
  })

  const toAdd = ownedGenerations
    .filter((g) => !existingSet.has(g.id))
    .slice(0, remaining)

  if (toAdd.length === 0) return 0

  // Determine starting order index
  const lastItem = await db.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  })
  const startIndex = (lastItem?.orderIndex ?? -1) + 1

  await db.collectionItem.createMany({
    data: toAdd.map((g, i) => ({
      collectionId,
      generationId: g.id,
      orderIndex: startIndex + i,
    })),
  })

  // Update cover to first item if no cover
  await updateCoverIfNeeded(collectionId)

  return toAdd.length
}

// ─── Remove item ────────────────────────────────────────────────

export async function removeFromCollection(
  collectionId: string,
  userId: string,
  generationId: string,
): Promise<boolean> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId, isDeleted: false },
    select: { userId: true },
  })

  if (!collection || collection.userId !== userId) return false

  const deleted = await db.collectionItem.deleteMany({
    where: { collectionId, generationId },
  })

  if (deleted.count > 0) {
    await updateCoverIfNeeded(collectionId)
  }

  return deleted.count > 0
}

// ─── Helpers ────────────────────────────────────────────────────

async function updateCoverIfNeeded(collectionId: string) {
  const firstItem = await db.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { orderIndex: 'asc' },
    include: { generation: { select: { url: true } } },
  })

  await db.collection.update({
    where: { id: collectionId },
    data: { coverUrl: firstItem?.generation.url ?? null },
  })
}

function mapToRecord(collection: {
  id: string
  name: string
  description: string | null
  coverUrl: string | null
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
  _count: { items: number }
}): CollectionRecord {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverUrl: collection.coverUrl,
    isPublic: collection.isPublic,
    itemCount: collection._count.items,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  }
}
