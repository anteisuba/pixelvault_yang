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
  SCRIPT_DOC_PROMPT_BUDGET,
  SCRIPT_DOC_STAGE_IDS,
  SCRIPT_DOC_STAGE_SYSTEM_PROMPTS,
  SCRIPT_DOC_TRIMMABLE_FIELDS,
  type ScriptDocDepth,
  type ScriptDocStage,
  type ScriptDocTrimmableField,
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
  type ScriptDoc,
  type ScriptDocTrimNotice,
} from '@/types/script-doc'

const SCRIPT_DOC_LANGUAGE_LABELS = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
} as const

const SECTION_SEPARATOR = '\n\n'

function renderMessages(messages: NodeScriptDocRequest['messages']): string {
  return messages
    .map((message) => {
      const label = message.role === 'user' ? 'User' : 'Assistant'
      return `${label}: ${message.content}`
    })
    .join(SECTION_SEPARATOR)
}

interface ConversationBuild {
  text: string
  keptMessages: number
  droppedMessages: number
}

/**
 * Fit the conversation into `maxChars`, newest turns first. The ScriptDoc
 * outranks the transcript — the doc IS the accumulated decisions, while the
 * turns mostly carry the latest instruction — so the conversation is what gets
 * squeezed first. Below `minMessages` we stop dropping turns and cap their
 * content instead, because a request without the creator's latest instruction
 * has nothing to act on.
 */
function buildConversation(
  messages: NodeScriptDocRequest['messages'],
  maxChars: number,
): ConversationBuild {
  const windowed = messages.slice(-SCRIPT_DOC_LIMITS.maxMessages)
  const floor = Math.min(SCRIPT_DOC_PROMPT_BUDGET.minMessages, windowed.length)

  for (let keep = windowed.length; keep >= floor; keep -= 1) {
    const text = renderMessages(windowed.slice(-keep))
    if (text.length <= maxChars) {
      return {
        text,
        keptMessages: keep,
        droppedMessages: messages.length - keep,
      }
    }
  }

  const capped = windowed.slice(-floor).map((message) => ({
    ...message,
    content: message.content.slice(0, SCRIPT_DOC_PROMPT_BUDGET.messageChars),
  }))

  return {
    text: renderMessages(capped),
    keptMessages: capped.length,
    droppedMessages: messages.length - capped.length,
  }
}

function omitDocField(
  doc: ScriptDoc,
  field: ScriptDocTrimmableField,
): ScriptDoc {
  const next = { ...doc }
  delete next[field]
  return next
}

function buildExistingBlock(
  doc: ScriptDoc | undefined,
  isShots: boolean,
): string {
  if (!doc) {
    return isShots
      ? 'No existing ScriptDoc provided — draft the outline first, then break it into shots.'
      : 'No existing ScriptDoc yet — draft a fresh one from the conversation.'
  }

  return `EXISTING SCRIPTDOC (revise in place — keep every existing id stable):\n${JSON.stringify(
    doc,
  )}`
}

function assemblePrompt(
  preamble: string,
  existing: string,
  conversation: string,
  closing: string,
): string {
  return [preamble, existing, `CONVERSATION:\n${conversation}`, closing].join(
    SECTION_SEPARATOR,
  )
}

function createPromptTooLongError(): ApiRequestError {
  return new ApiRequestError(
    SCRIPT_DOC_ERROR_CODES.promptTooLong,
    SCRIPT_DOC_HTTP_STATUS.promptTooLong,
    'errors.scriptDoc.promptTooLong',
    'The script is too long to revise in one request. Shorten the summaries or split it into fewer shots.',
  )
}

function buildFocusDirective(
  focus: NonNullable<NodeScriptDocRequest['focus']>,
): string {
  if (focus.kind === SCRIPT_DOC_FOCUS_KIND_IDS.roles) {
    return `FOCUS EDIT — apply the creator's latest message ONLY to the roles/cast: you may add, remove, rename, or rewrite roles as asked. Keep the title, logline, style, background, and EVERY shot byte-for-byte identical (same ids, same text). Never return clarifying questions — return the full revised ScriptDoc.`
  }
  return `FOCUS EDIT — apply the creator's latest message ONLY to the shot with id "${focus.id}" (its summary, emotion, camera, and dialogue). Keep every OTHER shot, all roles, and the doc header byte-for-byte identical (same ids, same text). Never return clarifying questions — return the full revised ScriptDoc.`
}

interface ScriptDocEnvelope {
  prompt: string
  /** Doc fields withheld from the model, to be restored onto its result. */
  heldBack: Partial<Record<ScriptDocTrimmableField, string>>
  /** Set only when something was actually trimmed. */
  trim?: ScriptDocTrimNotice
}

/**
 * Assemble the prompt envelope inside `SCRIPT_DOC_PROMPT_BUDGET`, degrading in
 * a fixed order rather than failing at a hard ceiling: drop conversation turns
 * first, then withhold optional doc fields, and only throw when even a trimmed
 * doc plus the creator's latest turn will not fit. Whatever was given up is
 * reported back so the UI can say so.
 */
function buildUserPrompt(
  request: NodeScriptDocRequest,
  stage: ScriptDocStage,
  depth: ScriptDocDepth,
): ScriptDocEnvelope {
  const language = SCRIPT_DOC_LANGUAGE_LABELS[request.locale]
  const isShots = stage === SCRIPT_DOC_STAGE_IDS.shots

  const preamble = [
    SCRIPT_DOC_OUTPUT_CONTRACT,
    SCRIPT_DOC_DEPTH_DIRECTIVES[depth],
    ...(request.focus ? [buildFocusDirective(request.focus)] : []),
    `Limits: max ${SCRIPT_DOC_LIMITS.maxRoles} roles, ${SCRIPT_DOC_LIMITS.maxShots} shots, ${SCRIPT_DOC_LIMITS.maxDialoguePerShot} dialogue lines per shot, ${SCRIPT_DOC_LIMITS.maxClarifyQuestions} clarifying questions.`,
    `Human-readable text language: ${language}. Keep JSON keys in English; content may match the user's language.`,
  ].join(SECTION_SEPARATOR)

  const closing = request.focus
    ? 'Return the full revised ScriptDoc (per the output contract) as a single JSON object. Do not return clarifying questions.'
    : isShots
      ? 'Return the revised ScriptDoc (per the output contract) as a single JSON object, with a rich "camera" field on every shot. Do not return clarifying questions.'
      : 'Return either clarifying questions or the complete ScriptDoc (per the output contract) as a single JSON object.'

  // Everything the two variable sections have to share, measured exactly
  // (separators and the CONVERSATION label included) instead of estimated.
  const scaffold = assemblePrompt(preamble, '', '', closing).length
  const available = Math.max(0, SCRIPT_DOC_PROMPT_BUDGET.totalChars - scaffold)

  // The floor the conversation is guaranteed — the doc may only trim down to
  // what it leaves behind.
  const conversationFloor = buildConversation(request.messages, 0).text.length

  const heldBack: Partial<Record<ScriptDocTrimmableField, string>> = {}
  let doc = request.scriptDoc
  let existing = buildExistingBlock(doc, isShots)

  for (const field of SCRIPT_DOC_TRIMMABLE_FIELDS) {
    if (existing.length + conversationFloor <= available) break
    const value = doc?.[field]
    if (!doc || value === undefined) continue
    heldBack[field] = value
    doc = omitDocField(doc, field)
    existing = buildExistingBlock(doc, isShots)
  }

  if (existing.length + conversationFloor > available) {
    throw createPromptTooLongError()
  }

  const conversation = buildConversation(
    request.messages,
    available - existing.length,
  )
  const heldBackFields = Object.keys(heldBack).length
  const trimmed = conversation.droppedMessages > 0 || heldBackFields > 0

  return {
    prompt: assemblePrompt(preamble, existing, conversation.text, closing),
    heldBack,
    trim: trimmed
      ? {
          keptMessages: conversation.keptMessages,
          droppedMessages: conversation.droppedMessages,
          heldBackFields,
        }
      : undefined,
  }
}

/**
 * Put back what the envelope withheld and stamp the trim notice.
 *
 * The model never saw the withheld fields, so anything it produced for them
 * would be invention — restoring the creator's values is the only non-lossy
 * option. `trim` is rebuilt from the envelope rather than passed through, so a
 * model that echoes the key cannot fake it.
 */
function finalizeResult(
  result: NodeScriptDocResponseData,
  envelope: ScriptDocEnvelope,
): NodeScriptDocResponseData {
  const { heldBack, trim } = envelope

  if (result.kind === 'questions') {
    return trim
      ? { kind: 'questions', questions: result.questions, trim }
      : { kind: 'questions', questions: result.questions }
  }

  const scriptDoc =
    Object.keys(heldBack).length > 0
      ? { ...result.scriptDoc, ...heldBack }
      : result.scriptDoc

  return trim
    ? { kind: 'scriptDoc', scriptDoc, trim }
    : { kind: 'scriptDoc', scriptDoc }
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

  // Assembled once, outside the retry: trimming is deterministic, and a
  // too-long script must fail immediately rather than burn a second attempt.
  const envelope = buildUserPrompt(params, stage, depth)

  const result = await withRetry(
    async () => {
      const rawOutput = await withScriptDocTimeout(
        llmTextCompletion({
          systemPrompt: SCRIPT_DOC_STAGE_SYSTEM_PROMPTS[stage],
          userPrompt: envelope.prompt,
          // The envelope is platform-assembled, not user-typed — measure it
          // against its own budget so the guard's injection checks still run
          // while the raw-input ceiling stops rejecting normal revisions.
          promptGuardMaxLength: SCRIPT_DOC_PROMPT_BUDGET.totalChars,
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
    promptChars: envelope.prompt.length,
    ...(envelope.trim ? { trim: envelope.trim } : {}),
    ...(result.kind === 'scriptDoc'
      ? {
          roleCount: result.scriptDoc.roles.length,
          shotCount: result.scriptDoc.shots.length,
        }
      : { questionCount: result.questions.length }),
  })

  return finalizeResult(result, envelope)
}
