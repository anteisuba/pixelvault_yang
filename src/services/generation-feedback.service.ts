import 'server-only'

import { z } from 'zod'

import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { fetchAsBuffer } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type { GenerationFeedbackResult } from '@/types'

// ─── Response Schema (parsed from LLM JSON output) ─────────────

const RefinementOutputSchema = z.object({
  refinedPrompt: z.string(),
  negativeAdditions: z.array(z.string()),
  explanation: z.string(),
})

// ─── System Prompt ──────────────────────────────────────────────

const REFINEMENT_SYSTEM_PROMPT = `You are an expert AI image generation prompt engineer. The user will show you a generated image, the original prompt used to create it, and their feedback describing what they don't like about the result. Your job is to refine the prompt to fix the issues they described.

Respond in valid JSON with this exact structure:
{
  "refinedPrompt": "The improved prompt that addresses the user's feedback while preserving the original intent.",
  "negativeAdditions": ["list", "of", "terms", "to", "add", "to", "negative", "prompt"],
  "explanation": "Brief explanation of what you changed and why, referencing the specific issues the user mentioned."
}

Rules:
- Analyze the image to understand what went wrong
- The refined prompt should directly address the user's complaints
- Preserve the original creative intent — only fix the issues mentioned
- negativeAdditions should list specific visual artifacts or unwanted elements to avoid
- Keep negativeAdditions concise — single terms or short phrases
- If the user's feedback is vague, infer specific issues from the image
- Return ONLY the JSON, no markdown fences, no explanation outside the JSON`

// ─── Public API ─────────────────────────────────────────────────

export async function refinePromptFromFeedback(
  clerkId: string,
  imageUrl: string,
  originalPrompt: string,
  feedback: string,
  apiKeyId?: string,
): Promise<GenerationFeedbackResult> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  // Convert the generated image to base64 for vision LLM
  const { buffer, mimeType } = await fetchAsBuffer(imageUrl)
  const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`

  const userPrompt = `Original prompt used to generate this image:
"${originalPrompt}"

User feedback (what they don't like):
"${feedback}"

Analyze the image, understand the issues described, and provide a refined prompt.`

  const raw = await llmTextCompletion({
    systemPrompt: REFINEMENT_SYSTEM_PROMPT,
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
    const parsed = RefinementOutputSchema.safeParse(JSON.parse(cleaned))

    if (parsed.success) {
      return {
        originalPrompt,
        ...parsed.data,
      }
    }
  } catch {
    // JSON parse failed — fall through to fallback
  }

  // Fallback: append feedback context to original prompt
  return {
    originalPrompt,
    refinedPrompt: `${originalPrompt}, ${feedback}`,
    negativeAdditions: [],
    explanation:
      'AI returned a non-standard response. The feedback was appended to your original prompt.',
  }
}
