import 'server-only'

import type { PromptEnhanceStyle } from '@/constants/config'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'

const STYLE_SYSTEM_PROMPTS: Record<PromptEnhanceStyle, string> = {
  detailed: `You are an expert AI image prompt engineer. Enhance the given prompt by adding rich details about environment, lighting, composition, materials, textures, and mood. Keep the core subject unchanged. Return ONLY the enhanced prompt text, no explanation.`,

  artistic: `You are an expert AI image prompt engineer specializing in artistic styles. Enhance the given prompt by adding art style references, artistic medium descriptions, color palette suggestions, and aesthetic qualities. Reference specific art movements or techniques when appropriate. Return ONLY the enhanced prompt text, no explanation.`,

  photorealistic: `You are an expert AI image prompt engineer specializing in photorealism. Enhance the given prompt by adding camera parameters (lens type, focal length, aperture), lighting setup (golden hour, studio lighting), film stock qualities, and photographic composition rules. Return ONLY the enhanced prompt text, no explanation.`,

  anime: `You are an expert AI image prompt engineer specializing in anime and manga styles. Enhance the given prompt by adding anime-specific style descriptors, character design details, scene atmosphere, color vibrancy, and animation quality references (like Studio Ghibli, Makoto Shinkai style). Return ONLY the enhanced prompt text, no explanation.`,
}

export async function enhancePrompt(
  clerkId: string,
  prompt: string,
  style: PromptEnhanceStyle,
): Promise<{ original: string; enhanced: string; style: string }> {
  const dbUser = await ensureUser(clerkId)

  const route = await resolveLlmTextRoute(dbUser.id)
  const systemPrompt = STYLE_SYSTEM_PROMPTS[style]

  const enhanced = await llmTextCompletion({
    systemPrompt,
    userPrompt: prompt,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  return {
    original: prompt,
    enhanced,
    style,
  }
}
