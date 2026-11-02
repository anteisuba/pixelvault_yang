import {
  computeTieredDimensions,
  type ImageResolutionTier,
  isImageResolutionTier,
} from '../../../../../src/lib/image-output-size'
import type {
  ExecutionEnv,
  WorkerImageGenerationResult,
  WorkerImageRunContext,
} from '../../index'
import { postSignedJson } from '../../lib/app-bridge'
import { base64ToBytes } from '../../lib/bytes'
import { isRecord, readBooleanField, readStringField } from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  getImageReferenceInputs,
  getStandardImageDimensions,
  getWorkerImageOutputKey,
  readAdvancedRecord,
  readReferenceImageAsInlinePart,
  uploadImageBytesToKey,
} from '../../lib/image-io'
import {
  createGeminiNoImageError,
  createProviderResponseError,
} from '../../lib/provider-error'

export const GEMINI_IMAGE_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models'

export const GEMINI_RESOLUTION_TARGET_PIXELS: Record<
  ImageResolutionTier,
  number
> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
  '4K': 4096 * 4096,
}

/** Local dimension record for a Gemini output once a resolution tier is picked. */
export function tieredGeminiDimensions(
  aspectRatio: string,
  tier: ImageResolutionTier,
): { width: number; height: number } {
  return computeTieredDimensions(aspectRatio, {
    targetPixels: GEMINI_RESOLUTION_TARGET_PIXELS[tier],
    maxEdge: 4096,
  })
}

/**
 * Gemini 的 `parts`：正文在前，每张参考图前面紧贴它的说明（卡片总线图例
 * 「Image 2 = @Denia identity (primary)」，进度表 35 ⑥）。
 * ⚠ 只有 `referenceImages` 那条路带说明；单张 `referenceImage` 与缺说明 = 旧行为。
 */
export async function buildGeminiImageParts(
  context: WorkerImageRunContext,
  readImage: (
    referenceImage: string,
  ) => Promise<Record<string, unknown>> = readReferenceImageAsInlinePart,
): Promise<Record<string, unknown>[]> {
  const parts: Record<string, unknown>[] = [
    { text: context.providerInput.prompt },
  ]
  const references = getImageReferenceInputs(context)
  const labels =
    context.providerInput.referenceImageLabels?.length === references.length
      ? context.providerInput.referenceImageLabels
      : undefined
  for (const [index, referenceImage] of references.entries()) {
    const label = labels?.[index]
    if (label) parts.push({ text: label })
    parts.push(await readImage(referenceImage))
  }
  return parts
}

/**
 * 「先搜再画」：Google 搜索落地，网页 + 图片两种都开（图片搜索只有 Nano
 * Banana 2.1 / 3.1 Flash 支持，能否开由应用侧按型号决定，这里只认参数）。
 * https://ai.google.dev/api/generate-content （GoogleSearch.searchTypes）
 */
export const GEMINI_SEARCH_GROUNDING_TOOL = {
  googleSearch: { searchTypes: { webSearch: {}, imageSearch: {} } },
} as const

export interface WorkerSearchGroundingSource {
  kind: 'web' | 'image'
  url: string
  title: string
  domain?: string
}

/** 与应用侧 `SearchGroundingResultSchema` 同形（status 回调的 data.searchGrounding）。 */
export interface WorkerSearchGroundingResult {
  status: 'grounded' | 'empty' | 'error'
  sources: WorkerSearchGroundingSource[]
  suggestionsHtml?: string
}

export const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

export function readHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

/**
 * 从 `candidates[].groundingMetadata` 读出来源与搜索建议。网页块只有
 * `uri`（Google 的跳转链）+ `title`（通常就是域名）；图片块给出图所在网页
 * `sourceUri` + 标题 + 域名 —— ⛔ `imageUri` 不取（owner：来源不显示缩略图）。
 * 链接原样用，按链接去重，顺序照 Google 给的。
 */
export function readGeminiSearchGrounding(
  payload: unknown,
): WorkerSearchGroundingResult {
  const candidates =
    isRecord(payload) && Array.isArray(payload.candidates)
      ? payload.candidates
      : []
  const sources: WorkerSearchGroundingSource[] = []
  const seen = new Set<string>()
  let suggestionsHtml: string | undefined

  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.groundingMetadata)) continue
    const metadata = candidate.groundingMetadata
    const entryPoint = isRecord(metadata.searchEntryPoint)
      ? metadata.searchEntryPoint
      : null
    suggestionsHtml ??=
      (entryPoint && readStringField(entryPoint, 'renderedContent')) ??
      undefined

    const chunks = Array.isArray(metadata.groundingChunks)
      ? metadata.groundingChunks
      : []
    for (const chunk of chunks) {
      if (!isRecord(chunk)) continue
      let source: WorkerSearchGroundingSource | null = null
      if (isRecord(chunk.image)) {
        const url = readHttpUrl(readStringField(chunk.image, 'sourceUri'))
        const domain = readStringField(chunk.image, 'domain') ?? undefined
        if (url) {
          source = {
            kind: 'image',
            url,
            title: readStringField(chunk.image, 'title') ?? domain ?? url,
            ...(domain ? { domain } : {}),
          }
        }
      } else if (isRecord(chunk.web)) {
        const url = readHttpUrl(readStringField(chunk.web, 'uri'))
        const title = readStringField(chunk.web, 'title')
        if (url) {
          const domain =
            title && DOMAIN_LIKE.test(title) ? title.toLowerCase() : undefined
          source = {
            kind: 'web',
            url,
            title: title ?? domain ?? url,
            ...(domain ? { domain } : {}),
          }
        }
      }
      if (!source || seen.has(source.url)) continue
      seen.add(source.url)
      sources.push(source)
    }
  }

  return {
    status: sources.length > 0 ? 'grounded' : 'empty',
    sources,
    ...(suggestionsHtml ? { suggestionsHtml } : {}),
  }
}

export function buildGeminiImageRequestBody(
  parts: Record<string, unknown>[],
  imageConfig: Record<string, unknown>,
  searchGrounding: boolean,
): Record<string, unknown> {
  return {
    contents: [{ parts }],
    ...(searchGrounding ? { tools: [GEMINI_SEARCH_GROUNDING_TOOL] } : {}),
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig,
    },
  }
}

/**
 * 带搜索那一枪失败时要不要退回不搜照常画：鉴权 / 额度错误换不搜也一样失败，
 * 原样报；其余（搜索出错、上游 5xx…）去掉搜索再画一次，界面说「搜索没成功」。
 */
export function shouldRetryWithoutSearch(status: number): boolean {
  return status !== 401 && status !== 403 && status !== 429
}

/**
 * 来源与搜索建议只经 status 回调交给应用、暂放到发起者来取 ——
 * ⛔ 不进 step 返回值（Workflows 会把 step 输出存下来）。送不到只丢来源，
 * 图照常交付。
 */
export async function deliverSearchGrounding(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  searchGrounding: WorkerSearchGroundingResult,
): Promise<void> {
  if (!env.INTERNAL_CALLBACK_SECRET) return
  try {
    const response = await postSignedJson(
      context.callbackUrl,
      env.INTERNAL_CALLBACK_SECRET,
      {
        runId: context.runId,
        kind: 'status',
        ts: new Date().toISOString(),
        data: { searchGrounding },
      },
    )
    if (!response.ok) {
      console.warn('Search grounding could not be delivered', {
        runId: context.runId,
        status: response.status,
      })
    }
  } catch {
    console.warn('Search grounding could not be delivered', {
      runId: context.runId,
    })
  }
}

export async function generateGeminiImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  const resolutionTier =
    resolution && isImageResolutionTier(resolution) ? resolution : null
  const dimensions = resolutionTier
    ? tieredGeminiDimensions(context.providerInput.aspectRatio, resolutionTier)
    : getStandardImageDimensions(context.providerInput.aspectRatio)
  const parts = await buildGeminiImageParts(context)
  const searchGrounding =
    readBooleanField(advancedParams, 'searchGrounding') === true

  const imageConfig: Record<string, unknown> = {
    aspectRatio: context.providerInput.aspectRatio,
  }
  if (resolutionTier) imageConfig.imageSize = resolutionTier

  const request = (withSearch: boolean) =>
    fetch(
      `${GEMINI_IMAGE_BASE_URL}/${context.providerInput.externalModelId}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': JSON_CONTENT_TYPE,
        },
        body: JSON.stringify(
          buildGeminiImageRequestBody(parts, imageConfig, withSearch),
        ),
      },
    )

  let response = await request(searchGrounding)
  let searchFailed = false
  if (
    !response.ok &&
    searchGrounding &&
    shouldRetryWithoutSearch(response.status)
  ) {
    console.warn(
      'Gemini grounded image request failed; retrying without search',
      {
        runId: context.runId,
        status: response.status,
      },
    )
    searchFailed = true
    response = await request(false)
  }

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'gemini',
      phase: 'generate_image',
      fallbackMessage: `Gemini image generation failed with status ${response.status}`,
    })
  }

  const payload = (await response.json()) as Record<string, unknown>
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue
    const parts = Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : []
    for (const part of parts) {
      if (!isRecord(part)) continue
      const inlineData = isRecord(part.inlineData)
        ? part.inlineData
        : isRecord(part.inline_data)
          ? part.inline_data
          : null
      const b64 = inlineData ? readStringField(inlineData, 'data') : null
      if (!b64) continue
      if (!inlineData) continue
      const mimeType =
        readStringField(inlineData, 'mimeType') ??
        readStringField(inlineData, 'mime_type') ??
        'image/png'
      const uploaded = await uploadImageBytesToKey(
        env,
        base64ToBytes(b64),
        mimeType,
        getWorkerImageOutputKey(context),
      )
      if (searchGrounding) {
        await deliverSearchGrounding(
          env,
          context,
          searchFailed
            ? { status: 'error', sources: [] }
            : readGeminiSearchGrounding(payload),
        )
      }
      return { ...uploaded, ...dimensions }
    }
  }

  throw createGeminiNoImageError(payload)
}
