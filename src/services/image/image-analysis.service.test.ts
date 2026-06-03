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

const mockLlmTextCompletion = vi.fn()
const mockResolveLlmTextRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
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
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://gemini.test' },
      apiKey: 'gemini-key',
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
})
