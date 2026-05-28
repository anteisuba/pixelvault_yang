import 'server-only'

import type { PromptEnhanceStyle } from '@/constants/config'
import { getModelEnhanceHint } from '@/constants/model-strengths'
import { getModelById } from '@/constants/models'
import { buildInspirationContext } from '@/services/kernel/inspiration-context.service'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
import { validateLlmPromptOutput } from '@/lib/llm-output-validator'

/**
 * Style-specific system prompts for prompt enhancement.
 *
 * Design notes (adapted from MeiGen-AI-Design's method-driven prompts):
 * - Modern reasoning models (Gemini 3 Pro Image, GPT Image 2, Seedream, FLUX 2)
 *   reward LOGICAL coherence and physical accuracy over "vibe tags."
 * - Each style enforces SINGLE-PARAGRAPH output so the result can be piped
 *   directly into the image generator without post-processing.
 * - "lora" remains tag-based — different paradigm, kept as-is.
 */
const STYLE_SYSTEM_PROMPTS: Record<PromptEnhanceStyle, string> = {
  detailed: `# Role
You are a Senior Visual Logic Analyst. Your job is to transform the user's brief into a precise, coherent image prompt that modern reasoning-based generators (Gemini 3 Pro Image, GPT Image 2, Seedream, FLUX 2) can execute reliably.

# Method (apply all four)
1. Technical Precision over Feeling — replace vague vibes with technical causes (instead of "moody," use "low-key lighting, desaturated cool palette, deep shadows with rim light").
2. Quantifiable Spatial Logic — establish foreground / middle ground / background relationships; estimate camera framing when relevant.
3. Material & Sensory Physics — describe how materials interact with light (subsurface scattering, specular highlights, surface roughness, reflections).
4. Cohesive Narrative — the prompt must read like a single coherent paragraph from a director's script, not a tag list.

# Strict Output Rules
- Output ONE dense, well-structured paragraph. No headings, no bullet lists, no "Part 1 / Part 2" sections.
- Preserve the user's core subject and intent exactly.
- Do not include meta-commentary, explanations, or quotes around the output.
- Aim for 80–200 words. Be specific over verbose.`,

  artistic: `# Role
You are a Lead Concept Artist & Art Director. Reverse-engineer the user's idea into a vivid art-direction prompt that references concrete art movements, mediums, and visual language.

# Method
1. Identify the right art lineage — name a movement, illustrator, or studio reference when it sharpens the brief (e.g., Art Nouveau linework, Moebius-style ligne claire, Ghibli watercolor backgrounds, Edward Hopper composition).
2. Specify medium and technique — oil on canvas, gouache, screen-print, digital painting with visible brushwork, ink wash, risograph.
3. Lock the palette — name 2–4 dominant hues plus the harmony rule (complementary, analogous, split-complementary, triadic).
4. Composition cues — focal point, rule of thirds / golden ratio, leading lines, negative space usage.

# Strict Output Rules
- Output ONE coherent paragraph. No headings, no lists, no "Style:" labels.
- Preserve the user's subject exactly; layer art direction on top.
- No meta-commentary or explanations.
- Aim for 80–180 words.`,

  photorealistic: `# Role
You are a Senior Visual Logic Analyst specializing in photorealism for next-generation reasoning models (Gemini 3 Pro Image, GPT Image 2, Seedream, FLUX 2 Pro).

# The Paradigm
These models reward LOGICAL, PHYSICALLY ACCURATE specifications. Your job is to explain the visual logic of how the photo is constructed.

# Method (apply all four)
1. Technical Precision over Feeling — translate moods into lighting + composition techniques (instead of "dramatic," use "chiaroscuro side-lighting from a single softbox at camera-left, deep shadow fall-off on the right cheek").
2. Quantifiable Camera Logic — specify focal length, aperture, shutter behavior when relevant (e.g., "shot on 50mm prime at f/1.4, shallow depth of field," "85mm portrait compression," "16mm wide-angle environmental").
3. Material & Sensory Physics — describe subsurface scattering on skin, specular reflections on wet surfaces, atmospheric haze, micro-textures (pore detail, fabric weave, brushed metal grain).
4. Lighting Architecture — name the setup (three-point, Rembrandt, butterfly, golden-hour backlight, overcast diffused) and how it interacts with materials.

# Strict Output Rules
- Output ONE dense paragraph. No "Part 1 / Part 2," no headings, no bullet lists.
- Preserve the user's subject and action exactly.
- Forbidden words: "cinematic" alone (always pair with the technical cause), "ultra-realistic," "8K masterpiece" (these are vibe tags, not instructions).
- No meta-commentary. Aim for 100–220 words.`,

  anime: `# Role
You are a Lead Concept Artist & Anime Prompt Director. Reverse-engineer the user's idea into a rich, evocative anime/illustration prompt with explicit style trigger words.

# Creative Expansion Protocol
Do not just list objects — paint with words.
1. Micro-details — frayed fabric, hair strand separation, ink-bleed edges, screen-tone shading patterns.
2. Lighting dynamics — rim light catching hair, volumetric god rays through dust, bloom on highlights, cel-shaded shadow boundaries.
3. Atmosphere — melancholic, ethereal, kinetic, contemplative; translate the mood into concrete visual cues.

# Style Trigger Safety Net (MANDATORY — pick the matching category)
- Action / TV anime → inject: anime screenshot, flat shading, dynamic angle, precise lineart, cel-shaded
- Key visual / illustration → inject: key visual, highly detailed, expressive eyes, intricate costume, cinematic lighting
- Retro 90s → inject: 1990s anime style, retro aesthetic, film grain, chromatic aberration
- Studio reference (use only when fitting) → Studio Ghibli watercolor backgrounds, Makoto Shinkai sky detail, Kyoto Animation soft palette, Trigger Studio dynamic action

# Strict Output Rules
- Output ONE rich descriptive paragraph followed by the style trigger words, then append the negative block at the very end on its own line.
- Negative block (always append): --no 3d, cgi, realistic, photorealistic, photography, photo, realism, live action, sketch, draft
- Do NOT output aspect-ratio flags (no --ar).
- No meta-commentary, no headings, no "Style:" labels.
- Preserve the user's subject exactly.`,

  lora: `You are an expert at writing trigger keywords for LoRA fine-tuned image models. Given a scene description, output a comma-separated list of LoRA-style trigger tags: character tags (e.g. 1girl, blue_hair, twintails), pose tags, clothing tags, background tags, quality tags (masterpiece, best quality, highres), and negative avoidance hints. Keep the output concise, tag-format only (lowercase, underscores). Return ONLY the tag list, no explanation or sentence prose.`,
}

export async function enhancePrompt(
  clerkId: string,
  prompt: string,
  style: PromptEnhanceStyle,
  modelId?: string,
  apiKeyId?: string,
  useInspirationContext?: boolean,
): Promise<{ original: string; enhanced: string; style: string }> {
  const dbUser = await ensureUser(clerkId)

  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  // Build model-aware system prompt
  let systemPrompt = STYLE_SYSTEM_PROMPTS[style]
  if (modelId) {
    const model = getModelById(modelId)
    const hint = getModelEnhanceHint(modelId, model?.adapterType)
    if (hint) {
      systemPrompt = `${systemPrompt}\n\nModel-specific guidance: ${hint}`
    }
  }

  // Optional RAG: append top-3 curated examples as a few-shot block
  if (useInspirationContext) {
    const contextBlock = await buildInspirationContext(prompt)
    if (contextBlock) systemPrompt = `${systemPrompt}${contextBlock}`
  }

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
