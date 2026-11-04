/**
 * L2a 真库：局部重绘（/api/image/inpaint）与流式改图（/api/image/edit-stream）。
 * 只假边界：Clerk 登录、限流、服务商与执行 Worker（fetch）、R2 的真 I/O。
 * 选 key、真解密、落作品行全真：核库里的作品行、发给服务商的请求与返回内容。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { POST as EDIT_STREAM } from '@/app/api/image/edit-stream/route'
import { POST as INPAINT } from '@/app/api/image/inpaint/route'
import { db } from '@/lib/db'
import { encodePng } from '@/lib/image-pixels'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'

const SOURCE = 'https://example.com/source.png'
const FAL_RESULT = 'https://fal.media/inpainted.png'
const FAL_INPAINT = `${AI_PROVIDER_ENDPOINTS.FAL}/fal-ai/flux-pro/v1/fill`
const OPENAI_EDITS = `${AI_PROVIDER_ENDPOINTS.OPENAI}/edits`

let me: Awaited<ReturnType<typeof createTestUser>>
let worker: FakeExecutionWorker
/** 打给服务商的请求（Worker 之外）。 */
let providerCalls: Array<{ url: string; init?: RequestInit }>
let openAiStream: string

async function png(width: number, height: number) {
  return encodePng({
    width,
    height,
    data: new Uint8Array(width * height * 4).fill(255),
  })
}

/** 左半白（要改）、右半黑（保留）。 */
async function halfMask(size: number) {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const value = i % size < size / 2 ? 255 : 0
    data.set([value, value, value, 255], i * 4)
  }
  return encodePng({ width: size, height: size, data })
}

let maskDataUrl: string

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  providerCalls = []
  const source = await png(4, 4)
  fakeBucket.remote.set(SOURCE, { buffer: source, mimeType: 'image/png' })
  fakeBucket.remote.set(FAL_RESULT, { buffer: source, mimeType: 'image/png' })
  maskDataUrl = `data:image/png;base64,${(await halfMask(4)).toString('base64')}`
  const final = (await png(6, 3)).toString('base64')
  openAiStream =
    `event: image_edit.partial_image\ndata: ${JSON.stringify({ type: 'image_edit.partial_image', b64_json: 'cGFydGlhbA==', partial_image_index: 0 })}\n\n` +
    `event: image_edit.completed\ndata: ${JSON.stringify({ type: 'image_edit.completed', b64_json: final })}\n\n`
  worker = installFakeExecutionWorker({
    other: (url, init) => {
      providerCalls.push({ url, init })
      if (url === FAL_INPAINT) {
        return Response.json({
          image: { url: FAL_RESULT, width: 1024, height: 768 },
        })
      }
      if (url === OPENAI_EDITS) {
        return new Response(openAiStream, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      return new Response('not found', { status: 404 })
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const INPAINT_BODY = {
  imageUrl: SOURCE,
  prompt: 'replace the sky',
  negativePrompt: 'low quality',
}

describe('POST /api/image/inpaint', () => {
  it('没登录 401、提示词空 400：⛔ 打服务商', async () => {
    mockUnauthenticated()
    expect(
      (
        await INPAINT(
          createPOST('/api/image/inpaint', {
            ...INPAINT_BODY,
            maskImageUrl: maskDataUrl,
          }),
        )
      ).status,
    ).toBe(401)

    mockAuthenticated(me.clerkId)
    expect(
      (
        await INPAINT(
          createPOST('/api/image/inpaint', {
            ...INPAINT_BODY,
            maskImageUrl: maskDataUrl,
            prompt: '',
          }),
        )
      ).status,
    ).toBe(400)
    expect(providerCalls).toEqual([])
  })

  it('fal 重绘：用选中的 key、带遮罩和反向词；结果转存进自己的桶、落一行作品', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)

    const res = await INPAINT(
      createPOST('/api/image/inpaint', {
        ...INPAINT_BODY,
        maskImageUrl: maskDataUrl,
        apiKeyId: key.id,
        sourceGenerationId: 'gen-source',
      }),
    )
    const json = await parseJSON<{
      success: boolean
      data: {
        imageUrl: string
        width: number
        height: number
        generation: { id: string; url: string }
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.data).toMatchObject({
      imageUrl: FAL_RESULT,
      width: 1024,
      height: 768,
    })
    expect(providerCalls).toHaveLength(1)
    const sent = JSON.parse(String(providerCalls[0]!.init?.body)) as Record<
      string,
      unknown
    >
    expect(sent).toEqual({
      image_url: SOURCE,
      mask_url: maskDataUrl,
      prompt: 'replace the sky',
      negative_prompt: 'low quality',
    })
    expect(
      new Headers(providerCalls[0]!.init?.headers).get('authorization'),
    ).toBe('Key sk-test-not-a-real-key')

    const row = await db.generation.findUniqueOrThrow({
      where: { id: json.data.generation.id },
    })
    expect(row).toMatchObject({
      userId: me.id,
      prompt: 'replace the sky',
      width: 1024,
      height: 768,
      model: 'inpaint',
      provider: AI_ADAPTER_TYPES.FAL,
    })
    expect(row.url.startsWith(`${FAKE_CDN}/`)).toBe(true)
    expect(fakeBucket.objects.has(row.storageKey)).toBe(true)
  })

  it('选的 key 是别家的：400，⛔ 打服务商、⛔ 落作品', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)

    const res = await INPAINT(
      createPOST('/api/image/inpaint', {
        ...INPAINT_BODY,
        maskImageUrl: maskDataUrl,
        apiKeyId: key.id,
      }),
    )

    expect(res.status).toBe(400)
    expect(providerCalls).toEqual([])
    expect(await db.generation.count()).toBe(0)
  })

  it('Ideogram：派成异步任务交回任务号，⛔ 当场落作品', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.IDEOGRAM)
    fakeBucket.objects.set('source.png', await png(4, 4))

    const res = await INPAINT(
      createPOST('/api/image/inpaint', {
        prompt: 'replace the sky',
        imageUrl: `${FAKE_CDN}/source.png`,
        maskImageUrl: maskDataUrl,
        apiKeyId: key.id,
        modelId: 'ideogram-4.5',
        referenceImages: [`${FAKE_CDN}/ref.png`],
      }),
    )
    const json = await parseJSON<{
      data: { jobId: string; requestId: string }
    }>(res)

    const job = await db.generationJob.findFirstOrThrow({
      where: { userId: me.id },
    })
    expect(json.data.jobId).toBe(job.id)
    expect(worker.requests).toHaveLength(1)
    expect(worker.requests[0]!.json).toMatchObject({ apiKeyId: key.id })
    expect(providerCalls).toEqual([])
    expect(await db.generation.count()).toBe(0)
  })
})

describe('POST /api/image/edit-stream', () => {
  const STREAM_BODY = {
    action: 'inpaint',
    imageUrl: SOURCE,
    prompt: 'Change the sky',
    modelId: 'gpt-image-2.5-sunburst',
    options: { quality: 'max' },
  }

  it('没登录 401、画质不认 400：⛔ 打服务商', async () => {
    mockUnauthenticated()
    expect(
      (
        await EDIT_STREAM(
          createPOST('/api/image/edit-stream', {
            ...STREAM_BODY,
            maskImageUrl: maskDataUrl,
          }),
        )
      ).status,
    ).toBe(401)

    mockAuthenticated(me.clerkId)
    expect(
      (
        await EDIT_STREAM(
          createPOST('/api/image/edit-stream', {
            ...STREAM_BODY,
            maskImageUrl: maskDataUrl,
            options: { quality: 'ultra' },
          }),
        )
      ).status,
    ).toBe(400)
    expect(providerCalls).toEqual([])
  })

  it('没配 OpenAI key：开流之前就 400', async () => {
    const res = await EDIT_STREAM(
      createPOST('/api/image/edit-stream', {
        ...STREAM_BODY,
        maskImageUrl: maskDataUrl,
      }),
    )

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).not.toBe('text/event-stream')
    expect(providerCalls).toEqual([])
  })

  it('流里先给预览、最后给成图，成图落一行作品', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)

    const res = await EDIT_STREAM(
      createPOST('/api/image/edit-stream', {
        ...STREAM_BODY,
        maskImageUrl: maskDataUrl,
      }),
    )
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const text = await res.text()

    expect(text).toContain('event: open')
    expect(text).toContain('event: preview')
    expect(text).toContain('data:image/png;base64,cGFydGlhbA==')
    expect(text).toContain('event: completed')
    const form = providerCalls[0]!.init?.body as FormData
    expect(form.get('stream')).toBe('true')
    expect(form.get('quality')).toBe('max')
    expect(form.get('mask')).toBeInstanceOf(Blob)

    const row = await db.generation.findFirstOrThrow({
      where: { userId: me.id },
    })
    expect(row).toMatchObject({
      prompt: 'Change the sky',
      width: 6,
      height: 3,
      provider: AI_ADAPTER_TYPES.OPENAI,
    })
  })
})
