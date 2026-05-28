import 'server-only'

import {
  SEEDANCE_PROMPT_PLAN_ERROR_CODES,
  SEEDANCE_PROMPT_PLAN_HTTP_STATUS,
  SEEDANCE_PROMPT_PLAN_LIMITS,
  SEEDANCE_PROMPT_PLAN_OUTPUT_CONTRACT,
  SEEDANCE_PROMPT_PLAN_OUTPUT_LANGUAGES,
  SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT,
} from '@/constants/seedance-prompt-plan'
import type { ScriptPlannerProvider } from '@/constants/script-breakdown'
import { logger } from '@/lib/logger'
import { ApiRequestError } from '@/lib/errors'
import type { AppLocale } from '@/i18n/routing'
import { validateLlmStructuredOutput } from '@/lib/llm-output-validator'
import { withRetry } from '@/lib/with-retry'
import { llmTextCompletion } from '@/services/llm-text.service'
import { resolveNodePlannerRoute } from '@/services/kernel/node-planner-route.service'
import { ensureUser } from '@/services/user.service'
import {
  SeedancePromptPlanResultSchema,
  type SeedancePromptPlanReferences,
  type SeedancePromptPlanResponseData,
} from '@/types/seedance-prompt-plan'

function getSeedancePromptOutputLanguage(locale: AppLocale): string {
  return SEEDANCE_PROMPT_PLAN_OUTPUT_LANGUAGES[locale]
}

function buildReferenceBlock(
  references: SeedancePromptPlanReferences | undefined,
): string | null {
  if (!references) return null

  const lines: string[] = []

  if (references.imageCount > 0) {
    lines.push(
      `- ${references.imageCount} reference image(s): use as opening frame, character likeness, or scene anchor as the idea requires. Images bind automatically — do not invent @Image tokens.`,
    )
  }

  if (references.videoCount > 0) {
    const tokens = Array.from(
      { length: references.videoCount },
      (_, index) => `@Video${index + 1}`,
    ).join(', ')
    lines.push(
      `- ${references.videoCount} reference video(s) (${tokens}): cite each token in finalPrompt to replicate its camera language, motion, or effects, e.g. "replicate @Video1's camera movement".`,
    )
  }

  if (references.audio.length > 0) {
    const tokens = references.audio
      .map((entry, index) => {
        const slot = `@Audio${index + 1}`
        return entry.characterName ? `${entry.characterName} (${slot})` : slot
      })
      .join(', ')
    const example = references.audio[0]?.characterName ?? 'Speaker'
    lines.push(
      `- ${references.audio.length} reference voice(s) (${tokens}): bind dialogue to the matching token, e.g. "${example} (@Audio1): ...".`,
    )
  }

  if (lines.length === 0) return null

  return [
    'PRODUCTION REFERENCES (the workflow includes these reference assets — weave them into the timeline and finalPrompt with intent):',
    ...lines,
    'Only use @VideoN / @AudioN tokens for the references listed above; never emit a token for a modality not listed.',
  ].join('\n')
}

function buildUserPrompt(
  idea: string,
  locale: AppLocale,
  references?: SeedancePromptPlanReferences,
): string {
  const outputLanguage = getSeedancePromptOutputLanguage(locale)
  const referenceBlock = buildReferenceBlock(references)

  return [
    SEEDANCE_PROMPT_PLAN_OUTPUT_CONTRACT,
    `Limits: max ${SEEDANCE_PROMPT_PLAN_LIMITS.maxTimelineItems} timeline items. Keep finalPrompt under ${SEEDANCE_PROMPT_PLAN_LIMITS.finalPromptMaxLength} characters.`,
    `Locale hint: ${locale}. Keep JSON keys in English. Write every JSON string value in ${outputLanguage}, including title, visualDescription, timeline items, motion, camera, audioIntent, and finalPrompt. Preserve standard film/camera/style terms when they are clearer as industry terms. If the user explicitly asks for another output language, use that language instead.`,
    ...(referenceBlock ? [referenceBlock] : []),
    `User idea: ${idea}`,
  ].join('\n\n')
}

function createInvalidPlannerOutputError(): ApiRequestError {
  return new ApiRequestError(
    SEEDANCE_PROMPT_PLAN_ERROR_CODES.invalidPlannerOutput,
    SEEDANCE_PROMPT_PLAN_HTTP_STATUS.invalidPlannerOutput,
    'errors.provider.invalidStructuredOutput',
    'The selected planner model returned malformed Seedance prompt JSON. Retry or choose another Agent Key.',
  )
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) {
      throw createInvalidPlannerOutputError()
    }

    try {
      return JSON.parse(match[0]) as unknown
    } catch {
      throw createInvalidPlannerOutputError()
    }
  }
}

function validateSeedancePromptPlanOutput(rawOutput: string) {
  let parsed: unknown
  try {
    parsed = parseJsonObject(rawOutput)
  } catch (error) {
    logger.warn('Seedance prompt plan JSON parse failed', {
      rawOutputLength: rawOutput.length,
      rawOutputSnippet: rawOutput.slice(0, 800),
    })
    throw error
  }

  const validation = validateLlmStructuredOutput(
    parsed,
    SeedancePromptPlanResultSchema,
  )

  if (!validation.usable || !validation.data) {
    logger.warn('Seedance prompt plan schema validation failed', {
      reason: validation.reason,
      rawOutputLength: rawOutput.length,
      rawOutputSnippet: rawOutput.slice(0, 800),
    })
    throw createInvalidPlannerOutputError()
  }

  return validation.data
}

function isSeedancePromptPlanRetryable(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return (
      error.errorCode ===
        SEEDANCE_PROMPT_PLAN_ERROR_CODES.invalidPlannerOutput ||
      error.httpStatus === SEEDANCE_PROMPT_PLAN_HTTP_STATUS.rateLimited ||
      error.httpStatus ===
        SEEDANCE_PROMPT_PLAN_HTTP_STATUS.temporarilyUnavailable
    )
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('timed out') || message.includes('network')
  }

  return false
}

async function withSeedancePromptPlanTimeout<T>(task: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Seedance prompt planning timed out. Please try again.'))
    }, SEEDANCE_PROMPT_PLAN_LIMITS.llmTimeoutMs)
  })

  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

export async function createSeedancePromptPlan(
  clerkId: string,
  params: {
    idea: string
    plannerProvider: ScriptPlannerProvider
    apiKeyId?: string
    locale: AppLocale
    references?: SeedancePromptPlanReferences
  },
): Promise<SeedancePromptPlanResponseData> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveNodePlannerRoute(
    dbUser.id,
    params.plannerProvider,
    params.apiKeyId,
  )

  const plan = await withRetry(
    async () => {
      const rawOutput = await withSeedancePromptPlanTimeout(
        llmTextCompletion({
          systemPrompt: SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(
            params.idea,
            params.locale,
            params.references,
          ),
          modelId: route.modelId,
          maxTokens: SEEDANCE_PROMPT_PLAN_LIMITS.maxTokens,
          responseFormat: 'json_object',
          adapterType: route.adapterType,
          providerConfig: route.providerConfig,
          apiKey: route.apiKey,
        }),
      )

      return validateSeedancePromptPlanOutput(rawOutput)
    },
    {
      maxAttempts: 2,
      baseDelayMs: 800,
      label: `seedance-prompt-plan.llm[${route.adapterType}/${route.modelId}]`,
      isRetryable: isSeedancePromptPlanRetryable,
    },
  )

  logger.info('Seedance prompt plan generated', {
    adapterType: route.adapterType,
    modelId: route.modelId,
    timelineCount: plan.timeline.length,
  })

  return {
    plan,
    planner: {
      adapterType: route.adapterType,
      modelId: route.modelId,
      label: route.label,
    },
  }
}
