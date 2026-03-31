import 'server-only'

import { db } from '@/lib/db'
import { CHARACTER_CARD } from '@/constants/character-card'
import type {
  CharacterAttributes,
  RefineCharacterCardRequest,
  RefineGenerationResult,
} from '@/types'
import { generateImageForUser } from '@/services/generate-image.service'
import { scoreConsistency } from '@/services/character-scoring.service'
import { buildPromptFromAttributes } from '@/services/character-card.service'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'

// ─── System Prompts ────────────────────────────────────────────

const REFINE_PROMPT_SYSTEM_PROMPT = `You are an expert at optimizing AI image generation prompts for character consistency. Given:
1. The current prompt
2. Structured character attributes
3. Feedback/suggestions from a consistency evaluation

Improve the prompt to better reproduce the character. Focus on the specific issues mentioned in the suggestions.

Return ONLY the improved prompt text, no explanation or preamble.`

// ─── Public API ────────────────────────────────────────────────

/**
 * Run one refinement iteration for a character card:
 * 1. Generate images using each specified model
 * 2. Score each generation against the source image
 * 3. If average score < threshold, refine the prompt based on suggestions
 * 4. Update the card's stabilityScore and status
 */
export async function refineCharacterCard(
  clerkId: string,
  cardId: string,
  input: RefineCharacterCardRequest,
): Promise<{
  results: RefineGenerationResult[]
  improved: boolean
  newStabilityScore: number | null
}> {
  const dbUser = await ensureUser(clerkId)

  const card = await db.characterCard.findUnique({
    where: { id: cardId },
  })

  if (!card || card.userId !== dbUser.id || card.isDeleted) {
    throw new Error('Character card not found')
  }

  // Generate image for each model
  const generationResults = await Promise.allSettled(
    input.models.map((model) =>
      generateImageForUser(clerkId, {
        prompt: card.characterPrompt,
        modelId: model.modelId,
        aspectRatio: input.aspectRatio,
        apiKeyId: model.apiKeyId,
        referenceImage: card.sourceImageUrl,
      }),
    ),
  )

  // Score each successful generation
  const results: RefineGenerationResult[] = []
  const scores: number[] = []

  for (let i = 0; i < generationResults.length; i++) {
    const genResult = generationResults[i]
    if (genResult.status === 'rejected') {
      continue
    }

    const generation = genResult.value

    // Link generation to character card
    await db.generation.update({
      where: { id: generation.id },
      data: { characterCardId: cardId },
    })

    let score = null
    try {
      score = await scoreConsistency(
        clerkId,
        card.sourceImageUrl,
        generation.url,
        input.models[i].apiKeyId,
      )
      scores.push(score.overallScore)
    } catch {
      // Scoring failed — continue without score
    }

    results.push({ generation, score })
  }

  if (results.length === 0) {
    throw new Error('All generation attempts failed')
  }

  // Calculate average score
  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  const normalizedScore = avgScore !== null ? avgScore / 100 : null
  const threshold = CHARACTER_CARD.STABILITY_THRESHOLD
  const improved = normalizedScore !== null && normalizedScore >= threshold

  // If below threshold and we have suggestions, refine the prompt
  if (!improved && scores.length > 0) {
    const allSuggestions = results
      .filter((r) => r.score?.suggestions?.length)
      .flatMap((r) => r.score!.suggestions)

    if (allSuggestions.length > 0) {
      try {
        const refinedPrompt = await refinePromptWithFeedback(
          clerkId,
          card.characterPrompt,
          (card.attributes as CharacterAttributes) ?? {},
          allSuggestions,
        )

        await db.characterCard.update({
          where: { id: cardId },
          data: {
            characterPrompt: refinedPrompt,
            stabilityScore: normalizedScore,
            status: 'REFINING',
          },
        })

        return { results, improved: false, newStabilityScore: normalizedScore }
      } catch {
        // Prompt refinement failed — still update score
      }
    }
  }

  // Update card status and score
  await db.characterCard.update({
    where: { id: cardId },
    data: {
      stabilityScore: normalizedScore,
      status: improved
        ? 'STABLE'
        : card.status === 'DRAFT'
          ? 'REFINING'
          : card.status,
      ...(improved && results.length > 0
        ? {
            referenceImages: results
              .filter((r) => r.score && r.score.overallScore >= 70)
              .map((r) => r.generation.url)
              .slice(0, CHARACTER_CARD.MAX_REFERENCE_IMAGES),
          }
        : {}),
    },
  })

  return { results, improved, newStabilityScore: normalizedScore }
}

// ─── Prompt Refinement ─────────────────────────────────────────

/**
 * Use LLM to refine a character prompt based on scoring feedback.
 */
async function refinePromptWithFeedback(
  clerkId: string,
  currentPrompt: string,
  attributes: CharacterAttributes,
  suggestions: string[],
): Promise<string> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id)

  const attributesSummary = buildPromptFromAttributes(attributes)
  const suggestionsText = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')

  const userPrompt = `Current prompt:
${currentPrompt}

Character attributes:
${attributesSummary}

Issues to fix:
${suggestionsText}

Generate an improved prompt that addresses these issues while maintaining character accuracy.`

  return llmTextCompletion({
    systemPrompt: REFINE_PROMPT_SYSTEM_PROMPT,
    userPrompt,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })
}
