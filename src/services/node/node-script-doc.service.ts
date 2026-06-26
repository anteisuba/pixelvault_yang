import 'server-only'

import {
  DEFAULT_SCRIPT_DOC_DEPTH,
  DEFAULT_SCRIPT_DOC_STAGE,
  SCRIPT_DOC_DEPTH_DIRECTIVES,
  SCRIPT_DOC_ERROR_CODES,
  SCRIPT_DOC_FOCUS_KIND_IDS,
  SCRIPT_DOC_HTTP_STATUS,
  SCRIPT_DOC_LIMITS,
  SCRIPT_DOC_OUTPUT_CONTRACT,
  SCRIPT_DOC_STAGE_IDS,
  SCRIPT_DOC_STAGE_SYSTEM_PROMPTS,
  type ScriptDocDepth,
  type ScriptDocStage,
} from '@/constants/script-doc'
import { logger } from '@/lib/logger'
import { ApiRequestError } from '@/lib/errors'
import { validateLlmStructuredOutput } from '@/lib/llm-output-validator'
import { withRetry } from '@/lib/with-retry'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import {
  NodeScriptDocResponseDataSchema,
  ScriptDocSchema,
  type NodeScriptDocRequest,
  type NodeScriptDocResponseData,
} from '@/types/script-doc'

const SCRIPT_DOC_LANGUAGE_LABELS = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
} as const

function buildConversation(messages: NodeScriptDocRequest['messages']): string {
  return messages
    .slice(-SCRIPT_DOC_LIMITS.maxMessages)
    .map((message) => {
      const label = message.role === 'user' ? 'User' : 'Assistant'
      return `${label}: ${message.content}`
    })
    .join('\n\n')
}

function buildFocusDirective(
  focus: NonNullable<NodeScriptDocRequest['focus']>,
): string {
  if (focus.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles) {
    return `FOCUS EDIT — apply the creator's latest message ONLY to the roles/cast: you may add, remove, rename, or rewrite roles as asked. Keep the title, logline, style, background, and EVERY shot byte-for-byte identical (same ids, same text). Never return clarifying questions — return the full revised ScriptDoc.`
  }
  return `FOCUS EDIT — apply the creator's latest message ONLY to the shot with id "${focus.id}" (its summary, emotion, camera, and dialogue). Keep every OTHER shot, all roles, and the doc header byte-for-byte identical (same ids, same text). Never return clarifying questions — return the full revised ScriptDoc.`
}

function buildUserPrompt(
  request: NodeScriptDocRequest,
  stage: ScriptDocStage,
  depth: ScriptDocDepth,
): string {
  const language = SCRIPT_DOC_LANGUAGE_LABELS[request.locale]
  const isShots = stage === SCRIPT_DOC_STAGE_IDS.shots
  const existing = request.scriptDoc
    ? `EXISTING SCRIPTDOC (revise in place — keep every existing id stable):\n${JSON.stringify(
        request.scriptDoc,
      )}`
    : isShots
      ? 'No existing ScriptDoc provided — draft the outline first, then break it into shots.'
      : 'No existing ScriptDoc yet — draft a fresh one from the conversation.'

  const closing = request.focus
    ? 'Return the full revised ScriptDoc (per the output contract) as a single JSON object. Do not return clarifying questions.'
    : isShots
      ? 'Return the revised ScriptDoc (per the output contract) as a single JSON object, with a rich "camera" field on every shot. Do not return clarifying questions.'
      : 'Return either clarifying questions or the complete ScriptDoc (per the output contract) as a single JSON object.'

  return [
    SCRIPT_DOC_OUTPUT_CONTRACT,
    SCRIPT_DOC_DEPTH_DIRECTIVES[depth],
    ...(request.focus ? [buildFocusDirective(request.focus)] : []),
    `Limits: max ${SCRIPT_DOC_LIMITS.maxRoles} roles, ${SCRIPT_DOC_LIMITS.maxShots} shots, ${SCRIPT_DOC_LIMITS.maxDialoguePerShot} dialogue lines per shot, ${SCRIPT_DOC_LIMITS.maxClarifyQuestions} clarifying questions.`,
    `Human-readable text language: ${language}. Keep JSON keys in English; content may match the user's language.`,
    existing,
    `CONVERSATION:\n${buildConversation(request.messages)}`,
    closing,
  ].join('\n\n')
}

function createInvalidOutputError(): ApiRequestError {
  return new ApiRequestError(
    SCRIPT_DOC_ERROR_CODES.invalidOutput,
    SCRIPT_DOC_HTTP_STATUS.invalidOutput,
    'errors.provider.invalidStructuredOutput',
    'The assistant returned a malformed outline. Retry or choose another Agent Key.',
  )
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) {
      throw createInvalidOutputError()
    }

    try {
      return JSON.parse(match[0]) as unknown
    } catch {
      throw createInvalidOutputError()
    }
  }
}

function validateDraftOutput(rawOutput: string): NodeScriptDocResponseData {
  const parsed = parseJsonObject(rawOutput)

  // Preferred: the discriminated {kind:'scriptDoc'|'questions'} shape.
  const union = validateLlmStructuredOutput(
    parsed,
    NodeScriptDocResponseDataSchema,
  )
  if (union.usable && union.data) {
    return union.data
  }

  // Lenient fallback: a bare ScriptDoc object (no `kind` wrapper) — keeps older
  // model behaviour working and degrades gracefully if the model forgets to wrap.
  const bare = validateLlmStructuredOutput(parsed, ScriptDocSchema)
  if (bare.usable && bare.data) {
    return { kind: 'scriptDoc', scriptDoc: bare.data }
  }

  throw createInvalidOutputError()
}

function isScriptDocRetryable(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return (
      error.errorCode === SCRIPT_DOC_ERROR_CODES.invalidOutput ||
      error.httpStatus === SCRIPT_DOC_HTTP_STATUS.rateLimited ||
      error.httpStatus === SCRIPT_DOC_HTTP_STATUS.temporarilyUnavailable
    )
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('timed out') || message.includes('network')
  }

  return false
}

async function withScriptDocTimeout<T>(task: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('ScriptDoc generation timed out. Please try again.'))
    }, SCRIPT_DOC_LIMITS.llmTimeoutMs)
  })

  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Turn a canvas-assistant conversation (+ the current ScriptDoc when
 * refining) into a validated ScriptDoc. Buffered structured output —
 * `responseFormat: 'json_object'` + `validateLlmStructuredOutput` +
 * `withRetry` — mirrors `script-breakdown.service.ts`. The prompt instructs
 * the model to preserve existing ids so the downstream projection stays
 * idempotent.
 */
export async function createNodeScriptDoc(
  clerkId: string,
  params: NodeScriptDocRequest,
): Promise<NodeScriptDocResponseData> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, params.apiKeyId)
  const stage = params.stage ?? DEFAULT_SCRIPT_DOC_STAGE
  const depth = params.depth ?? DEFAULT_SCRIPT_DOC_DEPTH

  const result = await withRetry(
    async () => {
      const rawOutput = await withScriptDocTimeout(
        llmTextCompletion({
          systemPrompt: SCRIPT_DOC_STAGE_SYSTEM_PROMPTS[stage],
          userPrompt: buildUserPrompt(params, stage, depth),
          maxTokens: SCRIPT_DOC_LIMITS.maxTokens,
          responseFormat: 'json_object',
          adapterType: route.adapterType,
          providerConfig: route.providerConfig,
          apiKey: route.apiKey,
        }),
      )

      return validateDraftOutput(rawOutput)
    },
    {
      maxAttempts: 2,
      baseDelayMs: 800,
      label: `node-script-doc.llm[${stage}/${depth}]`,
      isRetryable: isScriptDocRetryable,
    },
  )

  logger.info('Node ScriptDoc drafted', {
    adapterType: route.adapterType,
    stage,
    depth,
    kind: result.kind,
    ...(result.kind === 'scriptDoc'
      ? {
          roleCount: result.scriptDoc.roles.length,
          shotCount: result.scriptDoc.shots.length,
        }
      : { questionCount: result.questions.length }),
  })

  return result
}
