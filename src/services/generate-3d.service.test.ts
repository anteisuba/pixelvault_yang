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

vi.mock('@/services/image/generate-image.service', () => ({
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
  streamUploadToR2: vi.fn(),
  uploadBufferedHttpToR2: vi.fn(),
}))

vi.mock('@/services/image/image-3d-prep.service', () => ({
  inspect3DSourceImageQuality: vi.fn(),
  prepare3DSourceImage: vi.fn(),
}))

vi.mock('@/services/execution-worker.service', () => ({
  buildInternalUrl: vi.fn((path: string) => `https://app.test${path}`),
  dispatchHyper3DRodinWorkerRun: vi.fn().mockResolvedValue({
    workflowInstanceId: 'wf-rodin-1',
  }),
  dispatchHunyuan3DWorkerRun: vi.fn().mockResolvedValue({
    workflowInstanceId: 'wf-hunyuan-1',
  }),
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
  cancel3DGenerationForUserId,
  check3DGenerationStatusForUserId,
  continue3DGenerationForUserId,
  retryMesh3DGenerationForUserId,
  submit3DGenerationForUserId,
} from './generate-3d.service'
import { db } from '@/lib/db'
import { resolveGenerationRoute } from '@/services/image/generate-image.service'
import { createGeneration } from '@/services/generation.service'
import {
  inspect3DSourceImageQuality,
  prepare3DSourceImage,
} from '@/services/image/image-3d-prep.service'
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
  streamUploadToR2,
  uploadBufferedHttpToR2,
} from '@/services/storage/r2'
import { dispatchHunyuan3DWorkerRun } from '@/services/execution-worker.service'

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
const mockStreamUploadToR2 = vi.mocked(streamUploadToR2)
const mockUploadBufferedHttpToR2 = vi.mocked(uploadBufferedHttpToR2)
const mockDispatchHunyuan3D = vi.mocked(dispatchHunyuan3DWorkerRun)

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
    mockStreamUploadToR2.mockResolvedValue({
      publicUrl: 'https://cdn.test/final.glb',
      sizeBytes: 456,
    })
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

  it.each([AI_MODELS.HUNYUAN3D_V3, AI_MODELS.HUNYUAN3D_V31_PRO])(
    'dispatches %s to the Hunyuan3D Worker (mesh-first inline flow removed)',
    async (modelId) => {
      mockResolveRoute.mockResolvedValue({
        modelId,
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
        apiKey: 'fal-key',
        resolvedApiKeyId: 'fal-key-id',
        creditCost: 5,
      })

      const result = await submit3DGenerationForUserId('user-1', {
        imageUrl: 'https://cdn.test/source.png',
        modelId,
        apiKeyId: 'fal-key-id',
        previewMode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        enablePbr: true,
        faceCount: 1_000_000,
        prompt: 'source prompt',
      })

      expect(result).toEqual({ jobId: 'job-submit', requestId: 'job-submit' })
      expect(mockDispatchHunyuan3D).toHaveBeenCalledTimes(1)
      expect(mockDispatchHunyuan3D).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'HUNYUAN3D',
          outputType: 'MODEL_3D',
          userId: 'user-1',
          providerInput: expect.objectContaining({
            imageUrl: 'https://cdn.test/prepared.png',
            modelId,
            enablePbr: true,
            faceCount: 1_000_000,
          }),
        }),
      )
      const updateArg = mockUpdateJob.mock.calls[0][0] as {
        data: { externalRequestId: string }
      }
      const meta = JSON.parse(updateArg.data.externalRequestId) as {
        workerDispatched: boolean
        sourceImageUrl: string
      }
      expect(meta.workerDispatched).toBe(true)
      expect(meta.sourceImageUrl).toBe('https://cdn.test/source.png')
    },
  )

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
        // PR2-B2: the fal temp GLB URL is now surfaced during the uploading
        // stage so the client can preview the finished mesh while R2 ingest
        // runs in the background.
        provisionalModelUrl: 'https://fal.run/final.glb',
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
      expect(mockStreamUploadToR2).not.toHaveBeenCalled()
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
      // PR2-B1: stream upload is the primary path; buffered is fallback-only.
      expect(mockStreamUploadToR2).toHaveBeenCalledTimes(1)
      expect(mockStreamUploadToR2).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceUrl: 'https://fal.run/final.glb',
        }),
      )
      expect(mockUploadBufferedHttpToR2).not.toHaveBeenCalled()
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

  it('falls back to buffered upload when streaming the GLB fails', async () => {
    // PR2-B1: some provider CDNs terminate long-lived streamed downloads
    // under R2 multipart backpressure. The buffered path remains as a
    // safety net so a transient CDN issue doesn't surface as a failed run.
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
    mockStreamUploadToR2.mockRejectedValueOnce(
      new Error('provider CDN closed the connection'),
    )

    try {
      await check3DGenerationStatusForUserId('user-1', 'job-1')
      await vi.runOnlyPendingTimersAsync()

      expect(mockStreamUploadToR2).toHaveBeenCalledTimes(1)
      expect(mockUploadBufferedHttpToR2).toHaveBeenCalledTimes(1)
      expect(mockUploadBufferedHttpToR2).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceUrl: 'https://fal.run/final.glb',
        }),
      )
      expect(mockCreateGeneration).toHaveBeenCalledTimes(1)
      expect(mockCompleteJob).toHaveBeenCalledTimes(1)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})

// PR3-α: staged-mode generation. The previous behaviour (auto-chain Stage 1
// → Stage 2) is preserved when `staged !== true`; these tests cover the new
// pause-at-mesh-ready path plus the continue / retry / cancel actions that
// drive the next state transition.
describe('PR3-α staged-mode 3D generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateManyJobs.mockResolvedValue({ count: 1 } as never)
    mockUpdateJob.mockResolvedValue({ id: 'job-submit' } as never)
  })

  it('stops mesh-first chain at MESH_READY when staged=true', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      externalRequestId: JSON.stringify({
        mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        stage: MODEL_3D_JOB_STAGE.MESH_RUNNING,
        staged: true,
        mesh: {
          requestId: 'mesh-req',
          statusUrl: 'https://queue.fal.run/status/mesh-req',
          responseUrl: 'https://queue.fal.run/result/mesh-req',
        },
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: '',
        apiKeyId: 'fal-key-id',
      }),
    } as never)
    const submitModel3DToQueue = vi.fn()
    const checkModel3DQueueStatus = vi.fn().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        modelUrl: 'https://fal.run/mesh.glb',
        contentType: 'model/gltf-binary',
        fileSize: 200,
        requestCount: 1,
      },
    })
    mockGetProviderAdapter.mockReturnValue({
      checkModel3DQueueStatus,
      submitModel3DToQueue,
    } as never)

    const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

    expect(result).toMatchObject({
      jobId: 'job-1',
      status: 'IN_PROGRESS',
      stage: 'mesh_ready',
      meshModelUrl: 'https://fal.run/mesh.glb',
    })
    // The whole point: no Stage 2 submission until the user clicks continue.
    expect(submitModel3DToQueue).not.toHaveBeenCalled()

    // The persisted meta should have stage=MESH_READY for the next poll.
    const updateArg = mockUpdateJob.mock.calls[0][0] as {
      data: { externalRequestId: string }
    }
    const persistedMeta = JSON.parse(updateArg.data.externalRequestId) as {
      stage: string
      mesh: { modelUrl: string }
    }
    expect(persistedMeta.stage).toBe(MODEL_3D_JOB_STAGE.MESH_READY)
    expect(persistedMeta.mesh.modelUrl).toBe('https://fal.run/mesh.glb')
  })

  it('continue3DGenerationForUserId submits Stage 2 from MESH_READY', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      externalRequestId: JSON.stringify({
        mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        stage: MODEL_3D_JOB_STAGE.MESH_READY,
        staged: true,
        mesh: {
          requestId: 'mesh-req',
          statusUrl: 'https://queue.fal.run/status/mesh-req',
          responseUrl: 'https://queue.fal.run/result/mesh-req',
          modelUrl: 'https://fal.run/mesh.glb',
        },
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: '',
        apiKeyId: 'fal-key-id',
        options: { enablePbr: true, faceCount: 500_000 },
      }),
    } as never)
    const submitModel3DToQueue = vi.fn().mockResolvedValue({
      requestId: 'final-req',
      statusUrl: 'https://queue.fal.run/status/final-req',
      responseUrl: 'https://queue.fal.run/result/final-req',
    })
    mockGetProviderAdapter.mockReturnValue({
      submitModel3DToQueue,
    } as never)

    const result = await continue3DGenerationForUserId('user-1', {
      jobId: 'job-1',
    })

    expect(submitModel3DToQueue).toHaveBeenCalledTimes(1)
    expect(submitModel3DToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ generateType: 'Normal' }),
    )
    expect(result).toMatchObject({
      jobId: 'job-1',
      status: 'IN_PROGRESS',
      stage: 'texture',
      previewModelUrl: 'https://fal.run/mesh.glb',
    })

    const updateArg = mockUpdateJob.mock.calls[0][0] as {
      data: { externalRequestId: string }
    }
    const persistedMeta = JSON.parse(updateArg.data.externalRequestId) as {
      stage: string
      final: { requestId: string }
    }
    expect(persistedMeta.stage).toBe(MODEL_3D_JOB_STAGE.TEXTURE_RUNNING)
    expect(persistedMeta.final.requestId).toBe('final-req')
  })

  it('rejects continue3DGenerationForUserId when not at MESH_READY', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      externalRequestId: JSON.stringify({
        mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        stage: MODEL_3D_JOB_STAGE.MESH_RUNNING,
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: '',
        apiKeyId: 'fal-key-id',
      }),
    } as never)

    await expect(
      continue3DGenerationForUserId('user-1', { jobId: 'job-1' }),
    ).rejects.toThrow()
  })

  it('retryMesh3DGenerationForUserId re-submits Geometry from MESH_READY', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      externalRequestId: JSON.stringify({
        mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        stage: MODEL_3D_JOB_STAGE.MESH_READY,
        staged: true,
        mesh: {
          requestId: 'mesh-req-old',
          statusUrl: 'https://queue.fal.run/status/mesh-req-old',
          responseUrl: 'https://queue.fal.run/result/mesh-req-old',
          modelUrl: 'https://fal.run/mesh-old.glb',
        },
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: '',
        apiKeyId: 'fal-key-id',
        options: { enablePbr: true, faceCount: 500_000, seed: 1 },
      }),
    } as never)
    const submitModel3DToQueue = vi.fn().mockResolvedValue({
      requestId: 'mesh-req-new',
      statusUrl: 'https://queue.fal.run/status/mesh-req-new',
      responseUrl: 'https://queue.fal.run/result/mesh-req-new',
    })
    mockGetProviderAdapter.mockReturnValue({
      submitModel3DToQueue,
    } as never)

    const result = await retryMesh3DGenerationForUserId('user-1', {
      jobId: 'job-1',
      seed: 999,
    })

    expect(submitModel3DToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        generateType: 'Geometry',
        seed: 999,
      }),
    )
    expect(result).toMatchObject({
      jobId: 'job-1',
      status: 'IN_PROGRESS',
      stage: 'mesh',
    })

    const updateArg = mockUpdateJob.mock.calls[0][0] as {
      data: { externalRequestId: string }
    }
    const persistedMeta = JSON.parse(updateArg.data.externalRequestId) as {
      stage: string
      mesh: { requestId: string }
      options: { seed: number }
    }
    expect(persistedMeta.stage).toBe(MODEL_3D_JOB_STAGE.MESH_RUNNING)
    expect(persistedMeta.mesh.requestId).toBe('mesh-req-new')
    expect(persistedMeta.options.seed).toBe(999)
  })

  it('cancel3DGenerationForUserId marks job FAILED with cancelled flag', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      externalRequestId: JSON.stringify({
        mode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        stage: MODEL_3D_JOB_STAGE.MESH_READY,
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: '',
        apiKeyId: 'fal-key-id',
      }),
    } as never)

    const result = await cancel3DGenerationForUserId('user-1', {
      jobId: 'job-1',
    })

    expect(result).toMatchObject({
      jobId: 'job-1',
      status: 'FAILED',
      cancelled: true,
    })
    expect(mockFailJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ errorMessage: 'CANCELLED_BY_USER' }),
    )
  })

  it('status check surfaces cancelled flag when errorMessage is the marker', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      status: 'FAILED',
      errorMessage: 'CANCELLED_BY_USER',
    } as never)

    const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

    expect(result).toMatchObject({
      jobId: 'job-1',
      status: 'FAILED',
      cancelled: true,
    })
  })

  it('status check surfaces stored failure messages for non-cancelled jobs', async () => {
    mockFindJob.mockResolvedValue({
      ...RUNNING_JOB,
      status: 'FAILED',
      errorMessage: 'Rodin generation failed with status 400',
    } as never)

    const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

    expect(result).toMatchObject({
      jobId: 'job-1',
      status: 'FAILED',
      error: 'Rodin generation failed with status 400',
    })
    expect(result).not.toHaveProperty('cancelled')
  })
})
