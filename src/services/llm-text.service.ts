import 'server-only'

import { z } from 'zod'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { db } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

// ─── Types ───────────────────────────────────────────────────────

export interface LlmTextInput {
  systemPrompt: string
  userPrompt: string
  imageData?: string // base64 data URL for multimodal
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
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

const LLM_TEXT_MODELS = {
  [AI_ADAPTER_TYPES.GEMINI]: 'gemini-2.0-flash',
  [AI_ADAPTER_TYPES.OPENAI]: 'gpt-4o-mini',
} as const

// ─── Route Resolution ────────────────────────────────────────────

/**
 * Resolves which LLM provider + API key to use for text completion.
 * Priority: user Gemini key → user OpenAI key → env Gemini key → env OpenAI key
 */
export async function resolveLlmTextRoute(
  userId: string,
): Promise<ResolvedLlmTextRoute> {
  const preferenceOrder = [AI_ADAPTER_TYPES.GEMINI, AI_ADAPTER_TYPES.OPENAI]

  // Check user API keys first
  for (const adapterType of preferenceOrder) {
    const userKey = await db.userApiKey.findFirst({
      where: {
        userId,
        adapterType,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (userKey) {
      try {
        const keyValue = decryptApiKey(userKey.encryptedKey)
        return {
          adapterType,
          providerConfig: {
            label:
              adapterType === AI_ADAPTER_TYPES.GEMINI ? 'Gemini' : 'OpenAI',
            baseUrl:
              adapterType === AI_ADAPTER_TYPES.GEMINI
                ? AI_PROVIDER_ENDPOINTS.GEMINI
                : AI_PROVIDER_ENDPOINTS.OPENAI_CHAT,
          },
          apiKey: keyValue,
        }
      } catch {
        // Key decryption failed, try next
      }
    }
  }

  throw new Error(
    'No API key available for LLM text completion. Please bind a Gemini or OpenAI API key in the API Keys settings.',
  )
}

// ─── Provider Implementations ────────────────────────────────────

async function geminiTextCompletion(input: LlmTextInput): Promise<string> {
  const modelId = LLM_TEXT_MODELS[AI_ADAPTER_TYPES.GEMINI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI
  const endpoint = `${baseUrl}/${modelId}:generateContent`

  const parts: Array<Record<string, unknown>> = []

  // Add image if multimodal
  if (input.imageData) {
    const dataUrlMatch = input.imageData.match(/^data:([^;]+);base64,(.+)$/)
    if (dataUrlMatch) {
      parts.push({
        inlineData: {
          mimeType: dataUrlMatch[1],
          data: dataUrlMatch[2],
        },
      })
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
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: input.imageData },
        },
        { type: 'text', text: input.userPrompt },
      ],
    })
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
    default:
      throw new Error(
        `LLM text completion not supported for adapter: ${input.adapterType}`,
      )
  }
}
