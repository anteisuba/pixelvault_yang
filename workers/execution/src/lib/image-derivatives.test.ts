import { describe, expect, it, vi } from 'vitest'

import { createSignedRequestHeaders } from './app-bridge'
import {
  handleImageDerivatives,
  IMAGE_DERIVATIVE_MAX_SOURCE_BYTES,
  type ImageDerivativeEnv,
} from './image-derivatives'

const SECRET = 'test-secret'
const URL_ = 'https://worker.example.com/image-derivatives'

async function signedRequest(body: unknown): Promise<Request> {
  const raw = JSON.stringify(body)
  const headers = await createSignedRequestHeaders({
    secret: SECRET,
    body: raw,
    url: URL_,
  })
  return new Request(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  })
}

/** 只假边界：R2 和 Images 绑定是 Cloudflare 平台，按记录调用的假对象代替。 */
function makeEnv(options: { sourceSize?: number; missing?: boolean } = {}) {
  const puts: Array<{ key: string; size: number; contentType?: string }> = []
  const transforms: unknown[] = []
  const outputs: unknown[] = []
  const sourceBytes = new Uint8Array(options.sourceSize ?? 16)
  const bucket = {
    get: vi.fn(async () =>
      options.missing
        ? null
        : {
            size: sourceBytes.byteLength,
            body: new Response(sourceBytes).body!,
          },
    ),
    put: vi.fn(
      async (
        key: string,
        value: ArrayBuffer,
        opts?: { httpMetadata?: { contentType?: string } },
      ) => {
        puts.push({
          key,
          size: value.byteLength,
          contentType: opts?.httpMetadata?.contentType,
        })
        return { key, size: value.byteLength, etag: 'e' }
      },
    ),
    delete: vi.fn(),
  }
  const images: ImagesBinding = {
    input: () => {
      const handle: ImageTransformer = {
        transform(t) {
          transforms.push(t)
          return handle
        },
        async output(o) {
          outputs.push(o)
          return {
            image: () => new Response(new Uint8Array([1, 2, 3])).body!,
            contentType: () => o.format,
          }
        },
      }
      return handle
    },
  }
  const env: ImageDerivativeEnv = {
    INTERNAL_CALLBACK_SECRET: SECRET,
    GENERATION_BUCKET: bucket,
    R2_PUBLIC_URL: 'https://cdn.example.com/',
    IMAGES: images,
  }
  return { env, puts, transforms, outputs }
}

const VARIANTS = [
  { key: 'u/1.thumbnail.webp', maxSize: 768, quality: 78 },
  { key: 'u/1.preview.webp', maxSize: 1280, quality: 82 },
]

describe('handleImageDerivatives', () => {
  it('从 R2 读源图，按每个尺寸缩成 WebP 写回 R2，回 key 和公网地址', async () => {
    const { env, puts, transforms, outputs } = makeEnv()
    const response = await handleImageDerivatives(
      await signedRequest({ source: { key: 'u/1.png' }, variants: VARIANTS }),
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        variants: [
          {
            key: 'u/1.thumbnail.webp',
            url: 'https://cdn.example.com/u/1.thumbnail.webp',
          },
          {
            key: 'u/1.preview.webp',
            url: 'https://cdn.example.com/u/1.preview.webp',
          },
        ],
      },
    })
    expect(transforms).toEqual([
      { width: 768, height: 768, fit: 'scale-down' },
      { width: 1280, height: 1280, fit: 'scale-down' },
    ])
    // 小图恒静止：动图只取首帧（GIF 列表平时静止、悬停才播原件）。
    expect(outputs).toEqual([
      { format: 'image/webp', quality: 78, anim: false },
      { format: 'image/webp', quality: 82, anim: false },
    ])
    expect(puts).toEqual([
      { key: 'u/1.thumbnail.webp', size: 3, contentType: 'image/webp' },
      { key: 'u/1.preview.webp', size: 3, contentType: 'image/webp' },
    ])
  })

  it('URL 源带上调用方给的请求头去取', async () => {
    const { env } = makeEnv()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array(8)))
    try {
      const response = await handleImageDerivatives(
        await signedRequest({
          source: {
            url: 'https://provider.example.com/poster.jpg',
            headers: { Authorization: 'Key abc' },
          },
          variants: [VARIANTS[0]],
        }),
        env,
      )
      expect(response.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://provider.example.com/poster.jpg',
        { headers: { Authorization: 'Key abc' } },
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('签名不对直接 401，什么都不读', async () => {
    const { env } = makeEnv()
    const request = await signedRequest({
      source: { key: 'u/1.png' },
      variants: VARIANTS,
    })
    request.headers.set('X-Execution-Signature', '00')
    const response = await handleImageDerivatives(request, env)
    expect(response.status).toBe(401)
    expect(env.GENERATION_BUCKET.get).not.toHaveBeenCalled()
  })

  it('源图不存在回 404，超过 Images 的 20 MB 上限回 413', async () => {
    const missing = makeEnv({ missing: true })
    expect(
      (
        await handleImageDerivatives(
          await signedRequest({
            source: { key: 'u/x.png' },
            variants: VARIANTS,
          }),
          missing.env,
        )
      ).status,
    ).toBe(404)

    const big = makeEnv({ sourceSize: IMAGE_DERIVATIVE_MAX_SOURCE_BYTES + 1 })
    const response = await handleImageDerivatives(
      await signedRequest({ source: { key: 'u/1.png' }, variants: VARIANTS }),
      big.env,
    )
    expect(response.status).toBe(413)
    expect(big.puts).toEqual([])
  })

  it('参数不合法回 400：没有尺寸、尺寸越界、源不是 https', async () => {
    const { env } = makeEnv()
    for (const body of [
      { source: { key: 'u/1.png' }, variants: [] },
      {
        source: { key: 'u/1.png' },
        variants: [{ key: 'a', maxSize: 9999, quality: 80 }],
      },
      { source: { url: 'http://x.example.com/a.png' }, variants: VARIANTS },
    ]) {
      const response = await handleImageDerivatives(
        await signedRequest(body),
        env,
      )
      expect(response.status).toBe(400)
    }
  })
})
