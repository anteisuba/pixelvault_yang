import 'server-only'

import { db } from '@/lib/db'
import { CHARACTER_CARD } from '@/constants/cards/character-card'
import { RESEARCH_CONCLUSION_BASES } from '@/constants/research'
import { VISION_TASKS } from '@/constants/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import {
  CharacterAttributesSchema,
  type CharacterCardRecord,
  type CharacterAttributes,
  type CreateCharacterCardRequest,
  type UpdateCharacterCardRequest,
  type SourceImageEntry,
  type SourceImageUpload,
} from '@/types'
import type {
  VisionCharacterIdentity,
  VisionClaim,
  VisionNamedClaim,
} from '@/types/vision'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { analyzeVisual } from '@/services/vision/vision-analyzer.service'
import {
  mapCharacterCardRow,
  serializeCharacterAttributes,
  serializeCharacterLoras,
  serializeSourceImageEntries,
} from '@/services/cards/character-card.mapper'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { ownedBy } from '@/lib/db-scope'

// ─── System Prompts ────────────────────────────────────────────

// ─── Web Search Enhancement ──────────────────────────────────

const SEARCH_CHARACTER_SYSTEM_PROMPT = `You are an expert at researching anime, game, and illustration characters. Given a character name (and optionally an image), search the web and gather key visual information about this character.

Return ONLY valid JSON matching this exact schema (all fields optional strings):
{
  "officialName": "character's official full name",
  "franchise": "source franchise / game / anime",
  "hairColor": "canonical hair color",
  "hairStyle": "canonical hair style",
  "eyeColor": "canonical eye color",
  "outfit": "signature outfit description",
  "accessories": "signature accessories",
  "artStyle": "typical art style of the franchise",
  "distinguishingFeatures": "iconic visual traits that fans would recognize",
  "colorPalette": "character's signature colors",
  "backgroundInfo": "brief character background that helps with visual consistency"
}

Focus on VISUAL attributes that help AI image generators reproduce the character accurately. Be specific about colors and design details.`

/**
 * Search the web for character information using LLM with grounding.
 * Returns supplementary attributes to merge with image-extracted ones.
 */
async function searchCharacterInfo(
  clerkId: string,
  characterName: string,
  imageData?: string,
  apiKeyId?: string,
): Promise<CharacterAttributes | null> {
  try {
    const dbUser = await ensureUser(clerkId)
    const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

    const raw = await llmTextCompletion({
      systemPrompt: SEARCH_CHARACTER_SYSTEM_PROMPT,
      userPrompt: `Search for information about the character "${characterName}" and extract their visual attributes as JSON.`,
      imageData: imageData || undefined,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
      useGrounding: true,
    })

    const jsonStr = raw
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const parsed = JSON.parse(jsonStr)
    const result = CharacterAttributesSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch {
    // Search is best-effort — if it fails, we still have image extraction
  }
  return null
}

// ─── Attribute Extraction ──────────────────────────────────────

/**
 * `basis:'unknown'` 的槽位**不进属性表**。
 *
 * 这是收编时最实质的一处行为变化：属性会被 `buildPromptFromAttributes` 直接拼进
 * 生成提示词，而「我不知道她的发色」拼进去就变成一句关于发色的胡话。观察不到就
 * 留空 —— 空字段下游会跳过，编出来的字段下游会当真。
 */
function claimValue(
  claim: VisionClaim | VisionNamedClaim | undefined,
): string | undefined {
  if (!claim) return undefined
  if (claim.basis === RESEARCH_CONCLUSION_BASES.unknown) return undefined
  return claim.text
}

/**
 * Vision Analyzer 的 `character_identity` 观察 → 现有的 `CharacterAttributes` 形状。
 *
 * 槽位是一一对应的（`types/vision.ts` 的身份层/可变层就是按这 13 个字段切的），
 * 所以映射无损。**丢的只有元数据**：每条的 `basis` 和整包的 `uncertainties[]` ——
 * `CharacterAttributes` 里没有它们的位置，而给它加字段会波及 141 个文件。
 * 要看依据去读那一行 `ResearchRun`（`analyzeVisual` 已经把它落了）。
 */
export function mapVisionIdentityToAttributes(
  observations: VisionCharacterIdentity,
): CharacterAttributes {
  const { identity, variableLayer } = observations
  const mapped: CharacterAttributes = {
    hairColor: claimValue(identity.hairColor),
    hairStyle: claimValue(identity.hairStyle),
    eyeColor: claimValue(identity.eyeColor),
    skinTone: claimValue(identity.skinTone),
    bodyType: claimValue(identity.bodyType),
    outfit: claimValue(variableLayer.outfit),
    accessories: claimValue(variableLayer.accessories),
    pose: claimValue(variableLayer.pose),
    expression: claimValue(variableLayer.expression),
    artStyle: claimValue(observations.artStyle),
    colorPalette: claimValue(identity.colorPalette),
    distinguishingFeatures: claimValue(identity.distinguishingFeatures),
    freeformDescription: claimValue(observations.summary),
  }

  // 过一遍既有 schema：长度上限（发色 50、outfit 300…）由它来裁，
  // 别在这里复制一套第二份长度规则。
  const parsed = CharacterAttributesSchema.safeParse(mapped)
  return parsed.success ? parsed.data : mapped
}

/**
 * Extract structured character attributes from an image.
 *
 * **收编（切片 2）**：这条链原来自成一路 —— 自己的 system prompt、自己的
 * `JSON.parse`、自己的「解析失败就把整段原文塞进 freeformDescription」兜底。
 * 现在它调 Vision Analyzer 的 `character_identity` 任务，于是白拿三件事：
 * 借路（选了 DeepSeek 也能看图）、结构化校验 + 打回重试一次、每条观察带 `basis`
 * 并落一行 `ResearchRun`。
 *
 * ⚠ **两处行为变化，是有意的**：
 *  1. 解析失败不再降级成一段自由文本 —— 重试一次仍不合规就抛。原来的兜底会产出
 *     一张字段全空、只有一段模型碎碎念的角色卡，看起来建成了其实没用。
 *  2. `basis:'unknown'` 的槽位留空，不再让模型的「大概是」进提示词。
 *
 * ⛔ 返回形状与调用方签名一律不变（`CharacterAttributes`），也**不写 CharacterCard**
 * ——建卡仍然是 `createCharacterCard` 的事（边界 13 角色卡冻结）。
 */
export async function extractCharacterAttributes(
  clerkId: string,
  imageData: string,
  apiKeyId?: string,
): Promise<CharacterAttributes> {
  const dbUser = await ensureUser(clerkId)

  const analysis = await analyzeVisual({
    userId: dbUser.id,
    // 角色卡没有自己的助手槽位；图片工作台是离它最近的那个域。
    surface: ASSISTANT_SURFACE_IDS.imageStudio,
    task: VISION_TASKS.characterIdentity,
    mediaUrls: [imageData],
    routeHint: apiKeyId,
  })

  return mapVisionIdentityToAttributes(analysis.observations)
}

/**
 * Build a natural language prompt from structured attributes.
 */
export function buildPromptFromAttributes(
  attributes: CharacterAttributes,
): string {
  const parts: string[] = []

  if (attributes.artStyle) parts.push(attributes.artStyle)
  if (attributes.expression) parts.push(`${attributes.expression} expression`)
  if (attributes.hairColor || attributes.hairStyle) {
    const hair = [attributes.hairColor, attributes.hairStyle]
      .filter(Boolean)
      .join(' ')
    parts.push(`${hair} hair`)
  }
  if (attributes.eyeColor) parts.push(`${attributes.eyeColor} eyes`)
  if (attributes.skinTone) parts.push(`${attributes.skinTone} skin`)
  if (attributes.bodyType) parts.push(attributes.bodyType)
  if (attributes.outfit) parts.push(`wearing ${attributes.outfit}`)
  if (attributes.accessories) parts.push(`with ${attributes.accessories}`)
  if (attributes.pose) parts.push(attributes.pose)
  if (attributes.distinguishingFeatures)
    parts.push(attributes.distinguishingFeatures)
  if (attributes.colorPalette)
    parts.push(`color palette: ${attributes.colorPalette}`)

  if (parts.length === 0 && attributes.freeformDescription) {
    return attributes.freeformDescription
  }

  const composed = parts.join(', ')
  if (attributes.freeformDescription) {
    return `${composed}. ${attributes.freeformDescription}`
  }
  return composed
}

// ─── Multi-Image Attribute Merging ─────────────────────────────

const MERGE_ATTRIBUTES_SYSTEM_PROMPT = `You are an expert at analyzing character consistency across multiple images. Given multiple JSON attribute sets extracted from different images of the SAME character, merge them into one canonical set.

Rules:
- For each field, pick the value that appears most consistently across images
- If values conflict, choose the most specific/detailed one
- Ignore pose and expression (these vary across images) — leave them empty
- The freeformDescription should synthesize the character's overall appearance from all images

Return ONLY valid JSON matching the same schema as the inputs.`

/**
 * Merge multiple attribute sets into one canonical set.
 * Uses LLM to intelligently pick the most consistent values.
 */
async function mergeAttributes(
  clerkId: string,
  attributeSets: CharacterAttributes[],
  apiKeyId?: string,
): Promise<CharacterAttributes> {
  if (attributeSets.length === 1) return attributeSets[0]

  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  const raw = await llmTextCompletion({
    systemPrompt: MERGE_ATTRIBUTES_SYSTEM_PROMPT,
    userPrompt: `Merge these ${attributeSets.length} attribute sets from different images of the same character:\n\n${JSON.stringify(attributeSets, null, 2)}`,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  const jsonStr = raw
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  try {
    const parsed = JSON.parse(jsonStr)
    const result = CharacterAttributesSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch {
    // fall through
  }

  // Fallback: use the first set
  return attributeSets[0]
}

/**
 * Upload a single image (base64 or URL) to R2, return the URL.
 */
async function uploadSourceImage(
  imageData: string,
  userId: string,
): Promise<{ url: string; storageKey: string }> {
  if (imageData.startsWith('https://')) {
    return { url: imageData, storageKey: '' }
  }

  const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/)
  if (!dataUrlMatch) throw new Error('Invalid image data format')

  const mimeType = dataUrlMatch[1]
  const buffer = Buffer.from(dataUrlMatch[2], 'base64')
  const storageKey = generateStorageKey('IMAGE', userId)
  const url = await uploadToR2({ data: buffer, key: storageKey, mimeType })
  return { url, storageKey }
}

// ─── CRUD Operations ───────────────────────────────────────────

/** Normalize source image input — accept both plain strings and SourceImageUpload objects */
function normalizeSourceImages(
  images: (string | SourceImageUpload)[],
): { data: string; viewType: SourceImageEntry['viewType']; label?: string }[] {
  return images.map((img) => {
    if (typeof img === 'string') {
      return { data: img, viewType: 'other' as const }
    }
    return { data: img.data, viewType: img.viewType, label: img.label }
  })
}

/**
 * Create a new character card: upload source images, extract & merge attributes, build prompt.
 * Supports variants via parentId — creating a style variant under an existing card.
 */
export async function createCharacterCard(
  clerkId: string,
  input: CreateCharacterCardRequest,
): Promise<CharacterCardRecord> {
  const dbUser = await ensureUser(clerkId)

  // Check card limit
  const count = await db.characterCard.count({
    where: { ...ownedBy(dbUser.id), isDeleted: false },
  })
  if (count >= CHARACTER_CARD.MAX_CARDS_PER_USER) {
    throw new Error(
      `Maximum ${CHARACTER_CARD.MAX_CARDS_PER_USER} character cards allowed`,
    )
  }

  // If creating as variant, verify parent ownership + variant limit
  if (input.parentId) {
    const parent = await db.characterCard.findUnique({
      where: { id: input.parentId },
      include: {
        _count: { select: { variants: { where: { isDeleted: false } } } },
      },
    })
    if (!parent || parent.userId !== dbUser.id || parent.isDeleted) {
      throw new Error('Parent card not found')
    }
    if (parent._count.variants >= CHARACTER_CARD.MAX_VARIANTS_PER_CARD) {
      throw new Error(
        `Maximum ${CHARACTER_CARD.MAX_VARIANTS_PER_CARD} variants per card`,
      )
    }
  }

  // Normalize source images (support both string and SourceImageUpload)
  const normalizedImages = normalizeSourceImages(input.sourceImages)

  // Upload all source images to R2
  const uploadResults = await Promise.all(
    normalizedImages.map((img) => uploadSourceImage(img.data, dbUser.id)),
  )
  const sourceImageUrls = uploadResults.map((r) => r.url)
  const primaryUrl = sourceImageUrls[0]
  const primaryStorageKey = uploadResults[0].storageKey

  // Build structured source image entries with view types
  const sourceImageEntries: SourceImageEntry[] = uploadResults.map((r, i) => ({
    url: r.url,
    viewType: normalizedImages[i].viewType,
    label: normalizedImages[i].label,
  }))

  // Extract attributes from each image + search web for character info in parallel
  const [imageAttributeSets, webAttributes] = await Promise.all([
    Promise.all(
      normalizedImages.map((img) =>
        extractCharacterAttributes(clerkId, img.data, input.apiKeyId),
      ),
    ),
    searchCharacterInfo(
      clerkId,
      input.name,
      normalizedImages[0]?.data,
      input.apiKeyId,
    ),
  ])

  // Combine image-extracted + web-searched attributes, then merge
  const attributeSets = webAttributes
    ? [...imageAttributeSets, webAttributes]
    : imageAttributeSets

  // Merge attributes across all sources to find common traits
  const attributes = await mergeAttributes(
    clerkId,
    attributeSets,
    input.apiKeyId,
  )

  // Build initial prompt from merged attributes
  const characterPrompt = buildPromptFromAttributes(attributes)

  // Create DB record
  const card = await db.characterCard.create({
    data: {
      userId: dbUser.id,
      name: input.name,
      description: input.description ?? null,
      sourceImageUrl: primaryUrl,
      sourceStorageKey: primaryStorageKey,
      sourceImages: sourceImageUrls,
      sourceImageEntries: serializeSourceImageEntries(sourceImageEntries),
      characterPrompt,
      attributes: serializeCharacterAttributes(attributes),
      tags: input.tags ?? [],
      status: 'DRAFT',
      parentId: input.parentId ?? null,
      variantLabel: input.variantLabel ?? null,
    },
  })

  return mapCharacterCardRow(card)
}

/**
 * List all non-deleted root character cards for a user, with their variants nested.
 */
export async function listCharacterCards(
  clerkId: string,
): Promise<CharacterCardRecord[]> {
  const dbUser = await ensureUser(clerkId)

  const cards = await db.characterCard.findMany({
    where: { userId: dbUser.id, isDeleted: false, parentId: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      variants: {
        where: { isDeleted: false },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  return cards.map((card) => mapCharacterCardRow(card))
}

/**
 * Get a single character card by ID, with ownership check.
 */
export async function getCharacterCard(
  clerkId: string,
  cardId: string,
): Promise<CharacterCardRecord | null> {
  const dbUser = await ensureUser(clerkId)

  const card = await db.characterCard.findUnique({
    where: { id: cardId },
    include: {
      variants: {
        where: { isDeleted: false },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  if (!card || card.userId !== dbUser.id || card.isDeleted) return null

  return mapCharacterCardRow(card)
}

/**
 * Update a character card (name, description, tags, prompt, attributes, status).
 */
export async function updateCharacterCard(
  clerkId: string,
  cardId: string,
  data: UpdateCharacterCardRequest,
): Promise<CharacterCardRecord | null> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.characterCard.findUnique({
    where: { id: cardId },
  })

  if (!existing || existing.userId !== dbUser.id || existing.isDeleted)
    return null

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.tags !== undefined) updateData.tags = data.tags
  if (data.status !== undefined) updateData.status = data.status
  if (data.characterPrompt !== undefined)
    updateData.characterPrompt = data.characterPrompt
  if (data.attributes !== undefined)
    updateData.attributes = serializeCharacterAttributes(data.attributes)
  if (data.variantLabel !== undefined)
    updateData.variantLabel = data.variantLabel
  if (data.sourceImageEntries !== undefined)
    updateData.sourceImageEntries = serializeSourceImageEntries(
      data.sourceImageEntries,
    )
  if (data.loras !== undefined)
    updateData.loras = data.loras ? serializeCharacterLoras(data.loras) : null

  const card = await db.characterCard.update({
    where: { id: cardId },
    data: updateData,
    include: {
      variants: {
        where: { isDeleted: false },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  return mapCharacterCardRow(card)
}

/**
 * Soft-delete a character card.
 */
export async function deleteCharacterCard(
  clerkId: string,
  cardId: string,
): Promise<boolean> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.characterCard.findUnique({
    where: { id: cardId },
  })

  if (!existing || existing.userId !== dbUser.id || existing.isDeleted)
    return false

  await db.characterCard.update({
    where: { id: cardId },
    data: { isDeleted: true },
  })

  return true
}
