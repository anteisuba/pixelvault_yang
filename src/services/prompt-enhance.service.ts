import 'server-only'

import type { PromptEnhanceStyle } from '@/constants/config'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
import { validateLlmPromptOutput } from '@/lib/llm-output-validator'

const STYLE_SYSTEM_PROMPTS: Record<PromptEnhanceStyle, string> = {
  detailed: `You are an expert AI image prompt engineer. Enhance the given prompt by adding rich details about environment, lighting, composition, materials, textures, and mood. Keep the core subject unchanged. Return ONLY the enhanced prompt text, no explanation.`,

  artistic: `You are an expert AI image prompt engineer specializing in artistic styles. Enhance the given prompt by adding art style references, artistic medium descriptions, color palette suggestions, and aesthetic qualities. Reference specific art movements or techniques when appropriate. Return ONLY the enhanced prompt text, no explanation.`,

  photorealistic: `You are an expert AI image prompt engineer specializing in photorealism. Enhance the given prompt by adding camera parameters (lens type, focal length, aperture), lighting setup (golden hour, studio lighting), film stock qualities, and photographic composition rules. Return ONLY the enhanced prompt text, no explanation.`,

  anime: `You are an expert AI image prompt engineer specializing in anime and manga styles. Enhance the given prompt by adding anime-specific style descriptors, character design details, scene atmosphere, color vibrancy, and animation quality references (like Studio Ghibli, Makoto Shinkai style). Return ONLY the enhanced prompt text, no explanation.`,

  lora: `You are an expert at writing trigger keywords for LoRA fine-tuned image models. Given a scene description, output a comma-separated list of LoRA-style trigger tags: character tags (e.g. 1girl, blue_hair, twintails), pose tags, clothing tags, background tags, quality tags (masterpiece, best quality, highres), and negative avoidance hints. Keep the output concise, tag-format only (lowercase, underscores). Return ONLY the tag list, no explanation or sentence prose.`,
}

export async function enhancePrompt(
  clerkId: string,
  prompt: string,
  style: PromptEnhanceStyle,
  apiKeyId?: string,
): Promise<{ original: string; enhanced: string; style: string }> {
  const dbUser = await ensureUser(clerkId)

  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)
  const systemPrompt = STYLE_SYSTEM_PROMPTS[style]

  const rawEnhanced = await llmTextCompletion({
    systemPrompt,
    userPrompt: prompt,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Validate LLM output — fall back to original if enhancement is unusable
  const validation = validateLlmPromptOutput(rawEnhanced, prompt)
  if (!validation.usable) {
    logger.warn('Prompt enhancement rejected, using original', {
      reason: validation.reason,
      style,
    })
    return { original: prompt, enhanced: prompt, style }
  }
  if (validation.warnings.length > 0) {
    logger.info('Prompt enhancement warnings', {
      warnings: validation.warnings,
    })
  }

  return {
    original: prompt,
    enhanced: validation.output,
    style,
  }
}
