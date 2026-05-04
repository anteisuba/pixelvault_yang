import 'server-only'

import {
  ARENA_WINRATE_WEIGHT,
  DEFAULT_MODEL_ROUTER_WEIGHTS,
  MODEL_ROUTER_SCORE_WEIGHTS,
  MODEL_STRENGTHS,
  USER_PREFERENCE_WEIGHT,
  type ModelRouterWeights,
} from '@/constants/model-strengths'
import { MODEL_OPTIONS, getModelById } from '@/constants/models'
import { classifyImageIntentTaskType } from '@/lib/classify-task-type'
import { logger } from '@/lib/logger'
import type { ImageIntent, ModelRouterPreferences } from '@/types'
import { getModelWinRatesByTask } from '@/services/arena-winrate.service'
import {
  getUserPreference,
  parseUserPreferredModelsByTask,
} from '@/services/user-preference.service'

export interface RecommendedModel {
  modelId: string
  score: number
  reason: string
  matchedBestFor: string[]
}

interface ScoreModelResult {
  score: number
  reason: string
  matchedBestFor: string[]
}

const MIN_REQUIRED_HEALTH_WEIGHT = 0.7
const ROUTER_SCORE_SCALE = 100

export interface RouteModelsForIntentOptions {
  userId?: string | null
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function includesAny(value: string, needles: string[]): boolean {
  const normalized = value.toLowerCase()
  return needles.some((needle) => normalized.includes(needle))
}

function extractTaskKeywords(intent: ImageIntent): string[] {
  const keywords: string[] = []
  const subject = intent.subject.toLowerCase()
  const scene = intent.scene?.toLowerCase() ?? ''
  const action = intent.actionOrPose?.toLowerCase() ?? ''
  const joined = [subject, scene, action, ...(intent.mustInclude ?? [])]
    .join(' ')
    .toLowerCase()

  if (includesAny(joined, ['product', 'commercial', 'packshot'])) {
    keywords.push('product')
  }
  if (includesAny(joined, ['logo', 'brand', 'typography', 'poster'])) {
    keywords.push('logo', 'brand', 'typography', 'graphic-design')
  }
  if (
    includesAny(joined, ['portrait', 'person', 'woman', 'man', 'character'])
  ) {
    keywords.push('portrait', 'character-design')
  }
  if (includesAny(joined, ['landscape', 'architecture', 'building'])) {
    keywords.push('landscape', 'architecture')
  }
  if (includesAny(joined, ['concept', 'creative', 'fantasy', 'sci-fi'])) {
    keywords.push('concept', 'creative')
  }
  if (intent.referenceAssets && intent.referenceAssets.length > 0) {
    keywords.push('editing', 'instruction-following', 'character-design')
  }

  return unique(keywords)
}

function extractStyleKeywords(intent: ImageIntent): string[] {
  if (!intent.style) return []

  const style = intent.style.toLowerCase()
  const keywords: string[] = []

  if (includesAny(style, ['photo', 'realis', 'cinematic'])) {
    keywords.push('photorealistic', 'portrait', 'cinematic')
  }
  if (includesAny(style, ['anime', 'manga', 'cartoon'])) {
    keywords.push('anime', 'illustration', 'character-design')
  }
  if (includesAny(style, ['paint', 'art', 'illustrat', 'watercolor'])) {
    keywords.push('artistic', 'creative', 'illustration')
  }
  if (includesAny(style, ['logo', 'typography', 'brand', 'vector'])) {
    keywords.push('logo', 'typography', 'brand', 'vector-style')
  }

  return unique(keywords)
}

function resolveRouterWeights(modelId: string): ModelRouterWeights {
  const modelWeights =
    MODEL_STRENGTHS[modelId as keyof typeof MODEL_STRENGTHS]?.routerWeights ??
    {}

  return {
    ...DEFAULT_MODEL_ROUTER_WEIGHTS,
    ...modelWeights,
  }
}

function matchBestFor(bestFor: string[], keywords: string[]): string[] {
  if (keywords.length === 0) return []

  return bestFor.filter((bestForItem) => {
    const normalizedBestFor = bestForItem.toLowerCase()
    return keywords.some(
      (keyword) =>
        normalizedBestFor.includes(keyword) ||
        keyword.includes(normalizedBestFor),
    )
  })
}

function normalizedFit(matchedCount: number, keywordCount: number): number {
  return keywordCount === 0 ? 0 : matchedCount / keywordCount
}

function buildReason(params: {
  matchedBestFor: string[]
  hasReferenceAssets: boolean
  preferences: ModelRouterPreferences
}): string {
  const reasons: string[] = []

  if (params.matchedBestFor.length > 0) {
    reasons.push(`Matches: ${params.matchedBestFor.join(', ')}`)
  }
  if (params.hasReferenceAssets) {
    reasons.push('reference-aware fit')
  }
  if (params.preferences.preferLowCost) {
    reasons.push('cost-efficient preference')
  }
  if (params.preferences.preferLowLatency) {
    reasons.push('low-latency preference')
  }
  if (params.preferences.requireHealthy) {
    reasons.push('healthy route preference')
  }

  return reasons.length > 0
    ? `${reasons.join('; ')}.`
    : 'General-purpose fallback using static cost, latency, and health fit.'
}

function appendReason(reason: string, addition: string): string {
  const trimmed = reason.endsWith('.') ? reason.slice(0, -1) : reason
  return `${trimmed}; ${addition}.`
}

function scoreModel(
  modelId: string,
  intent: ImageIntent,
  preferences: ModelRouterPreferences,
): ScoreModelResult {
  const strengths = MODEL_STRENGTHS[modelId as keyof typeof MODEL_STRENGTHS]
  const routerWeights = resolveRouterWeights(modelId)

  if (!strengths) {
    return {
      score: 0,
      matchedBestFor: [],
      reason: 'No strength data for this model.',
    }
  }

  const taskKeywords = extractTaskKeywords(intent)
  const styleKeywords = extractStyleKeywords(intent)
  const taskMatches = matchBestFor(strengths.bestFor, taskKeywords)
  const styleMatches = matchBestFor(strengths.bestFor, styleKeywords)
  const matchedBestFor = unique([...taskMatches, ...styleMatches])
  const hasReferenceAssets = (intent.referenceAssets?.length ?? 0) > 0

  const taskFit =
    normalizedFit(taskMatches.length, taskKeywords.length) *
    MODEL_ROUTER_SCORE_WEIGHTS.taskFit
  const styleFit =
    normalizedFit(styleMatches.length, styleKeywords.length) *
    MODEL_ROUTER_SCORE_WEIGHTS.styleFit
  const referenceFit = hasReferenceAssets
    ? routerWeights.referenceFit * MODEL_ROUTER_SCORE_WEIGHTS.referenceFit
    : 0
  const costFit =
    routerWeights.costEfficiency * MODEL_ROUTER_SCORE_WEIGHTS.costEfficiency
  const latencyFit = routerWeights.latency * MODEL_ROUTER_SCORE_WEIGHTS.latency
  const healthFit = routerWeights.health * MODEL_ROUTER_SCORE_WEIGHTS.health
  const preferenceBoost =
    (preferences.preferLowCost ? routerWeights.costEfficiency : 0) *
      MODEL_ROUTER_SCORE_WEIGHTS.preferenceBoost +
    (preferences.preferLowLatency ? routerWeights.latency : 0) *
      MODEL_ROUTER_SCORE_WEIGHTS.preferenceBoost +
    (preferences.requireHealthy ? routerWeights.health : 0) *
      MODEL_ROUTER_SCORE_WEIGHTS.preferenceBoost

  return {
    score: Number(
      (
        taskFit +
        styleFit +
        referenceFit +
        costFit +
        latencyFit +
        healthFit +
        preferenceBoost
      ).toFixed(4),
    ),
    matchedBestFor,
    reason: buildReason({ matchedBestFor, hasReferenceAssets, preferences }),
  }
}

export function estimateModelCost(modelId: string): number {
  return getModelById(modelId)?.cost ?? 0
}

async function applyArenaWinRateBoost(
  rankedModels: RecommendedModel[],
  taskType: string,
): Promise<void> {
  try {
    const winRates = await getModelWinRatesByTask(taskType)

    for (const candidate of rankedModels) {
      const winRate = winRates.get(candidate.modelId)
      if (winRate === undefined) continue

      candidate.score = Number(
        (
          candidate.score +
          winRate * ARENA_WINRATE_WEIGHT * ROUTER_SCORE_SCALE
        ).toFixed(4),
      )
      candidate.reason = appendReason(candidate.reason, 'arena win-rate signal')
    }
  } catch (error) {
    logger.warn('Model router Arena win-rate boost skipped', {
      taskType,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function applyUserPreferenceBoost(
  rankedModels: RecommendedModel[],
  taskType: string,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return

  try {
    const preference = await getUserPreference(userId)
    if (!preference) return

    const preferredModelsByTask = parseUserPreferredModelsByTask(
      preference.preferredModelsByTask,
    )
    const taskModels = preferredModelsByTask[taskType] ?? []
    if (taskModels.length === 0) return

    for (const candidate of rankedModels) {
      if (!taskModels.includes(candidate.modelId)) continue

      candidate.score = Number(
        (candidate.score + USER_PREFERENCE_WEIGHT * ROUTER_SCORE_SCALE).toFixed(
          4,
        ),
      )
      candidate.reason = appendReason(
        candidate.reason,
        'user preference signal',
      )
    }
  } catch (error) {
    logger.warn('Model router user preference boost skipped', {
      taskType,
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function routeModelsForIntent(
  intent: ImageIntent,
  preferences: ModelRouterPreferences = {},
  options: RouteModelsForIntentOptions = {},
): Promise<RecommendedModel[]> {
  const scored = MODEL_OPTIONS.filter(
    (model) =>
      model.available === true &&
      model.outputType === 'IMAGE' &&
      MODEL_STRENGTHS[model.id],
  )
    .filter((model) => {
      if (!preferences.requireHealthy) return true
      return resolveRouterWeights(model.id).health >= MIN_REQUIRED_HEALTH_WEIGHT
    })
    .map((model) => {
      const { score, matchedBestFor, reason } = scoreModel(
        model.id,
        intent,
        preferences,
      )
      return { modelId: model.id, score, matchedBestFor, reason }
    })

  scored.sort((a, b) => b.score - a.score)

  const taskType = classifyImageIntentTaskType(intent)

  await applyArenaWinRateBoost(scored, taskType)
  scored.sort((a, b) => b.score - a.score)

  await applyUserPreferenceBoost(scored, taskType, options.userId)
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, 5)
}
