import { IMAGE_ASPECT_RATIO_PARTS } from '../../../../../src/lib/image-output-size'
import type {
  ExecutionEnv,
  WorkerImageGenerationResult,
  WorkerImageLayerResult,
  WorkerImageRunContext,
} from '../../index'
import {
  isRecord,
  readBooleanField,
  readNumberField,
  readStringField,
} from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  downloadAndUploadImageArtifactToKey,
  getImageReferenceInputs,
  getWorkerImageOutputKey,
  readAdvancedRecord,
} from '../../lib/image-io'

export const VOLCENGINE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

// VolcEngine Ark accepts an explicit "<W>x<H>" size string; the 4K tier is
// new, the default (no resolution picked) keeps the existing ~2K table in
// getVolcEngineImageSize() untouched.
export const VOLCENGINE_4K_TARGET_PIXELS = 3840 * 2160

/**
 * Ark's total-pixel ceiling is **per model**, and Seedream 5.0 pro's is far
 * lower than the rest: 4,624,220 px (2048x2048x1.1025) against 16,777,216
 * (4096x4096) for lite / 4.x. A single shared 4K budget of 8,294,400 px is
 * therefore always over pro's cap, and every 4K request on pro came back
 * `400 InvalidParameter: image area must be at most 4624220 pixels`.
 * Clamping (rather than rejecting) keeps the tier usable — pro officially
 * lists only 1K/1.5K/2K, so "4K" on it means "as large as pro allows".
 * Source: Ark 图片生成 API, the `size` parameter's per-model sections.
 */
export const VOLCENGINE_PRO_MAX_TOTAL_PIXELS = 4_624_220

export const VOLCENGINE_MAX_TOTAL_PIXELS = 4096 * 4096

export const VOLCENGINE_SIZE_EDGE_STEP = 16

export function volcEngineMaxTotalPixels(externalModelId: string): number {
  return /seedream-\d+-\d+-pro/.test(externalModelId)
    ? VOLCENGINE_PRO_MAX_TOTAL_PIXELS
    : VOLCENGINE_MAX_TOTAL_PIXELS
}

/**
 * Floors both edges to the step so the product is provably <= the budget.
 * `computeTieredDimensions` rounds to nearest and only shrinks *height* when
 * it overshoots `maxTotalPixels`, which would distort the requested aspect
 * ratio — not acceptable when the caller asked for 16:9.
 */
export function volcEngineSizeForBudget(
  aspectRatio: string,
  targetPixels: number,
): { width: number; height: number; size: string } {
  const [rw, rh] = IMAGE_ASPECT_RATIO_PARTS[aspectRatio] ?? [1, 1]
  const floorToStep = (value: number) =>
    Math.max(
      VOLCENGINE_SIZE_EDGE_STEP,
      Math.floor(value / VOLCENGINE_SIZE_EDGE_STEP) * VOLCENGINE_SIZE_EDGE_STEP,
    )

  const width = floorToStep(Math.sqrt((targetPixels * rw) / rh))
  const height = floorToStep((width * rh) / rw)

  return { width, height, size: `${width}x${height}` }
}

export function volcEngine4KSize(
  aspectRatio: string,
  externalModelId: string,
): {
  width: number
  height: number
  size: string
} {
  return volcEngineSizeForBudget(
    aspectRatio,
    Math.min(
      VOLCENGINE_4K_TARGET_PIXELS,
      volcEngineMaxTotalPixels(externalModelId),
    ),
  )
}

export function getVolcEngineImageSize(aspectRatio: string): {
  width: number
  height: number
  size: string
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 2560, height: 1440, size: '2560x1440' }
    case '9:16':
      return { width: 1440, height: 2560, size: '1440x2560' }
    case '4:3':
      return { width: 2304, height: 1728, size: '2304x1728' }
    case '3:4':
      return { width: 1728, height: 2304, size: '1728x2304' }
    default:
      return { width: 2048, height: 2048, size: '2048x2048' }
  }
}

/**
 * Ark 文档 2026-09-17 核实：Seedream 5.0 Pro 只收 10 张参考图，Lite / 4.5 / 4.0
 * 收 14 张。与 src/constants/provider-capabilities.ts 的上限保持一致。
 * https://www.volcengine.com/docs/82379/1541523
 */
export function volcEngineMaxReferenceImages(externalModelId: string): number {
  return isVolcEngineSeedream50Pro(externalModelId) ? 10 : 14
}

/**
 * `background` (transparent output) and `layer_decomposition` are both listed
 * under "模型支持: Seedream 5.0 pro" only — Lite / 4.5 / 4.0 reject them.
 * Matches both stations' ids: 火山 `doubao-seedream-5-0-pro-*` and BytePlus
 * `dola-seedream-5-0-pro-*`.
 * https://www.volcengine.com/docs/82379/1541523
 */
export function isVolcEngineSeedream50Pro(externalModelId: string): boolean {
  return /seedream-5-0-pro/.test(externalModelId)
}

/**
 * Ark reports each output's pixel size as `"<width>x<height>"`. In layer mode
 * every artifact has its own size (layers are cropped to their bounding box),
 * so the request's nominal size says nothing about them.
 */
export function parseVolcEngineArtifactSize(
  entry: Record<string, unknown>,
): { width: number; height: number } | null {
  const raw = readStringField(entry, 'size')
  const match = raw ? /^(\d+)x(\d+)$/.exec(raw) : null
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null
}

export function readVolcEngineBoundingBox(
  entry: Record<string, unknown>,
): { absolute?: number[]; normalized?: number[] } | undefined {
  const box = entry.bounding_box
  if (!isRecord(box)) return undefined
  const read = (key: string): number[] | undefined => {
    const value = box[key]
    return Array.isArray(value) && value.every((n) => typeof n === 'number')
      ? (value as number[])
      : undefined
  }
  const absolute = read('absolute')
  const normalized = read('normalized')
  if (!absolute && !normalized) return undefined
  return { absolute, normalized }
}

/** `image/foo.png` → `image/foo-layer-3.png`; extensionless keys just suffix. */
export function buildVolcEngineLayerKey(
  baseKey: string,
  zIndex: number,
): string {
  const dot = baseKey.lastIndexOf('.')
  const slash = baseKey.lastIndexOf('/')
  return dot > slash
    ? `${baseKey.slice(0, dot)}-layer-${zIndex}.png`
    : `${baseKey}-layer-${zIndex}.png`
}

export async function generateVolcEngineImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  const size =
    resolution === '4K'
      ? volcEngine4KSize(
          context.providerInput.aspectRatio,
          context.providerInput.externalModelId,
        )
      : getVolcEngineImageSize(context.providerInput.aspectRatio)
  const body: Record<string, unknown> = {
    model: context.providerInput.externalModelId,
    prompt: context.providerInput.prompt,
    content: [
      { type: 'text', text: context.providerInput.prompt },
      ...getImageReferenceInputs(context)
        .slice(
          0,
          volcEngineMaxReferenceImages(context.providerInput.externalModelId),
        )
        .map((url) => ({ type: 'image_url', image_url: { url } })),
    ],
    size: size.size,
    response_format: 'url',
    watermark: false,
    n: 1,
  }

  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) {
    body.seed = Math.min(Math.round(seed), 2_147_483_647)
  }
  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) body.guidance_scale = guidanceScale

  // `background: "transparent"` is Seedream 5.0 pro only, and the doc pins
  // three preconditions: image-to-image only, exactly one input image, and an
  // input that actually carries an alpha channel. We can check the first two
  // here; the third is the provider's to reject. Failing either of ours means
  // the field is simply not sent (an opaque image beats a 400), while the app's
  // validation layer turns the same situation into a readable error up front.
  //
  // Transparent output defaults to png AND the doc says pairing it with
  // `output_format: "jpeg"` is an error, so pin png explicitly rather than
  // relying on a default that a future body change could stomp.
  // https://www.volcengine.com/docs/82379/1541523
  const background = readStringField(advancedParams, 'background')
  if (
    background === 'transparent' &&
    isVolcEngineSeedream50Pro(context.providerInput.externalModelId) &&
    getImageReferenceInputs(context).length === 1
  ) {
    body.background = 'transparent'
    body.output_format = 'png'
  }

  // `layer_decomposition` has its own preconditions (5.0 pro, and "仅支持输入
  // 单张待拆分图，传入多张报错"), checked the same way and for the same reason.
  // ⚠ The doc does not make it exclusive with `background` — both may ride on
  // the same request, so these two blocks stay independent.
  // https://www.volcengine.com/docs/82379/1541523
  const wantsLayers =
    readBooleanField(advancedParams, 'layerDecomposition') === true &&
    isVolcEngineSeedream50Pro(context.providerInput.externalModelId) &&
    getImageReferenceInputs(context).length === 1
  if (wantsLayers) body.layer_decomposition = true

  // 火山 Ark (cn-beijing) and BytePlus ModelArk (ap-southeast) expose the
  // identical /images/generations contract, so one function serves both —
  // the station is chosen entirely by this URL. Hardcoding the CN host here
  // is what made an overseas image line impossible; the video path has read
  // providerBaseUrl since Seedance landed, which is why Seedance already had
  // a working BytePlus route while images did not.
  const baseUrl = (
    context.providerInput.providerBaseUrl ?? VOLCENGINE_BASE_URL
  ).replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `VolcEngine image generation failed (${response.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const payload = (await response.json()) as Record<string, unknown>
  const data = (Array.isArray(payload.data) ? payload.data : []).filter(
    isRecord,
  )
  // In layer mode the base plate is the entry with `z_index === 0`; the doc
  // says nothing about the array's order, so pick it by the field rather than
  // trusting position. Outside layer mode there is exactly one entry.
  const base = wantsLayers
    ? (data.find((entry) => readNumberField(entry, 'z_index') === 0) ?? data[0])
    : data[0]
  const imageUrl = base ? readStringField(base, 'url') : null
  if (!base || !imageUrl) {
    throw new Error('VolcEngine response did not include an image URL.')
  }

  const baseKey = getWorkerImageOutputKey(context)
  const uploaded = await downloadAndUploadImageArtifactToKey(
    env,
    imageUrl,
    'image/png',
    baseKey,
  )

  // ⚠ Sequential, not Promise.all: the doc is explicit that a layer job is
  // all-or-nothing ("任一图层生成失败，整体请求报错，不支持部分成功"), so a
  // failed upload must surface as a failed run rather than a half-stored set.
  const layers: WorkerImageLayerResult[] = []
  if (wantsLayers) {
    for (const entry of data) {
      const zIndex = readNumberField(entry, 'z_index')
      const layerUrl = readStringField(entry, 'url')
      if (zIndex == null || zIndex <= 0 || !layerUrl) continue
      const layerSize = parseVolcEngineArtifactSize(entry)
      const layerUpload = await downloadAndUploadImageArtifactToKey(
        env,
        layerUrl,
        // 图层始终以 png 格式输出 — `output_format` only governs the base.
        'image/png',
        buildVolcEngineLayerKey(baseKey, zIndex),
      )
      layers.push({
        zIndex,
        artifactUrl: layerUpload.artifactUrl,
        imageR2Key: layerUpload.imageR2Key,
        mimeType: layerUpload.mimeType,
        width: layerSize?.width ?? 0,
        height: layerSize?.height ?? 0,
        name: readStringField(entry, 'name') ?? undefined,
        description: readStringField(entry, 'description') ?? undefined,
        boundingBox: readVolcEngineBoundingBox(entry),
      })
    }
    layers.sort((a, b) => a.zIndex - b.zIndex)
  }

  // In layer mode `size` is a tier (or `auto`) and the base plate follows the
  // input image's aspect, so the request's nominal dimensions are wrong —
  // read the ones the response reports back. Outside layer mode nothing
  // changes.
  const baseSize = wantsLayers ? parseVolcEngineArtifactSize(base) : null

  return {
    ...uploaded,
    width: baseSize?.width ?? size.width,
    height: baseSize?.height ?? size.height,
    providerMetadata: { sourceUrlHost: new URL(imageUrl).host },
    ...(layers.length > 0 ? { layers } : {}),
  }
}
