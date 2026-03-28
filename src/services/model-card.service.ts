import 'server-only'

import { db } from '@/lib/db'
import { MODEL_CARD } from '@/constants/card-types'
import type {
  ModelCardRecord,
  CreateModelCardRequest,
  UpdateModelCardRequest,
  AdvancedParams,
} from '@/types'
import { ensureUser } from '@/services/user.service'

// ─── Helpers ────────────────────────────────────────────────────

function toRecord(row: {
  id: string
  name: string
  description: string | null
  modelId: string
  adapterType: string
  advancedParams: unknown
  tags: string[]
  projectId: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}): ModelCardRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    modelId: row.modelId,
    adapterType: row.adapterType,
    advancedParams: (row.advancedParams as AdvancedParams) ?? null,
    tags: row.tags,
    projectId: row.projectId,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── CRUD ───────────────────────────────────────────────────────

export async function listModelCards(
  clerkId: string,
  projectId?: string | null,
): Promise<ModelCardRecord[]> {
  const user = await ensureUser(clerkId)
  const where: Record<string, unknown> = { userId: user.id, isDeleted: false }
  if (projectId !== undefined) {
    where.projectId = projectId
  }
  const rows = await db.modelCard.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(toRecord)
}

export async function getModelCard(
  clerkId: string,
  cardId: string,
): Promise<ModelCardRecord | null> {
  const user = await ensureUser(clerkId)
  const row = await db.modelCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
  })
  return row ? toRecord(row) : null
}

export async function createModelCard(
  clerkId: string,
  input: CreateModelCardRequest,
): Promise<ModelCardRecord> {
  const user = await ensureUser(clerkId)

  const count = await db.modelCard.count({
    where: { userId: user.id, isDeleted: false },
  })
  if (count >= MODEL_CARD.MAX_CARDS_PER_USER) {
    throw new Error(
      `Maximum ${MODEL_CARD.MAX_CARDS_PER_USER} model cards reached`,
    )
  }

  const row = await db.modelCard.create({
    data: {
      userId: user.id,
      projectId: input.projectId ?? null,
      name: input.name,
      description: input.description ?? null,
      modelId: input.modelId,
      adapterType: input.adapterType,
      advancedParams: input.advancedParams ?? undefined,
      tags: input.tags ?? [],
    },
  })

  return toRecord(row)
}

export async function updateModelCard(
  clerkId: string,
  cardId: string,
  input: UpdateModelCardRequest,
): Promise<ModelCardRecord> {
  const user = await ensureUser(clerkId)

  const existing = await db.modelCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
  })
  if (!existing) throw new Error('Model card not found')

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.modelId !== undefined) data.modelId = input.modelId
  if (input.adapterType !== undefined) data.adapterType = input.adapterType
  if (input.advancedParams !== undefined)
    data.advancedParams = input.advancedParams
  if (input.tags !== undefined) data.tags = input.tags
  if (input.projectId !== undefined) data.projectId = input.projectId

  const row = await db.modelCard.update({
    where: { id: cardId },
    data,
  })

  return toRecord(row)
}

export async function deleteModelCard(
  clerkId: string,
  cardId: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  await db.modelCard.updateMany({
    where: { id: cardId, userId: user.id, isDeleted: false },
    data: { isDeleted: true },
  })
}
