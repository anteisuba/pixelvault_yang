import 'server-only'

import { z } from 'zod'

import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import type { PromptFeedbackResponseData } from '@/types'

// ─── Response Schema (parsed from LLM JSON output) ─────────────

const FeedbackOutputSchema = z.object({
  overallAssessment: z.string(),
  suggestions: z.array(
    z.object({
      category: z.string(),
      suggestion: z.string(),
      example: z.string().optional(),
    }),
  ),
  improvedPrompt: z.string(),
})

// ─── System Prompt ──────────────────────────────────────────────

const FEEDBACK_SYSTEM_PROMPT = `You are an expert AI image generation prompt coach. The user will give you a prompt they wrote for an AI image generator. Your job is to analyze the prompt and provide actionable feedback to help them get better results.

Respond in valid JSON with this exact structure:
{
  "overallAssessment": "A brief 1-2 sentence assessment of the prompt's quality and what it does well or lacks.",
  "suggestions": [
    {
      "category": "category name (e.g. Composition, Lighting, Style, Detail, Subject, Color, Mood, Technical)",
      "suggestion": "What to improve and why",
      "example": "A concrete example phrase the user could add or change"
    }
  ],
  "improvedPrompt": "The full improved version of the prompt incorporating your suggestions."
}

Rules:
- Provide 2-5 suggestions, prioritized by impact
- Keep suggestions specific and actionable — not vague advice
- The improved prompt should be a direct upgrade, not a rewrite from scratch
- Preserve the user's original intent and subject matter
- If the prompt is already strong, acknowledge that and suggest only minor refinements
- If context about the character or scene is provided, factor it into your suggestions
- Return ONLY the JSON, no markdown fences, no explanation outside the JSON`

// ─── Public API ─────────────────────────────────────────────────

export async function getPromptFeedback(
  clerkId: string,
  prompt: string,
  context?: string,
  apiKeyId?: string,
): Promise<PromptFeedbackResponseData> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  const userPrompt = context
    ? `Prompt to review:\n"${prompt}"\n\nAdditional context:\n${context}`
    : `Prompt to review:\n"${prompt}"`

  const raw = await llmTextCompletion({
    systemPrompt: FEEDBACK_SYSTEM_PROMPT,
    userPrompt,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Strip markdown fences if LLM wraps output
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')

  const parsed = FeedbackOutputSchema.safeParse(JSON.parse(cleaned))

  if (!parsed.success) {
    // Fallback: return raw text as a single suggestion
    return {
      originalPrompt: prompt,
      overallAssessment: 'AI returned a non-standard response.',
      suggestions: [
        {
          category: 'General',
          suggestion: raw,
        },
      ],
      improvedPrompt: prompt,
    }
  }

  return {
    originalPrompt: prompt,
    ...parsed.data,
  }
}
