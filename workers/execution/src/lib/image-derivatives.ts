/**
 * 出图后的小图（缩略图 / 预览图 / 视频海报）：app 签名发来源图位置和要做的尺寸，
 * Worker 用 Cloudflare Images 绑定缩成 WebP 写回 R2，回每张小图的 key 和公网地址。
 *
 * 为什么在这里做（2026-11-03）：以前是 Vercel 函数里用 sharp 解码大图再编码两次，
 * 是网站 CPU 的最大头，也是网站搬去 Workers 的拦路石（sharp 是原生库）。
 * Images 按「同一张图同一组参数每月一次」计费，出图时做一次就不再花钱。
 */
import { verifySignedBody } from './app-bridge'
import { JSON_CONTENT_TYPE } from './http'

/** Images 绑定 `.input()` 只收 20 MB 以内的图。 */
export const IMAGE_DERIVATIVE_MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_VARIANTS = 4
const MAX_EDGE = 4096

/** 只用到 R2 绑定的读写两样；index.ts 的 `R2Bucket` 结构上满足它。 */
interface DerivativeBucket {
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
}

export interface ImageDerivativeEnv {
  INTERNAL_CALLBACK_SECRET?: string
  GENERATION_BUCKET: DerivativeBucket
  R2_PUBLIC_URL: string
  IMAGES?: ImagesBinding
}

interface DerivativeVariant {
  key: string
  maxSize: number
  quality: number
}

type DerivativeSource =
  | { key: string }
  | { url: string; headers?: Record<string, string> }

interface DerivativeRequest {
  source: DerivativeSource
  variants: DerivativeVariant[]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': JSON_CONTENT_TYPE },
  })
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

function parseRequest(raw: string): DerivativeRequest | null {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const { source, variants } = body as { source?: unknown; variants?: unknown }

  let parsedSource: DerivativeSource | null = null
  if (typeof source === 'object' && source !== null) {
    const s = source as { key?: unknown; url?: unknown; headers?: unknown }
    if (typeof s.key === 'string' && s.key.length > 0) {
      parsedSource = { key: s.key }
    } else if (typeof s.url === 'string' && s.url.startsWith('https://')) {
      if (s.headers !== undefined && !isStringRecord(s.headers)) return null
      parsedSource = { url: s.url, headers: s.headers }
    }
  }
  if (!parsedSource) return null

  if (
    !Array.isArray(variants) ||
    variants.length === 0 ||
    variants.length > MAX_VARIANTS
  ) {
    return null
  }
  const parsedVariants: DerivativeVariant[] = []
  for (const item of variants) {
    const v = item as { key?: unknown; maxSize?: unknown; quality?: unknown }
    if (
      typeof v.key !== 'string' ||
      v.key.length === 0 ||
      !Number.isInteger(v.maxSize) ||
      (v.maxSize as number) < 1 ||
      (v.maxSize as number) > MAX_EDGE ||
      !Number.isInteger(v.quality) ||
      (v.quality as number) < 1 ||
      (v.quality as number) > 100
    ) {
      return null
    }
    parsedVariants.push({
      key: v.key,
      maxSize: v.maxSize as number,
      quality: v.quality as number,
    })
  }
  return { source: parsedSource, variants: parsedVariants }
}

async function readSourceBytes(
  env: ImageDerivativeEnv,
  source: DerivativeSource,
): Promise<ArrayBuffer> {
  if ('key' in source) {
    const object = await env.GENERATION_BUCKET.get(source.key)
    if (!object) throw new SourceError(`Source not found: ${source.key}`, 404)
    if (object.size > IMAGE_DERIVATIVE_MAX_SOURCE_BYTES) {
      throw new SourceError(`Source too large (${object.size} bytes)`, 413)
    }
    return new Response(object.body).arrayBuffer()
  }
  const response = await fetch(source.url, { headers: source.headers })
  if (!response.ok) {
    throw new SourceError(`Source fetch failed (${response.status})`, 502)
  }
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > IMAGE_DERIVATIVE_MAX_SOURCE_BYTES) {
    throw new SourceError(`Source too large (${declared} bytes)`, 413)
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > IMAGE_DERIVATIVE_MAX_SOURCE_BYTES) {
    throw new SourceError(`Source too large (${bytes.byteLength} bytes)`, 413)
  }
  return bytes
}

class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function publicUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/${key}`
}

export async function handleImageDerivatives(
  request: Request,
  env: ImageDerivativeEnv,
): Promise<Response> {
  const secret = env.INTERNAL_CALLBACK_SECRET
  if (!secret) {
    return json(
      { ok: false, error: 'Internal callback secret is not configured.' },
      500,
    )
  }
  const rawBody = await verifySignedBody(request, secret)
  if (!rawBody) return json({ ok: false, error: 'Invalid signature.' }, 401)

  const parsed = parseRequest(rawBody)
  if (!parsed) return json({ ok: false, error: 'Invalid request body.' }, 400)
  if (!env.IMAGES) {
    return json({ ok: false, error: 'Images binding is not configured.' }, 500)
  }

  let source: ArrayBuffer
  try {
    source = await readSourceBytes(env, parsed.source)
  } catch (error) {
    const status = error instanceof SourceError ? error.status : 502
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Source read failed.',
      },
      status,
    )
  }

  const images = env.IMAGES
  try {
    const variants = await Promise.all(
      parsed.variants.map(async (variant) => {
        const result = await images
          .input(new Response(source).body!)
          .transform({
            width: variant.maxSize,
            height: variant.maxSize,
            fit: 'scale-down',
          })
          .output({ format: 'image/webp', quality: variant.quality })
        const bytes = await new Response(result.image()).arrayBuffer()
        await env.GENERATION_BUCKET.put(variant.key, bytes, {
          httpMetadata: { contentType: 'image/webp' },
        })
        return {
          key: variant.key,
          url: publicUrl(env.R2_PUBLIC_URL, variant.key),
        }
      }),
    )
    return json({ ok: true, data: { variants } })
  } catch (error) {
    return json(
      {
        ok: false,
        error:
          `Image transform failed: ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            500,
          ),
      },
      502,
    )
  }
}
