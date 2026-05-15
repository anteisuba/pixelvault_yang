import { describe, it, expect, vi, beforeEach } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'

const { GenerateImageServiceErrorMock, generateImageMock } = vi.hoisted(() => {
  class GenerateImageServiceErrorMock extends Error {
    readonly code: string
    readonly status: number

    constructor(code: string, message: string, status: number) {
      super(message)
      this.code = code
      this.status = status
    }
  }

  return {
    GenerateImageServiceErrorMock,
    generateImageMock: vi.fn(),
  }
})

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn().mockResolvedValue({ id: 'db-user-1' }),
}))

vi.mock('@/services/generate-image.service', () => ({
  GenerateImageServiceError: GenerateImageServiceErrorMock,
  resolveGenerationRoute: vi.fn(),
}))

vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: vi.fn(() => ({
    generateImage: generateImageMock,
  })),
}))

vi.mock('@/services/usage.service', () => ({
  createApiUsageEntry: vi.fn().mockResolvedValue({ id: 'usage-1' }),
}))

vi.mock('@/lib/circuit-breaker', () => ({
  getCircuitBreaker: vi.fn(() => ({
    call: (fn: () => Promise<unknown>) => fn(),
  })),
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { generateMultiView } from './multiview-generate.service'
import { resolveGenerationRoute } from '@/services/generate-image.service'
import { createApiUsageEntry } from '@/services/usage.service'
import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_PROMPTS,
  THREE_D_READY_NEGATIVE,
} from '@/constants/three-d-ready-prompt'

const mockResolveRoute = vi.mocked(resolveGenerationRoute)
const mockCreateUsage = vi.mocked(createApiUsageEntry)

const fakeRoute = {
  modelId: AI_MODELS.FLUX_KONTEXT_PRO,
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.example.com' },
  apiKey: 'fal-key',
  resolvedApiKeyId: 'key-1',
  creditCost: 2,
}

const fakeImageResult = (name: string) => ({
  imageUrl: `https://provider.example.com/${name}.png`,
  width: 1024,
  height: 1024,
  requestCount: 1,
})

describe('generateMultiView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveRoute.mockResolvedValue(fakeRoute)
  })

  it('calls the provider once per non-front angle in parallel', async () => {
    generateImageMock
      .mockResolvedValueOnce(fakeImageResult('back'))
      .mockResolvedValueOnce(fakeImageResult('left'))
      .mockResolvedValueOnce(fakeImageResult('right'))

    const result = await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
      sourceGenerationId: 'src_1',
    })

    expect(generateImageMock).toHaveBeenCalledTimes(
      GENERATED_VIEW_ANGLES.length,
    )
    expect(result.views).toHaveLength(3)
    expect(result.views.map((v) => v.view)).toEqual(['back', 'left', 'right'])
    expect(result.views.map((v) => v.url)).toEqual([
      'https://provider.example.com/back.png',
      'https://provider.example.com/left.png',
      'https://provider.example.com/right.png',
    ])
  })

  it('passes the front view as referenceImage and applies negative prompt', async () => {
    generateImageMock.mockResolvedValue(fakeImageResult('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    for (const call of generateImageMock.mock.calls) {
      const [input] = call
      expect(input.referenceImage).toBe('https://cdn.test/front.png')
      expect(input.aspectRatio).toBe('1:1')
      expect(input.advancedParams?.negativePrompt).toBe(THREE_D_READY_NEGATIVE)
    }
  })

  it('defaults to a fal reference-edit route for temporary provider URLs', async () => {
    generateImageMock.mockResolvedValue(fakeImageResult('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    expect(mockResolveRoute).toHaveBeenCalledWith('db-user-1', {
      modelId: AI_MODELS.FLUX_KONTEXT_PRO,
      apiKeyId: undefined,
    })
  })

  it('uses the camera-angle prompts in stable order', async () => {
    generateImageMock.mockResolvedValue(fakeImageResult('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    expect(generateImageMock.mock.calls[0][0].prompt).toBe(
      MULTI_VIEW_PROMPTS.back,
    )
    expect(generateImageMock.mock.calls[1][0].prompt).toBe(
      MULTI_VIEW_PROMPTS.left,
    )
    expect(generateImageMock.mock.calls[2][0].prompt).toBe(
      MULTI_VIEW_PROMPTS.right,
    )
  })

  it('honours user-supplied modelId / apiKeyId', async () => {
    generateImageMock.mockResolvedValue(fakeImageResult('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
      modelId: 'gemini-3-pro-image-preview',
      apiKeyId: 'key_42',
      projectId: 'proj_99',
    })

    expect(mockResolveRoute).toHaveBeenCalledWith('db-user-1', {
      modelId: 'gemini-3-pro-image-preview',
      apiKeyId: 'key_42',
    })
  })

  it('records usage without creating Generation rows', async () => {
    generateImageMock.mockResolvedValue(fakeImageResult('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    expect(mockCreateUsage).toHaveBeenCalledTimes(3)
    expect(mockCreateUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'db-user-1',
        requestCount: 2,
        inputImageCount: 1,
        outputImageCount: 1,
      }),
    )
  })

  it('returns partial results when some angles fail', async () => {
    generateImageMock
      .mockResolvedValueOnce(fakeImageResult('back'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(fakeImageResult('right'))

    const result = await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    expect(result.views).toHaveLength(2)
    expect(result.views.map((v) => v.view)).toEqual(['back', 'right'])
  })

  it('throws a provider error when every angle fails', async () => {
    generateImageMock.mockRejectedValue(new Error('upstream down'))

    await expect(
      generateMultiView('clerk_test', {
        imageUrl: 'https://cdn.test/front.png',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 502,
    })
  })
})
