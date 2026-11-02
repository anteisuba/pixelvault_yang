import type { ExecutionEnv, WorkerImageRunContext } from '../index'
import { bytesToBase64 } from './bytes'
import { GENERATION_ERROR_CODES } from '../../../../src/constants/generation-errors'
import { base64ToBytes } from './bytes'
import { isRecord, readNumberField, readStringField } from './fields'
import { WorkerProviderError } from './provider-error'

// Same header as the app's `uploadToR2`. Without it the CDN falls back to
// Cloudflare's defaults (edge ~2 h, browser 4 h), so every edge keeps
// re-pulling multi-MB originals from R2. Keys written here are unique per run.
export const R2_OBJECT_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export function buildR2PublicUrl(env: ExecutionEnv, key: string): string {
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

export function readAdvancedRecord(
  context: WorkerImageRunContext,
): Record<string, unknown> {
  return context.providerInput.advancedParams ?? {}
}

/**
 * 这一次要发给 provider 的参考图 —— **有几张发几张**。
 *
 * ⚠ 复数字段优先，单数 `referenceImage` 只是向后兼容的回退。别在这里或调用方
 * 取 `[0]`：OpenAI 的 `/v1/images/edits` 收到 16 张，Vercel 侧一路（
 * `submit-image.service.ts` 的 providerInput）传的也是完整数组，这里截一刀就
 * 等于用户放了两张只有一张生效，而 UI 上两张都亮着 —— 那类静默失效最难归因。
 */
export function getImageReferenceInputs(
  context: WorkerImageRunContext,
): string[] {
  if (context.providerInput.referenceImages?.length) {
    return context.providerInput.referenceImages
  }
  return context.providerInput.referenceImage
    ? [context.providerInput.referenceImage]
    : []
}

export function invertReferenceStrength(value: number): number {
  return Math.max(0.01, Math.min(0.99, 1 - value))
}

export async function readReferenceImageAsBase64(
  referenceImage: string,
): Promise<string> {
  const dataUrlMatch = referenceImage.match(/^data:[^;]+;base64,(.+)$/)
  if (dataUrlMatch) return dataUrlMatch[1]

  const response = await fetch(referenceImage)
  if (!response.ok) {
    throw new Error(
      `Reference image download failed with status ${response.status}`,
    )
  }

  return bytesToBase64(new Uint8Array(await response.arrayBuffer()))
}

export async function uploadImageBytesToKey(
  env: ExecutionEnv,
  bytes: ArrayBuffer | Uint8Array,
  mimeType: string,
  imageR2Key: string,
): Promise<{ artifactUrl: string; imageR2Key: string; mimeType: string }> {
  await env.GENERATION_BUCKET.put(imageR2Key, bytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, imageR2Key),
    imageR2Key,
    mimeType,
  }
}

export function getWorkerImageOutputKey(
  context: WorkerImageRunContext,
  extension = 'png',
): string {
  return (
    context.providerInput.outputStorageKey ??
    `image/${context.runId}.${extension}`
  )
}

export const R2_WORKER_BASE = 'https://r2.anteisuba.com'

export interface ImageLoraInput {
  url: string
  scale?: number | null
}

export function getImageLoraInputs(
  context: WorkerImageRunContext,
): ImageLoraInput[] {
  const loras = readAdvancedRecord(context).loras
  if (!Array.isArray(loras)) return []

  return loras.flatMap((candidate): ImageLoraInput[] => {
    if (!isRecord(candidate)) return []
    const url = readStringField(candidate, 'url')
    if (!url) return []
    return [{ url, scale: readNumberField(candidate, 'scale') }]
  })
}

export function injectCivitaiToken(
  url: string,
  civitaiToken: string | null,
): string {
  if (!civitaiToken || !url.includes('civitai.com')) return url
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('token')) {
      parsed.searchParams.set('token', civitaiToken)
    }
    return parsed.toString()
  } catch {
    return url
  }
}

export async function downloadAndUploadImageArtifactToKey(
  env: ExecutionEnv,
  artifactUrl: string,
  fallbackMimeType: string,
  imageR2Key: string,
  fetchHeaders?: Record<string, string>,
): Promise<{ artifactUrl: string; imageR2Key: string; mimeType: string }> {
  const response = await fetch(artifactUrl, { headers: fetchHeaders })
  if (!response.ok) {
    throw new Error(
      `Image artifact download failed with status ${response.status}`,
    )
  }

  const imageBytes = await response.arrayBuffer()
  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? fallbackMimeType

  await env.GENERATION_BUCKET.put(imageR2Key, imageBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, imageR2Key),
    imageR2Key,
    mimeType,
  }
}

export async function readReferenceImageAsInlinePart(
  referenceImage: string,
): Promise<Record<string, unknown>> {
  const dataUrlMatch = referenceImage.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      inlineData: {
        mimeType: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    }
  }

  const response = await fetch(referenceImage)
  if (!response.ok) {
    throw new Error(
      `Reference image download failed with status ${response.status}`,
    )
  }

  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? 'image/png'
  return {
    inlineData: {
      mimeType,
      data: bytesToBase64(new Uint8Array(await response.arrayBuffer())),
    },
  }
}

export function getStandardImageDimensions(aspectRatio: string): {
  width: number
  height: number
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1792, height: 1024 }
    case '9:16':
      return { width: 1024, height: 1792 }
    case '4:3':
      return { width: 1024, height: 768 }
    case '3:4':
      return { width: 768, height: 1024 }
    default:
      return { width: 1024, height: 1024 }
  }
}

// OpenAI edits accepts PNG/JPEG/WebP files under 50 MB, up to 16 per request.
export const OPENAI_REFERENCE_MAX_BYTES = 50 * 1024 * 1024

export const OPENAI_REFERENCE_READ_TIMEOUT_MS = 30_000

export function imageReferenceStorageKey(
  rawUrl: string,
  env: ExecutionEnv,
): string | null {
  try {
    const url = new URL(rawUrl)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null
    const bases = [
      env.R2_PUBLIC_URL,
      R2_WORKER_BASE,
      'https://pub-5346558f8dc549f9ba5217489fe5395e.r2.dev',
    ]
    for (const rawBase of bases) {
      const base = new URL(rawBase)
      const prefix = `${base.pathname.replace(/\/+$/, '')}/`
      if (url.origin !== base.origin || !url.pathname.startsWith(prefix))
        continue
      const key = decodeURIComponent(url.pathname.slice(prefix.length))
      return key && !key.includes('..') ? key : null
    }
  } catch {
    return null
  }
  return null
}

export function createImageEditBody(
  env: ExecutionEnv,
  fields: Record<string, unknown>,
  references: readonly string[],
  options: {
    provider: string
    fileFields: readonly string[]
    maxBytes: number
  } = {
    provider: 'openai',
    fileFields: [],
    maxBytes: OPENAI_REFERENCE_MAX_BYTES,
  },
) {
  const boundary = `pixelvault-${crypto.randomUUID()}`
  const encoder = new TextEncoder()
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const cancel = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason)
    void reader?.cancel(reason).catch(() => {})
    void chunks.return(undefined).catch(() => {})
  }
  const wait = async <T>(work: Promise<T>): Promise<T> => {
    let onAbort: () => void = () => {}
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason)
      if (controller.signal.aborted) onAbort()
      else controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      return await Promise.race([work, aborted])
    } finally {
      controller.signal.removeEventListener('abort', onAbort)
    }
  }

  async function* encode(): AsyncGenerator<Uint8Array> {
    for (const [name, value] of Object.entries(fields)) {
      yield encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`,
      )
    }
    for (let index = 0; index < references.length; index += 1) {
      const fail = (
        detail: string,
        errorCode: string = GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE,
      ) =>
        new WorkerProviderError({
          message: `Reference image ${index + 1} ${detail}`,
          provider: options.provider,
          phase: 'reference_download',
          errorCode,
          httpStatus: 400,
          providerMetadata: { referenceIndex: index + 1 },
        })
      const timeout = setTimeout(
        () => cancel(fail('could not be read before timeout.')),
        OPENAI_REFERENCE_READ_TIMEOUT_MS,
      )
      try {
        controller.signal.throwIfAborted()
        const reference = references[index]
        const dataUrl =
          /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
            reference,
          )
        let mimeType: string
        let data: string | undefined
        if (dataUrl) {
          mimeType = dataUrl[1]
          data = dataUrl[2]
          const size =
            (data.length / 4) * 3 -
            (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
          if (size >= options.maxBytes)
            throw fail(
              `exceeds the ${options.maxBytes / 1024 / 1024} MB input limit.`,
              GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
            )
        } else {
          const key = imageReferenceStorageKey(reference, env)
          if (!key) throw fail('must be an archived image from this gallery.')
          const object = await wait(
            env.GENERATION_BUCKET.get(key).then((value) => {
              if (controller.signal.aborted)
                void value?.body.cancel().catch(() => {})
              return value
            }),
          )
          if (!object) throw fail('is missing from storage.')
          reader = object.body.getReader()
          if (object.size >= options.maxBytes)
            throw fail(
              `exceeds the ${options.maxBytes / 1024 / 1024} MB input limit.`,
              GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
            )
          mimeType =
            object.httpMetadata?.contentType
              ?.split(';')[0]
              .trim()
              .toLowerCase() ?? 'image/png'
        }
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
          throw fail(
            'must be a PNG, JPEG or WebP image.',
            GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
          )
        }
        yield encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${options.fileFields[index] ?? 'image[]'}"; filename="reference-${index + 1}.${mimeType.split('/')[1]}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
        )
        if (data !== undefined) {
          for (let offset = 0; offset < data.length; offset += 65_536) {
            controller.signal.throwIfAborted()
            yield base64ToBytes(data.slice(offset, offset + 65_536))
          }
        } else {
          let bytes = 0
          while (reader) {
            const chunk = await wait(reader.read())
            controller.signal.throwIfAborted()
            if (chunk.done) break
            bytes += chunk.value.byteLength
            if (bytes >= options.maxBytes)
              throw fail(
                `exceeds the ${options.maxBytes / 1024 / 1024} MB input limit.`,
                GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
              )
            yield chunk.value
          }
        }
        yield encoder.encode('\r\n')
      } catch (error) {
        throw controller.signal.aborted
          ? controller.signal.reason
          : error instanceof WorkerProviderError
            ? error
            : fail('could not be read from storage.')
      } finally {
        clearTimeout(timeout)
        void reader?.cancel().catch(() => {})
        reader = undefined
      }
    }
    yield encoder.encode(`--${boundary}--\r\n`)
  }

  const chunks = encode()
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(stream) {
        try {
          const chunk = await chunks.next()
          if (chunk.done) stream.close()
          else stream.enqueue(chunk.value)
        } catch (error) {
          cancel(error)
          stream.error(error)
        }
      },
      async cancel(reason) {
        cancel(reason)
        await chunks.return(undefined)
      },
    },
    { highWaterMark: 0 },
  )
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    signal: controller.signal,
    cancel,
  }
}

export function hasCivitaiLora(context: WorkerImageRunContext): boolean {
  return getImageLoraInputs(context).some((lora) =>
    lora.url.includes('civitai.com'),
  )
}
