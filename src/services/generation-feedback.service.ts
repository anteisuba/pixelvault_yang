import 'server-only'

import { z } from 'zod'

import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { fetchAsBuffer } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type { ConversationMessage, GenerationFeedbackResult } from '@/types'

// ─── Response Schema (parsed from LLM JSON output) ─────────────

const ConversationOutputSchema = z.object({
  reply: z.string(),
  refinedPrompt: z.string().nullable(),
  negativeAdditions: z.array(z.string()),
  done: z.boolean(),
})

// ─── Locale Labels ──────────────────────────────────────────────

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
}

// ─── System Prompt ──────────────────────────────────────────────

function buildSystemPrompt(locale: string): string {
  const lang = LOCALE_LABELS[locale] || LOCALE_LABELS.en
  return `You are an expert AI image generation prompt coach. You help users iteratively refine their image generation prompts through conversation.

You will be shown a generated image and the prompt used to create it. Your job is to ask the user targeted questions to understand what they want to improve, then produce an optimized prompt.

CONVERSATION FLOW:
1. First turn: Look at the image, analyze it, then ask 2-3 specific questions about what the user wants to change (composition, style, colors, mood, character details, etc.)
2. Follow-up turns: Based on the user's answers, either ask 1-2 more clarifying questions OR deliver the final refined prompt
3. When you have enough information, set "done": true and provide the refined prompt

Respond in valid JSON with this exact structure:
{
  "reply": "Your conversational message to the user (questions or explanation of the refined prompt)",
  "refinedPrompt": null or "the final optimized prompt when done",
  "negativeAdditions": [] or ["terms", "to", "avoid"] when done,
  "done": false or true
}

Rules:
- Ask specific, actionable questions — not vague ones
- Reference what you see in the image when asking questions (e.g. "I notice the lighting is flat — would you prefer dramatic side-lighting or soft diffused light?")
- Keep questions concise — 2-3 per turn maximum
- When delivering the final prompt, explain briefly what you changed in "reply"
- The refined prompt should be a direct upgrade, preserving the user's original intent
- negativeAdditions: only include when done=true, list specific visual artifacts to avoid
- You MUST respond in ${lang}
- Return ONLY the JSON, no markdown fences, no explanation outside the JSON`
}

// ─── Public API ─────────────────────────────────────────────────

export async function conversationalRefine(
  clerkId: string,
  imageUrl: string,
  originalPrompt: string,
  messages: ConversationMessage[],
  locale: string,
  apiKeyId?: string,
): Promise<GenerationFeedbackResult> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  // Convert the generated image to base64 for vision LLM
  const { buffer, mimeType } = await fetchAsBuffer(imageUrl)
  const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`

  // Build the user prompt with conversation history
  let userPrompt = `Original prompt used to generate this image:\n"${originalPrompt}"\n`

  if (messages.length === 0) {
    userPrompt += `\nThis is the first turn. Analyze the image and ask the user what they want to improve.`
  } else {
    userPrompt += `\nConversation so far:\n`
    for (const msg of messages) {
      const label = msg.role === 'assistant' ? 'You' : 'User'
      userPrompt += `${label}: ${msg.content}\n`
    }
    userPrompt += `\nContinue the conversation. Either ask follow-up questions or deliver the final refined prompt if you have enough information.`
  }

  const raw = await llmTextCompletion({
    systemPrompt: buildSystemPrompt(locale),
    userPrompt,
    imageData: base64,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Strip markdown fences if LLM wraps output
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')

  try {
    const parsed = ConversationOutputSchema.safeParse(JSON.parse(cleaned))

    if (parsed.success) {
      return parsed.data
    }
  } catch {
    // JSON parse failed — fall through to fallback
  }

  // Fallback: treat raw text as a reply asking for clarification
  return {
    reply: raw,
    refinedPrompt: null,
    negativeAdditions: [],
    done: false,
  }
}
