import 'server-only'

import { db } from '@/lib/db'
import { CARD_RECIPE } from '@/constants/card-types'
import type {
  CardRecipeRecord,
  CardRecipeDetailRecord,
  CreateCardRecipeRequest,
  UpdateCardRecipeRequest,
} from '@/types'
import { ensureUser } from '@/services/user.service'

// ─── Helpers ────────────────────────────────────────────────────

const CARD_NAME_SELECT = { id: true, name: true } as const
const MODEL_CARD_NAME_SELECT = { id: true, name: true, modelId: true } as const

function toRecord(row: {
  id: string
  name: string
  characterCardId: string | null
  backgroundCardId: string | null
  styleCardId: string | null
  modelCardId: string | null
  freePrompt: string | null
  projectId: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}): CardRecipeRecord {
  return {
    id: row.id,
    name: row.name,
    characterCardId: row.characterCardId,
    backgroundCardId: row.backgroundCardId,
    styleCardId: row.styleCardId,
    modelCardId: row.modelCardId,
    freePrompt: row.freePrompt,
    projectId: row.projectId,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

type DetailRow = CardRecipeRecord & {
  characterCard: { id: string; name: string } | null
  backgroundCard: { id: string; name: string } | null
  styleCard: { id: string; name: string } | null
  modelCard: { id: string; name: string; modelId: string } | null
}

function toDetailRecord(row: DetailRow): CardRecipeDetailRecord {
  return {
    ...toRecord(row),
    characterCard: row.characterCard,
    backgroundCard: row.backgroundCard,
    styleCard: row.styleCard,
    modelCard: row.modelCard,
  }
}

// ─── CRUD ───────────────────────────────────────────────────────

export async function listCardRecipes(
  clerkId: string,
  projectId?: string | null,
): Promise<CardRecipeDetailRecord[]> {
  const user = await ensureUser(clerkId)
  const where: Record<string, unknown> = { userId: user.id, isDeleted: false }
  if (projectId !== undefined) {
    where.projectId = projectId
  }
  const rows = await db.cardRecipe.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      characterCard: { select: CARD_NAME_SELECT },
      backgroundCard: { select: CARD_NAME_SELECT },
      styleCard: { select: CARD_NAME_SELECT },
      modelCard: { select: MODEL_CARD_NAME_SELECT },
    },
  })
  return rows.map(toDetailRecord as (row: (typeof rows)[number]) => CardRecipeDetailRecord)
}

export async function getCardRecipe(
  clerkId: string,
  recipeId: string,
): Promise<CardRecipeDetailRecord | null> {
  const user = await ensureUser(clerkId)
  const row = await db.cardRecipe.findFirst({
    where: { id: recipeId, userId: user.id, isDeleted: false },
    include: {
      characterCard: { select: CARD_NAME_SELECT },
      backgroundCard: { select: CARD_NAME_SELECT },
      styleCard: { select: CARD_NAME_SELECT },
      modelCard: { select: MODEL_CARD_NAME_SELECT },
    },
  })
  return row ? toDetailRecord(row as DetailRow) : null
}

export async function createCardRecipe(
  clerkId: string,
  input: CreateCardRecipeRequest,
): Promise<CardRecipeDetailRecord> {
  const user = await ensureUser(clerkId)

  const count = await db.cardRecipe.count({
    where: { userId: user.id, isDeleted: false },
  })
  if (count >= CARD_RECIPE.MAX_RECIPES_PER_USER) {
    throw new Error(
      `Maximum ${CARD_RECIPE.MAX_RECIPES_PER_USER} recipes reached`,
    )
  }

  const row = await db.cardRecipe.create({
    data: {
      userId: user.id,
      projectId: input.projectId ?? null,
      name: input.name,
      characterCardId: input.characterCardId ?? null,
      backgroundCardId: input.backgroundCardId ?? null,
      styleCardId: input.styleCardId ?? null,
      modelCardId: input.modelCardId ?? null,
      freePrompt: input.freePrompt ?? null,
    },
    include: {
      characterCard: { select: CARD_NAME_SELECT },
      backgroundCard: { select: CARD_NAME_SELECT },
      styleCard: { select: CARD_NAME_SELECT },
      modelCard: { select: MODEL_CARD_NAME_SELECT },
    },
  })

  return toDetailRecord(row as DetailRow)
}

export async function updateCardRecipe(
  clerkId: string,
  recipeId: string,
  input: UpdateCardRecipeRequest,
): Promise<CardRecipeDetailRecord> {
  const user = await ensureUser(clerkId)

  const existing = await db.cardRecipe.findFirst({
    where: { id: recipeId, userId: user.id, isDeleted: false },
  })
  if (!existing) throw new Error('Card recipe not found')

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.characterCardId !== undefined)
    data.characterCardId = input.characterCardId
  if (input.backgroundCardId !== undefined)
    data.backgroundCardId = input.backgroundCardId
  if (input.styleCardId !== undefined) data.styleCardId = input.styleCardId
  if (input.modelCardId !== undefined) data.modelCardId = input.modelCardId
  if (input.freePrompt !== undefined) data.freePrompt = input.freePrompt
  if (input.projectId !== undefined) data.projectId = input.projectId

  const row = await db.cardRecipe.update({
    where: { id: recipeId },
    data,
    include: {
      characterCard: { select: CARD_NAME_SELECT },
      backgroundCard: { select: CARD_NAME_SELECT },
      styleCard: { select: CARD_NAME_SELECT },
      modelCard: { select: MODEL_CARD_NAME_SELECT },
    },
  })

  return toDetailRecord(row as DetailRow)
}

export async function deleteCardRecipe(
  clerkId: string,
  recipeId: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  await db.cardRecipe.updateMany({
    where: { id: recipeId, userId: user.id, isDeleted: false },
    data: { isDeleted: true },
  })
}
