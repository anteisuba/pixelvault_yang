import 'server-only'

import crypto from 'crypto'
import { db } from '@/lib/db'
import { CARD_RECIPE } from '@/constants/card-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { z } from 'zod'
import {
  BackgroundAttributesSchema,
  StyleAttributesSchema,
  LoraSchema,
  type RecipeSnapshot,
  type AdvancedParams,
  type BackgroundAttributes,
  type StyleAttributes,
} from '@/types'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { logger } from '@/lib/logger'
import { validateRecipeFusion } from '@/lib/llm-output-validator'
import {
  getCivitaiTokenByInternalUserId,
  injectCivitaiToken,
} from '@/services/civitai-token.service'

// ─── Types ──────────────────────────────────────────────────────

export interface CompileRecipeInput {
  userId: string
  characterCardId?: string | null
  backgroundCardId?: string | null
  styleCardId?: string | null
  freePrompt?: string | null
}

export interface CompiledRecipe {
  compiledPrompt: string
  modelId: string
  adapterType: string
  advancedParams: AdvancedParams | null
  referenceImages: string[]
  snapshot: RecipeSnapshot
}

// ─── LLM System Prompts ─────────────────────────────────────────

// Model-specific prompt style hints used by the fusion system prompt
const MODEL_PROMPT_HINTS: Record<string, string> = {
  [AI_ADAPTER_TYPES.FAL]:
    'Target model: FLUX. Prefer photographic terminology, specific lens/camera details, precise lighting descriptions, and full natural language sentences.',
  [AI_ADAPTER_TYPES.NOVELAI]:
    'Target model: NovelAI (anime diffusion). Output as comma-separated danbooru-style tags. Include quality tags (masterpiece, best quality) at the start. Character tags before style and background tags.',
  [AI_ADAPTER_TYPES.GEMINI]:
    'Target model: Gemini image generation. Prefer natural, descriptive English sentences with rich visual detail.',
  [AI_ADAPTER_TYPES.VOLCENGINE]:
    'Target model: Seedream (VolcEngine). Prefer concise, clear descriptions. Works well with both English and Chinese.',
  [AI_ADAPTER_TYPES.OPENAI]:
    'Target model: GPT Image. Prefer detailed natural language descriptions with emphasis on composition and mood.',
  [AI_ADAPTER_TYPES.HUGGINGFACE]:
    'Target model: Stable Diffusion. Prefer comma-separated descriptive phrases with quality modifiers.',
  [AI_ADAPTER_TYPES.REPLICATE]:
    'Target model: Replicate hosted model. Prefer detailed natural language descriptions.',
}

function buildFusionSystemPrompt(adapterType: string): string {
  const modelHint =
    MODEL_PROMPT_HINTS[adapterType] ??
    'Prefer detailed natural language descriptions.'

  if (isTagBasedAdapter(adapterType)) {
    return `You are an expert AI image generation prompt composer. Given structured inputs (character description, background description, art style description, and user action/scene direction), compose a single coherent prompt.

${modelHint}

Rules:
- Do NOT simply concatenate the inputs. Understand the semantics and prioritize the most important visual elements.
- Most important tags first (subject, key features, then style, then background).
- Output ONLY the composed tags, no explanation or preamble.`
  }

  return `You are an expert AI image generation prompt composer. Given structured inputs (character description, background description, art style description, and user action/scene direction), compose a single coherent, high-quality image generation prompt.

${modelHint}

Rules:
- Do NOT simply concatenate the inputs. Understand the semantics and produce natural, flowing text.
- Start with the subject/character, then integrate the action, background, and style naturally.
- Be detailed and specific. Include visual details that help the AI model produce a high-quality image.
- Output ONLY the composed prompt text, no explanation or preamble.
- Output in English.`
}

const EXTRACT_BACKGROUND_SYSTEM_PROMPT = `You are an expert at analyzing backgrounds and environments in images. Given an image, extract structured attributes of the background/environment AND compose a generation-ready prompt fragment, all in one JSON response. Ignore any characters or people in the image — focus ONLY on the setting, environment, and atmosphere.

Return ONLY valid JSON matching this exact schema:
{
  "attributes": {
    "setting": "overall location description",
    "lighting": "lighting conditions",
    "timeOfDay": "time of day",
    "weather": "weather conditions",
    "architectureStyle": "architectural style if present",
    "colorPalette": "dominant background colors",
    "mood": "atmosphere/mood of the environment",
    "perspective": "camera angle / viewpoint (e.g. eye-level, bird's eye, low angle)",
    "depth": "spatial layers (e.g. foreground cobblestones, midground buildings, distant mountains)",
    "materialTexture": "dominant surface textures (e.g. wet asphalt, rough stone, polished wood)",
    "freeformDescription": "overall background description"
  },
  "prompt": "a single, detailed prompt fragment describing this environment for AI image generation"
}

Be specific and detailed. Focus on visually distinctive environmental traits that help reproduce this background consistently.`

const EXTRACT_STYLE_SYSTEM_PROMPT = `You are an expert at analyzing art styles in images. Given an image, extract the art style attributes AND compose a generation-ready prompt fragment, all in one JSON response. Ignore the content/subject matter — focus ONLY on HOW it is drawn/rendered/styled.

Return ONLY valid JSON matching this exact schema:
{
  "attributes": {
    "artStyle": "overall art style category",
    "medium": "rendering medium (digital, watercolor, oil, 3D, etc.)",
    "colorPalette": "color usage tendencies",
    "brushwork": "line/stroke characteristics",
    "composition": "composition tendencies",
    "mood": "visual mood/feeling",
    "era": "era or period influence",
    "influences": "notable artist or studio influences",
    "detailLevel": "level of detail (e.g. highly detailed, minimalist, sketchy)",
    "lineWeight": "line thickness tendency (e.g. thin precise lines, bold outlines, no outlines)",
    "contrast": "contrast level (e.g. high contrast, soft/muted, dramatic chiaroscuro)",
    "freeformDescription": "overall style description"
  },
  "prompt": "a single, detailed prompt fragment describing this visual style for AI image generation"
}

Be specific and detailed. Focus on style traits that can be reproduced across different subjects.`

// BUILD_*_PROMPT prompts removed — extraction now returns attributes + prompt in one call

// ─── In-memory Cache ────────────────────────────────────────────

interface CacheEntry {
  compiledPrompt: string
  expiresAt: number
}

const compiledPromptCache = new Map<string, CacheEntry>()

function getCacheKey(input: CompileRecipeInput): string {
  const parts = [
    input.characterCardId ?? '',
    input.backgroundCardId ?? '',
    input.styleCardId ?? '',
    input.freePrompt ?? '',
  ].join('|')
  return crypto.createHash('sha256').update(parts).digest('hex')
}

function getCachedPrompt(key: string): string | null {
  const entry = compiledPromptCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    compiledPromptCache.delete(key)
    return null
  }
  return entry.compiledPrompt
}

function setCachedPrompt(key: string, prompt: string): void {
  compiledPromptCache.set(key, {
    compiledPrompt: prompt,
    expiresAt: Date.now() + CARD_RECIPE.CACHE_TTL_MS,
  })
}

// ─── Card Loaders ───────────────────────────────────────────────

async function loadCharacterCard(id: string, userId: string) {
  return db.characterCard.findFirst({
    where: { id, userId, isDeleted: false },
    select: {
      id: true,
      name: true,
      characterPrompt: true,
      sourceImageUrl: true,
      referenceImages: true,
      loras: true,
    },
  })
}

async function loadBackgroundCard(id: string, userId: string) {
  return db.backgroundCard.findFirst({
    where: { id, userId, isDeleted: false },
    select: {
      id: true,
      name: true,
      backgroundPrompt: true,
      sourceImageUrl: true,
      loras: true,
    },
  })
}

async function loadStyleCard(id: string, userId: string) {
  return db.styleCard.findFirst({
    where: { id, userId, isDeleted: false },
    select: {
      id: true,
      name: true,
      stylePrompt: true,
      loras: true,
      modelId: true,
      adapterType: true,
      advancedParams: true,
    },
  })
}

// ─── Stage 1: Template Fallback ─────────────────────────────────

function compileWithTemplate(parts: {
  characterPrompt?: string
  backgroundPrompt?: string
  stylePrompt?: string
  freePrompt?: string
}): string {
  // Order: subject first → action → environment → style modifier
  const segments: string[] = []
  if (parts.characterPrompt) segments.push(parts.characterPrompt)
  if (parts.freePrompt) segments.push(parts.freePrompt)
  if (parts.backgroundPrompt) segments.push(parts.backgroundPrompt)
  if (parts.stylePrompt) segments.push(parts.stylePrompt)
  return segments.join(', ')
}

function truncatePrompt(prompt: string): string {
  if (prompt.length <= CARD_RECIPE.PROMPT_TRUNCATION_LIMIT) return prompt
  return prompt.slice(0, CARD_RECIPE.PROMPT_TRUNCATION_LIMIT) + '...'
}

// ─── Stage 2: LLM Fusion ───────────────────────────────────────

function isTagBasedAdapter(adapterType: string): boolean {
  return adapterType === AI_ADAPTER_TYPES.NOVELAI
}

async function compileWithLlm(
  userId: string,
  adapterType: string,
  parts: {
    characterPrompt?: string
    backgroundPrompt?: string
    stylePrompt?: string
    freePrompt?: string
  },
): Promise<string | null> {
  try {
    const route = await resolveLlmTextRoute(userId)
    const systemPrompt = buildFusionSystemPrompt(adapterType)

    const userMessage = [
      parts.characterPrompt
        ? `CHARACTER: ${truncatePrompt(parts.characterPrompt)}`
        : null,
      parts.backgroundPrompt
        ? `BACKGROUND: ${truncatePrompt(parts.backgroundPrompt)}`
        : null,
      parts.stylePrompt ? `STYLE: ${truncatePrompt(parts.stylePrompt)}` : null,
      parts.freePrompt
        ? `ACTION/SCENE: ${truncatePrompt(parts.freePrompt)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    if (!userMessage) return null

    const result = await Promise.race([
      llmTextCompletion({
        systemPrompt,
        userPrompt: userMessage,
        adapterType: route.adapterType,
        apiKey: route.apiKey,
        providerConfig: route.providerConfig,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('LLM fusion timeout')),
          CARD_RECIPE.LLM_FUSION_TIMEOUT_MS,
        ),
      ),
    ])

    const trimmed = result.trim()

    // Validate LLM fusion output
    const validation = validateRecipeFusion(trimmed, parts)
    if (!validation.usable) {
      logger.warn('LLM fusion output rejected', {
        reason: validation.reason,
        adapterType,
      })
      return null
    }
    if (validation.warnings.length > 0) {
      logger.info('LLM fusion warnings', { warnings: validation.warnings })
    }

    return validation.output
  } catch {
    // LLM fusion failed — caller should fall back to template
    return null
  }
}

// ─── Main Compiler ──────────────────────────────────────────────

export async function compileRecipe(
  input: CompileRecipeInput,
): Promise<CompiledRecipe> {
  const { userId } = input

  // Load all referenced cards in parallel
  const [charCard, bgCard, styleCard] = await Promise.all([
    input.characterCardId
      ? loadCharacterCard(input.characterCardId, userId)
      : null,
    input.backgroundCardId
      ? loadBackgroundCard(input.backgroundCardId, userId)
      : null,
    input.styleCardId ? loadStyleCard(input.styleCardId, userId) : null,
  ])

  // Determine model/adapter from StyleCard
  const modelId = styleCard?.modelId
  const adapterType = styleCard?.adapterType
  if (!modelId || !adapterType) {
    throw new Error('MISSING_MODEL_IN_STYLE: 请在画风卡中选择一个模型')
  }

  // Collect prompt parts
  const parts = {
    characterPrompt: charCard?.characterPrompt,
    backgroundPrompt: bgCard?.backgroundPrompt,
    stylePrompt: styleCard?.stylePrompt,
    freePrompt: input.freePrompt ?? undefined,
  }

  // Include adapterType in cache key (same recipe compiles differently for different models)
  const cacheKeyInput = {
    ...input,
    freePrompt: `${adapterType}|${input.freePrompt ?? ''}`,
  }
  const cacheKey = getCacheKey(cacheKeyInput)

  // Check cache
  let compiledPrompt = getCachedPrompt(cacheKey)

  if (!compiledPrompt) {
    // Stage 2: Try LLM fusion
    compiledPrompt = await compileWithLlm(userId, adapterType, parts)

    // Stage 1 fallback: Template-based compilation
    if (!compiledPrompt) {
      compiledPrompt = compileWithTemplate(parts)
    }

    // Cache the result
    if (compiledPrompt) {
      setCachedPrompt(cacheKey, compiledPrompt)
    }
  }

  if (!compiledPrompt) {
    compiledPrompt = input.freePrompt ?? ''
  }

  // Collect reference images (character card source image takes priority)
  const referenceImages: string[] = []
  if (charCard?.sourceImageUrl) {
    referenceImages.push(charCard.sourceImageUrl)
  }
  // Add character reference images if available
  const charRefImages = charCard?.referenceImages as string[] | null
  if (charRefImages?.length) {
    referenceImages.push(...charRefImages)
  }

  // Build snapshot for reproducibility
  const snapshot: RecipeSnapshot = {
    characterCard: charCard
      ? {
          id: charCard.id,
          name: charCard.name,
          characterPrompt: charCard.characterPrompt,
        }
      : undefined,
    backgroundCard: bgCard
      ? {
          id: bgCard.id,
          name: bgCard.name,
          backgroundPrompt: bgCard.backgroundPrompt,
        }
      : undefined,
    styleCard: styleCard
      ? {
          id: styleCard.id,
          name: styleCard.name,
          stylePrompt: styleCard.stylePrompt,
          modelId: styleCard.modelId ?? undefined,
          adapterType: styleCard.adapterType ?? undefined,
        }
      : undefined,
    freePrompt: input.freePrompt ?? undefined,
    compiledPrompt,
    compiledAt: new Date().toISOString(),
  }

  // Merge LoRAs from all card types (character → style → background)
  // Deduplicate by URL, trim to provider maxLoras limit
  type Lora = z.infer<typeof LoraSchema>
  const baseAdvancedParams =
    (styleCard?.advancedParams as AdvancedParams) ?? null
  const charLoras = (charCard?.loras as Lora[] | null) ?? []
  const bgLoras = (bgCard?.loras as Lora[] | null) ?? []
  const styleLoras = (styleCard?.loras as Lora[] | null) ?? []
  const styleParamLoras = baseAdvancedParams?.loras ?? []

  const seenUrls = new Set<string>()
  const mergedLoras: Lora[] = []
  for (const lora of [
    ...charLoras,
    ...styleLoras,
    ...styleParamLoras,
    ...bgLoras,
  ]) {
    if (!seenUrls.has(lora.url)) {
      seenUrls.add(lora.url)
      mergedLoras.push(lora)
    }
  }
  // Trim to provider max (FAL: 5, Replicate: 1)
  const maxLoras = adapterType === AI_ADAPTER_TYPES.REPLICATE ? 1 : 5
  const trimmedLoras = mergedLoras.slice(0, maxLoras)

  // Inject Civitai token into LoRA URLs that need it
  let lorasWithToken = trimmedLoras
  if (trimmedLoras.some((l) => l.url.includes('civitai.com'))) {
    const civitaiToken = await getCivitaiTokenByInternalUserId(userId).catch(
      () => null,
    )
    if (civitaiToken) {
      lorasWithToken = trimmedLoras.map((l) => ({
        ...l,
        url: injectCivitaiToken(l.url, civitaiToken),
      }))
    }
  }

  const finalAdvancedParams: AdvancedParams | null =
    lorasWithToken.length > 0
      ? { ...baseAdvancedParams, loras: lorasWithToken }
      : baseAdvancedParams

  return {
    compiledPrompt,
    modelId,
    adapterType,
    advancedParams: finalAdvancedParams,
    referenceImages,
    snapshot,
  }
}

// ─── Stage 1 Preview (for real-time UI, no LLM call) ───────────

export async function previewRecipe(
  input: CompileRecipeInput,
): Promise<string> {
  const { userId } = input

  const [charCard, bgCard, styleCard] = await Promise.all([
    input.characterCardId
      ? loadCharacterCard(input.characterCardId, userId)
      : null,
    input.backgroundCardId
      ? loadBackgroundCard(input.backgroundCardId, userId)
      : null,
    input.styleCardId ? loadStyleCard(input.styleCardId, userId) : null,
  ])

  return compileWithTemplate({
    characterPrompt: charCard?.characterPrompt,
    backgroundPrompt: bgCard?.backgroundPrompt,
    stylePrompt: styleCard?.stylePrompt,
    freePrompt: input.freePrompt ?? undefined,
  })
}

// ─── Image Extraction Helpers ───────────────────────────────────

/** Parse LLM JSON response, stripping markdown fences */
function parseLlmJson(raw: string): unknown {
  const cleaned = raw
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()
  return JSON.parse(cleaned)
}

export async function extractBackgroundAttributes(
  userId: string,
  imageData: string,
): Promise<{ attributes: BackgroundAttributes; prompt: string }> {
  const route = await resolveLlmTextRoute(userId)

  // Single LLM call returns both attributes + prompt
  const raw = await llmTextCompletion({
    systemPrompt: EXTRACT_BACKGROUND_SYSTEM_PROMPT,
    userPrompt:
      'Analyze this image and extract the background/environment attributes and a generation-ready prompt.',
    imageData,
    adapterType: route.adapterType,
    apiKey: route.apiKey,
    providerConfig: route.providerConfig,
  })

  try {
    const parsed = parseLlmJson(raw) as {
      attributes?: unknown
      prompt?: string
    }
    const attrResult = BackgroundAttributesSchema.safeParse(
      parsed.attributes ?? parsed,
    )
    const attributes = attrResult.success
      ? attrResult.data
      : { freeformDescription: raw }
    const prompt =
      typeof parsed.prompt === 'string' ? parsed.prompt.trim() : raw.trim()
    return { attributes, prompt }
  } catch {
    return { attributes: { freeformDescription: raw }, prompt: raw.trim() }
  }
}

export async function extractStyleAttributes(
  userId: string,
  imageData: string,
): Promise<{ attributes: StyleAttributes; prompt: string }> {
  const route = await resolveLlmTextRoute(userId)

  // Single LLM call returns both attributes + prompt
  const raw = await llmTextCompletion({
    systemPrompt: EXTRACT_STYLE_SYSTEM_PROMPT,
    userPrompt:
      'Analyze this image and extract the art style attributes and a generation-ready prompt.',
    imageData,
    adapterType: route.adapterType,
    apiKey: route.apiKey,
    providerConfig: route.providerConfig,
  })

  try {
    const parsed = parseLlmJson(raw) as {
      attributes?: unknown
      prompt?: string
    }
    const attrResult = StyleAttributesSchema.safeParse(
      parsed.attributes ?? parsed,
    )
    const attributes = attrResult.success
      ? attrResult.data
      : { freeformDescription: raw }
    const prompt =
      typeof parsed.prompt === 'string' ? parsed.prompt.trim() : raw.trim()
    return { attributes, prompt }
  } catch {
    return { attributes: { freeformDescription: raw }, prompt: raw.trim() }
  }
}
