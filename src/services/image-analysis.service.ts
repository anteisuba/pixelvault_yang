import 'server-only'

import { db } from '@/lib/db'
import type { AspectRatio } from '@/constants/config'
import type { GenerationRecord, GenerateVariationsModel } from '@/types'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { generateImageForUser } from '@/services/generate-image.service'
import {
  detectTrustedImageMime,
  fetchAsBuffer,
  generateStorageKey,
  isOwnedStorageUrl,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

const REVERSE_ENGINEER_SYSTEM_PROMPT = `You are an expert at describing images for AI image generation. Analyze the provided image and generate a detailed prompt that could recreate it. Include: subject matter, composition, style, lighting, color palette, mood, textures, and any notable artistic qualities. Return ONLY the prompt text, no explanation or preamble.`

// ─── Dimension-specific extraction prompts ──────────────────────

export type AnalysisDimension =
  | 'artStyle'
  | 'character'
  | 'background'
  | 'overall'
  | 'tags'

const DIMENSION_PROMPTS: Record<AnalysisDimension, string> = {
  artStyle:
    'Focus ONLY on the visual style of this image. Describe: art medium, technique, color palette, mood, lighting approach, brush strokes or texture, and artistic influences. Ignore specific characters, objects, or settings — extract only the style that could be applied to any subject.',
  character:
    'Focus ONLY on the characters or people in this image. Describe: physical appearance, hair, clothing, accessories, pose, expression, and body language. Ignore the background and art style.',
  background:
    'Focus ONLY on the environment and setting in this image. Describe: location, architecture, nature, weather, time of day, atmosphere, and spatial composition. Ignore any characters or people.',
  overall:
    'Describe this entire image as a complete, detailed AI image generation prompt that could recreate it. Include subject matter, composition, style, lighting, color palette, mood, textures, and artistic qualities.',
  tags: 'Output danbooru-style comma-separated tags that describe this image for anime/illustration AI models like NovelAI. Start with quality tags (masterpiece, best quality, highres), then character tags (hair color, eye color, clothing, pose, expression), then style tags (art style, coloring technique, lighting), then background tags. Use lowercase with underscores. Example format: masterpiece, best quality, 1girl, pink_hair, purple_eyes, white_dress, standing, smile, watercolor, soft_lighting, garden',
}

function buildDimensionSystemPrompt(dimensions: AnalysisDimension[]): string {
  if (dimensions.length === 1) {
    return `You are an expert at analyzing images for AI image generation. ${DIMENSION_PROMPTS[dimensions[0]]} Return ONLY the description text, no explanation or preamble.`
  }

  // Multiple dimensions → return JSON
  const fields = dimensions
    .map((d) => `  "${d}": "${DIMENSION_PROMPTS[d]}"`)
    .join('\n')

  return `You are an expert at analyzing images for AI image generation. Extract the requested dimensions from this image.

Return ONLY valid JSON with these fields:
{
${fields}
}

Each field should contain a detailed description for that dimension. Output in English. No explanation or preamble — only JSON.`
}

// ─── Public API ─────────────────────────────────────────────────

export interface AnalyzeImageResult {
  id: string
  generatedPrompt: string
  dimensions: Partial<Record<AnalysisDimension, string>> | null
  sourceImageUrl: string
}

/** ~10 MB — matches the route's data-URL string-length budget. */
export const ANALYSIS_MAX_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * Resolve `imageData` (data URL OR http(s) URL) into the `sourceImageUrl` we
 * persist on `ImageAnalysis`. We always want a self-hosted R2 URL so the
 * record stays valid after the original asset disappears.
 *
 *   - data URL → decode + upload to a fresh R2 key
 *   - http(s) URL pointing at our own R2 bucket → reuse the URL as-is
 *   - any other http(s) URL → fetch + re-upload (keeps records self-contained
 *     and prevents drift if the third-party origin disappears)
 */
interface ResolvedSourceUpload {
  /** Public R2 URL we persist on the ImageAnalysis row. */
  url: string
  /** Storage key — required by the schema, derived from the URL when reusing. */
  storageKey: string
}

/**
 * Strip the public storage base URL prefix off an owned R2 URL to recover
 * the underlying object key. Falls back to the full URL when the env var
 * isn't set (matches the legacy r2.dev path that callers may also pass).
 */
function deriveOwnedStorageKey(url: string): string {
  const base = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  if (base && url.startsWith(`${base}/`)) {
    return url.slice(base.length + 1)
  }
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return url
  }
}

async function resolveAnalysisSourceUrl(
  imageData: string,
  userId: string,
): Promise<ResolvedSourceUpload> {
  if (imageData.startsWith('data:')) {
    const { buffer } = await fetchAsBuffer(imageData, {
      maxBytes: ANALYSIS_MAX_IMAGE_BYTES,
    })
    const { mimeType } = await detectTrustedImageMime(buffer)
    const storageKey = generateStorageKey('IMAGE', userId)
    const url = await uploadToR2({ data: buffer, key: storageKey, mimeType })
    return { url, storageKey }
  }

  if (isOwnedStorageUrl(imageData)) {
    return { url: imageData, storageKey: deriveOwnedStorageKey(imageData) }
  }

  // Third-party URL — fetch and re-upload so the analysis row stays valid
  // if the original origin disappears. fetchAsBuffer enforces SSRF guards
  // and the size cap matches the route-level data-URL ceiling so users
  // can't trivially bypass it by passing a URL pointing at a huge file.
  const { buffer } = await fetchAsBuffer(imageData, {
    maxBytes: ANALYSIS_MAX_IMAGE_BYTES,
  })
  const { mimeType } = await detectTrustedImageMime(buffer)
  const storageKey = generateStorageKey('IMAGE', userId)
  const url = await uploadToR2({ data: buffer, key: storageKey, mimeType })
  return { url, storageKey }
}

export async function analyzeImage(
  clerkId: string,
  imageData: string,
  requestedDimensions?: AnalysisDimension[],
  apiKeyId?: string,
): Promise<AnalyzeImageResult> {
  const dbUser = await ensureUser(clerkId)

  const { url: sourceImageUrl, storageKey } = await resolveAnalysisSourceUrl(
    imageData,
    dbUser.id,
  )

  const route = await resolveLlmTextRoute(dbUser.id, apiKeyId)

  // Use dimension-based extraction if dimensions are specified
  const dims = requestedDimensions?.length ? requestedDimensions : null
  const systemPrompt = dims
    ? buildDimensionSystemPrompt(dims)
    : REVERSE_ENGINEER_SYSTEM_PROMPT
  const userPrompt = dims
    ? 'Analyze this image and extract the requested dimensions.'
    : 'Describe this image as a detailed AI image generation prompt.'

  const rawResult = await llmTextCompletion({
    systemPrompt,
    userPrompt,
    imageData: sourceImageUrl,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Parse result
  let generatedPrompt = rawResult
  let dimensions: Partial<Record<AnalysisDimension, string>> | null = null

  if (dims) {
    if (dims.length === 1) {
      // Single dimension → raw text is the result
      dimensions = { [dims[0]]: rawResult.trim() }
      generatedPrompt = rawResult.trim()
    } else {
      // Multiple dimensions → parse JSON
      try {
        const cleaned = rawResult
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim()
        const parsed = JSON.parse(cleaned) as Record<string, string>
        dimensions = {}
        for (const d of dims) {
          if (parsed[d]) {
            dimensions[d] = parsed[d]
          }
        }
        // Use overall as generatedPrompt, or join all dimensions
        generatedPrompt =
          parsed.overall ??
          Object.values(dimensions).filter(Boolean).join('\n\n')
      } catch {
        // JSON parse failed — use raw text as overall
        dimensions = { overall: rawResult.trim() }
        generatedPrompt = rawResult.trim()
      }
    }
  }

  // Save to DB
  const analysis = await db.imageAnalysis.create({
    data: {
      userId: dbUser.id,
      sourceImageUrl,
      sourceStorageKey: storageKey,
      generatedPrompt,
      modelUsed: route.adapterType,
    },
  })

  return {
    id: analysis.id,
    generatedPrompt: analysis.generatedPrompt,
    dimensions,
    sourceImageUrl: analysis.sourceImageUrl,
  }
}

export async function getAnalysisById(
  analysisId: string,
  clerkId: string,
): Promise<{
  id: string
  generatedPrompt: string
  sourceImageUrl: string
} | null> {
  const dbUser = await ensureUser(clerkId)

  const analysis = await db.imageAnalysis.findUnique({
    where: { id: analysisId },
  })

  if (!analysis || analysis.userId !== dbUser.id) return null

  return {
    id: analysis.id,
    generatedPrompt: analysis.generatedPrompt,
    sourceImageUrl: analysis.sourceImageUrl,
  }
}

export async function generateVariations(
  clerkId: string,
  analysisId: string,
  models: GenerateVariationsModel[],
  aspectRatio: AspectRatio,
): Promise<{ variations: GenerationRecord[]; failed: string[] }> {
  const dbUser = await ensureUser(clerkId)

  const analysis = await db.imageAnalysis.findUnique({
    where: { id: analysisId },
  })

  if (!analysis || analysis.userId !== dbUser.id) {
    throw new Error('Analysis not found')
  }

  const results = await Promise.allSettled(
    models.map((model) =>
      generateImageForUser(clerkId, {
        prompt: analysis.generatedPrompt,
        modelId: model.modelId,
        aspectRatio,
        apiKeyId: model.apiKeyId,
      }),
    ),
  )

  const variations: GenerationRecord[] = []
  const failed: string[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      variations.push(result.value)
    } else {
      failed.push(models[index].modelId)
    }
  })

  return { variations, failed }
}
