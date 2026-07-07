import 'server-only'

import { getModelEnhanceHint } from '@/constants/model-strengths'
import { getModelById } from '@/constants/models'
import { buildInspirationContext } from '@/services/kernel/inspiration-context.service'
import {
  formatWebContext,
  resolveResearchRoute,
} from '@/services/kernel/research-route.service'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import {
  gatherWebContext,
  hasWebContext,
  type WebContext,
} from '@/services/web-research.service'
import { logger } from '@/lib/logger'
import { validateLlmPromptOutput } from '@/lib/llm-output-validator'
import type {
  PromptAssistantMode,
  PromptAssistantMessage,
  PromptAssistantResponseLanguage,
} from '@/types'

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

// ─── Flatten conversation into user prompt ──────────────────────

function flattenConversation(
  messages: PromptAssistantMessage[],
  currentPrompt?: string,
): string {
  const parts: string[] = []

  if (currentPrompt?.trim()) {
    parts.push(`[Current prompt in the editor]: ${currentPrompt.trim()}`)
  }

  if (messages.length === 1) {
    // Single turn — just pass the message directly
    return currentPrompt?.trim()
      ? `${parts[0]}\n\n${messages[0].content}`
      : messages[0].content
  }

  // Multi-turn — flatten with role labels
  parts.push('[Conversation history]:')
  for (const msg of messages) {
    const label = msg.role === 'user' ? 'User' : 'Assistant'
    parts.push(`${label}: ${msg.content}`)
  }

  return parts.join('\n')
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
): Promise<{ prompt: string }> {
  const dbUser = await ensureUser(clerkId)

  let systemPrompt = buildAssistantSystemPrompt(modelId, responseLanguage, mode)

  // RAG: inject curated examples only on the first turn — later turns are
  // iterative refinements where extra reference examples would dilute the
  // user's evolving intent.
  if (useInspirationContext && messages.length === 1) {
    const seedPrompt = currentPrompt?.trim() || messages[0]?.content || ''
    const contextBlock = await buildInspirationContext(seedPrompt)
    if (contextBlock) systemPrompt = `${systemPrompt}${contextBlock}`
  }

  let userPrompt = flattenConversation(messages, currentPrompt)

  // Research turn — same two-tier policy as the node assistant:
  // Serper-gathered context lets ANY writing model (incl. DeepSeek/Qwen)
  // answer; otherwise borrow provider-native grounding when possible.
  let route = await resolveLlmTextRoute(dbUser.id, apiKeyId)
  let useGrounding: boolean | undefined
  if (research) {
    const latestUserText =
      [...messages].reverse().find((msg) => msg.role === 'user')?.content ?? ''
    const webContext: WebContext = latestUserText
      ? await gatherWebContext(latestUserText)
      : { results: [], pages: [] }

    if (hasWebContext(webContext)) {
      userPrompt = `${userPrompt}

WEB CONTEXT (use this as your primary evidence for factual claims):
${formatWebContext(webContext)}`
    } else {
      const researchRoute = await resolveResearchRoute(dbUser.id, apiKeyId)
      route = researchRoute.route
      useGrounding = researchRoute.useGrounding || undefined
    }
  }

  const rawResult = await llmTextCompletion({
    systemPrompt,
    userPrompt,
    imageData: referenceImageData || undefined,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
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
