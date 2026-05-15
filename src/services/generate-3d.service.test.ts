import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  MODEL_3D_GENERATE_TYPE,
  MODEL_3D_JOB_STAGE,
  MODEL_3D_PREVIEW_MODE,
} from '@/constants/model-3d-generation'
import { ProviderError } from '@/services/providers/types'

vi.mock('server-only', () => ({}))

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

vi.mock('@/services/generate-image.service', () => ({
  GenerateImageServiceError: GenerateImageServiceErrorMock,
  resolveGenerationRoute: vi.fn(),
}))

vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: vi.fn(),
}))

vi.mock('@/services/usage.service', () => ({
  attachUsageEntryToGeneration: vi.fn(),
  completeGenerationJob: vi.fn(),
  createApiUsageEntry: vi.fn(),
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
}))

vi.mock('@/services/generation.service', () => ({
  createGeneration: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn(),
  uploadBufferedHttpToR2: vi.fn(),
}))

vi.mock('@/services/image-3d-prep.service', () => ({
  inspect3DSourceImageQuality: vi.fn(),
  prepare3DSourceImage: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/lib/circuit-breaker', () => ({
  getCircuitBreaker: vi.fn(() => ({
    call: (fn: () => Promise<unknown>) => fn(),
  })),
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import {
  check3DGenerationStatusForUserId,
  submit3DGenerationForUserId,
} from './generate-3d.service'
import { db } from '@/lib/db'
import { resolveGenerationRoute } from '@/services/generate-image.service'
import { createGeneration } from '@/services/generation.service'
import {
  inspect3DSourceImageQuality,
  prepare3DSourceImage,
} from '@/services/image-3d-prep.service'
import { getProviderAdapter } from '@/services/providers/registry'
import {
  attachUsageEntryToGeneration,
  completeGenerationJob,
  createApiUsageEntry,
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import {
  generateStorageKey,
  uploadBufferedHttpToR2,
} from '@/services/storage/r2'

const mockFindJob = vi.mocked(db.generationJob.findUnique)
const mockUpdateJob = vi.mocked(db.generationJob.update)
const mockUpdateManyJobs = vi.mocked(db.generationJob.updateMany)
const mockResolveRoute = vi.mocked(resolveGenerationRoute)
const mockGetProviderAdapter = vi.mocked(getProviderAdapter)
const mockCreateGeneration = vi.mocked(createGeneration)
const mockInspectSourceQuality = vi.mocked(inspect3DSourceImageQuality)
const mockPrepareSourceImage = vi.mocked(prepare3DSourceImage)
const mockAttachUsageEntry = vi.mocked(attachUsageEntryToGeneration)
const mockCompleteJob = vi.mocked(completeGenerationJob)
const mockCreateUsageEntry = vi.mocked(createApiUsageEntry)
const mockCreateJob = vi.mocked(createGenerationJob)
const mockFailJob = vi.mocked(failGenerationJob)
const mockGenerateStorageKey = vi.mocked(generateStorageKey)
const mockUploadBufferedHttpToR2 = vi.mocked(uploadBufferedHttpToR2)

const RUNNING_JOB = {
  id: 'job-1',
  userId: 'user-1',
  status: 'RUNNING',
  modelId: 'hunyuan3d-v3.1-pro',
  createdAt: new Date('2026-05-15T00:00:00.000Z'),
  externalRequestId: JSON.stringify({
    requestId: 'req-1',
    statusUrl: 'https://queue.fal.run/status/req-1',
    responseUrl: 'https://queue.fal.run/result/req-1',
    sourceImageUrl: 'https://cdn.test/source.png',
    prompt: '',
    apiKeyId: 'fal-key-id',
  }),
  generation: null,
}

const GENERATED_MODEL = {
  id: 'generation-1',
  createdAt: new Date('2026-05-15T00:04:00.000Z'),
  outputType: 'MODEL_3D',
  status: 'COMPLETED',
  url: 'https://cdn.test/final.glb',
  storageKey: 'generations/user-1/model/final.glb',
  mimeType: 'model/gltf-binary',
  width: 0,
  height: 0,
  modelUrl: 'https://cdn.test/final.glb',
  modelStorageKey: 'generations/user-1/model/final.glb',
  referenceImageUrl: 'https://cdn.test/source.png',
  prompt: 'source prompt',
  negativePrompt: null,
  model: AI_MODELS.HUNYUAN3D_V31_PRO,
  provider: 'fal.ai',
  requestCount: 5,
  isPublic: false,
  isPromptPublic: false,
  userId: 'user-1',
}

describe('check3DGenerationStatusForUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindJob.mockResolvedValue(RUNNING_JOB as never)
    mockUpdateManyJobs.mockResolvedValue({ count: 1 } as never)
    mockCreateJob.mockResolvedValue({ id: 'job-submit' } as never)
    mockUpdateJob.mockResolvedValue({ id: 'job-submit' } as never)
    mockInspectSourceQuality.mockResolvedValue({
      width: 1024,
      height: 1024,
      blockingIssues: [],
    })
    mockPrepareSourceImage.mockResolvedValue('https://cdn.test/prepared.png')
    mockGenerateStorageKey.mockReturnValue('generations/user-1/model/final.glb')
    mockCreateUsageEntry.mockResolvedValue({ id: 'usage-1' } as never)
    mockUploadBufferedHttpToR2.mockResolvedValue({
      publicUrl: 'https://cdn.test/final.glb',
    } as never)
    mockCreateGeneration.mockResolvedValue(GENERATED_MODEL as never)
    mockAttachUsageEntry.mockResolvedValue({ id: 'usage-1' } as never)
    mockCompleteJob.mockResolvedValue({ id: 'job-1' } as never)
    mockResolveRoute.mockResolvedValue({
      modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      apiKey: 'fal-key',
      resolvedApiKeyId: 'fal-key-id',
      creditCost: 5,
    })
  })

  it('keeps the job active when fal status polling has a transient network failure', async () => {
    mockGetProviderAdapter.mockReturnValue({
      checkModel3DQueueStatus: vi
        .fn()
        .mockRejectedValue(
          new ProviderError(
            'fal.ai',
            502,
            '[3D-status-fetch-error] fetch failed',
          ),
        ),
    } as never)

    const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

    expect(result).toEqual({ jobId: 'job-1', status: 'IN_PROGRESS' })
    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('submits v3.1 Pro mesh-first mode as a Geometry queue job', async () => {
    const submitModel3DToQueue = vi.fn().mockResolvedValue({
      requestId: 'mesh-req',
      statusUrl: 'https://queue.fal.run/status/mesh-req',
      responseUrl: 'https://queue.fal.run/result/mesh-req',
    })
    mockGetProviderAdapter.mockReturnValue({ submitModel3DToQueue } as never)

    const result = await submit3DGenerationForUserId('user-1', {
      imageUrl: 'https://cdn.test/source.png',
      modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
      apiKeyId: 'fal-key-id',
      previewMode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
      enablePbr: true,
      faceCount: 1_000_000,
      prompt: 'source prompt',
    })

    expect(result).toEqual({ jobId: 'job-submit', requestId: 'mesh-req' })
    expect(submitModel3DToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'https://cdn.test/prepared.png',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        enablePbr: false,
        generateType: MODEL_3D_GENERATE_TYPE.GEOMETRY,
        faceCount: 1_000_000,
      }),
    )
    const updateArg = mockUpdateJob.mock.calls[0][0] as {
      data: { externalRequestId: string }
    }
    const meta = JSON.parse(updateArg.data.externalRequestId) as {
      mode: string
      stage: string
      mesh: { requestId: string }
      preparedImageUrl: string
      options: { enablePbr: boolean; faceCount: number }
    }
    expect(meta.mode).toBe(MODEL_3D_PREVIEW_MODE.MESH_FIRST)
    expect(meta.stage).toBe(MODEL_3D_JOB_STAGE.MESH_RUNNING)
    expect(meta.mesh.requestId).toBe('mesh-req')
    expect(meta.preparedImageUrl).toBe('https://cdn.test/prepared.png')
    expect(meta.options).toMatchObject({
      enablePbr: true,
      faceCount: 1_000_000,
    })
  })

  it('starts the final textured job after mesh preview completes', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      externalRequestId: JSON.stringify({
        mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        stage: MODEL_3D_JOB_STAGE.MESH_RUNNING,
        mesh: {
          requestId: 'mesh-req',
          statusUrl: 'https://queue.fal.run/status/mesh-req',
          responseUrl: 'https://queue.fal.run/result/mesh-req',
        },
        sourceImageUrl: 'https://cdn.test/source.png',
        preparedImageUrl: 'https://cdn.test/prepared.png',
        prompt: 'source prompt',
        apiKeyId: 'fal-key-id',
        multiViewImages: {
          backImageUrl: 'https://cdn.test/back.png',
        },
        options: {
          enablePbr: true,
          faceCount: 1_000_000,
        },
      }),
    } as never)
    const checkModel3DQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        modelUrl: 'https://fal.run/mesh.glb',
        contentType: 'model/gltf-binary',
        fileSize: 123,
        requestCount: 1,
      },
    })
    const submitModel3DToQueue = vi.fn().mockResolvedValue({
      requestId: 'final-req',
      statusUrl: 'https://queue.fal.run/status/final-req',
      responseUrl: 'https://queue.fal.run/result/final-req',
    })
    mockGetProviderAdapter.mockReturnValue({
      checkModel3DQueueStatus,
      submitModel3DToQueue,
    } as never)

    const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

    expect(result).toEqual({
      jobId: 'job-1',
      status: 'IN_PROGRESS',
      stage: 'texture',
      previewModelUrl: 'https://fal.run/mesh.glb',
    })
    expect(submitModel3DToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'https://cdn.test/prepared.png',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        enablePbr: true,
        generateType: MODEL_3D_GENERATE_TYPE.NORMAL,
        faceCount: 1_000_000,
        multiViewImages: {
          backImageUrl: 'https://cdn.test/back.png',
        },
      }),
    )
    const updateArg = mockUpdateJob.mock.calls[0][0] as {
      data: { externalRequestId: string; status: string }
    }
    const meta = JSON.parse(updateArg.data.externalRequestId) as {
      stage: string
      mesh: { modelUrl: string }
      final: { requestId: string }
    }
    expect(updateArg.data.status).toBe('RUNNING')
    expect(meta.stage).toBe(MODEL_3D_JOB_STAGE.TEXTURE_RUNNING)
    expect(meta.mesh.modelUrl).toBe('https://fal.run/mesh.glb')
    expect(meta.final.requestId).toBe('final-req')
    expect(mockUploadBufferedHttpToR2).not.toHaveBeenCalled()
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })

  it('stores the final result, returns uploading, and finalizes in the background', async () => {
    vi.useFakeTimers()
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      externalRequestId: JSON.stringify({
        mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        stage: MODEL_3D_JOB_STAGE.TEXTURE_RUNNING,
        mesh: {
          requestId: 'mesh-req',
          statusUrl: 'https://queue.fal.run/status/mesh-req',
          responseUrl: 'https://queue.fal.run/result/mesh-req',
          modelUrl: 'https://fal.run/mesh.glb',
        },
        final: {
          requestId: 'final-req',
          statusUrl: 'https://queue.fal.run/status/final-req',
          responseUrl: 'https://queue.fal.run/result/final-req',
        },
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: 'source prompt',
        apiKeyId: 'fal-key-id',
      }),
    } as never)
    const checkModel3DQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        modelUrl: 'https://fal.run/final.glb',
        contentType: 'model/gltf-binary',
        fileSize: 456,
        requestCount: 1,
      },
    })
    mockGetProviderAdapter.mockReturnValue({
      checkModel3DQueueStatus,
      submitModel3DToQueue: vi.fn(),
    } as never)

    try {
      const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

      expect(result).toEqual({
        jobId: 'job-1',
        status: 'IN_PROGRESS',
        stage: 'uploading',
        previewModelUrl: 'https://fal.run/mesh.glb',
      })
      const updateArg = mockUpdateJob.mock.calls[0][0] as {
        data: { externalRequestId: string; status: string }
      }
      const meta = JSON.parse(updateArg.data.externalRequestId) as {
        finalResult: { modelUrl: string; fileSize: number }
      }
      expect(updateArg.data.status).toBe('QUEUED')
      expect(meta.finalResult).toMatchObject({
        modelUrl: 'https://fal.run/final.glb',
        fileSize: 456,
      })
      expect(mockUploadBufferedHttpToR2).not.toHaveBeenCalled()
      expect(mockCreateGeneration).not.toHaveBeenCalled()
      expect(mockAttachUsageEntry).not.toHaveBeenCalled()
      expect(mockCompleteJob).not.toHaveBeenCalled()

      await vi.runOnlyPendingTimersAsync()

      expect(mockUpdateManyJobs).toHaveBeenCalledWith({
        where: {
          id: 'job-1',
          OR: [
            { status: 'QUEUED' },
            {
              status: 'RUNNING',
              updatedAt: { lt: expect.any(Date) },
            },
          ],
        },
        data: { status: 'RUNNING' },
      })
      expect(mockUploadBufferedHttpToR2).toHaveBeenCalledTimes(1)
      expect(mockUploadBufferedHttpToR2).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceUrl: 'https://fal.run/final.glb',
        }),
      )
      expect(mockCreateGeneration).toHaveBeenCalledTimes(1)
      expect(mockCreateGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          modelUrl: 'https://cdn.test/final.glb',
          outputType: 'MODEL_3D',
        }),
      )
      expect(mockAttachUsageEntry).toHaveBeenCalledTimes(1)
      expect(mockCompleteJob).toHaveBeenCalledTimes(1)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})
