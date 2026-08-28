import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  MODEL_3D_JOB_STAGE,
  MODEL_3D_PREVIEW_MODE,
} from '@/constants/model-3d-generation'

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

vi.mock('@/services/usage.service', () => ({
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
}))

vi.mock('@/services/image/image-3d-prep.service', () => ({
  inspect3DSourceImageQuality: vi.fn(),
  prepare3DSourceImage: vi.fn(),
}))

vi.mock('@/services/execution-worker.service', () => ({
  ExecutionWorkerDispatchError: class ExecutionWorkerDispatchError extends Error {
    readonly outcome: 'rejected' | 'unknown'
    constructor(message: string, outcome: 'rejected' | 'unknown') {
      super(message)
      this.name = 'ExecutionWorkerDispatchError'
      this.outcome = outcome
    }
  },
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
import {
  inspect3DSourceImageQuality,
  prepare3DSourceImage,
} from '@/services/image/image-3d-prep.service'
import {
  createGenerationJob,
  failGenerationJob,
} from '@/services/usage.service'
import {
  dispatchHunyuan3DWorkerRun,
  ExecutionWorkerDispatchError,
} from '@/services/execution-worker.service'

const mockFindJob = vi.mocked(db.generationJob.findUnique)
const mockUpdateJob = vi.mocked(db.generationJob.update)
const mockResolveRoute = vi.mocked(resolveGenerationRoute)
const mockInspectSourceQuality = vi.mocked(inspect3DSourceImageQuality)
const mockPrepareSourceImage = vi.mocked(prepare3DSourceImage)
const mockCreateJob = vi.mocked(createGenerationJob)
const mockFailJob = vi.mocked(failGenerationJob)
const mockDispatchHunyuan3D = vi.mocked(dispatchHunyuan3DWorkerRun)

// Fixture shape mirrors a job created by the retired fal.ai inline path
// (no `workerDispatched` flag). Every FAL/Hyper3D-Rodin 3D model now
// dispatches through submitWorker3DGeneration instead — see
// submit3DGenerationForUserId's adapter short-circuit — so a job like this
// can only exist as pre-Worker legacy data.
const LEGACY_INLINE_RUNNING_JOB = {
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

describe('submit3DGenerationForUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateJob.mockResolvedValue({ id: 'job-submit' } as never)
    mockUpdateJob.mockResolvedValue({ id: 'job-submit' } as never)
    mockInspectSourceQuality.mockResolvedValue({
      width: 1024,
      height: 1024,
      blockingIssues: [],
    })
    mockPrepareSourceImage.mockResolvedValue('https://cdn.test/prepared.png')
    mockResolveRoute.mockResolvedValue({
      modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
      externalModelId: 'fal-ai/hunyuan3d-v3.1/pro',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
      apiKey: 'fal-key',
      resolvedApiKeyId: 'fal-key-id',
      creditCost: 5,
    })
  })

  it.each([AI_MODELS.HUNYUAN3D_V3, AI_MODELS.HUNYUAN3D_V31_PRO])(
    'dispatches %s to the Hunyuan3D Worker (mesh-first inline flow removed)',
    async (modelId) => {
      mockResolveRoute.mockResolvedValue({
        modelId,
        externalModelId: modelId,
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
      expect(mockUpdateJob.mock.invocationCallOrder[0]).toBeLessThan(
        mockDispatchHunyuan3D.mock.invocationCallOrder[0],
      )
    },
  )

  it('keeps the 3D job active when the worker acknowledgement may be lost', async () => {
    mockDispatchHunyuan3D.mockRejectedValueOnce(
      new ExecutionWorkerDispatchError(
        'worker acknowledgement was lost',
        'unknown',
      ),
    )

    await expect(
      submit3DGenerationForUserId('user-1', {
        imageUrl: 'https://cdn.test/source.png',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        apiKeyId: 'fal-key-id',
      }),
    ).rejects.toThrow('worker acknowledgement was lost')

    expect(mockFailJob).not.toHaveBeenCalled()
  })

  it('does not dispatch 3D work before callback metadata is durable', async () => {
    mockUpdateJob.mockRejectedValueOnce(new Error('database write failed'))

    await expect(
      submit3DGenerationForUserId('user-1', {
        imageUrl: 'https://cdn.test/source.png',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        apiKeyId: 'fal-key-id',
      }),
    ).rejects.toThrow('database write failed')

    expect(mockDispatchHunyuan3D).not.toHaveBeenCalled()
    expect(mockFailJob).toHaveBeenCalledWith(
      'job-submit',
      expect.objectContaining({ errorMessage: 'database write failed' }),
    )
  })

  // fal.adapter.ts no longer implements a 3D submission method for any
  // adapter — the only ones that used to (FAL, and Hyper3D Rodin's own
  // direct-API adapter) are both caught by the short-circuit above. A 3D
  // model resolving to any other adapter (e.g. a future catalog mistake)
  // must fail loudly instead of silently no-op-ing.
  it('rejects a 3D model resolved to an adapter with no submission method', async () => {
    mockResolveRoute.mockResolvedValue({
      modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
      externalModelId: 'fal-ai/hunyuan3d-v3.1/pro',
      adapterType: AI_ADAPTER_TYPES.REPLICATE,
      providerConfig: { label: 'replicate', baseUrl: 'https://replicate.com' },
      apiKey: 'replicate-key',
      resolvedApiKeyId: 'replicate-key-id',
      creditCost: 5,
    })

    await expect(
      submit3DGenerationForUserId('user-1', {
        imageUrl: 'https://cdn.test/source.png',
        modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
        apiKeyId: 'replicate-key-id',
      }),
    ).rejects.toThrow('3D generation is not supported for this provider')

    expect(mockDispatchHunyuan3D).not.toHaveBeenCalled()
    expect(mockCreateJob).not.toHaveBeenCalled()
  })
})

describe('check3DGenerationStatusForUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // The fal.ai inline queue path (submitModel3DToQueue / checkModel3DQueue-
  // Status) was retired from fal.adapter.ts once every 3D model moved to
  // Worker dispatch (see submit3DGenerationForUserId). No code path can
  // create a new job without `workerDispatched: true`, so a job whose
  // queue metadata lacks that flag can only be pre-Worker legacy data —
  // and any such job still RUNNING has long since been reaped FAILED by
  // the execution sweeper cron before it ever reaches this branch.
  it('rejects a legacy (pre-Worker) job whose queue metadata has no workerDispatched flag', async () => {
    mockFindJob.mockResolvedValue(LEGACY_INLINE_RUNNING_JOB as never)

    await expect(
      check3DGenerationStatusForUserId('user-1', 'job-1'),
    ).rejects.toThrow('3D status check is not supported for this provider')
  })

  it('surfaces cancelled flag when errorMessage is the marker', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
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

  it('surfaces stored failure messages for non-cancelled jobs', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
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

  // 3D's queue metadata names its source image `sourceImageUrl` — a
  // different key from the IMAGE/VIDEO/AUDIO metadata schema's
  // `referenceImageUrl`/`referenceImages`. Regression: an earlier version of
  // this fix reused the shared IMAGE-shaped parser here, which always read 0
  // reference images for 3D and silently disabled reference-image error
  // classification even when a genuine source image caused the failure.
  it('derives hasReferenceImage from the 3D-specific sourceImageUrl field', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
      status: 'FAILED',
      errorMessage: 'the source image aspect ratio is not supported',
    } as never)

    const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

    expect(result).toMatchObject({
      hasReferenceImage: true,
      errorCode: 'invalid_reference_image_dimensions',
    })
  })

  it('reports no reference image for a text-to-3D job with no source image', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
      externalRequestId: JSON.stringify({
        requestId: 'req-1',
        statusUrl: 'https://queue.fal.run/status/req-1',
        responseUrl: 'https://queue.fal.run/result/req-1',
        prompt: 'a low poly fox',
        apiKeyId: 'fal-key-id',
      }),
      status: 'FAILED',
      errorMessage: 'the source image aspect ratio is not supported',
    } as never)

    const result = await check3DGenerationStatusForUserId('user-1', 'job-1')

    expect(result).toMatchObject({ hasReferenceImage: false })
    expect((result as { errorCode?: string }).errorCode).not.toBe(
      'invalid_reference_image_dimensions',
    )
  })
})

// PR3-α's staged mesh-first flow (continue / retry-mesh) only ever drove
// the fal.ai inline queue — see continue3DGenerationForUserId. No job can
// reach MESH_READY anymore (that stage was only ever written by the
// retired inline path), so both actions now always throw; loadStagedJob's
// 404/400 guard is preserved so a missing/foreign job still reports 404.
describe('staged mesh-first actions (fal.ai inline path retired)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('continue3DGenerationForUserId rejects when not at MESH_READY', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
      externalRequestId: JSON.stringify({
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

  it('continue3DGenerationForUserId is unreachable even from a job parked at MESH_READY', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
      externalRequestId: JSON.stringify({
        stage: MODEL_3D_JOB_STAGE.MESH_READY,
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: '',
        apiKeyId: 'fal-key-id',
      }),
    } as never)

    await expect(
      continue3DGenerationForUserId('user-1', { jobId: 'job-1' }),
    ).rejects.toThrow('3D generation is not supported for this provider')
  })

  it('retryMesh3DGenerationForUserId is unreachable even from a job parked at MESH_READY', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
      externalRequestId: JSON.stringify({
        stage: MODEL_3D_JOB_STAGE.MESH_READY,
        sourceImageUrl: 'https://cdn.test/source.png',
        prompt: '',
        apiKeyId: 'fal-key-id',
      }),
    } as never)

    await expect(
      retryMesh3DGenerationForUserId('user-1', { jobId: 'job-1' }),
    ).rejects.toThrow('3D generation is not supported for this provider')
  })
})

describe('cancel3DGenerationForUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks job FAILED with cancelled flag', async () => {
    mockFindJob.mockResolvedValue({
      ...LEGACY_INLINE_RUNNING_JOB,
      externalRequestId: JSON.stringify({
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
})
