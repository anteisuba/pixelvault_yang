import type { ExecutionEnv, WorkerImageRunContext } from '../index'
import { bytesToBase64 } from './bytes'

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
