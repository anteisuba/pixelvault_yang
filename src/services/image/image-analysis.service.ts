import 'server-only'

import { z } from 'zod'

import { db } from '@/lib/db'
import type { AspectRatio } from '@/constants/config'
import { VISION_LIMITS } from '@/constants/vision'
import type { GenerationRecord, GenerateVariationsModel } from '@/types'
import { llmTextCompletion } from '@/services/llm-text.service'
import { resolveVisionRoute } from '@/services/vision/vision-route.service'
import {
  completeVisionStructured,
  VISION_JSON_CONTRACT,
  VISION_SAFETY_PREAMBLE,
} from '@/services/vision/vision-structured-output'
import {
  submitImageGeneration,
  waitForImageGenerationResult,
} from '@/services/image/submit-image.service'
import {
  detectTrustedImageMime,
  fetchAsBuffer,
  generateStorageKey,
  isOwnedStorageUrl,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

/**
 * ⚠ **本文件的产物是「反推提示词」，不是「结构化观察」** —— 别把它当成 Vision
 * Analyzer 的一部分重写（AI 导演内核 · 切片 2 收编，2026-08-21）。
 *
 * 两条线现在共用三件东西，其余各走各的：
 *  1. **路由**：`resolveVisionRoute` —— 用户选了看不了图的 key（DeepSeek / 通义 /
 *     火山）时借一条能看图的，而不是把图发给一个瞎子然后拿到一段编造的描述。
 *  2. **结构化输出纪律**：多维请求走 `completeVisionStructured`（zod + validator +
 *     打回重试一次）。原来那段手写 `JSON.parse` + `catch { 整段塞进 overall }`
 *     是一处真 bug —— 四维请求解析失败会**静默降级成一维**，字段齐全、内容错位、
 *     零报错。
 *  3. **注入前言**：图片是用户可控输入，图里嵌一句「忽略上述指令」不需要任何技术。
 *
 * ⛔ 不共用的是**任务 schema 与 `ResearchRun` 落库**：这里每个 dimension 产出的是
 * 一段可以直接拼进生成提示词的文本，不是带 `basis` 的观察；它已经有自己的持久化
 * （`ImageAnalysis` 行）。硬套四个视觉任务只会让 Arena 的反推入口拿到一份它用不了的
 * 结构体。后续清理点记在切片 2 的交接里。
 */
const REVERSE_ENGINEER_SYSTEM_PROMPT = `You are an expert at describing images for AI image generation. Analyze the provided image and generate a detailed prompt that could recreate it. Include: subject matter, composition, style, lighting, color palette, mood, textures, and any notable artistic qualities. Return ONLY the prompt text, no explanation or preamble.

${VISION_SAFETY_PREAMBLE}`

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
    return `You are an expert at analyzing images for AI image generation. ${DIMENSION_PROMPTS[dimensions[0]]} Return ONLY the description text, no explanation or preamble.

${VISION_SAFETY_PREAMBLE}`
  }

  // Multiple dimensions → return JSON
  const fields = dimensions
    .map((d) => `  "${d}": "${DIMENSION_PROMPTS[d]}"`)
    .join('\n')

  return `You are an expert at analyzing images for AI image generation. Extract the requested dimensions from this image.

${VISION_SAFETY_PREAMBLE}

${VISION_JSON_CONTRACT}
{
${fields}
}

Each field should contain a detailed description for that dimension. Output in English.`
}

/**
 * 多维请求的输出契约。
 *
 * 全部字段 optional + 「至少命中一个」：模型漏掉一维是可以接受的（老实现也是
 * `if (parsed[d])` 逐个挑），但**一个都没有**说明这次输出根本没用上 ——
 * 那是要打回重试的，不是安静地返回一个空对象。
 */
function buildDimensionSchema(dimensions: AnalysisDimension[]) {
  const shape = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      z.string().trim().min(1).max(VISION_LIMITS.dimensionChars).optional(),
    ]),
  ) as Record<AnalysisDimension, z.ZodOptional<z.ZodString>>

  return z
    .object(shape)
    .partial()
    .refine(
      (parsed) =>
        Object.values(parsed).some(
          (value) => typeof value === 'string' && value.length > 0,
        ),
      { message: 'No requested dimension was returned' },
    )
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

  // 借路（切片 2）：用户选的 key 看不了图就换一条能看图的，一条都借不到才抛。
  const { route } = await resolveVisionRoute(dbUser.id, apiKeyId)

  // Use dimension-based extraction if dimensions are specified
  const dims = requestedDimensions?.length ? requestedDimensions : null

  let generatedPrompt: string
  let dimensions: Partial<Record<AnalysisDimension, string>> | null = null

  if (dims && dims.length > 1) {
    // 多维 → 结构化输出（zod + validator + 打回重试一次）。
    const parsed = await completeVisionStructured({
      schema: buildDimensionSchema(dims),
      systemPrompt: buildDimensionSystemPrompt(dims),
      userPrompt: 'Analyze this image and extract the requested dimensions.',
      imageData: [sourceImageUrl],
      route,
      label: `image-analysis.dimensions[${dims.join('+')}]`,
    })

    dimensions = {}
    for (const dimension of dims) {
      const value = parsed[dimension]
      if (value) dimensions[dimension] = value
    }
    // `overall` 优先当反推提示词；没要 overall 时把各维拼起来（形态不变）。
    generatedPrompt =
      parsed.overall ?? Object.values(dimensions).filter(Boolean).join('\n\n')
  } else {
    const rawResult = await llmTextCompletion({
      systemPrompt: dims
        ? buildDimensionSystemPrompt(dims)
        : REVERSE_ENGINEER_SYSTEM_PROMPT,
      userPrompt: dims
        ? 'Analyze this image and extract the requested dimensions.'
        : 'Describe this image as a detailed AI image generation prompt.',
      imageData: sourceImageUrl,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
    })

    if (dims) {
      // 单维 → 原文就是结果（没有 JSON 可解，也就没有结构可校验）。
      dimensions = { [dims[0]]: rawResult.trim() }
      generatedPrompt = rawResult.trim()
    } else {
      generatedPrompt = rawResult
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
    models.map(async (model) => {
      const submitted = await submitImageGeneration(clerkId, {
        prompt: analysis.generatedPrompt,
        modelId: model.modelId,
        aspectRatio,
        apiKeyId: model.apiKeyId,
      })
      return waitForImageGenerationResult(clerkId, submitted.jobId)
    }),
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
