import 'server-only'

import { db } from '@/lib/db'
import type {
  InspirationPrompt,
  Prisma,
  Recipe,
} from '@/lib/generated/prisma/client'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { ensureUser } from '@/services/user.service'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'

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
 * List curated inspiration prompts with filter, search, and sort.
 *
 * - `category` matches against the `categories` text[] via `has`
 * - `query` does a case-insensitive substring match on the prompt text
 *   (Phase 1; a trigram index can be added in a follow-up PR if needed)
 * - `sortBy` defaults to `rank` ascending (curated order)
 */
export async function listInspirations(
  options: ListInspirationsOptions = {},
): Promise<ListInspirationsResult> {
  const limit = clampLimit(options.limit)
  const offset = Math.max(options.offset ?? 0, 0)
  const sortBy: InspirationSortBy = options.sortBy ?? 'rank'

  const where: Prisma.InspirationPromptWhereInput = { isPublic: true }
  if (options.category) {
    where.categories = { has: options.category }
  }
  const trimmedQuery = options.query?.trim()
  if (trimmedQuery) {
    where.prompt = { contains: trimmedQuery, mode: 'insensitive' }
  }

  const orderBy = getOrderBy(sortBy)

  const [inspirations, total] = await Promise.all([
    db.inspirationPrompt.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    db.inspirationPrompt.count({ where }),
  ])

  return { inspirations, total }
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

function getCloneName(
  inspiration: Pick<InspirationPrompt, 'prompt' | 'authorName'>,
): string {
  const firstLine = inspiration.prompt
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) return `Inspiration by ${inspiration.authorName}`

  const compact = firstLine.replace(/\s+/g, ' ')
  return compact.length > CLONE_NAME_MAX_LENGTH
    ? `${compact.slice(0, CLONE_NAME_MAX_LENGTH - 3)}...`
    : compact
}
