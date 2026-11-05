import {
  aspectRatioToOpenAISize,
  isImageResolutionTier,
  tieredOpenAISize,
} from '../../../../../src/lib/image-output-size'
import { readOpenAIImageStream } from '../../../../../src/lib/openai-image-stream'
import {
  readSvgDimensions,
  sanitizeGeneratedSvg,
  SVG_MIME_TYPE,
} from '../../../../../src/lib/svg-image'
import type { ExecutionEnv, WorkerImageRunContext } from '../../index'
import { postSignedJson } from '../../lib/app-bridge'
import { base64ToBytes } from '../../lib/bytes'
import { readStringField } from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  createImageEditBody,
  getImageReferenceInputs,
  R2_OBJECT_CACHE_CONTROL,
  readAdvancedRecord,
} from '../../lib/image-io'
import { createProviderResponseError } from '../../lib/provider-error'

export const OPENAI_BASE_URL = 'https://api.openai.com'

/**
 * Call OpenAI's image API and upload the result to R2. gpt-image models return
 * base64 (no hosted URL), so the worker persists the bytes to R2 and returns a
 * public URL for the Vercel callback to finalize.
 */
export async function generateOpenAIImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<{
  artifactUrl: string
  imageR2Key: string
  width: number
  height: number
  mimeType: string
}> {
  const { providerInput } = context
  const advancedParams = readAdvancedRecord(context)
  const resolution = readStringField(advancedParams, 'resolution')
  const { size, width, height } =
    resolution && isImageResolutionTier(resolution)
      ? tieredOpenAISize(providerInput.aspectRatio, resolution)
      : aspectRatioToOpenAISize(providerInput.aspectRatio)
  const referenceImages = getImageReferenceInputs(context)
  const body: Record<string, unknown> = {
    model: providerInput.externalModelId,
    prompt: providerInput.prompt,
    size,
    n: 1,
  }

  const quality = readStringField(advancedParams, 'quality')
  if (quality) body.quality = quality
  // GPT Image 2.6 only; the app rejects it for other models before dispatch.
  const complexity = readStringField(advancedParams, 'complexity')
  if (complexity) body.complexity = complexity
  const background = readStringField(advancedParams, 'background')
  if (background) body.background = background
  // 已在 app 侧哈希；只有声明支持的模型才会带过来。
  if (providerInput.safetyIdentifier)
    body.safety_identifier = providerInput.safetyIdentifier

  // SVG 只在 `/images/generations` 上成立，且官方不给流式预览 —— app 侧已经
  // 拒了「SVG + 参考图」，这里再按同一条收口：有参考图就照旧出 PNG。
  const svg =
    readStringField(advancedParams, 'outputFormat') === 'svg' &&
    referenceImages.length === 0
  const streaming = !svg && advancedParams.preview === true
  if (streaming) {
    body.stream = true
    body.partial_images = 2
  }
  body.output_format = svg ? 'svg' : 'png'

  const edit = referenceImages.length
    ? createImageEditBody(env, body, referenceImages)
    : undefined
  let response: Response
  try {
    response = await fetch(
      `${OPENAI_BASE_URL}/v1/images/${edit ? 'edits' : 'generations'}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': edit?.contentType ?? JSON_CONTENT_TYPE,
        },
        body: edit?.body ?? JSON.stringify(body),
        ...(edit ? { signal: edit.signal } : {}),
      },
    )
  } catch (error) {
    const failure = edit?.signal.aborted ? edit.signal.reason : error
    edit?.cancel(failure)
    throw failure
  }

  if (!response.ok) {
    const failure = await createProviderResponseError(response, {
      provider: 'openai',
      phase: 'generate_image',
      fallbackMessage: `OpenAI image generation failed (${response.status}).`,
    })
    edit?.cancel(failure)
    throw failure
  }

  let b64: unknown
  if (streaming) {
    if (!response.body)
      throw new Error('OpenAI returned an empty image stream.')
    const result = await readOpenAIImageStream(
      response.body,
      async (base64, index) => {
        try {
          const previewKey = `image/previews/${context.runId}/${index}.png`
          await env.GENERATION_BUCKET.put(previewKey, base64ToBytes(base64), {
            httpMetadata: {
              contentType: 'image/png',
              cacheControl: R2_OBJECT_CACHE_CONTROL,
            },
          })
          if (env.INTERNAL_CALLBACK_SECRET) {
            await postSignedJson(
              context.callbackUrl,
              env.INTERNAL_CALLBACK_SECRET,
              {
                runId: context.runId,
                kind: 'status',
                ts: new Date().toISOString(),
                data: { previewUrl: `${env.R2_PUBLIC_URL}/${previewKey}` },
              },
            )
          }
        } catch {
          console.warn('Image preview could not be delivered', {
            runId: context.runId,
          })
        }
      },
    )
    b64 = result.base64
  } else {
    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: unknown }>
    }
    b64 = payload.data?.[0]?.b64_json
  }
  if (typeof b64 !== 'string') {
    throw new Error('OpenAI response did not include base64 image data.')
  }

  if (svg) return storeOpenAISvg(env, context, b64, { width, height })

  const bytes = base64ToBytes(b64)
  const mimeType = 'image/png'
  const r2Key = providerInput.outputStorageKey ?? `image/${context.runId}.png`
  await env.GENERATION_BUCKET.put(r2Key, bytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: `${env.R2_PUBLIC_URL}/${r2Key}`,
    imageR2Key: r2Key,
    width,
    height,
    mimeType,
  }
}

/**
 * SVG 结果：解码 → 白名单清洗 → 按 viewBox 读尺寸 → 存 `image/svg+xml`。
 * `Content-Disposition: attachment` 让人直接打开 CDN 地址时只会下载、不会在
 * CDN 源上渲染（`<img>` 显示不受影响）。
 */
async function storeOpenAISvg(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  b64: string,
  requested: { width: number; height: number },
) {
  const source = new TextDecoder().decode(base64ToBytes(b64))
  const clean = sanitizeGeneratedSvg(source)
  const { width, height } = readSvgDimensions(clean) ?? requested
  const key =
    context.providerInput.outputStorageKey ?? `image/${context.runId}.svg`
  const r2Key = key.endsWith('.svg') ? key : key.replace(/\.[^./]+$/, '.svg')
  await env.GENERATION_BUCKET.put(r2Key, new TextEncoder().encode(clean), {
    httpMetadata: {
      contentType: SVG_MIME_TYPE,
      contentDisposition: 'attachment',
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })
  return {
    artifactUrl: `${env.R2_PUBLIC_URL}/${r2Key}`,
    imageR2Key: r2Key,
    width,
    height,
    mimeType: SVG_MIME_TYPE,
  }
}
