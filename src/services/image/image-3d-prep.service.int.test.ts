/**
 * L2a 真库：转 3D 前的源图预处理与预检。
 * 放大走真的 `upscaleImage`（只假 fal 的 fetch），图存取走假 R2 桶；
 * 语义预检的路由是真的（真 key / 人设行 → `resolveAssistantRoute`），只假补全那一跳。
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)
const mockLlmTextCompletion = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
}))

import sharp from 'sharp'

import { AI_PROVIDER_ENDPOINTS, LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  inspect3DSourceImageQuality,
  prepare3DSourceImage,
} from '@/services/image/image-3d-prep.service'
import { plainKeyOf, seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

const SOURCE = `${FAKE_CDN}/source.png`
const UPSCALED = `${FAKE_CDN}/upscaled.png`

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 100, b: 100, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
}

/** 远端（CDN / fal 的产物地址）上放一张图。 */
async function hostPng(url: string, width: number, height: number) {
  fakeBucket.remote.set(url, {
    buffer: await makePng(width, height),
    mimeType: 'image/png',
  })
}

let userId: string
/** fal 收到的放大请求；`falReply` 决定它怎么回。 */
let falCalls: { url: string; body: Record<string, unknown>; auth: string }[]
let falReply: () => Response

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  mockLlmTextCompletion.mockReset()
  userId = (await createTestUser()).id
  falCalls = []
  falReply = () =>
    Response.json({ image: { url: UPSCALED, width: 2048, height: 2048 } })
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.startsWith(AI_PROVIDER_ENDPOINTS.FAL))
      return new Response('unexpected', { status: 404 })
    falCalls.push({
      url,
      body: JSON.parse(String(init?.body)),
      auth: new Headers(init?.headers).get('Authorization') ?? '',
    })
    return falReply()
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('prepare3DSourceImage', () => {
  const params = () => ({ imageUrl: SOURCE, userId, falApiKey: 'fal_key' })
  const uploadedPng = async () => {
    expect(fakeBucket.uploads).toHaveLength(1)
    const key = fakeBucket.uploads[0]!
    return { key, meta: await sharp(fakeBucket.objects.get(key)).metadata() }
  }

  it('已经 ≥1024 且是方的：原样交回，不放大也不上传', async () => {
    await hostPng(SOURCE, 1024, 1024)

    expect(await prepare3DSourceImage(params())).toBe(SOURCE)
    expect(falCalls).toEqual([])
    expect(fakeBucket.uploads).toEqual([])
  })

  it('长边不到 1024：用她的 fal key 放大，放大后的那张存进 prep/', async () => {
    await hostPng(SOURCE, 512, 512)
    await hostPng(UPSCALED, 2048, 2048)

    const result = await prepare3DSourceImage(params())

    expect(falCalls).toHaveLength(1)
    expect(falCalls[0]).toMatchObject({
      body: { image_url: SOURCE },
      auth: 'Key fal_key',
    })
    const { key, meta } = await uploadedPng()
    expect(result).toBe(`${FAKE_CDN}/${key}`)
    expect([meta.width, meta.height]).toEqual([2048, 2048])
  })

  it('不是方的：白边补成方，存在 prep/<userId>/ 下的 PNG', async () => {
    await hostPng(SOURCE, 1600, 900)

    const result = await prepare3DSourceImage(params())

    expect(falCalls).toEqual([])
    const { key, meta } = await uploadedPng()
    expect(key.startsWith(`prep/${userId}/`)).toBe(true)
    expect(key.endsWith('.png')).toBe(true)
    expect([meta.width, meta.height]).toEqual([1600, 1600])
    expect(result).toBe(`${FAKE_CDN}/${key}`)
  })

  it('放大失败（方图）：不补边也不上传，交回原图', async () => {
    await hostPng(SOURCE, 512, 512)
    falReply = () => new Response('upscale down', { status: 500 })

    expect(await prepare3DSourceImage(params())).toBe(SOURCE)
    expect(fakeBucket.uploads).toEqual([])
  })

  it('原图取不到：交回原图（预处理是优化，不是关卡）', async () => {
    expect(await prepare3DSourceImage(params())).toBe(SOURCE)
    expect(fakeBucket.uploads).toEqual([])
  })

  it('既小又不方：先放大再补边', async () => {
    await hostPng(SOURCE, 512, 384)
    await hostPng(UPSCALED, 2048, 1536)
    falReply = () =>
      Response.json({ image: { url: UPSCALED, width: 2048, height: 1536 } })

    await prepare3DSourceImage(params())

    expect(falCalls).toHaveLength(1)
    const { meta } = await uploadedPng()
    expect([meta.width, meta.height]).toEqual([2048, 2048])
  })
})

describe('inspect3DSourceImageQuality', () => {
  let findFirstSpy: MockInstance

  beforeEach(() => {
    findFirstSpy = vi.spyOn(db.userApiKey, 'findFirst')
  })
  const usesOf = () => [
    ...keyLookupUsesOf(findFirstSpy),
    ...providerUsesOf(mockLlmTextCompletion, '3d precheck'),
  ]

  it('近方、够大：没有阻断项', async () => {
    await hostPng(SOURCE, 1024, 1024)

    expect(await inspect3DSourceImageQuality(SOURCE)).toEqual({
      width: 1024,
      height: 1024,
      blockingIssues: [],
    })
  })

  it('短边不够：too_small', async () => {
    await hostPng(SOURCE, 511, 768)

    expect(
      (await inspect3DSourceImageQuality(SOURCE)).blockingIssues,
    ).toContain('too_small')
  })

  it('比例太极端：extreme_aspect_ratio', async () => {
    await hostPng(SOURCE, 1800, 600)

    expect(
      (await inspect3DSourceImageQuality(SOURCE)).blockingIssues,
    ).toContain('extreme_aspect_ratio')
  })

  it('助手那一家看得了图：加上语义阻断项，只用那一家', async () => {
    await hostPng(SOURCE, 1024, 1024)
    await seedAssistantKeys(userId, {
      keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI }],
    })
    mockLlmTextCompletion.mockResolvedValueOnce(
      '{"issues":["multi_subject","strong_shadow"]}',
    )

    const result = await inspect3DSourceImageQuality(SOURCE, { userId })

    expect(result.blockingIssues).toEqual(['multi_subject', 'strong_shadow'])
    expectSelectedProviderOnly(usesOf(), {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
    })
  })

  /**
   * 「全跟助手」（owner 2026-10-15）：预检用助手那一家、那个型号；它看不了图就跳过预检
   * （尺寸那几条照旧），⛔ 不借别家能看图的 key。
   */
  it('助手选的 DeepSeek V4 Pro 看不了图 → 跳过语义预检，⛔ 不借 Gemini', async () => {
    await hostPng(SOURCE, 1024, 1024)
    await seedAssistantKeys(userId, {
      keys: [
        { adapterType: AI_ADAPTER_TYPES.DEEPSEEK },
        { adapterType: AI_ADAPTER_TYPES.GEMINI },
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })

    const result = await inspect3DSourceImageQuality(SOURCE, { userId })

    expect(result.blockingIssues).toEqual([])
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
    expectSelectedProviderOnly(usesOf(), {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    })
  })

  it('「自动」挑的那一家（OpenAI）连型号一起用', async () => {
    await hostPng(SOURCE, 1024, 1024)
    await seedAssistantKeys(userId, {
      keys: [
        { adapterType: AI_ADAPTER_TYPES.XAI },
        { adapterType: AI_ADAPTER_TYPES.OPENAI },
      ],
    })
    mockLlmTextCompletion.mockResolvedValueOnce('{"issues":[]}')

    await inspect3DSourceImageQuality(SOURCE, { userId })

    expect(mockLlmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    })
    expectSelectedProviderOnly(usesOf(), {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      apiKey: plainKeyOf(AI_ADAPTER_TYPES.OPENAI),
    })
  })
})
