import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { BACKGROUND_CARD } from '@/constants/card-types'
import type {
  BackgroundCardRecord,
  CreateBackgroundCardRequest,
  UpdateBackgroundCardRequest,
  BackgroundAttributes,
} from '@/types'
import { ensureUser } from '@/services/user.service'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { extractBackgroundAttributes } from '@/services/recipe-compiler.service'

// ─── Helpers ────────────────────────────────────────────────────

function toRecord(row: {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string | null
  backgroundPrompt: string
  attributes: unknown
  loras?: unknown
  tags: string[]
  projectId: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}): BackgroundCardRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceImageUrl: row.sourceImageUrl,
    backgroundPrompt: row.backgroundPrompt,
    attributes: (row.attributes as BackgroundAttributes) ?? null,
    loras: (row.loras as BackgroundCardRecord['loras']) ?? null,
    tags: row.tags,
    projectId: row.projectId,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── CRUD ───────────────────────────────────────────────────────

export async function listBackgroundCards(
  clerkId: string,
  projectId?: string | null,
): Promise<BackgroundCardRecord[]> {
  const user = await ensureUser(clerkId)
  const where: Record<string, unknown> = { userId: user.id, isDeleted: false }
  if (projectId !== undefined) {
    where.projectId = projectId
  }
  const rows = await db.backgroundCard.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(toRecord)
}

export async function getBackgroundCard(
  clerkId: string,
  cardId: string,
): Promise<BackgroundCardRecord | null> {
  const user = await ensureUser(clerkId)
  const row = await db.backgroundCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
  })
  return row ? toRecord(row) : null
}

export async function createBackgroundCard(
  clerkId: string,
  input: CreateBackgroundCardRequest,
): Promise<BackgroundCardRecord> {
  const user = await ensureUser(clerkId)

  // Check limit
  const count = await db.backgroundCard.count({
    where: { userId: user.id, isDeleted: false },
  })
  if (count >= BACKGROUND_CARD.MAX_CARDS_PER_USER) {
    throw new Error(
      `Maximum ${BACKGROUND_CARD.MAX_CARDS_PER_USER} background cards reached`,
    )
  }

  let sourceImageUrl: string | null = null
  let sourceStorageKey: string | null = null
  let attributes = input.attributes ?? null
  let backgroundPrompt = input.backgroundPrompt

  // If source image provided, upload and optionally extract attributes
  if (input.sourceImageData) {
    const buffer = Buffer.from(
      input.sourceImageData.replace(/^data:image\/\w+;base64,/, ''),
      'base64',
    )
    sourceStorageKey = generateStorageKey('IMAGE', user.id)
    sourceImageUrl = await uploadToR2({
      data: buffer,
      key: sourceStorageKey,
      mimeType: 'image/png',
    })

    // Extract attributes from image if not provided (best-effort)
    if (!attributes) {
      try {
        const extracted = await extractBackgroundAttributes(
          user.id,
          input.sourceImageData,
        )
        attributes = extracted.attributes
        backgroundPrompt = extracted.prompt
      } catch {
        // LLM unavailable — card still created with user's manual prompt and uploaded image
        logger.warn(
          '[BackgroundCard] Attribute extraction failed, using manual prompt',
        )
      }
    }
  }

  const row = await db.backgroundCard.create({
    data: {
      userId: user.id,
      projectId: input.projectId ?? null,
      name: input.name,
      description: input.description ?? null,
      sourceImageUrl,
      sourceStorageKey,
      backgroundPrompt,
      attributes: attributes ?? undefined,
      tags: input.tags ?? [],
    },
  })

  return toRecord(row)
}

export async function updateBackgroundCard(
  clerkId: string,
  cardId: string,
  input: UpdateBackgroundCardRequest,
): Promise<BackgroundCardRecord> {
  const user = await ensureUser(clerkId)

  const existing = await db.backgroundCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
  })
  if (!existing) throw new Error('Background card not found')

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.backgroundPrompt !== undefined)
    data.backgroundPrompt = input.backgroundPrompt
  if (input.attributes !== undefined) data.attributes = input.attributes
  if (input.tags !== undefined) data.tags = input.tags
  if (input.projectId !== undefined) data.projectId = input.projectId

  const row = await db.backgroundCard.update({
    where: { id: cardId },
    data,
  })

  return toRecord(row)
}

export async function deleteBackgroundCard(
  clerkId: string,
  cardId: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  await db.backgroundCard.updateMany({
    where: { id: cardId, userId: user.id, isDeleted: false },
    data: { isDeleted: true },
  })
}
