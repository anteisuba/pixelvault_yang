import 'server-only'

import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { db } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { getSystemApiKey } from '@/lib/platform-keys'

// ─── Types ───────────────────────────────────────────────────────

export interface LlmTextInput {
  systemPrompt: string
  userPrompt: string
  imageData?: string | string[] // base64 data URL(s) for multimodal (single or multiple images)
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  /** Enable web search grounding (Gemini google_search / OpenAI web_search) */
  useGrounding?: boolean
}

export interface ResolvedLlmTextRoute {
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
}

// ─── Response Schemas ────────────────────────────────────────────

const GeminiTextResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
})

const OpenAiChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ),
})

// ─── LLM Text Models ────────────────────────────────────────────

/** Text-capable LLM adapter types */
const LLM_TEXT_ADAPTERS = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
] as const

type LlmTextAdapterType = (typeof LLM_TEXT_ADAPTERS)[number]

function isLlmTextAdapter(t: AI_ADAPTER_TYPES): t is LlmTextAdapterType {
  return (LLM_TEXT_ADAPTERS as readonly AI_ADAPTER_TYPES[]).includes(t)
}

const LLM_TEXT_MODELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: 'gemini-2.5-flash-lite',
  [AI_ADAPTER_TYPES.OPENAI]: 'gpt-4.1-nano',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'doubao-1.5-pro-32k',
}

const LLM_TEXT_LABELS: Record<LlmTextAdapterType, string> = {
  [AI_ADAPTER_TYPES.GEMINI]: 'Gemini',
  [AI_ADAPTER_TYPES.OPENAI]: 'OpenAI',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'VolcEngine',
}

function getBaseUrlForAdapter(adapterType: LlmTextAdapterType): string {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return AI_PROVIDER_ENDPOINTS.GEMINI
    case AI_ADAPTER_TYPES.OPENAI:
      return AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return AI_PROVIDER_ENDPOINTS.VOLCENGINE
  }
}

// ─── Route Resolution ────────────────────────────────────────────

/**
 * Resolves which LLM provider + API key to use for text completion.
 * Priority: specified apiKeyId → user Gemini key → user OpenAI key → user VolcEngine key
 */
export async function resolveLlmTextRoute(
  userId: string,
  apiKeyId?: string,
): Promise<ResolvedLlmTextRoute> {
  // If a specific key is requested, use it directly
  if (apiKeyId) {
    const specificKey = await db.userApiKey.findFirst({
      where: { id: apiKeyId, userId, isActive: true },
    })

    if (!specificKey) {
      throw new Error(
        'The selected API key is unavailable. Please choose a different key in Settings > API Keys.',
      )
    }

    const adapterType = specificKey.adapterType as AI_ADAPTER_TYPES
    if (!isLlmTextAdapter(adapterType)) {
      throw new Error(
        'The selected API key does not support text completion (requires Gemini, OpenAI, or VolcEngine). Please bind a compatible key.',
      )
    }

    const keyValue = decryptApiKey(specificKey.encryptedKey)
    return {
      adapterType,
      providerConfig: {
        label: LLM_TEXT_LABELS[adapterType],
        baseUrl: getBaseUrlForAdapter(adapterType),
      },
      apiKey: keyValue,
    }
  }

  const triedProviders: string[] = []

  for (const adapterType of LLM_TEXT_ADAPTERS) {
    const label = LLM_TEXT_LABELS[adapterType]

    const userKey = await db.userApiKey.findFirst({
      where: {
        userId,
        adapterType,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!userKey) {
      triedProviders.push(`${label} (no key bound)`)
      continue
    }

    try {
      const keyValue = decryptApiKey(userKey.encryptedKey)
      return {
        adapterType,
        providerConfig: {
          label,
          baseUrl: getBaseUrlForAdapter(adapterType),
        },
        apiKey: keyValue,
      }
    } catch {
      triedProviders.push(`${label} (key decryption failed)`)
    }
  }

  // Platform fallback: use system Gemini key for users without their own keys
  const platformKey = getSystemApiKey(AI_ADAPTER_TYPES.GEMINI)
  if (platformKey) {
    return {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: LLM_TEXT_LABELS[AI_ADAPTER_TYPES.GEMINI],
        baseUrl: getBaseUrlForAdapter(AI_ADAPTER_TYPES.GEMINI),
      },
      apiKey: platformKey,
    }
  }

  const tried = triedProviders.join(', ')
  throw new Error(
    `No API key available. Tried: ${tried}. Please add a Gemini, OpenAI, or VolcEngine API key in Settings > API Keys.`,
  )
}

// ─── Provider Implementations ────────────────────────────────────

async function geminiTextCompletion(input: LlmTextInput): Promise<string> {
  const modelId = LLM_TEXT_MODELS[AI_ADAPTER_TYPES.GEMINI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI
  const endpoint = `${baseUrl}/${modelId}:generateContent`

  const parts: Array<Record<string, unknown>> = []

  // Add image(s) if multimodal
  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    for (const img of images) {
      const dataUrlMatch = img.match(/^data:([^;]+);base64,(.+)$/)
      if (dataUrlMatch) {
        parts.push({
          inlineData: {
            mimeType: dataUrlMatch[1],
            data: dataUrlMatch[2],
          },
        })
      }
    }
  }

  parts.push({ text: input.userPrompt })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': input.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: input.systemPrompt }],
      },
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT'],
      },
      ...(input.useGrounding ? { tools: [{ google_search: {} }] } : {}),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`Gemini text API error (${response.status}): ${errorBody}`)
  }

  const data = GeminiTextResponseSchema.parse(await response.json())
  const textPart = data.candidates?.[0]?.content?.parts?.find((p) => p.text)

  if (!textPart?.text) {
    throw new Error('No text response from Gemini')
  }

  return textPart.text.trim()
}

async function openAiTextCompletion(input: LlmTextInput): Promise<string> {
  const modelId = LLM_TEXT_MODELS[AI_ADAPTER_TYPES.OPENAI]
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.OPENAI_CHAT
  const endpoint = `${baseUrl}/chat/completions`

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: input.systemPrompt },
  ]

  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    const content: Array<Record<string, unknown>> = images.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    }))
    content.push({ type: 'text', text: input.userPrompt })
    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: input.userPrompt })
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: 1024,
      ...(input.useGrounding
        ? { tools: [{ type: 'web_search_preview' }] }
        : {}),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenAI text API error (${response.status}): ${errorBody}`)
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No text response from OpenAI')
  }

  return content.trim()
}

/**
 * VolcEngine (豆包) text completion — OpenAI-compatible chat API.
 * Supports vision (image_url in content) and web search via plugin.
 */
async function volcengineTextCompletion(input: LlmTextInput): Promise<string> {
  const modelId = LLM_TEXT_MODELS[AI_ADAPTER_TYPES.VOLCENGINE]
  const baseUrl =
    input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.VOLCENGINE
  const endpoint = `${baseUrl}/chat/completions`

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: input.systemPrompt },
  ]

  if (input.imageData) {
    const images = Array.isArray(input.imageData)
      ? input.imageData
      : [input.imageData]
    const content: Array<Record<string, unknown>> = images.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    }))
    content.push({ type: 'text', text: input.userPrompt })
    messages.push({ role: 'user', content })
  } else {
    messages.push({ role: 'user', content: input.userPrompt })
  }

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    max_tokens: 1024,
  }

  // VolcEngine web search: use built-in web_search plugin
  if (input.useGrounding) {
    body.tools = [
      {
        type: 'web_search',
        web_search: { enable: true, search_query: input.userPrompt },
      },
    ]
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(
      `VolcEngine text API error (${response.status}): ${errorBody}`,
    )
  }

  const data = OpenAiChatResponseSchema.parse(await response.json())
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No text response from VolcEngine')
  }

  return content.trim()
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Complete a text prompt using the specified LLM provider.
 * Supports pure text and multimodal (image + text) input.
 */
export async function llmTextCompletion(input: LlmTextInput): Promise<string> {
  switch (input.adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return geminiTextCompletion(input)
    case AI_ADAPTER_TYPES.OPENAI:
      return openAiTextCompletion(input)
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return volcengineTextCompletion(input)
    default:
      throw new Error(
        `LLM text completion not supported for adapter: ${input.adapterType}`,
      )
  }
}
