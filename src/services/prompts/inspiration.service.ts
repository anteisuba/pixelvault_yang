import 'server-only'

import { db } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'
import type { InspirationPrompt, Recipe } from '@/lib/generated/prisma/client'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { ensureUser } from '@/services/user.service'
import { AI_MODELS } from '@/constants/models'
import {
  RECIPE_VISIBILITY,
  USER_RECIPE_INSPIRATION_SOURCE,
} from '@/constants/prompt-library'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { creatorProfilePath } from '@/constants/routes'

// ─── Types ──────────────────────────────────────────────────────

export type InspirationSortBy = 'rank' | 'likes' | 'views' | 'recent'

export interface ListInspirationsOptions {
  category?: string
  query?: string
  sortBy?: InspirationSortBy
  limit?: number
  offset?: number
}

export interface ListInspirationsResult {
  inspirations: InspirationPrompt[]
  total: number
}

export interface CloneInspirationOverrides {
  modelId?: string
  provider?: string
  outputType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D'
}

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 60
const CLONE_NAME_MAX_LENGTH = 48
const DEFAULT_CLONE_MODEL_ID: string = AI_MODELS.OPENAI_GPT_IMAGE_2
const DEFAULT_CLONE_PROVIDER_LABEL = getDefaultProviderConfig(
  AI_ADAPTER_TYPES.OPENAI,
).label

// ─── List ───────────────────────────────────────────────────────

/**
 * List the shared prompt library feed: community-published recipes first
 * (freshest at top), then the curated inspiration dataset.
 *
 * - `category` matches curated `categories` and recipe `tags` via `has`
 * - `query` does a case-insensitive substring match on the prompt text
 * - `sortBy` defaults to `rank` (curated order); recipes sort by recency /
 *   favorites / usage to mirror the same knob
 *
 * The two sources are paginated as one deterministic list — recipes occupy the
 * leading `recipeTotal` slots, curated inspirations follow. This keeps offset
 * pagination stable without a heterogeneous SQL UNION.
 */
export async function listInspirations(
  options: ListInspirationsOptions = {},
): Promise<ListInspirationsResult> {
  const limit = clampLimit(options.limit)
  const offset = Math.max(options.offset ?? 0, 0)
  const sortBy: InspirationSortBy = options.sortBy ?? 'rank'
  const category = options.category
  const trimmedQuery = options.query?.trim() || undefined

  const inspirationWhere: Prisma.InspirationPromptWhereInput = {
    isPublic: true,
  }
  if (category) inspirationWhere.categories = { has: category }
  if (trimmedQuery) {
    inspirationWhere.prompt = { contains: trimmedQuery, mode: 'insensitive' }
  }

  const recipeWhere: Prisma.RecipeWhereInput = {
    visibility: RECIPE_VISIBILITY.PUBLIC,
    isDeleted: false,
  }
  if (category) recipeWhere.tags = { has: category }
  if (trimmedQuery) {
    recipeWhere.compiledPrompt = { contains: trimmedQuery, mode: 'insensitive' }
  }

  const [recipeTotal, inspirationTotal] = await Promise.all([
    db.recipe.count({ where: recipeWhere }),
    db.inspirationPrompt.count({ where: inspirationWhere }),
  ])

  // Window math across the two segments (recipes lead, curated follow).
  const recipeSkip = Math.min(offset, recipeTotal)
  const recipeTake = Math.max(0, Math.min(recipeTotal - offset, limit))
  const inspirationSkip = Math.max(0, offset - recipeTotal)
  const inspirationTake = limit - recipeTake

  const [recipeRows, inspirationRows] = await Promise.all([
    recipeTake > 0
      ? db.recipe.findMany({
          where: recipeWhere,
          orderBy: getRecipeFeedOrderBy(sortBy),
          skip: recipeSkip,
          take: recipeTake,
        })
      : Promise.resolve<Recipe[]>([]),
    inspirationTake > 0
      ? db.inspirationPrompt.findMany({
          where: inspirationWhere,
          orderBy: getOrderBy(sortBy),
          skip: inspirationSkip,
          take: inspirationTake,
        })
      : Promise.resolve<InspirationPrompt[]>([]),
  ])

  const recipeInspirations = await mapPublicRecipesToInspirations(recipeRows)

  return {
    inspirations: [...recipeInspirations, ...inspirationRows],
    total: recipeTotal + inspirationTotal,
  }
}

/**
 * Project community-published recipes into the inspiration-card shape the
 * shared library UI consumes. Cover precedence: earliest *public* generation
 * made with the recipe → the recipe's stored cover → none (text fallback).
 */
async function mapPublicRecipesToInspirations(
  recipes: Recipe[],
): Promise<InspirationPrompt[]> {
  if (recipes.length === 0) return []

  const [coverByRecipeId, authorByUserId] = await Promise.all([
    resolvePublicRecipeCovers(recipes),
    resolveRecipeAuthors(recipes),
  ])

  return recipes.map((recipe) => {
    const author = authorByUserId.get(recipe.userId)
    const handle = author?.username ?? author?.displayName ?? 'creator'
    const displayName = author?.displayName ?? author?.username ?? 'Creator'
    return {
      id: recipe.id,
      source: USER_RECIPE_INSPIRATION_SOURCE,
      rank: 0,
      prompt: recipe.compiledPrompt,
      author: handle,
      authorName: displayName,
      likes: recipe.favoriteCount,
      views: recipe.usageCount,
      imageUrl: coverByRecipeId.get(recipe.id) ?? recipe.coverImageUrl ?? '',
      modelHint: recipe.modelId,
      categories: recipe.tags,
      sourceUrl: author?.username ? creatorProfilePath(author.username) : '',
      rating: null,
      score: null,
      publishedAt: recipe.updatedAt,
      isPublic: true,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    }
  })
}

type PublicRecipeCoverRow = {
  recipeId: string
  thumbnailUrl: string | null
  previewUrl: string | null
  url: string | null
}

async function resolvePublicRecipeCovers(
  recipes: Array<{ id: string }>,
): Promise<Map<string, string>> {
  const coverByRecipeId = new Map<string, string>()
  const recipeIds = recipes.map((recipe) => recipe.id)
  if (recipeIds.length === 0) return coverByRecipeId

  // Only public generations may back a public cover — never leak a private image.
  const rows = await db.$queryRaw<PublicRecipeCoverRow[]>`
    SELECT DISTINCT ON ("recipeSnapshot"->>'recipeId')
      "recipeSnapshot"->>'recipeId' AS "recipeId",
      "thumbnailUrl",
      "previewUrl",
      "url"
    FROM "Generation"
    WHERE "isPublic" = true
      AND "recipeSnapshot"->>'recipeId' IN (${Prisma.join(recipeIds)})
    ORDER BY "recipeSnapshot"->>'recipeId', "createdAt" ASC
  `
  for (const row of rows) {
    const cover = row.thumbnailUrl ?? row.previewUrl ?? row.url
    if (cover) coverByRecipeId.set(row.recipeId, cover)
  }
  return coverByRecipeId
}

async function resolveRecipeAuthors(
  recipes: Array<{ userId: string }>,
): Promise<
  Map<string, { username: string | null; displayName: string | null }>
> {
  const userIds = Array.from(new Set(recipes.map((recipe) => recipe.userId)))
  if (userIds.length === 0) return new Map()

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, displayName: true },
  })
  return new Map(
    users.map((user) => [
      user.id,
      { username: user.username, displayName: user.displayName },
    ]),
  )
}

// ─── Get by id ──────────────────────────────────────────────────

/**
 * Fetch a single public inspiration by id.
 * Returns null when the row is missing or has been soft-hidden.
 */
export async function getInspirationById(
  id: string,
): Promise<InspirationPrompt | null> {
  const row = await db.inspirationPrompt.findUnique({ where: { id } })
  if (!row || !row.isPublic) return null
  return row
}

// ─── Clone to Recipe ────────────────────────────────────────────

/**
 * Clone an inspiration prompt into the user's private Recipe library.
 * The new Recipe gets a `userIntent.source = 'inspiration'` marker
 * so the UI can show "Cloned from @author" attribution and link back.
 */
export async function cloneInspirationToRecipe(
  clerkId: string,
  inspirationId: string,
  overrides: CloneInspirationOverrides = {},
): Promise<Recipe> {
  const dbUser = await ensureUser(clerkId)
  const inspiration = await db.inspirationPrompt.findUnique({
    where: { id: inspirationId },
  })

  if (!inspiration || !inspiration.isPublic) {
    // The feed also surfaces community-published recipes — an id that isn't a
    // curated inspiration may be a public recipe. Clone that instead.
    const shared = await cloneSharedRecipe(dbUser.id, inspirationId, overrides)
    if (shared) return shared

    throw new ApiRequestError(
      'INSPIRATION_NOT_FOUND',
      404,
      'errors.inspiration.notFound',
      `Inspiration ${inspirationId} not found`,
    )
  }

  const recipe = await db.recipe.create({
    data: {
      userId: dbUser.id,
      name: getCloneName(inspiration),
      compiledPrompt: inspiration.prompt,
      modelId: overrides.modelId ?? DEFAULT_CLONE_MODEL_ID,
      provider: overrides.provider ?? DEFAULT_CLONE_PROVIDER_LABEL,
      outputType: overrides.outputType ?? 'IMAGE',
      userIntent: {
        source: 'inspiration',
        inspirationId: inspiration.id,
        author: inspiration.author,
        authorName: inspiration.authorName,
        sourceUrl: inspiration.sourceUrl,
        categories: inspiration.categories,
      },
    },
  })

  logger.info('Cloned inspiration to recipe', {
    recipeId: recipe.id,
    inspirationId,
    userId: dbUser.id,
  })

  return recipe
}

/**
 * Clone a community-published recipe (from the shared feed) into the caller's
 * library. Returns null when `id` is not a public recipe, so the caller can
 * fall through to a not-found error.
 */
async function cloneSharedRecipe(
  userId: string,
  recipeId: string,
  overrides: CloneInspirationOverrides,
): Promise<Recipe | null> {
  const source = await db.recipe.findFirst({
    where: {
      id: recipeId,
      visibility: RECIPE_VISIBILITY.PUBLIC,
      isDeleted: false,
    },
  })
  if (!source) return null

  const recipe = await db.recipe.create({
    data: {
      userId,
      name: source.name || getCloneName({ prompt: source.compiledPrompt }),
      outputType: overrides.outputType ?? source.outputType,
      compiledPrompt: source.compiledPrompt,
      negativePrompt: source.negativePrompt,
      modelId: overrides.modelId ?? source.modelId,
      provider: overrides.provider ?? source.provider,
      remixSourceRecipeId: source.id,
      userIntent: {
        source: USER_RECIPE_INSPIRATION_SOURCE,
        recipeId: source.id,
      },
    },
  })

  // Reflect the clone in the source's usage counter (drives the feed "views").
  await db.recipe
    .update({
      where: { id: source.id },
      data: { usageCount: { increment: 1 } },
    })
    .catch((error: unknown) => {
      logger.warn('Failed to bump shared recipe usageCount', {
        recipeId: source.id,
        error: error instanceof Error ? error.message : String(error),
      })
    })

  logger.info('Cloned shared recipe', {
    recipeId: recipe.id,
    sourceRecipeId: source.id,
    userId,
  })

  return recipe
}

// ─── Helpers ────────────────────────────────────────────────────

function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

function getOrderBy(
  sortBy: InspirationSortBy,
): Prisma.InspirationPromptOrderByWithRelationInput {
  switch (sortBy) {
    case 'likes':
      return { likes: 'desc' }
    case 'views':
      return { views: 'desc' }
    case 'recent':
      return { publishedAt: 'desc' }
    case 'rank':
    default:
      return { rank: 'asc' }
  }
}

function getRecipeFeedOrderBy(
  sortBy: InspirationSortBy,
): Prisma.RecipeOrderByWithRelationInput {
  switch (sortBy) {
    case 'likes':
      return { favoriteCount: 'desc' }
    case 'views':
      return { usageCount: 'desc' }
    case 'recent':
    case 'rank':
    default:
      return { updatedAt: 'desc' }
  }
}

function getCloneName(inspiration: {
  prompt: string
  authorName?: string
}): string {
  const firstLine = inspiration.prompt
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) return `Inspiration by ${inspiration.authorName ?? 'creator'}`

  const compact = firstLine.replace(/\s+/g, ' ')
  return compact.length > CLONE_NAME_MAX_LENGTH
    ? `${compact.slice(0, CLONE_NAME_MAX_LENGTH - 3)}...`
    : compact
}
