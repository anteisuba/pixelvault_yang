import 'server-only'

import {
  ImageIntentSchema,
  type ImageIntent,
  type ReferenceAsset,
} from '@/types'
import { logger } from '@/lib/logger'
import { validatePrompt, sanitizePrompt } from '@/lib/prompt-guard'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'

const INTENT_PARSER_PLATFORM_USER_ID = '__generation_plan_platform__'

const INTENT_EXTRACTION_SYSTEM_PROMPT = `You are an expert image generation prompt analyst.
Your task is to extract structured intent from a user's natural language description.

Return ONLY a JSON object with these optional fields (only include fields you can infer):
{
  "subject": "string (REQUIRED - the main subject)",
  "subjectDetails": "string (optional - appearance, clothing)",
  "actionOrPose": "string (optional - what they are doing)",
  "scene": "string (optional - environment/location)",
  "composition": "string (optional - framing like close-up or wide shot)",
  "camera": "string (optional - lens/camera details)",
  "lighting": "string (optional - lighting conditions)",
  "colorPalette": "string (optional - colors/tones)",
  "style": "string (optional - visual style)",
  "mood": "string (optional - emotional tone)",
  "mustInclude": ["string array of elements that must appear"],
  "mustAvoid": ["string array of elements to avoid"]
}

Rules:
- Always extract a "subject" field.
- Only include fields you can confidently infer from the description.
- Do not invent details not implied by the description.
- Return raw JSON only. No markdown. No explanation.`

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

function buildFallbackIntent(
  naturalLanguage: string,
  referenceAssets?: ReferenceAsset[],
): ImageIntent {
  return {
    subject: naturalLanguage.slice(0, 500),
    referenceAssets,
  }
}

export async function parseImageIntent(
  naturalLanguage: string,
  referenceAssets?: ReferenceAsset[],
): Promise<ImageIntent> {
  const guardResult = validatePrompt(naturalLanguage)

  if (!guardResult.valid) {
    logger.warn('Intent parser prompt failed guard, using fallback', {
      reason: guardResult.reason,
    })
    return buildFallbackIntent(naturalLanguage, referenceAssets)
  }

  const safeInput = sanitizePrompt(naturalLanguage)

  try {
    const route = await resolveLlmTextRoute(INTENT_PARSER_PLATFORM_USER_ID)
    const rawOutput = await llmTextCompletion({
      systemPrompt: INTENT_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: `Extract intent from: "${safeInput}"`,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
    })

    const parsed: unknown = JSON.parse(stripMarkdownFences(rawOutput))
    const validated = ImageIntentSchema.safeParse(parsed)

    if (!validated.success) {
      logger.warn('Intent parser LLM output failed schema validation', {
        issues: validated.error.issues,
      })
      return buildFallbackIntent(naturalLanguage, referenceAssets)
    }

    return {
      ...validated.data,
      referenceAssets: referenceAssets ?? validated.data.referenceAssets,
    }
  } catch (error) {
    logger.warn('Intent parser LLM call failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    })
    return buildFallbackIntent(naturalLanguage, referenceAssets)
  }
}
