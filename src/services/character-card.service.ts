import 'server-only'

import { db } from '@/lib/db'
import { CHARACTER_CARD } from '@/constants/character-card'
import {
  CharacterAttributesSchema,
  type CharacterCardRecord,
  type CharacterAttributes,
  type CreateCharacterCardRequest,
  type UpdateCharacterCardRequest,
  type SourceImageEntry,
  type SourceImageUpload,
} from '@/types'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

// ─── System Prompts ────────────────────────────────────────────

const EXTRACT_ATTRIBUTES_SYSTEM_PROMPT = `You are an expert at analyzing anime, game, and illustration characters. Given an image of a character, extract structured attributes as JSON.

Return ONLY valid JSON matching this exact schema (all fields optional strings):
{
  "hairColor": "color description",
  "hairStyle": "style description",
  "eyeColor": "color description",
  "skinTone": "tone description",
  "bodyType": "build description",
  "outfit": "clothing description",
  "accessories": "accessories description",
  "pose": "pose description",
  "expression": "facial expression",
  "artStyle": "art style (anime, realistic, etc.)",
  "colorPalette": "dominant colors",
  "distinguishingFeatures": "unique features that identify this character",
  "freeformDescription": "overall character description for generation"
}

Be specific and detailed. Focus on visually distinctive traits that would help an AI model reproduce this character consistently. Do NOT include background or setting details — focus only on the character.`

const BUILD_PROMPT_SYSTEM_PROMPT = `You are an expert at writing AI image generation prompts. Given structured character attributes as JSON, compose a single detailed prompt that would generate an image of this character.

The prompt should be natural language, detailed, and focused on the character's appearance. Include all provided attributes. Do NOT add background, setting, or action unless explicitly stated in the attributes.

Return ONLY the prompt text, no explanation or preamble.`

// ─── Helpers ───────────────────────────────────────────────────

/** DB row shape for CharacterCard (with optional variant relations) */
interface DbCharacterCardRow {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string
  sourceImages: unknown
  sourceImageEntries: unknown
  characterPrompt: string
  modelPrompts: unknown
  referenceImages: unknown
  attributes: unknown
  loras: unknown
  tags: string[]
  status: string
  stabilityScore: number | null
  parentId: string | null
  variantLabel: string | null
  createdAt: Date
  updatedAt: Date
  variants?: DbCharacterCardRow[]
}

/** Map DB CharacterCard row to API response record */
function toRecord(row: DbCharacterCardRow): CharacterCardRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceImageUrl: row.sourceImageUrl,
    sourceImages: (row.sourceImages as string[]) ?? [row.sourceImageUrl],
    sourceImageEntries: (row.sourceImageEntries as SourceImageEntry[]) ?? [],
    characterPrompt: row.characterPrompt,
    modelPrompts: (row.modelPrompts as Record<string, string>) ?? null,
    referenceImages: (row.referenceImages as string[]) ?? null,
    attributes: (row.attributes as CharacterAttributes) ?? null,
    loras: (row.loras as CharacterCardRecord['loras']) ?? null,
    tags: row.tags,
    status: row.status as CharacterCardRecord['status'],
    stabilityScore: row.stabilityScore,
    parentId: row.parentId,
    variantLabel: row.variantLabel,
    variants: (row.variants ?? []).map(toRecord),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

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
 * Extract structured character attributes from an image using LLM vision.
 */
export async function extractCharacterAttributes(
  clerkId: string,
  imageData: string,
  apiKeyId?: string,
): Promise<CharacterAttributes> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  const raw = await llmTextCompletion({
    systemPrompt: EXTRACT_ATTRIBUTES_SYSTEM_PROMPT,
    userPrompt:
      'Analyze this character image and extract structured attributes as JSON.',
    imageData,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Parse LLM JSON output — strip markdown fences if present
  const jsonStr = raw
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  try {
    const parsed = JSON.parse(jsonStr)
    const result = CharacterAttributesSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch {
    // JSON parse failed — fall through to fallback
  }

  // Fallback: treat entire LLM output as freeform description
  return { freeformDescription: raw.slice(0, 2000) }
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
    where: { userId: dbUser.id, isDeleted: false },
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
      sourceImageEntries: JSON.parse(JSON.stringify(sourceImageEntries)),
      characterPrompt,
      attributes: JSON.parse(JSON.stringify(attributes)),
      tags: input.tags ?? [],
      status: 'DRAFT',
      parentId: input.parentId ?? null,
      variantLabel: input.variantLabel ?? null,
    },
  })

  return toRecord(card as DbCharacterCardRow)
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

  return cards.map((c) => toRecord(c as unknown as DbCharacterCardRow))
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

  return toRecord(card as unknown as DbCharacterCardRow)
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
    updateData.attributes = JSON.parse(JSON.stringify(data.attributes))
  if (data.variantLabel !== undefined)
    updateData.variantLabel = data.variantLabel
  if (data.sourceImageEntries !== undefined)
    updateData.sourceImageEntries = JSON.parse(
      JSON.stringify(data.sourceImageEntries),
    )
  if (data.loras !== undefined)
    updateData.loras = data.loras
      ? JSON.parse(JSON.stringify(data.loras))
      : null

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

  return toRecord(card as unknown as DbCharacterCardRow)
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
