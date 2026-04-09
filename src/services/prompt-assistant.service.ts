import 'server-only'

import { getModelEnhanceHint } from '@/constants/model-strengths'
import { getModelById } from '@/constants/models'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
import { validateLlmPromptOutput } from '@/lib/llm-output-validator'
import type { PromptAssistantMessage } from '@/types'

// ─── Style preset shortcuts ────────────────────────────────────

export const STYLE_SHORTCUTS: Record<string, string> = {
  detailed:
    'Enhance with rich environment, lighting, material, and texture details.',
  artistic:
    'Enhance with art style references, medium descriptions, and color palette.',
  photorealistic:
    'Enhance with camera parameters, lens specs, lighting setup, and film stock.',
  anime:
    'Enhance with anime descriptors, character design details, and atmosphere.',
  tags: 'Convert to danbooru-style comma-separated tags for NovelAI.',
}

// ─── System prompt builder ─────────────────────────────────────

function buildAssistantSystemPrompt(modelId?: string): string {
  let modelSection = ''

  if (modelId) {
    const model = getModelById(modelId)
    const hint = getModelEnhanceHint(modelId, model?.adapterType)
    if (hint) {
      modelSection = `\n\nCURRENT TARGET MODEL: ${modelId}${model?.adapterType ? ` (${model.adapterType})` : ''}
MODEL PROMPT STYLE: ${hint}
Adapt your output format to match this model's strengths.`
    }
  }

  return `You are a professional AI image generation prompt engineer.
The user will describe what they want in natural language (any language).

If a reference image is provided, analyze its visual characteristics
(art medium, color palette, lighting, texture, composition, mood, effects)
and incorporate those qualities into the prompt unless the user
explicitly asks to change them.${modelSection}

RULES:
- Output ONLY the prompt text inside a markdown code block (\`\`\`)
- Be specific about visual details (lighting, texture, color, composition, effects)
- Preserve the user's intent exactly
- Each response should be a complete, ready-to-use prompt
- If the user asks to modify a previous prompt, build on the last version
- Support any language input but output prompts in English (unless user requests otherwise)`
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
): Promise<{ prompt: string }> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  const systemPrompt = buildAssistantSystemPrompt(modelId)
  const userPrompt = flattenConversation(messages, currentPrompt)

  const rawResult = await llmTextCompletion({
    systemPrompt,
    userPrompt,
    imageData: referenceImageData || undefined,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
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
