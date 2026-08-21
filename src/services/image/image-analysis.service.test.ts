import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('server-only', () => ({}))

const mockImageAnalysisCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    imageAnalysis: {
      create: (...args: unknown[]) => mockImageAnalysisCreate(...args),
      findUnique: vi.fn(),
    },
  },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockLlmTextCompletion = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
}))

/**
 * 切片 2 收编：路由从 `resolveLlmTextRoute` 换成 `resolveVisionRoute` ——
 * 用户选了看不了图的 key（DeepSeek / 通义 / 火山）时借一条能看图的，
 * 而不是把图发给一个瞎子然后拿回一段编造的描述。
 */
const mockResolveVisionRoute = vi.fn()
vi.mock('@/services/vision/vision-route.service', () => ({
  resolveVisionRoute: (...args: unknown[]) => mockResolveVisionRoute(...args),
}))

vi.mock('@/services/image/submit-image.service', () => ({
  submitImageGeneration: vi.fn(),
  waitForImageGenerationResult: vi.fn(),
}))

const mockFetchAsBuffer = vi.fn()
const mockGenerateStorageKey = vi.fn()
const mockIsOwnedStorageUrl = vi.fn()
const mockUploadToR2 = vi.fn()
const mockDetectTrustedImageMime = vi.fn()
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: (...args: unknown[]) => mockFetchAsBuffer(...args),
  generateStorageKey: (...args: unknown[]) => mockGenerateStorageKey(...args),
  isOwnedStorageUrl: (...args: unknown[]) => mockIsOwnedStorageUrl(...args),
  uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
  detectTrustedImageMime: (...args: unknown[]) =>
    mockDetectTrustedImageMime(...args),
}))

import {
  ANALYSIS_MAX_IMAGE_BYTES,
  analyzeImage,
} from '@/services/image/image-analysis.service'

describe('analyzeImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue({ id: 'db_user_1' })
    mockResolveVisionRoute.mockResolvedValue({
      route: {
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: { label: 'Gemini', baseUrl: 'https://gemini.test' },
        apiKey: 'gemini-key',
      },
      borrowed: false,
    })
    mockLlmTextCompletion.mockResolvedValue('generated prompt')
    mockFetchAsBuffer.mockResolvedValue({
      buffer: Buffer.from('image-bytes'),
      mimeType: 'image/png',
    })
    mockGenerateStorageKey.mockReturnValue(
      'generations/db_user_1/image/key.png',
    )
    mockIsOwnedStorageUrl.mockReturnValue(false)
    mockUploadToR2.mockResolvedValue(
      'https://cdn.test.com/generations/db_user_1/image/key.png',
    )
    mockDetectTrustedImageMime.mockResolvedValue({
      format: 'png',
      mimeType: 'image/png',
      width: 512,
      height: 512,
    })
    mockImageAnalysisCreate.mockResolvedValue({
      id: 'analysis_1',
      generatedPrompt: 'generated prompt',
      sourceImageUrl:
        'https://cdn.test.com/generations/db_user_1/image/key.png',
    })
  })

  it('re-uploads third-party image URLs and sends the stable R2 URL to LLM vision', async () => {
    const result = await analyzeImage(
      'clerk_user_1',
      'https://example.com/reference.png',
    )

    expect(mockFetchAsBuffer).toHaveBeenCalledWith(
      'https://example.com/reference.png',
      { maxBytes: ANALYSIS_MAX_IMAGE_BYTES },
    )
    expect(mockUploadToR2).toHaveBeenCalledWith({
      data: Buffer.from('image-bytes'),
      key: 'generations/db_user_1/image/key.png',
      mimeType: 'image/png',
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: 'https://cdn.test.com/generations/db_user_1/image/key.png',
      }),
    )
    expect(mockImageAnalysisCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceImageUrl:
          'https://cdn.test.com/generations/db_user_1/image/key.png',
        sourceStorageKey: 'generations/db_user_1/image/key.png',
      }),
    })
    expect(result.sourceImageUrl).toBe(
      'https://cdn.test.com/generations/db_user_1/image/key.png',
    )
  })

  it('applies the same byte cap before uploading data URL inputs', async () => {
    const imageData = `data:image/png;base64,${Buffer.from('inline').toString('base64')}`

    await analyzeImage('clerk_user_1', imageData)

    expect(mockFetchAsBuffer).toHaveBeenCalledWith(imageData, {
      maxBytes: ANALYSIS_MAX_IMAGE_BYTES,
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: 'https://cdn.test.com/generations/db_user_1/image/key.png',
      }),
    )
  })

  // ─── 切片 2 收编后的回归：Arena 反推路径必须原样不动 ─────────────

  it('keeps the Arena reverse-prompt path on plain text with no dimensions', async () => {
    const result = await analyzeImage(
      'clerk_user_1',
      'https://example.com/a.png',
    )

    // 没有 dimensions = 反推提示词。它的产物是一段可直接生成的文本，
    // 不是结构化观察 —— 不许被收编成 JSON。
    expect(
      mockLlmTextCompletion.mock.calls[0][0].responseFormat,
    ).toBeUndefined()
    expect(result.generatedPrompt).toBe('generated prompt')
    expect(result.dimensions).toBeNull()
  })

  it('keeps a single-dimension request on plain text too', async () => {
    mockLlmTextCompletion.mockResolvedValue('watercolour, soft light')
    mockImageAnalysisCreate.mockResolvedValue({
      id: 'analysis_1',
      generatedPrompt: 'watercolour, soft light',
      sourceImageUrl:
        'https://cdn.test.com/generations/db_user_1/image/key.png',
    })

    const result = await analyzeImage(
      'clerk_user_1',
      'https://example.com/a.png',
      ['artStyle'],
    )

    expect(result.dimensions).toEqual({ artStyle: 'watercolour, soft light' })
    expect(result.generatedPrompt).toBe('watercolour, soft light')
  })

  it('parses a multi-dimension request through the shared structured pipeline', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      '```json\n' +
        JSON.stringify({
          artStyle: 'watercolour',
          character: 'pink-haired swordswoman',
          overall: 'a pink-haired swordswoman, watercolour',
        }) +
        '\n```',
    )
    mockImageAnalysisCreate.mockResolvedValue({
      id: 'analysis_1',
      generatedPrompt: 'a pink-haired swordswoman, watercolour',
      sourceImageUrl:
        'https://cdn.test.com/generations/db_user_1/image/key.png',
    })

    const result = await analyzeImage(
      'clerk_user_1',
      'https://example.com/a.png',
      ['artStyle', 'character', 'overall'],
    )

    expect(result.dimensions).toEqual({
      artStyle: 'watercolour',
      character: 'pink-haired swordswoman',
      overall: 'a pink-haired swordswoman, watercolour',
    })
    // `overall` 仍然优先当反推提示词 —— 形态不变。
    expect(result.generatedPrompt).toBe(
      'a pink-haired swordswoman, watercolour',
    )
  })

  it('no longer degrades a multi-dimension request into one blob when the JSON is broken', async () => {
    // 收编前这里是 `catch { dimensions = { overall: raw } }` —— 四维请求解析失败会
    // **静默降级成一维**，字段齐全、内容错位、零报错。现在打回重试一次，仍不行就抛。
    mockLlmTextCompletion.mockResolvedValue('I think it looks quite nice!')

    await expect(
      analyzeImage('clerk_user_1', 'https://example.com/a.png', [
        'artStyle',
        'character',
      ]),
    ).rejects.toMatchObject({ errorCode: 'VISION_INVALID_OUTPUT' })

    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    expect(mockImageAnalysisCreate).not.toHaveBeenCalled()
  })

  it('borrows an image-capable route instead of resolving a text-only one', async () => {
    await analyzeImage(
      'clerk_user_1',
      'https://example.com/a.png',
      undefined,
      'key_deepseek',
    )

    expect(mockResolveVisionRoute).toHaveBeenCalledWith(
      'db_user_1',
      'key_deepseek',
    )
  })
})
