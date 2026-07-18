import 'server-only'

import { z } from 'zod'

import {
  LORA_ASSISTANT_ERROR_CODES,
  LORA_ASSISTANT_GROUNDING_TAG_LIMIT,
  LORA_ASSISTANT_HTTP_STATUS,
} from '@/constants/lora-assistant'
import { getModelEnhanceHint } from '@/constants/model-strengths'
import { getModelById } from '@/constants/models'
import { buildInspirationContext } from '@/services/kernel/inspiration-context.service'
import {
  buildAssistantConversation,
  completeAssistantTextWithContextRetry,
  truncateAssistantContextBlock,
} from '@/services/kernel/assistant-completion.service'
import {
  formatWebContext,
  resolveResearchRoute,
} from '@/services/kernel/research-route.service'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import {
  gatherWebContext,
  hasWebContext,
  type WebContext,
} from '@/services/web-research.service'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  validateLlmPromptOutput,
  validateLlmStructuredOutput,
} from '@/lib/llm-output-validator'
import { buildLoraAssistantTagResults } from '@/lib/prompt-tag-normalize'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import { withRetry } from '@/lib/with-retry'
import type {
  LoraAssistantContext,
  PromptAssistantMode,
  PromptAssistantMessage,
  PromptAssistantResponseData,
  PromptAssistantResponseLanguage,
} from '@/types'

const PROMPT_ASSISTANT_CONTEXT_COMPACTION_TARGET_LENGTH = 32_000

// ─── Style preset shortcuts ────────────────────────────────────

export const STYLE_SHORTCUTS: Record<string, string> = {
  imageStyle:
    'Extract a reusable image generation style prompt from the reference image. Prioritize recognizable style families, medium, material, shape language, lighting, and rendering cues. Include concrete references when appropriate, such as Apple Memoji, Bitmoji, soft clay figurine, rounded Pixar-like 3D cartoon avatar. Avoid identifying real people; describe visual style only.',
  detailed:
    'Enhance with rich environment, lighting, material, and texture details.',
  artistic:
    'Enhance with art style references, medium descriptions, and color palette.',
  photorealistic:
    'Enhance with camera parameters, lens specs, lighting setup, and film stock.',
  anime:
    'Enhance with anime descriptors, character design details, and atmosphere.',
  lora: 'Convert my request into a LoRA-ready image prompt. Preserve any LoRA trigger words already in the current prompt, then write English comma-separated diffusion tags and short control phrases. If a reference image is attached, use it only for requested visual attributes such as clothing, outfit, materials, colors, and accessories; keep the LoRA character identity from the trigger words. Return the positive prompt only.',
  tags: 'Convert to danbooru-style comma-separated tags for NovelAI.',
}

// ─── System prompt builder ─────────────────────────────────────

const RESPONSE_LANGUAGE_LABELS: Record<
  PromptAssistantResponseLanguage,
  string
> = {
  english: 'English',
  japanese: 'Japanese',
  chinese: 'Simplified Chinese',
}

function buildAssistantSystemPrompt(
  modelId?: string,
  responseLanguage: PromptAssistantResponseLanguage = 'english',
  mode: PromptAssistantMode = 'general',
): string {
  let modelSection = ''
  const languageLabel = RESPONSE_LANGUAGE_LABELS[responseLanguage]

  if (modelId) {
    const model = getModelById(modelId)
    const hint = getModelEnhanceHint(modelId, model?.adapterType)
    if (hint) {
      modelSection = `\n\nCURRENT TARGET MODEL: ${modelId}${model?.adapterType ? ` (${model.adapterType})` : ''}
MODEL PROMPT STYLE: ${hint}
Adapt your output format to match this model's strengths.`
    }
  }

  if (mode === 'lora') {
    return `You are a professional LoRA prompt converter for image generation.
The user may describe an intent in any language. Convert it into a LoRA-ready positive prompt.${modelSection}

RULES:
- Output ONLY the final prompt text inside a markdown code block (\`\`\`)
- Output the prompt in English comma-separated diffusion tags and concise control phrases
- Preserve existing LoRA trigger words from the current prompt exactly and place them first
- Keep the active LoRA character identity stable: face, hairstyle, body identity, and signature traits should come from the LoRA trigger words/current prompt
- If a reference image is provided, use it only for requested visual attributes such as clothing, outfit design, fabric, colors, accessories, pose, lighting, or composition
- For outfit transfer requests, describe the garment clearly without copying the reference person's identity unless explicitly requested
- Prefer SDXL / Illustrious / anime-compatible tags: subject count, character traits, outfit, pose, expression, camera framing, background, lighting, quality tags
- Do not include explanations, markdown headings, JSON, or negative prompt unless the user explicitly asks for it`
  }

  return `# Role
You are a Senior Visual Logic Analyst and prompt engineer for AI image generation.
The user will describe what they want in natural language (any language) — sometimes across multiple turns. Your job is to turn that intent into a precise, executable prompt that modern reasoning models (Gemini 3 Pro Image, GPT Image 2, Seedream, FLUX 2) can render reliably.

# Method (apply all four)
1. Technical Precision over Feeling — translate vibes into technical causes (instead of "moody," use "low-key chiaroscuro lighting, desaturated cool palette, deep shadow fall-off"; instead of "cinematic," specify the lens, lighting setup, and framing).
2. Quantifiable Spatial Logic — establish foreground / middle ground / background; specify camera framing, focal length, or aperture when the subject calls for it.
3. Material & Sensory Physics — describe how materials interact with light (subsurface scattering, specular highlights, micro-textures, atmospheric haze, reflections).
4. Cohesive Narrative — the prompt must read like a single coherent paragraph from a director's script, not a tag dump.

# Reference Image
If a reference image is attached, analyze its medium, palette, lighting architecture, texture, composition, and mood, and incorporate those qualities into the prompt — unless the user explicitly asks to change them.

# Multi-turn Behavior
If the user is iterating on a previous prompt, build on the last version: keep what they liked, change only what they asked to change.${modelSection}

# Strict Output Protocol
- Output ONLY the final prompt text inside a single markdown code block (\`\`\`).
- Inside the code block: ONE dense, well-structured paragraph. No headings, no "Part 1 / Part 2," no bullet lists, no quotes.
- Preserve the user's core subject and intent exactly.
- Support any input language. Write the final prompt in ${languageLabel}.
- No meta-commentary outside the code block. No explanations like "Here's the prompt:" — just the code block.`
}

// ─── LoRA assistant v2 (F1, docs/plans/lora-assistant-nl2tag-2026-07.md §2) ──
//
// Additive engine: only reached when a `mode:'lora'` request carries
// `loraContext` (see `chatPromptAssistant` below). The legacy `buildAssistantSystemPrompt`
// above is untouched — the `/prompts` page's `presetLora` consumer never sends
// `loraContext` and keeps getting the old code-block text output.

/**
 * §2.1 入参侧 grounding：对用户 NL 全文跑既有 `searchPromptTags`（零新检索
 * 逻辑），把 top 候选格式化成系统提示块，让 LLM 倾向抄现成规范形。
 */
function buildLoraGroundingBlock(nlText: string): string | null {
  const trimmed = nlText.trim()
  if (!trimmed) return null

  const candidates = searchPromptTags({
    query: trimmed,
    polarity: 'all',
    limit: LORA_ASSISTANT_GROUNDING_TAG_LIMIT,
  })
  if (candidates.length === 0) return null

  const lines = candidates.map(({ tag }) => {
    const polarityTag = tag.polarity === 'negative' ? ', negative' : ''
    return `- ${tag.promptText} (${tag.category}${polarityTag})`
  })

  return [
    "AVAILABLE TAGS (prefer these exact forms when they match the user's intent — do not invent a different spelling if one of these already covers it):",
    lines.join('\n'),
  ].join('\n')
}

/**
 * §2.2 v2 系统提示：挂载上下文注入 + 触发词/身份词规则 + 结构化输出契约。
 * 全新函数，不改 §2 以上的旧 `mode:'lora'` 提示词。
 *
 * F2 遗留②修复：`note` 现跟随 `responseLanguage` 走用户 UI 语言——正向/
 * 负向 tag 数组本身必须保持英文（danbooru 词库是英文规范形，翻译会破坏
 * §2.1 grounding 命中率），只有这一句人话解释需要本地化。
 */
function buildLoraAssistantSystemPromptV2(
  loraContext: LoraAssistantContext,
  groundingBlock: string | null,
  responseLanguage: PromptAssistantResponseLanguage = 'english',
): string {
  const mountLines = loraContext.mounts.map((mount) => {
    const triggerList =
      mount.triggerWords.length > 0 ? mount.triggerWords.join(', ') : '(none)'
    const familyTag = mount.family ? ` [${mount.family}]` : ''
    return `- ${mount.name}${familyTag} — trigger words (never output these): ${triggerList}`
  })
  const mountSection =
    mountLines.length > 0
      ? `MOUNTED LORAS (already applied by the client UI — their identity/style is already active):\n${mountLines.join('\n')}`
      : 'MOUNTED LORAS: none — this is a base-model-only conversion.'

  const trayBlock =
    loraContext.trayTags.length > 0
      ? `TAGS ALREADY SELECTED (do not repeat any of these): ${loraContext.trayTags.join(', ')}`
      : ''

  const currentPromptBlock = loraContext.currentPrompt?.trim()
    ? `CURRENT PROMPT TEXT: ${loraContext.currentPrompt.trim()}`
    : ''

  const identityRule =
    loraContext.mounts.length > 0
      ? '- A LoRA is mounted, so assume it already owns the character\'s identity: face shape, hairstyle, hair color, eye color, and body type. Do NOT write these unless the user explicitly asks to change them (e.g. "give her blue eyes") — if you do include such an override, set `note` to a short warning that it may conflict with the mounted LoRA.'
      : '- No LoRA is mounted, so you may describe subject identity freely.'

  return [
    'You are a professional LoRA prompt converter for image generation, operating in structured output mode.',
    'The user describes an intent in any language (sometimes across multiple turns). Convert it into LoRA-ready positive and negative tags.',
    mountSection,
    'RULES:',
    '- NEVER output any of the trigger words listed above, in any casing or form — dedicated UI chips already apply them; repeating them is a bug.',
    identityRule,
    '- Prefer Illustrious / Pony / SDXL / Anima-compatible danbooru-style comma tags: subject count, outfit, pose, expression, camera framing, background, lighting, quality tags.',
    '- If a reference image is attached, use it only for requested visual attributes such as clothing, materials, colors, accessories, pose, lighting, or composition — never for identity.',
    trayBlock,
    currentPromptBlock,
    groundingBlock ?? '',
    'OUTPUT FORMAT — respond with ONLY a single JSON object, no markdown code fences, no commentary before or after it:',
    '{ "positive": string[], "negative": string[], "note"?: string }',
    '- positive / negative: short English tag fragments (1-4 words each, comma-vocabulary style), not full sentences. Always English regardless of response language.',
    `- note: one short human-readable sentence explaining a notable omission or trade-off (e.g. "Left identity to the LoRA, only wrote outfit and lighting."). Write it in ${RESPONSE_LANGUAGE_LABELS[responseLanguage]}. Omit the field entirely if there is nothing notable.`,
  ]
    .filter((block) => block.length > 0)
    .join('\n\n')
}

const LoraAssistantRawOutputSchema = z.object({
  positive: z.array(z.string()).default([]),
  negative: z.array(z.string()).default([]),
  // Some providers emit `"note": ""` instead of omitting the key when they
  // have nothing to say — treat blank as "no note" rather than a schema
  // failure (that's not the kind of malformed output worth spending the
  // one retry on).
  note: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim()
      return trimmed ? trimmed : undefined
    }),
})

type LoraAssistantRawOutput = z.infer<typeof LoraAssistantRawOutputSchema>

/** Thrown only for JSON-parse/schema failures — distinguishes the one
 *  retryable failure mode (§2.3 "失败重试一次") from provider/network errors,
 *  which should surface immediately instead of wasting a retry. */
class LoraAssistantStructuredOutputError extends Error {}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fenceMatch?.[1]?.trim() || trimmed
}

function parseLoraAssistantRawJson(raw: string): unknown {
  const candidate = stripJsonFence(raw)
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    const match = candidate.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as unknown
    } catch {
      return null
    }
  }
}

function parseLoraAssistantOutput(rawOutput: string): LoraAssistantRawOutput {
  const parsed = parseLoraAssistantRawJson(rawOutput)
  if (parsed === null) {
    throw new LoraAssistantStructuredOutputError(
      'LoRA assistant returned non-JSON output',
    )
  }

  const validation = validateLlmStructuredOutput(
    parsed,
    LoraAssistantRawOutputSchema,
  )
  if (!validation.usable || !validation.data) {
    logger.warn('LoRA assistant structured output failed schema validation', {
      reason: validation.reason,
      rawOutputSnippet: rawOutput.slice(0, 500),
    })
    throw new LoraAssistantStructuredOutputError(
      validation.reason ?? 'LoRA assistant structured output invalid',
    )
  }
  return validation.data
}

/** §2.3：completion + JSON parse/validate, with exactly one retry on
 *  structured-output failure (`llm-output-validator` 惯例). */
async function completeLoraAssistantStructured(options: {
  systemPrompt: string
  buildUserPrompt: (maxLength?: number) => string
  route: ResolvedLlmTextRoute
  imageData?: string
}): Promise<LoraAssistantRawOutput> {
  return withRetry(
    async () => {
      const rawResult = await completeAssistantTextWithContextRetry({
        systemPrompt: options.systemPrompt,
        buildUserPrompt: options.buildUserPrompt,
        route: options.route,
        contextCompactionTargetLength:
          PROMPT_ASSISTANT_CONTEXT_COMPACTION_TARGET_LENGTH,
        imageData: options.imageData,
        responseFormat: 'json_object',
      })
      return parseLoraAssistantOutput(rawResult)
    },
    {
      maxAttempts: 2,
      baseDelayMs: 300,
      label: 'prompt-assistant.lora-structured',
      isRetryable: (error) =>
        error instanceof LoraAssistantStructuredOutputError,
    },
  )
}

/**
 * F1 v2 引擎入口。§2.1（grounding）+ §2.2（系统提示）+ §2.3（结构化输出+
 * 校验+重试）+ 出参规范化管线（触发词剔除/tray 去重/词库规范化）串联。
 */
async function chatLoraAssistantStructured(
  dbUserId: string,
  params: {
    messages: PromptAssistantMessage[]
    referenceImageData?: string
    currentPrompt?: string
    apiKeyId?: string
    responseLanguage: PromptAssistantResponseLanguage
    loraContext: LoraAssistantContext
  },
): Promise<PromptAssistantResponseData> {
  const {
    messages,
    referenceImageData,
    currentPrompt,
    apiKeyId,
    responseLanguage,
    loraContext,
  } = params
  const route = await resolveLlmTextRoute(dbUserId, apiKeyId)

  const latestUserText =
    [...messages].reverse().find((msg) => msg.role === 'user')?.content ?? ''
  const groundingBlock = buildLoraGroundingBlock(latestUserText)
  const systemPrompt = buildLoraAssistantSystemPromptV2(
    loraContext,
    groundingBlock,
    responseLanguage,
  )
  const effectiveCurrentPrompt = loraContext.currentPrompt ?? currentPrompt

  let structured: LoraAssistantRawOutput
  try {
    structured = await completeLoraAssistantStructured({
      systemPrompt,
      buildUserPrompt: (maxLength) =>
        buildPromptAssistantUserPrompt(
          messages,
          effectiveCurrentPrompt,
          undefined,
          maxLength,
        ),
      route,
      imageData: referenceImageData || undefined,
    })
  } catch (error) {
    if (error instanceof LoraAssistantStructuredOutputError) {
      logger.warn('LoRA assistant v2 gave up after one retry', {
        message: error.message,
      })
      throw new ApiRequestError(
        LORA_ASSISTANT_ERROR_CODES.invalidStructuredOutput,
        LORA_ASSISTANT_HTTP_STATUS.invalidStructuredOutput,
        'errors.provider.invalidStructuredOutput',
        'The LoRA assistant returned malformed structured output after a retry.',
      )
    }
    throw error
  }

  const filterContext = {
    triggerWords: loraContext.mounts.flatMap((mount) => mount.triggerWords),
    trayTags: loraContext.trayTags,
  }

  const positive = buildLoraAssistantTagResults(
    structured.positive,
    filterContext,
  )
  const negative = buildLoraAssistantTagResults(
    structured.negative,
    filterContext,
  )

  logger.info('LoRA assistant v2 structured result', {
    mountCount: loraContext.mounts.length,
    positiveCount: positive.length,
    negativeCount: negative.length,
    hasNote: Boolean(structured.note),
  })

  return {
    prompt: positive.map((tag) => tag.canonical ?? tag.text).join(', '),
    lora: {
      positive,
      negative,
      note: structured.note,
    },
  }
}

// ─── Flatten conversation into user prompt ──────────────────────

function flattenConversation(
  messages: PromptAssistantMessage[],
  currentPrompt?: string,
  maxLength?: number,
): string {
  const parts: string[] = []

  if (currentPrompt?.trim()) {
    parts.push(`[Current prompt in the editor]: ${currentPrompt.trim()}`)
  }

  let fullPrompt: string
  if (messages.length === 1) {
    fullPrompt = currentPrompt?.trim()
      ? `${parts[0]}\n\n${messages[0].content}`
      : messages[0].content
  } else {
    parts.push('[Conversation history]:')
    for (const msg of messages) {
      const label = msg.role === 'user' ? 'User' : 'Assistant'
      parts.push(`${label}: ${msg.content}`)
    }
    fullPrompt = parts.join('\n')
  }
  if (maxLength === undefined || fullPrompt.length <= maxLength) {
    return fullPrompt
  }

  const currentBlock = currentPrompt?.trim()
    ? `[Current prompt in the editor]: ${currentPrompt.trim()}`
    : ''
  const compactedCurrent = currentBlock
    ? truncateAssistantContextBlock(
        currentBlock,
        Math.max(1, Math.floor(maxLength * 0.2)),
        'Additional editor prompt details compacted for the retry.',
      )
    : ''
  const historyLabel = '[Conversation history]:'
  const fixedLength =
    compactedCurrent.length + historyLabel.length + (compactedCurrent ? 4 : 1)
  const conversation = buildAssistantConversation(
    messages,
    Math.max(1, maxLength - fixedLength),
  )

  return [compactedCurrent, `${historyLabel}\n${conversation}`]
    .filter(Boolean)
    .join('\n\n')
}

function buildPromptAssistantUserPrompt(
  messages: PromptAssistantMessage[],
  currentPrompt?: string,
  webContext?: WebContext,
  maxLength?: number,
): string {
  if (!webContext || !hasWebContext(webContext)) {
    return flattenConversation(messages, currentPrompt, maxLength)
  }

  const webBlock = `WEB CONTEXT (use this as your primary evidence for factual claims):
${formatWebContext(webContext)}`
  if (maxLength === undefined) {
    return `${flattenConversation(messages, currentPrompt)}\n\n${webBlock}`
  }

  const webBudget = Math.max(1, Math.floor(maxLength * 0.25))
  const compactedWebBlock = truncateAssistantContextBlock(
    webBlock,
    webBudget,
    'Additional web research context compacted for the retry.',
  )
  const conversationBudget = Math.max(
    1,
    maxLength - compactedWebBlock.length - 2,
  )
  return `${flattenConversation(
    messages,
    currentPrompt,
    conversationBudget,
  )}\n\n${compactedWebBlock}`
}

// ─── Extract prompt from LLM response ──────────────────────────

function extractPromptFromResponse(raw: string): string {
  // Try to extract from code block first
  const codeBlockMatch = raw.match(/```(?:\w*\n)?([\s\S]*?)```/)
  if (codeBlockMatch?.[1]?.trim()) {
    return codeBlockMatch[1].trim()
  }

  // Fallback: use raw text, strip any explanation prefix
  return raw
    .replace(/^(Here'?s?|I'?ve|Based on|The prompt|Prompt:)\s*/i, '')
    .trim()
}

// ─── Public API ─────────────────────────────────────────────────

export async function chatPromptAssistant(
  clerkId: string,
  messages: PromptAssistantMessage[],
  modelId?: string,
  referenceImageData?: string,
  currentPrompt?: string,
  apiKeyId?: string,
  responseLanguage: PromptAssistantResponseLanguage = 'english',
  mode: PromptAssistantMode = 'general',
  useInspirationContext?: boolean,
  research?: boolean,
  loraContext?: LoraAssistantContext,
): Promise<PromptAssistantResponseData> {
  const dbUser = await ensureUser(clerkId)

  // F1 v2 引擎（docs/plans/lora-assistant-nl2tag-2026-07.md §2）：加法式
  // opt-in——只有 `mode:'lora'` 且显式带 `loraContext` 才走新路径。任何其他
  // 组合（含 `/prompts` 页 presetLora 发的 `mode:'lora'` 不带 loraContext）
  // 原样落到下面的旧逻辑，逐字节不变。
  if (mode === 'lora' && loraContext) {
    return chatLoraAssistantStructured(dbUser.id, {
      messages,
      referenceImageData,
      currentPrompt,
      apiKeyId,
      responseLanguage,
      loraContext,
    })
  }

  let systemPrompt = buildAssistantSystemPrompt(modelId, responseLanguage, mode)

  // RAG: inject curated examples only on the first turn — later turns are
  // iterative refinements where extra reference examples would dilute the
  // user's evolving intent.
  if (useInspirationContext && messages.length === 1) {
    const seedPrompt = currentPrompt?.trim() || messages[0]?.content || ''
    const contextBlock = await buildInspirationContext(seedPrompt)
    if (contextBlock) systemPrompt = `${systemPrompt}${contextBlock}`
  }

  // Research turn — same two-tier policy as the node assistant:
  // Serper-gathered context lets ANY writing model (incl. DeepSeek/Qwen)
  // answer; otherwise borrow provider-native grounding when possible.
  let route = await resolveLlmTextRoute(dbUser.id, apiKeyId)
  let useGrounding: boolean | undefined
  let webContext: WebContext | undefined
  if (research) {
    const latestUserText =
      [...messages].reverse().find((msg) => msg.role === 'user')?.content ?? ''
    const gatheredContext: WebContext = latestUserText
      ? await gatherWebContext(latestUserText)
      : { results: [], pages: [] }

    if (hasWebContext(gatheredContext)) {
      webContext = gatheredContext
    } else {
      const researchRoute = await resolveResearchRoute(dbUser.id, apiKeyId)
      route = researchRoute.route
      useGrounding = researchRoute.useGrounding || undefined
    }
  }

  const rawResult = await completeAssistantTextWithContextRetry({
    systemPrompt,
    buildUserPrompt: (maxLength) =>
      buildPromptAssistantUserPrompt(
        messages,
        currentPrompt,
        webContext,
        maxLength,
      ),
    route,
    contextCompactionTargetLength:
      PROMPT_ASSISTANT_CONTEXT_COMPACTION_TARGET_LENGTH,
    imageData: referenceImageData || undefined,
    useGrounding,
  })

  const prompt = extractPromptFromResponse(rawResult)

  // Validate output
  const validation = validateLlmPromptOutput(
    prompt,
    messages[messages.length - 1]?.content ?? '',
  )
  if (!validation.usable) {
    logger.warn('Prompt assistant output rejected', {
      reason: validation.reason,
      modelId,
    })
    // Return raw prompt anyway — assistant output is less strict than enhance
    return { prompt: prompt || rawResult.trim() }
  }

  return { prompt: validation.output }
}
