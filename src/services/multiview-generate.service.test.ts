import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/generate-image.service', () => ({
  generateImageForUser: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { generateMultiView } from './multiview-generate.service'
import { generateImageForUser } from '@/services/generate-image.service'
import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_PROMPTS,
  THREE_D_READY_NEGATIVE,
} from '@/constants/three-d-ready-prompt'

const mockGenerate = vi.mocked(generateImageForUser)

const fakeView = (id: string) =>
  ({
    id,
    url: `https://cdn.test/${id}.png`,
    prompt: 'view',
  }) as never

describe('generateMultiView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls generateImageForUser once per non-front angle in parallel', async () => {
    mockGenerate
      .mockResolvedValueOnce(fakeView('back'))
      .mockResolvedValueOnce(fakeView('left'))
      .mockResolvedValueOnce(fakeView('right'))

    const result = await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
      sourceGenerationId: 'src_1',
    })

    expect(mockGenerate).toHaveBeenCalledTimes(GENERATED_VIEW_ANGLES.length)
    expect(result.views).toHaveLength(3)
    expect(result.views.map((v) => v.id)).toEqual(['back', 'left', 'right'])
  })

  it('passes the front view as referenceImage and applies negative prompt', async () => {
    mockGenerate.mockResolvedValue(fakeView('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    for (const call of mockGenerate.mock.calls) {
      const [, input] = call
      expect(input.referenceImage).toBe('https://cdn.test/front.png')
      expect(input.aspectRatio).toBe('1:1')
      expect(input.advancedParams?.negativePrompt).toBe(THREE_D_READY_NEGATIVE)
    }
  })

  it('uses the camera-angle prompts in stable order', async () => {
    mockGenerate.mockResolvedValue(fakeView('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    expect(mockGenerate.mock.calls[0][1].prompt).toBe(MULTI_VIEW_PROMPTS.back)
    expect(mockGenerate.mock.calls[1][1].prompt).toBe(MULTI_VIEW_PROMPTS.left)
    expect(mockGenerate.mock.calls[2][1].prompt).toBe(MULTI_VIEW_PROMPTS.right)
  })

  it('honours user-supplied modelId / apiKeyId / projectId', async () => {
    mockGenerate.mockResolvedValue(fakeView('any'))

    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
      modelId: 'gemini-3-pro-image-preview',
      apiKeyId: 'key_42',
      projectId: 'proj_99',
    })

    for (const call of mockGenerate.mock.calls) {
      expect(call[1].modelId).toBe('gemini-3-pro-image-preview')
      expect(call[1].apiKeyId).toBe('key_42')
      expect(call[1].projectId).toBe('proj_99')
    }
  })

  it('returns partial results when some angles fail', async () => {
    mockGenerate
      .mockResolvedValueOnce(fakeView('back'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(fakeView('right'))

    const result = await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    expect(result.views).toHaveLength(2)
    expect(result.views.map((v) => v.id)).toEqual(['back', 'right'])
  })

  it('rethrows when every angle fails', async () => {
    const failure = new Error('upstream down')
    mockGenerate.mockRejectedValue(failure)

    await expect(
      generateMultiView('clerk_test', {
        imageUrl: 'https://cdn.test/front.png',
      }),
    ).rejects.toBe(failure)
  })
})
