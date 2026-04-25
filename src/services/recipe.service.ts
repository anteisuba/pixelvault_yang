import 'server-only'

import { db } from '@/lib/db'
import type { Prisma, Recipe } from '@/lib/generated/prisma/client'
import { ensureUser } from '@/services/user.service'
import type { CreateRecipeRequest } from '@/types'

export interface ListRecipesResult {
  recipes: Recipe[]
  total: number
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  const serialized = JSON.stringify(value)
  if (!serialized) return undefined
  return JSON.parse(serialized) as Prisma.InputJsonValue
}

export async function createRecipe(
  clerkId: string,
  data: CreateRecipeRequest,
): Promise<Recipe> {
  const user = await ensureUser(clerkId)

  return db.recipe.create({
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

  return { recipes, total }
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
