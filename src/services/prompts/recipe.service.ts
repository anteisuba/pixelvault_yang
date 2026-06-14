import 'server-only'

import { db } from '@/lib/db'
import { Prisma, type Recipe } from '@/lib/generated/prisma/client'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { ensureUser } from '@/services/user.service'
import { updatePreferenceOnRecipeSaved } from '@/services/user-preference.service'
import {
  GenerationSnapshotSchema,
  type CreateRecipeFromGenerationRequest,
  type CreateRecipeRequest,
  type GenerationRecord,
  type RecipeUsage,
} from '@/types'

export interface ListRecipesResult {
  recipes: RecipeWithCover[]
  total: number
}

export type RecipeWithCover = Recipe & {
  coverThumbnailUrl: string | null
}

export type RecipeListItem = Pick<
  Recipe,
  | 'id'
  | 'outputType'
  | 'name'
  | 'compiledPrompt'
  | 'modelId'
  | 'version'
  | 'createdAt'
>

export type RecipeSummaryWithCover = RecipeListItem & {
  coverThumbnailUrl: string | null
}

const RECIPE_LIST_ITEM_SELECT = {
  id: true,
  outputType: true,
  name: true,
  compiledPrompt: true,
  modelId: true,
  version: true,
  createdAt: true,
} as const satisfies Prisma.RecipeSelect

const RECIPE_GENERATION_SELECT = {
  id: true,
  createdAt: true,
  outputType: true,
  status: true,
  url: true,
  storageKey: true,
  mimeType: true,
  thumbnailUrl: true,
  thumbnailStorageKey: true,
  previewUrl: true,
  previewStorageKey: true,
  width: true,
  height: true,
  duration: true,
  referenceImageUrl: true,
  modelUrl: true,
  modelStorageKey: true,
  prompt: true,
  negativePrompt: true,
  model: true,
  provider: true,
  requestCount: true,
  isFreeGeneration: true,
  isPublic: true,
  isPromptPublic: true,
  isFeatured: true,
  userId: true,
  projectId: true,
  characterCardId: true,
  cardRecipeId: true,
  snapshot: true,
  seed: true,
  runGroupId: true,
  runGroupType: true,
  runGroupIndex: true,
  isWinner: true,
} as const satisfies Prisma.GenerationSelect

const RECIPE_COVER_GENERATION_SELECT = {
  id: true,
  thumbnailUrl: true,
  previewUrl: true,
  url: true,
} as const satisfies Prisma.GenerationSelect

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined
  const serialized = JSON.stringify(value)
  if (!serialized) return undefined
  return JSON.parse(serialized) as Prisma.InputJsonValue
}

function getRecipeNameFromGeneration(
  generation: Pick<GenerationRecord, 'prompt' | 'model'>,
): string {
  const compactPrompt = generation.prompt.replace(/\s+/g, ' ').trim()
  if (!compactPrompt) return generation.model
  return compactPrompt.length > 48
    ? `${compactPrompt.slice(0, 45)}...`
    : compactPrompt
}

function getGenerationRecipeParams(generation: {
  snapshot?: unknown
}): Record<string, unknown> | undefined {
  const parsed = GenerationSnapshotSchema.safeParse(generation.snapshot)
  if (!parsed.success) return undefined

  return {
    aspectRatio: parsed.data.aspectRatio,
    advancedParams: parsed.data.advancedParams,
  }
}

function getGenerationCoverThumbnailUrl(generation: {
  thumbnailUrl: string | null
  previewUrl: string | null
  url: string | null
}): string | null {
  return generation.thumbnailUrl ?? generation.previewUrl ?? generation.url
}

function getGenerationReferenceAssets(generation: {
  referenceImageUrl?: string | null
  snapshot?: unknown
}): Array<{ url: string; role: 'composition' }> | undefined {
  const parsed = GenerationSnapshotSchema.safeParse(generation.snapshot)
  const referenceImages = parsed.success
    ? parsed.data.referenceImages
    : generation.referenceImageUrl
      ? [generation.referenceImageUrl]
      : undefined

  if (!referenceImages || referenceImages.length === 0) return undefined

  return referenceImages
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .slice(0, 5)
    .map((url) => ({ url, role: 'composition' as const }))
}

export function buildRecipeSnapshot(
  recipe: Recipe,
  usage: RecipeUsage,
): Prisma.InputJsonValue {
  return toPrismaJson({
    sourceType: 'prompt_template',
    recipeId: recipe.id,
    recipeVersion: usage.recipeVersion ?? recipe.version,
    useMode: usage.useMode,
    name: recipe.name,
    outputType: recipe.outputType,
    compiledPrompt: recipe.compiledPrompt,
    negativePrompt: recipe.negativePrompt,
    modelId: recipe.modelId,
    provider: recipe.provider,
    params: recipe.params,
    referenceAssets: recipe.referenceAssets,
    parentGenerationId: recipe.parentGenerationId,
    appliedAt: new Date().toISOString(),
  })!
}

export async function buildRecipeSnapshotForUser(
  userId: string,
  usage: RecipeUsage,
): Promise<Prisma.InputJsonValue> {
  const recipe = await db.recipe.findFirst({
    where: {
      id: usage.recipeId,
      userId,
      isDeleted: false,
    },
  })

  if (!recipe) {
    throw new ApiRequestError(
      'RECIPE_NOT_FOUND',
      404,
      'errors.recipes.notFound',
      'Recipe not found',
    )
  }

  return buildRecipeSnapshot(recipe, usage)
}

export async function createRecipe(
  clerkId: string,
  data: CreateRecipeRequest,
): Promise<Recipe> {
  const user = await ensureUser(clerkId)

  const recipe = await db.recipe.create({
    data: {
      userId: user.id,
      outputType: data.outputType,
      name: data.name,
      userIntent: toPrismaJson(data.userIntent),
      compiledPrompt: data.compiledPrompt,
      negativePrompt: data.negativePrompt ?? null,
      modelId: data.modelId,
      provider: data.provider,
      params: toPrismaJson(data.params),
      referenceAssets: toPrismaJson(data.referenceAssets),
      seed: data.seed,
      parentGenerationId: data.parentGenerationId,
    },
  })

  try {
    await updatePreferenceOnRecipeSaved(user.id, recipe)
  } catch (error) {
    logger.warn('Recipe preference update failed', {
      recipeId: recipe.id,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return recipe
}

export async function updateRecipe(
  clerkId: string,
  id: string,
  data: CreateRecipeRequest,
): Promise<Recipe | null> {
  const user = await ensureUser(clerkId)
  const existingRecipe = await db.recipe.findFirst({
    where: {
      id,
      userId: user.id,
      isDeleted: false,
    },
  })

  if (!existingRecipe) return null

  const recipe = await db.recipe.update({
    where: { id },
    data: {
      outputType: data.outputType,
      name: data.name,
      userIntent: toPrismaJson(data.userIntent),
      compiledPrompt: data.compiledPrompt,
      negativePrompt: data.negativePrompt ?? null,
      modelId: data.modelId,
      provider: data.provider,
      params: toPrismaJson(data.params),
      referenceAssets: toPrismaJson(data.referenceAssets),
      seed: data.seed,
      parentGenerationId: data.parentGenerationId,
      version: { increment: 1 },
    },
  })

  try {
    await updatePreferenceOnRecipeSaved(user.id, recipe)
  } catch (error) {
    logger.warn('Recipe preference update failed', {
      recipeId: recipe.id,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return recipe
}

export async function listRecipes(
  clerkId: string,
  page: number,
  limit: number,
): Promise<ListRecipesResult> {
  const user = await ensureUser(clerkId)
  const skip = (page - 1) * limit
  const where = {
    userId: user.id,
    isDeleted: false,
  }

  const [recipes, total] = await Promise.all([
    db.recipe.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.recipe.count({ where }),
  ])

  const parentGenerationIds = Array.from(
    new Set(
      recipes
        .map((recipe) => recipe.parentGenerationId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )

  if (parentGenerationIds.length === 0) {
    return {
      recipes: recipes.map((recipe) => ({
        ...recipe,
        coverThumbnailUrl: null,
      })),
      total,
    }
  }

  const coverGenerations = await db.generation.findMany({
    where: {
      userId: user.id,
      id: { in: parentGenerationIds },
    },
    select: RECIPE_COVER_GENERATION_SELECT,
  })

  const coverUrlByGenerationId = new Map(
    coverGenerations.map((generation) => [
      generation.id,
      getGenerationCoverThumbnailUrl(generation),
    ]),
  )

  return {
    recipes: recipes.map((recipe) => ({
      ...recipe,
      coverThumbnailUrl: recipe.parentGenerationId
        ? (coverUrlByGenerationId.get(recipe.parentGenerationId) ?? null)
        : null,
    })),
    total,
  }
}

/**
 * Resolve each recipe's cover thumbnail for list surfaces. Cover precedence:
 *   1. the FIRST image generated with the recipe — the earliest live generation
 *      whose recipeSnapshot.recipeId matches (a deleted first image naturally
 *      falls back to the next-earliest, since only live rows are returned);
 *   2. the recipe's parent generation (the image it was saved from);
 *   3. null → caller renders a text/icon fallback.
 * One JSONB DISTINCT ON query for (1) + one batched fetch for (2) — no
 * per-recipe fan-out.
 */
async function resolveRecipeCovers(
  userId: string,
  recipes: Array<{ id: string; parentGenerationId: string | null }>,
): Promise<Map<string, string | null>> {
  const coverByRecipeId = new Map<string, string | null>()
  const recipeIds = recipes.map((recipe) => recipe.id)
  if (recipeIds.length === 0) return coverByRecipeId

  type FirstGenerationCoverRow = {
    recipeId: string
    thumbnailUrl: string | null
    previewUrl: string | null
    url: string | null
  }
  const firstGenerations = await db.$queryRaw<FirstGenerationCoverRow[]>`
    SELECT DISTINCT ON ("recipeSnapshot"->>'recipeId')
      "recipeSnapshot"->>'recipeId' AS "recipeId",
      "thumbnailUrl",
      "previewUrl",
      "url"
    FROM "Generation"
    WHERE "userId" = ${userId}
      AND "recipeSnapshot"->>'recipeId' IN (${Prisma.join(recipeIds)})
    ORDER BY "recipeSnapshot"->>'recipeId', "createdAt" ASC
  `
  for (const row of firstGenerations) {
    coverByRecipeId.set(row.recipeId, getGenerationCoverThumbnailUrl(row))
  }

  const parentGenerationIds = recipes
    .filter((recipe) => !coverByRecipeId.get(recipe.id))
    .map((recipe) => recipe.parentGenerationId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  if (parentGenerationIds.length > 0) {
    const parents = await db.generation.findMany({
      where: { userId, id: { in: parentGenerationIds } },
      select: RECIPE_COVER_GENERATION_SELECT,
    })
    const parentCoverById = new Map(
      parents.map((generation) => [
        generation.id,
        getGenerationCoverThumbnailUrl(generation),
      ]),
    )
    for (const recipe of recipes) {
      if (coverByRecipeId.get(recipe.id)) continue
      if (!recipe.parentGenerationId) continue
      const cover = parentCoverById.get(recipe.parentGenerationId)
      if (cover) coverByRecipeId.set(recipe.id, cover)
    }
  }

  return coverByRecipeId
}

export async function listRecipeSummaries(
  clerkId: string,
  page: number,
  limit: number,
): Promise<RecipeSummaryWithCover[]> {
  const user = await ensureUser(clerkId)
  const skip = (page - 1) * limit

  const recipes = await db.recipe.findMany({
    where: {
      userId: user.id,
      isDeleted: false,
    },
    select: { ...RECIPE_LIST_ITEM_SELECT, parentGenerationId: true },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  })

  if (recipes.length === 0) return []

  const coverByRecipeId = await resolveRecipeCovers(user.id, recipes)

  return recipes.map((recipe) => ({
    id: recipe.id,
    outputType: recipe.outputType,
    name: recipe.name,
    compiledPrompt: recipe.compiledPrompt,
    modelId: recipe.modelId,
    version: recipe.version,
    createdAt: recipe.createdAt,
    coverThumbnailUrl: coverByRecipeId.get(recipe.id) ?? null,
  }))
}

export async function createRecipeFromGeneration(
  clerkId: string,
  data: CreateRecipeFromGenerationRequest,
): Promise<Recipe> {
  const user = await ensureUser(clerkId)
  const generation = await db.generation.findFirst({
    where: {
      id: data.generationId,
      userId: user.id,
    },
  })

  if (!generation) {
    throw new ApiRequestError(
      'GENERATION_NOT_FOUND',
      404,
      'errors.generation.notFound',
      'Generation not found',
    )
  }

  const recipe = await db.recipe.create({
    data: {
      userId: user.id,
      outputType: generation.outputType,
      name:
        data.name?.trim() ||
        getRecipeNameFromGeneration({
          prompt: generation.prompt,
          model: generation.model,
        }),
      compiledPrompt: generation.prompt,
      negativePrompt: generation.negativePrompt,
      modelId: generation.model,
      provider: generation.provider,
      params: toPrismaJson(getGenerationRecipeParams(generation)),
      referenceAssets: toPrismaJson(getGenerationReferenceAssets(generation)),
      seed: typeof generation.seed === 'bigint' ? generation.seed : undefined,
      parentGenerationId: generation.id,
    },
  })

  try {
    await updatePreferenceOnRecipeSaved(user.id, recipe)
  } catch (error) {
    logger.warn('Recipe preference update failed', {
      recipeId: recipe.id,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return recipe
}

export async function listRecipeGenerations(
  clerkId: string,
  recipeId: string,
): Promise<GenerationRecord[]> {
  const user = await ensureUser(clerkId)
  const recipe = await db.recipe.findFirst({
    where: {
      id: recipeId,
      userId: user.id,
      isDeleted: false,
    },
  })

  if (!recipe) return []

  const generations = await db.generation.findMany({
    where: {
      userId: user.id,
      OR: [
        ...(recipe.parentGenerationId
          ? [{ id: recipe.parentGenerationId }]
          : []),
        {
          recipeSnapshot: {
            path: ['recipeId'],
            equals: recipe.id,
          },
        },
      ],
    },
    select: RECIPE_GENERATION_SELECT,
    orderBy: { createdAt: 'desc' },
  })

  return generations
}

export async function getRecipe(
  clerkId: string,
  id: string,
): Promise<Recipe | null> {
  const user = await ensureUser(clerkId)

  return db.recipe.findFirst({
    where: {
      id,
      userId: user.id,
      isDeleted: false,
    },
  })
}

export async function deleteRecipe(
  clerkId: string,
  id: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const recipe = await db.recipe.findFirst({
    where: {
      id,
      userId: user.id,
      isDeleted: false,
    },
  })

  if (!recipe) return false

  await db.recipe.update({
    where: { id },
    data: { isDeleted: true },
  })

  return true
}
