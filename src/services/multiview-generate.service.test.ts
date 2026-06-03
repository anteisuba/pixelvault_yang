import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_NEGATIVE,
  MULTI_VIEW_PROMPTS,
} from '@/constants/three-d-ready-prompt'
import type { ImageStatusResponseData } from '@/types'

const { GenerateImageServiceErrorMock } = vi.hoisted(() => {
  class GenerateImageServiceErrorMock extends Error {
    readonly code: string
    readonly status: number

    constructor(code: string, message: string, status: number) {
      super(message)
      this.code = code
      this.status = status
    }
  }

  return { GenerateImageServiceErrorMock }
})

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn().mockResolvedValue({ id: 'db-user-1' }),
}))

vi.mock('@/services/image/generate-image.service', () => ({
  GenerateImageServiceError: GenerateImageServiceErrorMock,
}))

vi.mock('@/services/image/submit-image.service', () => ({
  submitImageGeneration: vi.fn(),
  checkImageGenerationStatus: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { db } from '@/lib/db'
import {
  checkImageGenerationStatus,
  submitImageGeneration,
} from '@/services/image/submit-image.service'
import {
  checkMultiViewGenerationStatus,
  generateMultiView,
} from './multiview-generate.service'

const mockSubmitImageGeneration = vi.mocked(submitImageGeneration)
const mockCheckImageGenerationStatus = vi.mocked(checkImageGenerationStatus)
const mockFindMany = vi.mocked(db.generationJob.findMany)

function multiViewMetadata(angle: (typeof GENERATED_VIEW_ANGLES)[number]) {
  return JSON.stringify({
    outputType: 'IMAGE',
    multiViewBatchId: 'batch-1',
    multiViewAngle: angle,
  })
}

function generationFor(angle: (typeof GENERATED_VIEW_ANGLES)[number]) {
  return {
    jobId: `job-${angle}`,
    status: 'COMPLETED',
    generation: {
      id: `gen-${angle}`,
      url: `https://cdn.example.com/${angle}.png`,
      width: 1024,
      height: 1024,
      prompt: MULTI_VIEW_PROMPTS[angle],
      model: AI_MODELS.FLUX_KONTEXT_PRO,
      provider: 'fal.ai',
    },
  } as ImageStatusResponseData
}

describe('generateMultiView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubmitImageGeneration.mockImplementation(async () => {
      const callIndex = mockSubmitImageGeneration.mock.calls.length - 1
      const angle = GENERATED_VIEW_ANGLES[callIndex]
      return { jobId: `job-${angle}`, requestId: `wf-${angle}` }
    })
  })

  it('submits one worker image job per generated angle', async () => {
    const result = await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
      sourceGenerationId: 'src_1',
    })

    expect(mockSubmitImageGeneration).toHaveBeenCalledTimes(
      GENERATED_VIEW_ANGLES.length,
    )
    expect(result.jobs.map((job) => job.view)).toEqual(GENERATED_VIEW_ANGLES)
    expect(result.jobs.map((job) => job.jobId)).toEqual([
      'job-back',
      'job-left',
      'job-right',
    ])
  })

  it('passes the front view as referenceImages and applies multi-view metadata', async () => {
    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
      sourceGenerationId: 'src_1',
    })

    const batchIds = new Set<string>()
    for (const [
      index,
      call,
    ] of mockSubmitImageGeneration.mock.calls.entries()) {
      const input = call[1]
      const metadata = call[3]
      const angle = GENERATED_VIEW_ANGLES[index]

      expect(input.referenceImages).toEqual(['https://cdn.test/front.png'])
      expect(input.aspectRatio).toBe('1:1')
      expect(input.advancedParams?.negativePrompt).toBe(MULTI_VIEW_NEGATIVE)
      expect(input.prompt).toBe(MULTI_VIEW_PROMPTS[angle])
      expect(metadata?.multiViewAngle).toBe(angle)
      expect(metadata?.sourceGenerationId).toBe('src_1')
      expect(metadata?.multiViewBatchId).toEqual(expect.any(String))
      batchIds.add(metadata!.multiViewBatchId!)
    }
    expect(batchIds.size).toBe(1)
  })

  it('honours user-supplied modelId / apiKeyId / projectId', async () => {
    await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
      modelId: AI_MODELS.GEMINI_FLASH_IMAGE,
      apiKeyId: 'key_42',
      projectId: 'proj_99',
    })

    for (const call of mockSubmitImageGeneration.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          modelId: AI_MODELS.GEMINI_FLASH_IMAGE,
          apiKeyId: 'key_42',
          projectId: 'proj_99',
        }),
      )
    }
  })

  it('returns partial submitted jobs when one angle dispatch fails', async () => {
    mockSubmitImageGeneration.mockImplementation(async () => {
      const callIndex = mockSubmitImageGeneration.mock.calls.length - 1
      const angle = GENERATED_VIEW_ANGLES[callIndex]
      if (angle === 'left') throw new Error('worker dispatch failed')
      return { jobId: `job-${angle}`, requestId: `wf-${angle}` }
    })

    const result = await generateMultiView('clerk_test', {
      imageUrl: 'https://cdn.test/front.png',
    })

    expect(result.jobs.map((job) => job.view)).toEqual(['back', 'right'])
  })

  it('fails loudly when all angle dispatches fail', async () => {
    mockSubmitImageGeneration.mockRejectedValue(new Error('worker down'))

    await expect(
      generateMultiView('clerk_test', {
        imageUrl: 'https://cdn.test/front.png',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 502,
    })
  })

  it('rejects unsupported multi-view models before dispatch', async () => {
    await expect(
      generateMultiView('clerk_test', {
        imageUrl: 'https://cdn.test/front.png',
        modelId: AI_MODELS.SDXL,
      }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_MODEL',
      status: 400,
    })
    expect(mockSubmitImageGeneration).not.toHaveBeenCalled()
  })
})

describe('checkMultiViewGenerationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue(
      GENERATED_VIEW_ANGLES.map((angle) => ({
        id: `job-${angle}`,
        userId: 'db-user-1',
        status: 'COMPLETED',
        generationId: `gen-${angle}`,
        modelId: AI_MODELS.FLUX_KONTEXT_PRO,
        provider: 'fal.ai',
        prompt: MULTI_VIEW_PROMPTS[angle],
        errorMessage: null,
        externalRequestId: multiViewMetadata(angle),
      })) as never,
    )
    mockCheckImageGenerationStatus.mockImplementation(
      async (_clerkId, jobId) => {
        const angle = GENERATED_VIEW_ANGLES.find(
          (candidate) => jobId === `job-${candidate}`,
        )
        if (!angle) throw new Error('unknown job')
        return generationFor(angle)
      },
    )
  })

  it('aggregates completed angle jobs into stable view records', async () => {
    const result = await checkMultiViewGenerationStatus('clerk_test', {
      batchId: 'batch-1',
      jobIds: ['job-back', 'job-left', 'job-right'],
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.views.map((view) => view.view)).toEqual(GENERATED_VIEW_ANGLES)
    expect(result.views.map((view) => view.url)).toEqual([
      'https://cdn.example.com/back.png',
      'https://cdn.example.com/left.png',
      'https://cdn.example.com/right.png',
    ])
  })

  it('completes with partial views when at least one terminal job succeeded', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'job-back',
        userId: 'db-user-1',
        status: 'COMPLETED',
        generationId: 'gen-back',
        modelId: AI_MODELS.FLUX_KONTEXT_PRO,
        provider: 'fal.ai',
        prompt: MULTI_VIEW_PROMPTS.back,
        errorMessage: null,
        externalRequestId: multiViewMetadata('back'),
      },
      {
        id: 'job-left',
        userId: 'db-user-1',
        status: 'FAILED',
        generationId: null,
        modelId: AI_MODELS.FLUX_KONTEXT_PRO,
        provider: 'fal.ai',
        prompt: MULTI_VIEW_PROMPTS.left,
        errorMessage: 'provider failed',
        externalRequestId: multiViewMetadata('left'),
      },
    ] as never)
    mockCheckImageGenerationStatus.mockResolvedValue(generationFor('back'))

    const result = await checkMultiViewGenerationStatus('clerk_test', {
      batchId: 'batch-1',
      jobIds: ['job-back', 'job-left'],
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.views.map((view) => view.view)).toEqual(['back'])
    expect(result.jobs.find((job) => job.view === 'left')?.status).toBe(
      'FAILED',
    )
  })

  it('returns FAILED when every terminal job failed', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'job-back',
        userId: 'db-user-1',
        status: 'FAILED',
        generationId: null,
        modelId: AI_MODELS.FLUX_KONTEXT_PRO,
        provider: 'fal.ai',
        prompt: MULTI_VIEW_PROMPTS.back,
        errorMessage: 'provider failed',
        externalRequestId: multiViewMetadata('back'),
      },
    ] as never)

    const result = await checkMultiViewGenerationStatus('clerk_test', {
      batchId: 'batch-1',
      jobIds: ['job-back'],
    })

    expect(result.status).toBe('FAILED')
    expect(result.views).toEqual([])
  })

  it('rejects jobs that are missing, owned by another user, or not in the batch', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'job-back',
        userId: 'someone-else',
        status: 'COMPLETED',
        generationId: 'gen-back',
        modelId: AI_MODELS.FLUX_KONTEXT_PRO,
        provider: 'fal.ai',
        prompt: MULTI_VIEW_PROMPTS.back,
        errorMessage: null,
        externalRequestId: multiViewMetadata('back'),
      },
    ] as never)

    await expect(
      checkMultiViewGenerationStatus('clerk_test', {
        batchId: 'batch-1',
        jobIds: ['job-back'],
      }),
    ).rejects.toMatchObject({
      code: 'JOB_NOT_FOUND',
      status: 404,
    })
  })
})
