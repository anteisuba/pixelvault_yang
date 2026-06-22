import 'server-only'

import {
  SCRIPT_DOC_ERROR_CODES,
  SCRIPT_DOC_HTTP_STATUS,
  SCRIPT_DOC_LIMITS,
  SCRIPT_DOC_OUTPUT_CONTRACT,
  SCRIPT_DOC_SYSTEM_PROMPT,
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

function buildUserPrompt(request: NodeScriptDocRequest): string {
  const language = SCRIPT_DOC_LANGUAGE_LABELS[request.locale]
  const existing = request.scriptDoc
    ? `EXISTING SCRIPTDOC (revise in place — keep every existing id stable):\n${JSON.stringify(
        request.scriptDoc,
      )}`
    : 'No existing ScriptDoc yet — draft a fresh one from the conversation.'

  return [
    SCRIPT_DOC_OUTPUT_CONTRACT,
    `Limits: max ${SCRIPT_DOC_LIMITS.maxRoles} roles, ${SCRIPT_DOC_LIMITS.maxShots} shots, ${SCRIPT_DOC_LIMITS.maxDialoguePerShot} dialogue lines per shot, ${SCRIPT_DOC_LIMITS.maxClarifyQuestions} clarifying questions.`,
    `Human-readable text language: ${language}. Keep JSON keys in English; content may match the user's language.`,
    existing,
    `CONVERSATION:\n${buildConversation(request.messages)}`,
    'Return either clarifying questions or the complete ScriptDoc (per the output contract) as a single JSON object.',
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

  const result = await withRetry(
    async () => {
      const rawOutput = await withScriptDocTimeout(
        llmTextCompletion({
          systemPrompt: SCRIPT_DOC_SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(params),
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
      label: 'node-script-doc.llm',
      isRetryable: isScriptDocRetryable,
    },
  )

  logger.info('Node ScriptDoc drafted', {
    adapterType: route.adapterType,
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
