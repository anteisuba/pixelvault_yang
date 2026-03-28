import 'server-only'

import { db } from '@/lib/db'
import { STYLE_CARD } from '@/constants/card-types'
import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
  StyleAttributes,
} from '@/types'
import { ensureUser } from '@/services/user.service'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { extractStyleAttributes } from '@/services/recipe-compiler.service'

// ─── Helpers ────────────────────────────────────────────────────

function toRecord(row: {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string | null
  stylePrompt: string
  attributes: unknown
  loras?: unknown
  tags: string[]
  projectId: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}): StyleCardRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceImageUrl: row.sourceImageUrl,
    stylePrompt: row.stylePrompt,
    attributes: (row.attributes as StyleAttributes) ?? null,
    loras: (row.loras as StyleCardRecord['loras']) ?? null,
    tags: row.tags,
    projectId: row.projectId,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── CRUD ───────────────────────────────────────────────────────

export async function listStyleCards(
  clerkId: string,
  projectId?: string | null,
): Promise<StyleCardRecord[]> {
  const user = await ensureUser(clerkId)
  const where: Record<string, unknown> = { userId: user.id, isDeleted: false }
  if (projectId !== undefined) {
    where.projectId = projectId
  }
  const rows = await db.styleCard.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(toRecord)
}

export async function getStyleCard(
  clerkId: string,
  cardId: string,
): Promise<StyleCardRecord | null> {
  const user = await ensureUser(clerkId)
  const row = await db.styleCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
  })
  return row ? toRecord(row) : null
}

export async function createStyleCard(
  clerkId: string,
  input: CreateStyleCardRequest,
): Promise<StyleCardRecord> {
  const user = await ensureUser(clerkId)

  const count = await db.styleCard.count({
    where: { userId: user.id, isDeleted: false },
  })
  if (count >= STYLE_CARD.MAX_CARDS_PER_USER) {
    throw new Error(
      `Maximum ${STYLE_CARD.MAX_CARDS_PER_USER} style cards reached`,
    )
  }

  let sourceImageUrl: string | null = null
  let sourceStorageKey: string | null = null
  let attributes = input.attributes ?? null
  let stylePrompt = input.stylePrompt

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

    if (!attributes) {
      try {
        const extracted = await extractStyleAttributes(
          user.id,
          input.sourceImageData,
        )
        attributes = extracted.attributes
        stylePrompt = extracted.prompt
      } catch {
        console.warn(
          '[StyleCard] Attribute extraction failed, using manual prompt',
        )
      }
    }
  }

  const row = await db.styleCard.create({
    data: {
      userId: user.id,
      projectId: input.projectId ?? null,
      name: input.name,
      description: input.description ?? null,
      sourceImageUrl,
      sourceStorageKey,
      stylePrompt,
      attributes: attributes ?? undefined,
      tags: input.tags ?? [],
    },
  })

  return toRecord(row)
}

export async function updateStyleCard(
  clerkId: string,
  cardId: string,
  input: UpdateStyleCardRequest,
): Promise<StyleCardRecord> {
  const user = await ensureUser(clerkId)

  const existing = await db.styleCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
  })
  if (!existing) throw new Error('Style card not found')

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.stylePrompt !== undefined) data.stylePrompt = input.stylePrompt
  if (input.attributes !== undefined) data.attributes = input.attributes
  if (input.tags !== undefined) data.tags = input.tags
  if (input.projectId !== undefined) data.projectId = input.projectId

  const row = await db.styleCard.update({
    where: { id: cardId },
    data,
  })

  return toRecord(row)
}

export async function deleteStyleCard(
  clerkId: string,
  cardId: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  await db.styleCard.updateMany({
    where: { id: cardId, userId: user.id, isDeleted: false },
    data: { isDeleted: true },
  })
}
