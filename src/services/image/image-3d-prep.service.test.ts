import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
  uploadToR2: vi.fn(),
}))

vi.mock('@/services/image/image-edit.service', () => ({
  upscaleImage: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

/**
 * ⭐ 语义预检的路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），只桩库与
 * 补全那一跳（owner 2026-10-15「全跟助手」）。
 */
const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personaFindUnique: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: { findFirst: keyStore.findFirst, findMany: keyStore.findMany },
    assistantPersona: { findUnique: keyStore.personaFindUnique },
  },
}))
vi.mock('@/lib/crypto', () => ({
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))

vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: vi.fn(),
}))

import sharp from 'sharp'

import {
  inspect3DSourceImageQuality,
  prepare3DSourceImage,
} from './image-3d-prep.service'
import { fetchAsBuffer, uploadToR2 } from '@/services/storage/r2'
import { upscaleImage } from '@/services/image/image-edit.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

const mockFetch = vi.mocked(fetchAsBuffer)
const mockUpload = vi.mocked(uploadToR2)
const mockUpscale = vi.mocked(upscaleImage)
const mockLlmTextCompletion = vi.mocked(llmTextCompletion)

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

describe('prepare3DSourceImage', () => {
  const baseParams = {
    imageUrl: 'https://cdn.test/source.png',
    userId: 'user_1',
    falApiKey: 'fal_key',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue('https://cdn.test/prep/out.png')
  })

  it('returns the original URL when image is already ≥1024px and square', async () => {
    const buf = await makePng(1024, 1024)
    mockFetch.mockResolvedValueOnce({ buffer: buf, mimeType: 'image/png' })

    const result = await prepare3DSourceImage(baseParams)

    expect(result).toBe(baseParams.imageUrl)
    expect(mockUpscale).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('upscales when the long edge is below 1024px', async () => {
    const small = await makePng(512, 512)
    const upscaled = await makePng(2048, 2048)
    mockFetch
      .mockResolvedValueOnce({ buffer: small, mimeType: 'image/png' })
      .mockResolvedValueOnce({ buffer: upscaled, mimeType: 'image/png' })
    mockUpscale.mockResolvedValue({
      imageUrl: 'https://cdn.test/upscaled.png',
      width: 2048,
      height: 2048,
    })

    await prepare3DSourceImage(baseParams)

    expect(mockUpscale).toHaveBeenCalledWith(
      baseParams.imageUrl,
      baseParams.falApiKey,
    )
    expect(mockUpload).toHaveBeenCalledTimes(1)
  })

  it('white-pads to square when aspect is non-1:1', async () => {
    const wide = await makePng(1600, 900)
    mockFetch.mockResolvedValueOnce({ buffer: wide, mimeType: 'image/png' })

    const result = await prepare3DSourceImage(baseParams)

    expect(mockUpscale).not.toHaveBeenCalled()
    expect(mockUpload).toHaveBeenCalledTimes(1)
    const uploadCall = mockUpload.mock.calls[0][0]
    const finalMeta = await sharp(uploadCall.data).metadata()
    expect(finalMeta.width).toBe(1600)
    expect(finalMeta.height).toBe(1600)
    expect(result).toBe('https://cdn.test/prep/out.png')
  })

  it('uploads under the prep/{userId}/ prefix', async () => {
    const wide = await makePng(1600, 900)
    mockFetch.mockResolvedValueOnce({ buffer: wide, mimeType: 'image/png' })

    await prepare3DSourceImage(baseParams)

    const uploadCall = mockUpload.mock.calls[0][0]
    expect(uploadCall.key.startsWith(`prep/${baseParams.userId}/`)).toBe(true)
    expect(uploadCall.key.endsWith('.png')).toBe(true)
    expect(uploadCall.mimeType).toBe('image/png')
  })

  it('falls back to the original URL when upscale fails (size stays square)', async () => {
    const small = await makePng(512, 512)
    mockFetch.mockResolvedValueOnce({ buffer: small, mimeType: 'image/png' })
    mockUpscale.mockRejectedValueOnce(new Error('upscale down'))

    const result = await prepare3DSourceImage(baseParams)

    // square + upscale-failed → no padding either → no upload, original url
    expect(result).toBe(baseParams.imageUrl)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('falls back to the original URL when fetch fails entirely', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    const result = await prepare3DSourceImage(baseParams)

    expect(result).toBe(baseParams.imageUrl)
  })

  it('combines upscale + pad when both are needed', async () => {
    const small = await makePng(512, 384)
    const upscaled = await makePng(2048, 1536)
    mockFetch
      .mockResolvedValueOnce({ buffer: small, mimeType: 'image/png' })
      .mockResolvedValueOnce({ buffer: upscaled, mimeType: 'image/png' })
    mockUpscale.mockResolvedValue({
      imageUrl: 'https://cdn.test/upscaled.png',
      width: 2048,
      height: 1536,
    })

    await prepare3DSourceImage(baseParams)

    expect(mockUpscale).toHaveBeenCalledTimes(1)
    expect(mockUpload).toHaveBeenCalledTimes(1)
    const uploadCall = mockUpload.mock.calls[0][0]
    const finalMeta = await sharp(uploadCall.data).metadata()
    expect(finalMeta.width).toBe(2048)
    expect(finalMeta.height).toBe(2048)
  })
})

describe('inspect3DSourceImageQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes a near-square source above the minimum edge', async () => {
    const buf = await makePng(1024, 1024)
    mockFetch.mockResolvedValueOnce({ buffer: buf, mimeType: 'image/png' })

    const result = await inspect3DSourceImageQuality(
      'https://cdn.test/source.png',
    )

    expect(result.width).toBe(1024)
    expect(result.height).toBe(1024)
    expect(result.blockingIssues).toEqual([])
  })

  it('blocks sources below the minimum short edge', async () => {
    const buf = await makePng(511, 768)
    mockFetch.mockResolvedValueOnce({ buffer: buf, mimeType: 'image/png' })

    const result = await inspect3DSourceImageQuality(
      'https://cdn.test/source.png',
    )

    expect(result.blockingIssues).toContain('too_small')
  })

  it('blocks extreme aspect ratios', async () => {
    const buf = await makePng(1800, 600)
    mockFetch.mockResolvedValueOnce({ buffer: buf, mimeType: 'image/png' })

    const result = await inspect3DSourceImageQuality(
      'https://cdn.test/source.png',
    )

    expect(result.blockingIssues).toContain('extreme_aspect_ratio')
  })

  it('adds semantic blockers when vision inspection is available', async () => {
    const buf = await makePng(1024, 1024)
    mockFetch.mockResolvedValueOnce({ buffer: buf, mimeType: 'image/png' })
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'user_1' })],
    })
    mockLlmTextCompletion.mockResolvedValueOnce(
      '{"issues":["multi_subject","strong_shadow"]}',
    )

    const result = await inspect3DSourceImageQuality(
      'https://cdn.test/source.png',
      { userId: 'user_1' },
    )

    expect(result.blockingIssues).toEqual(['multi_subject', 'strong_shadow'])
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmTextCompletion, '3d precheck'),
      ],
      { adapterType: AI_ADAPTER_TYPES.GEMINI },
    )
  })

  /**
   * 「全跟助手」（owner 2026-10-15）：预检用助手那一家、那个型号；它看不了图就跳过预检
   * （尺寸那几条照旧），⛔ 不借别家能看图的 key。
   */
  it('助手选的 DeepSeek V4 Pro 看不了图 → 跳过语义预检，⛔ 不借 Gemini', async () => {
    const buf = await makePng(1024, 1024)
    mockFetch.mockResolvedValueOnce({ buffer: buf, mimeType: 'image/png' })
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK, { userId: 'user_1' }),
        assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'user_1' }),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })

    const result = await inspect3DSourceImageQuality(
      'https://cdn.test/source.png',
      { userId: 'user_1' },
    )

    expect(result.blockingIssues).toEqual([])
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmTextCompletion, '3d precheck'),
      ],
      { adapterType: AI_ADAPTER_TYPES.DEEPSEEK },
    )
  })

  it('「自动」挑的那一家（OpenAI）连型号一起用', async () => {
    const buf = await makePng(1024, 1024)
    mockFetch.mockResolvedValueOnce({ buffer: buf, mimeType: 'image/png' })
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.XAI, { userId: 'user_1' }),
        assistantKey(AI_ADAPTER_TYPES.OPENAI, { userId: 'user_1' }),
      ],
    })
    mockLlmTextCompletion.mockResolvedValueOnce('{"issues":[]}')

    await inspect3DSourceImageQuality('https://cdn.test/source.png', {
      userId: 'user_1',
    })

    expect(mockLlmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    })
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmTextCompletion, '3d precheck'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.OPENAI}`,
      },
    )
  })
})
