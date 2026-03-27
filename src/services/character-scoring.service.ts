import 'server-only'

import { z } from 'zod'

import { db } from '@/lib/db'
import type { ConsistencyScoreResult } from '@/types'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { fetchAsBuffer } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

// ─── System Prompt ─────────────────────────────────────────────

const SCORING_SYSTEM_PROMPT = `You are an expert at evaluating character consistency in AI-generated images. You will be given TWO images:
1. The SOURCE image (original character reference)
2. The GENERATED image (AI-generated attempt to reproduce the character)

Compare them and return ONLY valid JSON matching this exact schema:
{
  "overallScore": <number 0-100>,
  "breakdown": {
    "face": <number 0-100>,
    "hair": <number 0-100>,
    "outfit": <number 0-100>,
    "pose": <number 0-100>,
    "style": <number 0-100>
  },
  "suggestions": ["suggestion 1", "suggestion 2", ...]
}

Scoring guide:
- 90-100: Nearly identical character, very high consistency
- 70-89: Recognizable as same character, minor differences
- 50-69: Some similarities but noticeable inconsistencies
- 30-49: Loosely similar, major differences
- 0-29: Different character entirely

Focus on CHARACTER consistency, not image quality. The same character in different poses/backgrounds should still score high if the character features match.

Suggestions should be specific and actionable for improving the generation prompt.`

// ─── Response Schema ───────────────────────────────────────────

const ScoreResponseSchema = z.object({
  overallScore: z.number().min(0).max(100),
  breakdown: z.object({
    face: z.number().min(0).max(100),
    hair: z.number().min(0).max(100),
    outfit: z.number().min(0).max(100),
    pose: z.number().min(0).max(100),
    style: z.number().min(0).max(100),
  }),
  suggestions: z.array(z.string()),
})

// ─── Default Score ─────────────────────────────────────────────

const DEFAULT_SCORE: ConsistencyScoreResult = {
  overallScore: 50,
  breakdown: { face: 50, hair: 50, outfit: 50, pose: 50, style: 50 },
  suggestions: ['Unable to parse scoring response. Please try again.'],
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Score the consistency between a source character image and a generated image.
 * Uses LLM dual-image comparison to evaluate character fidelity.
 */
export async function scoreConsistency(
  clerkId: string,
  sourceImageUrl: string,
  generatedImageUrl: string,
  apiKeyId?: string,
): Promise<ConsistencyScoreResult> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  // Convert URLs to base64 data URLs for LLM input
  const [sourceData, generatedData] = await Promise.all([
    urlToDataUrl(sourceImageUrl),
    urlToDataUrl(generatedImageUrl),
  ])

  const raw = await llmTextCompletion({
    systemPrompt: SCORING_SYSTEM_PROMPT,
    userPrompt:
      'Image 1 is the SOURCE (original character). Image 2 is the GENERATED image. Score the character consistency.',
    imageData: [sourceData, generatedData],
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Parse LLM JSON output
  const jsonStr = raw
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  try {
    const parsed = JSON.parse(jsonStr)
    const result = ScoreResponseSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch {
    // JSON parse failed
  }

  return DEFAULT_SCORE
}

/**
 * Score a specific generation against its character card's source image.
 */
export async function scoreGenerationForCard(
  clerkId: string,
  cardId: string,
  generationId: string,
  apiKeyId?: string,
): Promise<ConsistencyScoreResult> {
  const dbUser = await ensureUser(clerkId)

  const [card, generation] = await Promise.all([
    db.characterCard.findUnique({ where: { id: cardId } }),
    db.generation.findUnique({ where: { id: generationId } }),
  ])

  if (!card || card.userId !== dbUser.id || card.isDeleted) {
    throw new Error('Character card not found')
  }
  if (!generation || generation.userId !== dbUser.id) {
    throw new Error('Generation not found')
  }

  return scoreConsistency(
    clerkId,
    card.sourceImageUrl,
    generation.url,
    apiKeyId,
  )
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Convert an HTTPS URL to a base64 data URL for LLM multimodal input.
 */
async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url

  const { buffer, mimeType } = await fetchAsBuffer(url)
  const base64 = buffer.toString('base64')
  return `data:${mimeType};base64,${base64}`
}
