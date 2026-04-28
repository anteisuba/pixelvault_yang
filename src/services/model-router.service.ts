import 'server-only'

import { MODEL_STRENGTHS } from '@/constants/model-strengths'
import { getModelById } from '@/constants/models'
import type { ImageIntent } from '@/types'

export interface RecommendedModel {
  modelId: string
  score: number
  reason: string
  matchedBestFor: string[]
}

function extractTaskKeywords(intent: ImageIntent): string[] {
  const keywords: string[] = []

  if (intent.style) {
    const style = intent.style.toLowerCase()

    if (style.includes('photo') || style.includes('realis')) {
      keywords.push('photorealistic', 'portrait', 'product', 'architecture')
    }
    if (
      style.includes('anime') ||
      style.includes('manga') ||
      style.includes('cartoon')
    ) {
      keywords.push('anime', 'illustration')
    }
    if (
      style.includes('paint') ||
      style.includes('art') ||
      style.includes('illustrat')
    ) {
      keywords.push('artistic', 'creative', 'concept')
    }
  }

  const subject = intent.subject.toLowerCase()

  if (
    subject.includes('product') ||
    subject.includes('logo') ||
    subject.includes('commercial')
  ) {
    keywords.push('product')
  }
  if (
    subject.includes('portrait') ||
    subject.includes('person') ||
    subject.includes('woman') ||
    subject.includes('man')
  ) {
    keywords.push('portrait')
  }
  if (
    subject.includes('landscape') ||
    subject.includes('architecture') ||
    subject.includes('building')
  ) {
    keywords.push('architecture', 'landscape')
  }

  if (intent.referenceAssets && intent.referenceAssets.length > 0) {
    keywords.push('reference')
  }

  if (intent.mood) {
    const mood = intent.mood.toLowerCase()
    if (mood.includes('dramatic') || mood.includes('moody')) {
      keywords.push('portrait')
    }
  }

  return [...new Set(keywords)]
}

function scoreModel(
  modelId: string,
  taskKeywords: string[],
  arenaRates: Record<string, number>,
): { score: number; matchedBestFor: string[]; reason: string } {
  const strengths = MODEL_STRENGTHS[modelId as keyof typeof MODEL_STRENGTHS]
  const arenaRate = arenaRates[modelId]
  const arenaScore = arenaRate === undefined ? 0 : arenaRate * 2

  if (!strengths) {
    return {
      score: arenaScore,
      matchedBestFor: [],
      reason: 'No strength data for this model.',
    }
  }

  const matchedBestFor = strengths.bestFor.filter((bestForItem) => {
    const normalizedBestFor = bestForItem.toLowerCase()
    return taskKeywords.some(
      (keyword) =>
        normalizedBestFor.includes(keyword) ||
        keyword.includes(normalizedBestFor),
    )
  })

  const reason =
    matchedBestFor.length > 0
      ? `Matches: ${matchedBestFor.join(', ')}.`
      : 'No direct task match; general-purpose fallback.'

  return {
    score: matchedBestFor.length + arenaScore,
    matchedBestFor,
    reason,
  }
}

export function routeModelsForIntent(
  intent: ImageIntent,
  arenaRates: Record<string, number> = {},
): RecommendedModel[] {
  const taskKeywords = extractTaskKeywords(intent)

  const scored = Object.keys(MODEL_STRENGTHS)
    .filter((modelId) => getModelById(modelId)?.available === true)
    .map((modelId) => {
      const { score, matchedBestFor, reason } = scoreModel(
        modelId,
        taskKeywords,
        arenaRates,
      )
      return { modelId, score, matchedBestFor, reason }
    })

  return scored.sort((a, b) => b.score - a.score).slice(0, 5)
}
