import 'server-only'

import { z } from 'zod'

import { db } from '@/lib/db'
import type {
  Prisma,
  Recipe,
  UserCreativePreference,
} from '@/lib/generated/prisma/client'
import {
  classifyImageIntentTaskType,
  classifyPromptTaskType,
  TASK_TYPES,
  type TaskType,
} from '@/lib/classify-task-type'
import {
  ImageIntentSchema,
  type GenerationRecord,
  type ImageIntent,
  type RecipeRecord,
} from '@/types'

const StringArraySchema = z.array(z.string())
const PreferredModelsByTaskSchema = z.record(z.string(), z.array(z.string()))

type PreferredModelsByTask = z.infer<typeof PreferredModelsByTaskSchema>
interface PreferenceRecipeRecord {
  id: string
  modelId: string
  negativePrompt: string | null
  compiledPrompt: string
  userIntent?: unknown
}

interface PreferenceGenerationRecord {
  id: string
  createdAt: Date
  prompt: string
  negativePrompt?: string | null
  model: string
  snapshot?: unknown
}

interface PreferenceEvent {
  modelId: string
  style: string | null
  taskType: TaskType
  aspectRatio: string | null
  createdAt: Date
}

const RECENT_SATISFIED_STYLE_LIMIT = 20
const RECENT_SATISFIED_MODEL_LIMIT = 10
const RECENT_RECIPE_NEGATIVE_LIMIT = 5
const FAVORITE_STYLE_THRESHOLD = 3
const COMMON_NEGATIVE_TAG_THRESHOLD = 2
const PREFERRED_MODEL_LIMIT_PER_TASK = 3

export type CreativePreference = UserCreativePreference

export async function getUserPreference(
  userId: string,
): Promise<UserCreativePreference | null> {
  return db.userCreativePreference.findUnique({
    where: { userId },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseStringArray(value: unknown): string[] {
  const parsed = StringArraySchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

function parsePreferredModelsByTask(value: unknown): PreferredModelsByTask {
  const parsed = PreferredModelsByTaskSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

export function parseUserPreferredModelsByTask(
  value: unknown,
): PreferredModelsByTask {
  return parsePreferredModelsByTask(value)
}

function normalizeTag(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function mostFrequentAtLeast(values: string[], threshold: number): string[] {
  const counts = new Map<string, number>()

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value)
}

function extractIntent(snapshot: unknown): ImageIntent | null {
  if (!isRecord(snapshot)) return null

  const candidate =
    snapshot.intent ??
    snapshot.imageIntent ??
    snapshot.userIntent ??
    snapshot.currentIntent
  const parsed = ImageIntentSchema.safeParse(candidate)

  return parsed.success ? parsed.data : null
}

function extractSnapshotString(
  snapshot: unknown,
  keys: string[],
): string | null {
  if (!isRecord(snapshot)) return null

  for (const key of keys) {
    const value = snapshot[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function extractStyle(record: {
  prompt: string
  snapshot?: unknown
}): string | null {
  const intent = extractIntent(record.snapshot)
  const style =
    intent?.style ?? extractSnapshotString(record.snapshot, ['style'])

  return typeof style === 'string' ? normalizeTag(style) : null
}

function extractAspectRatio(record: { snapshot?: unknown }): string | null {
  return extractSnapshotString(record.snapshot, ['aspectRatio', 'ratio'])
}

function extractTaskType(record: {
  prompt: string
  snapshot?: unknown
}): TaskType {
  const intent = extractIntent(record.snapshot)
  if (intent) return classifyImageIntentTaskType(intent)

  return classifyPromptTaskType(
    [record.prompt, extractStyle(record)].filter(Boolean).join(' '),
  )
}

function toPreferenceEvent(
  record: PreferenceGenerationRecord,
): PreferenceEvent {
  return {
    modelId: record.model,
    style: extractStyle(record),
    taskType: extractTaskType(record),
    aspectRatio: extractAspectRatio(record),
    createdAt: record.createdAt,
  }
}

function buildPreferredModelsByTask(
  events: PreferenceEvent[],
): PreferredModelsByTask {
  const grouped = new Map<TaskType, Map<string, number>>()

  for (const event of events.slice(0, RECENT_SATISFIED_MODEL_LIMIT)) {
    const modelCounts = grouped.get(event.taskType) ?? new Map<string, number>()
    modelCounts.set(event.modelId, (modelCounts.get(event.modelId) ?? 0) + 1)
    grouped.set(event.taskType, modelCounts)
  }

  const preferred: PreferredModelsByTask = {}

  for (const taskType of TASK_TYPES) {
    const modelCounts = grouped.get(taskType)
    if (!modelCounts) continue

    const rankedModels = [...modelCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, PREFERRED_MODEL_LIMIT_PER_TASK)
      .map(([modelId]) => modelId)

    if (rankedModels.length > 0) {
      preferred[taskType] = rankedModels
    }
  }

  return preferred
}

function uniqueGenerationHistory(
  records: PreferenceGenerationRecord[],
): PreferenceGenerationRecord[] {
  const seen = new Set<string>()
  const uniqueRecords: PreferenceGenerationRecord[] = []

  for (const record of records) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    uniqueRecords.push(record)
  }

  return uniqueRecords
}

function mergePreferredModel(
  existing: PreferredModelsByTask,
  taskType: TaskType,
  modelId: string,
): PreferredModelsByTask {
  return {
    ...existing,
    [taskType]: unique([modelId, ...(existing[taskType] ?? [])]).slice(
      0,
      PREFERRED_MODEL_LIMIT_PER_TASK,
    ),
  }
}

function splitNegativeTags(
  negativePrompt: string | null | undefined,
): string[] {
  if (!negativePrompt) return []

  return negativePrompt
    .split(/[,;\n]+/)
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is string => tag !== null)
}

function extractRecipeIntent(recipe: PreferenceRecipeRecord): unknown {
  return recipe.userIntent
}

function toPreferenceRecipeRecord(
  recipe: Recipe | RecipeRecord,
): PreferenceRecipeRecord {
  return {
    id: recipe.id,
    modelId: recipe.modelId,
    negativePrompt: recipe.negativePrompt,
    compiledPrompt: recipe.compiledPrompt,
    userIntent: 'userIntent' in recipe ? recipe.userIntent : undefined,
  }
}

function extractRecipeStyle(recipe: PreferenceRecipeRecord): string | null {
  const parsed = ImageIntentSchema.safeParse(extractRecipeIntent(recipe))
  const style = parsed.success ? parsed.data.style : null

  return typeof style === 'string' ? normalizeTag(style) : null
}

function extractRecipeTaskType(recipe: PreferenceRecipeRecord): TaskType {
  const parsed = ImageIntentSchema.safeParse(extractRecipeIntent(recipe))
  if (parsed.success) return classifyImageIntentTaskType(parsed.data)

  return classifyPromptTaskType(recipe.compiledPrompt)
}

async function upsertPreference(params: {
  userId: string
  favoriteStyles: string[]
  rejectedStyles: string[]
  preferredModelsByTask: PreferredModelsByTask
  commonNegativeTags: string[]
  preferredAspectRatios: string[]
}): Promise<void> {
  await db.userCreativePreference.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      favoriteStyles: toPrismaJson(params.favoriteStyles),
      rejectedStyles: toPrismaJson(params.rejectedStyles),
      preferredModelsByTask: toPrismaJson(params.preferredModelsByTask),
      commonNegativeTags: toPrismaJson(params.commonNegativeTags),
      preferredAspectRatios: toPrismaJson(params.preferredAspectRatios),
    },
    update: {
      favoriteStyles: toPrismaJson(params.favoriteStyles),
      rejectedStyles: toPrismaJson(params.rejectedStyles),
      preferredModelsByTask: toPrismaJson(params.preferredModelsByTask),
      commonNegativeTags: toPrismaJson(params.commonNegativeTags),
      preferredAspectRatios: toPrismaJson(params.preferredAspectRatios),
    },
  })
}

export async function updatePreferenceOnSatisfied(
  userId: string,
  generation: GenerationRecord,
): Promise<void> {
  const [existing, recentSatisfiedGenerations] = await Promise.all([
    getUserPreference(userId),
    db.generation.findMany({
      where: {
        userId,
        outputType: 'IMAGE',
        evaluation: {
          path: ['userSatisfied'],
          equals: true,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SATISFIED_STYLE_LIMIT,
      select: {
        id: true,
        createdAt: true,
        prompt: true,
        negativePrompt: true,
        model: true,
        snapshot: true,
      },
    }),
  ])

  const history = uniqueGenerationHistory([
    generation,
    ...recentSatisfiedGenerations,
  ]).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const events = history.map(toPreferenceEvent)
  const favoriteStyles = mostFrequentAtLeast(
    events
      .slice(0, RECENT_SATISFIED_STYLE_LIMIT)
      .map((event) => event.style)
      .filter((style): style is string => style !== null),
    FAVORITE_STYLE_THRESHOLD,
  )
  const preferredAspectRatios = unique(
    events
      .map((event) => event.aspectRatio)
      .filter((aspectRatio): aspectRatio is string => aspectRatio !== null),
  ).slice(0, 10)

  await upsertPreference({
    userId,
    favoriteStyles,
    rejectedStyles: parseStringArray(existing?.rejectedStyles),
    preferredModelsByTask: buildPreferredModelsByTask(events),
    commonNegativeTags: parseStringArray(existing?.commonNegativeTags),
    preferredAspectRatios,
  })
}

export async function updatePreferenceOnDeleted(
  userId: string,
  generation: GenerationRecord,
): Promise<void> {
  const style = extractStyle(generation)
  if (!style) return

  const existing = await getUserPreference(userId)

  await upsertPreference({
    userId,
    favoriteStyles: parseStringArray(existing?.favoriteStyles),
    rejectedStyles: unique([
      style,
      ...parseStringArray(existing?.rejectedStyles),
    ]).slice(0, 20),
    preferredModelsByTask: parsePreferredModelsByTask(
      existing?.preferredModelsByTask,
    ),
    commonNegativeTags: parseStringArray(existing?.commonNegativeTags),
    preferredAspectRatios: parseStringArray(existing?.preferredAspectRatios),
  })
}

export async function updatePreferenceOnRecipeSaved(
  userId: string,
  recipe: Recipe | RecipeRecord,
): Promise<void> {
  const currentRecipe = toPreferenceRecipeRecord(recipe)
  const [existing, recentRecipes] = await Promise.all([
    getUserPreference(userId),
    db.recipe.findMany({
      where: {
        userId,
        isDeleted: false,
        id: { not: currentRecipe.id },
      },
      orderBy: { createdAt: 'desc' },
      take: RECENT_RECIPE_NEGATIVE_LIMIT - 1,
      select: {
        id: true,
        modelId: true,
        negativePrompt: true,
        compiledPrompt: true,
        userIntent: true,
      },
    }),
  ])
  const recipeHistory: PreferenceRecipeRecord[] = [
    currentRecipe,
    ...recentRecipes,
  ]
  const commonNegativeTags = mostFrequentAtLeast(
    recipeHistory.flatMap((item) => splitNegativeTags(item.negativePrompt)),
    COMMON_NEGATIVE_TAG_THRESHOLD,
  )
  const recipeStyle = extractRecipeStyle(currentRecipe)
  const favoriteStyles = recipeStyle
    ? unique([
        recipeStyle,
        ...parseStringArray(existing?.favoriteStyles),
      ]).slice(0, 20)
    : parseStringArray(existing?.favoriteStyles)
  const taskType = extractRecipeTaskType(currentRecipe)
  const preferredModelsByTask = mergePreferredModel(
    parsePreferredModelsByTask(existing?.preferredModelsByTask),
    taskType,
    currentRecipe.modelId,
  )

  await upsertPreference({
    userId,
    favoriteStyles,
    rejectedStyles: parseStringArray(existing?.rejectedStyles),
    preferredModelsByTask,
    commonNegativeTags,
    preferredAspectRatios: parseStringArray(existing?.preferredAspectRatios),
  })
}
