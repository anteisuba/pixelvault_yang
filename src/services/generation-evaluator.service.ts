import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { GenerationEvaluationSchema, type GenerationEvaluation } from '@/types'
import { ensureUser } from '@/services/user.service'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { fetchAsBuffer } from '@/services/storage/r2'

const FALLBACK_EVALUATION: GenerationEvaluation = {
  subjectMatch: 0.5,
  styleMatch: 0.5,
  compositionMatch: 0.5,
  artifactScore: 1.0,
  promptAdherence: 0.5,
  overall: 0.5,
  detectedIssues: [],
  suggestedFixes: [
    'Automatic evaluation unavailable. Please review the image manually.',
  ],
}

const EVALUATION_SYSTEM_PROMPT = `You are an expert AI image quality evaluator. Given an AI-generated image and its generation prompt, evaluate how well the image matches the intended prompt.

Return ONLY valid JSON matching this exact schema:
{
  "subjectMatch": <0.0-1.0, how well the main subject is depicted>,
  "styleMatch": <0.0-1.0, how well the visual style matches>,
  "compositionMatch": <0.0-1.0, how well framing and composition match>,
  "artifactScore": <0.0-1.0, where 1.0 means no artifacts and 0.0 means severe artifacts>,
  "promptAdherence": <0.0-1.0, overall prompt following>,
  "overall": <0.0-1.0, weighted overall quality>,
  "detectedIssues": ["specific issue 1", "specific issue 2"],
  "suggestedFixes": ["actionable prompt improvement 1", "actionable prompt improvement 2"]
}

Rules:
- All scores are 0.0 (poor) to 1.0 (excellent)
- detectedIssues: list up to 5 specific visual problems observed
- suggestedFixes: list up to 5 concrete prompt improvements
- Return raw JSON only. No markdown fences. No explanation.`

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) {
    return url
  }

  const { buffer, mimeType } = await withRetry(() => fetchAsBuffer(url), {
    maxAttempts: 3,
    baseDelayMs: 500,
    label: 'generationEvaluator.fetchImage',
  })
  const base64 = buffer.toString('base64')
  return `data:${mimeType};base64,${base64}`
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

export async function evaluateGeneration(
  clerkId: string,
  generationId: string,
): Promise<GenerationEvaluation> {
  const dbUser = await ensureUser(clerkId)

  const generation = await db.generation.findFirst({
    where: { id: generationId, userId: dbUser.id },
    select: { id: true, url: true, prompt: true, evaluation: true },
  })

  if (!generation) {
    throw new Error('Generation not found')
  }

  if (generation.evaluation) {
    const cached = GenerationEvaluationSchema.safeParse(generation.evaluation)
    if (cached.success) {
      return cached.data
    }
  }

  try {
    const route = await resolveLlmTextRoute(dbUser.id)
    const imageDataUrl = await urlToDataUrl(generation.url)

    const raw = await llmTextCompletion({
      systemPrompt: EVALUATION_SYSTEM_PROMPT,
      userPrompt: `Evaluate this AI-generated image against the following prompt:\n"${generation.prompt}"\n\nReturn a JSON evaluation following the schema in the system instruction.`,
      imageData: imageDataUrl,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
    })

    const parsed: unknown = JSON.parse(stripMarkdownFences(raw))
    const validated = GenerationEvaluationSchema.safeParse(parsed)

    if (!validated.success) {
      logger.warn('Generation evaluator LLM output failed schema validation', {
        generationId,
        issues: validated.error.issues,
      })
      return FALLBACK_EVALUATION
    }

    await db.generation.update({
      where: { id: generationId },
      data: { evaluation: validated.data },
    })

    return validated.data
  } catch (error) {
    logger.warn('Generation evaluator failed, returning fallback', {
      generationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return FALLBACK_EVALUATION
  }
}
