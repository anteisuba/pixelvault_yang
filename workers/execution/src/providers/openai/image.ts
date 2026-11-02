import {
  aspectRatioToOpenAISize,
  isImageResolutionTier,
  tieredOpenAISize,
} from '../../../../../src/lib/image-output-size'
import { readOpenAIImageStream } from '../../../../../src/lib/openai-image-stream'
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
  const background = readStringField(advancedParams, 'background')
  if (background) body.background = background

  const streaming = advancedParams.preview === true
  if (streaming) {
    body.stream = true
    body.partial_images = 2
  }
  body.output_format = 'png'

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
