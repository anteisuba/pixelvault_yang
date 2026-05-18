import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { LongVideoRequest } from '@/types'

const mockEnsureUser = vi.hoisted(() => vi.fn())
const mockResolveGenerationRoute = vi.hoisted(() => vi.fn())
const mockGetProviderAdapter = vi.hoisted(() => vi.fn())
const mockValidateVideoGenerationInput = vi.hoisted(() => vi.fn())
const mockGenerateStorageKey = vi.hoisted(() => vi.fn())
const mockFetchAsBuffer = vi.hoisted(() => vi.fn())
const mockUploadToR2 = vi.hoisted(() => vi.fn())
const mockStreamUploadToR2 = vi.hoisted(() => vi.fn())
const mockCreateApiUsageEntry = vi.hoisted(() => vi.fn())
const mockCreateGeneration = vi.hoisted(() => vi.fn())
const mockVideoPipelineCreate = vi.hoisted(() => vi.fn())
const mockVideoPipelineFindUnique = vi.hoisted(() => vi.fn())
const mockVideoPipelineFindUniqueOrThrow = vi.hoisted(() => vi.fn())
const mockVideoPipelineUpdate = vi.hoisted(() => vi.fn())
const mockVideoPipelineClipUpdate = vi.hoisted(() => vi.fn())
const mockVideoPipelineClipUpdateMany = vi.hoisted(() => vi.fn())
const mockSubmitVideoToQueue = vi.hoisted(() => vi.fn())
const mockSubmitExtendVideoToQueue = vi.hoisted(() => vi.fn())
const mockCheckVideoQueueStatus = vi.hoisted(() => vi.fn())
const mockDispatchLongVideoPipelineWorkerRun = vi.hoisted(() => vi.fn())

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/generate-image.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/generate-image.service')
  >('@/services/generate-image.service')

  return {
    ...actual,
    resolveGenerationRoute: (...args: unknown[]) =>
      mockResolveGenerationRoute(...args),
  }
})

vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: (...args: unknown[]) => mockGetProviderAdapter(...args),
}))

vi.mock('@/services/video-generation-validation.service', () => ({
  validateVideoGenerationInput: (...args: unknown[]) =>
    mockValidateVideoGenerationInput(...args),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: (...args: unknown[]) => mockGenerateStorageKey(...args),
  fetchAsBuffer: (...args: unknown[]) => mockFetchAsBuffer(...args),
  uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
  streamUploadToR2: (...args: unknown[]) => mockStreamUploadToR2(...args),
}))

vi.mock('@/services/usage.service', () => ({
  createApiUsageEntry: (...args: unknown[]) => mockCreateApiUsageEntry(...args),
}))

vi.mock('@/services/generation.service', () => ({
  createGeneration: (...args: unknown[]) => mockCreateGeneration(...args),
}))

vi.mock('@/services/execution-worker.service', () => ({
  buildInternalUrl: (path: string) => `https://app.example.com${path}`,
  dispatchLongVideoPipelineWorkerRun: (...args: unknown[]) =>
    mockDispatchLongVideoPipelineWorkerRun(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    videoPipeline: {
      create: (...args: unknown[]) => mockVideoPipelineCreate(...args),
      findUnique: (...args: unknown[]) => mockVideoPipelineFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) =>
        mockVideoPipelineFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => mockVideoPipelineUpdate(...args),
    },
    videoPipelineClip: {
      update: (...args: unknown[]) => mockVideoPipelineClipUpdate(...args),
      updateMany: (...args: unknown[]) =>
        mockVideoPipelineClipUpdateMany(...args),
    },
  },
}))

import {
  cancelPipeline,
  advanceLongVideoPipelineFromWorker,
  checkPipelineStatus,
  createLongVideoPipeline,
  retryPipelineClip,
} from './video-pipeline.service'

const BASE_INPUT: LongVideoRequest = {
  prompt: 'cinematic long shot over a neon city',
  modelId: AI_MODELS.KLING_V3_PRO,
  aspectRatio: '16:9',
  targetDuration: 20,
  apiKeyId: 'key-1',
  resolution: '720p',
  characterCardIds: ['card-1'],
}

const EXECUTION_ROUTE = {
  modelId: 'fal-ai/kling-video/v3/pro/text-to-video',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  apiKey: 'plain-key',
  resolvedApiKeyId: 'key-1',
  creditCost: 6,
}

const BASE_GENERATION = {
  id: 'generation-1',
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  outputType: 'VIDEO',
  status: 'COMPLETED',
  url: 'https://cdn.example.com/final.mp4',
  storageKey: 'videos/final.mp4',
  mimeType: 'video/mp4',
  width: 1280,
  height: 720,
  duration: 15,
  prompt: BASE_INPUT.prompt,
  negativePrompt: null,
  model: AI_MODELS.KLING_V3_PRO,
  provider: 'fal.ai',
  requestCount: 2,
  isPublic: false,
  isPromptPublic: false,
  userId: 'user-1',
}

function clip(overrides: Record<string, unknown> = {}) {
  return {
    id: `clip-${overrides.clipIndex ?? 0}`,
    clipIndex: 0,
    status: 'QUEUED',
    externalRequestId: JSON.stringify({
      requestId: 'request-1',
      statusUrl: 'https://queue.example.com/status',
      responseUrl: 'https://queue.example.com/response',
    }),
    videoUrl: null,
    storageKey: null,
    lastFrameUrl: null,
    durationSec: null,
    errorMessage: null,
    startedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  }
}

function pipeline(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pipeline-1',
    userId: 'user-1',
    status: 'RUNNING',
    prompt: BASE_INPUT.prompt,
    modelId: AI_MODELS.KLING_V3_PRO,
    adapterType: AI_ADAPTER_TYPES.FAL,
    aspectRatio: '16:9',
    resolution: '720p',
    negativePrompt: null,
    extensionMethod: 'native_extend',
    targetDurationSec: 20,
    currentDurationSec: 0,
    completedClips: 0,
    totalClips: 2,
    characterCardIds: ['card-1'],
    referenceImageUrl: null,
    apiKeyId: 'key-1',
    errorMessage: null,
    clips: [clip(), clip({ id: 'clip-1', clipIndex: 1, status: 'PENDING' })],
    generation: null,
    ...overrides,
  }
}

describe('video-pipeline.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue({ id: 'user-1' })
    mockResolveGenerationRoute.mockResolvedValue(EXECUTION_ROUTE)
    mockGetProviderAdapter.mockReturnValue({
      submitVideoToQueue: (...args: unknown[]) =>
        mockSubmitVideoToQueue(...args),
      submitExtendVideoToQueue: (...args: unknown[]) =>
        mockSubmitExtendVideoToQueue(...args),
      checkVideoQueueStatus: (...args: unknown[]) =>
        mockCheckVideoQueueStatus(...args),
    })
    mockSubmitVideoToQueue.mockResolvedValue({
      requestId: 'request-1',
      statusUrl: 'https://queue.example.com/status',
      responseUrl: 'https://queue.example.com/response',
    })
    mockSubmitExtendVideoToQueue.mockResolvedValue({
      requestId: 'request-2',
      statusUrl: 'https://queue.example.com/status-2',
      responseUrl: 'https://queue.example.com/response-2',
    })
    mockGenerateStorageKey.mockReturnValue('videos/user-1/clip.mp4')
    mockFetchAsBuffer.mockResolvedValue({
      buffer: Buffer.from('reference'),
      mimeType: 'image/png',
    })
    mockUploadToR2.mockResolvedValue('https://cdn.example.com/reference.png')
    mockStreamUploadToR2.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/clip.mp4',
    })
    mockCreateApiUsageEntry.mockResolvedValue({ id: 'usage-1' })
    mockCreateGeneration.mockResolvedValue(BASE_GENERATION)
    mockVideoPipelineCreate.mockResolvedValue({ id: 'pipeline-1' })
    mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(pipeline())
    mockDispatchLongVideoPipelineWorkerRun.mockResolvedValue({
      workflowInstanceId: 'pipeline-1',
    })
  })

  describe('createLongVideoPipeline', () => {
    it('submits the first clip and creates a pipeline with calculated clip count', async () => {
      const result = await createLongVideoPipeline('clerk-1', BASE_INPUT)

      expect(result).toEqual({
        pipelineId: 'pipeline-1',
        totalClips: 3,
        estimatedDurationSec: 20,
      })
      expect(mockValidateVideoGenerationInput).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: AI_MODELS.KLING_V3_PRO,
          duration: 10,
        }),
      )
      expect(mockSubmitVideoToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: BASE_INPUT.prompt,
          modelId: EXECUTION_ROUTE.modelId,
          apiKey: 'plain-key',
          duration: 10,
        }),
      )
      expect(mockVideoPipelineCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            status: 'RUNNING',
            totalClips: 3,
            clips: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ clipIndex: 0, status: 'QUEUED' }),
                expect.objectContaining({ clipIndex: 1, status: 'PENDING' }),
                expect.objectContaining({ clipIndex: 2, status: 'PENDING' }),
              ]),
            }),
          }),
        }),
      )
      expect(mockDispatchLongVideoPipelineWorkerRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'pipeline-1',
          workflowId: 'LONG_VIDEO_PIPELINE',
          pipelineId: 'pipeline-1',
          advanceUrl:
            'https://app.example.com/api/internal/execution/long-video/advance',
          maxAttempts: 600,
        }),
      )
    })

    it('rejects target durations above the model extension limit', async () => {
      await expect(
        createLongVideoPipeline('clerk-1', {
          ...BASE_INPUT,
          targetDuration: 181,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_JOB',
        status: 400,
      })
      expect(mockSubmitVideoToQueue).not.toHaveBeenCalled()
    })
  })

  describe('checkPipelineStatus', () => {
    it('returns cached terminal pipeline status without provider polling', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(
        pipeline({
          status: 'COMPLETED',
          completedClips: 2,
          currentDurationSec: 15,
          generation: BASE_GENERATION,
        }),
      )

      const result = await checkPipelineStatus('clerk-1', 'pipeline-1')

      expect(result).toMatchObject({
        pipelineId: 'pipeline-1',
        status: 'COMPLETED',
        generation: { id: 'generation-1' },
      })
      expect(mockCheckVideoQueueStatus).not.toHaveBeenCalled()
    })

    it('marks a queued active clip as running while provider is still processing', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(pipeline())
      mockCheckVideoQueueStatus.mockResolvedValue({ status: 'IN_PROGRESS' })
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(
        pipeline({
          clips: [
            clip({ status: 'RUNNING' }),
            clip({ id: 'clip-1', clipIndex: 1, status: 'PENDING' }),
          ],
        }),
      )

      const result = await advanceLongVideoPipelineFromWorker('pipeline-1')

      expect(result.clips[0].status).toBe('RUNNING')
      expect(mockVideoPipelineClipUpdate).toHaveBeenCalledWith({
        where: { id: 'clip-0' },
        data: { status: 'RUNNING' },
      })
    })

    it('fails the pipeline when provider marks the active clip failed', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(pipeline())
      mockCheckVideoQueueStatus.mockResolvedValue({ status: 'FAILED' })
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(
        pipeline({
          status: 'FAILED',
          errorMessage: 'Clip 1 failed',
          clips: [
            clip({
              status: 'FAILED',
              errorMessage: 'Video generation failed on provider side',
            }),
            clip({ id: 'clip-1', clipIndex: 1, status: 'PENDING' }),
          ],
        }),
      )

      const result = await advanceLongVideoPipelineFromWorker('pipeline-1')

      expect(result.status).toBe('FAILED')
      expect(mockVideoPipelineUpdate).toHaveBeenCalledWith({
        where: { id: 'pipeline-1' },
        data: {
          status: 'FAILED',
          errorMessage: 'Clip 1 failed',
        },
      })
    })

    it('stores a completed clip and submits the next native extension clip', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(pipeline())
      mockCheckVideoQueueStatus.mockResolvedValue({
        status: 'COMPLETED',
        result: {
          videoUrl: 'https://provider.example.com/clip.mp4',
          thumbnailUrl: 'https://provider.example.com/last-frame.png',
          duration: 10,
          width: 1280,
          height: 720,
          requestCount: 1,
        },
      })
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(
        pipeline({
          completedClips: 1,
          currentDurationSec: 10,
          clips: [
            clip({
              status: 'COMPLETED',
              videoUrl: 'https://cdn.example.com/clip.mp4',
              storageKey: 'videos/user-1/clip.mp4',
              durationSec: 10,
            }),
            clip({ id: 'clip-1', clipIndex: 1, status: 'QUEUED' }),
          ],
        }),
      )

      const result = await advanceLongVideoPipelineFromWorker('pipeline-1')

      expect(result.completedClips).toBe(1)
      expect(mockStreamUploadToR2).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceUrl: 'https://provider.example.com/clip.mp4',
          key: 'videos/user-1/clip.mp4',
          mimeType: 'video/mp4',
        }),
      )
      expect(mockCreateApiUsageEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          provider: 'fal.ai',
          modelId: AI_MODELS.KLING_V3_PRO,
          wasSuccessful: true,
        }),
      )
      expect(mockSubmitExtendVideoToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          videoUrl: 'https://cdn.example.com/clip.mp4',
          extendEndpointId: 'fal-ai/kling-video/v3/pro/extend-video',
          duration: 5,
        }),
      )
    })

    it('submits the next last_frame_chain clip in parallel with the current R2 upload', async () => {
      // video-perf #1: last_frame_chain pipelines should kick the next
      // clip's submitVideoToQueue at the same time the previous clip's
      // bytes are being multipart-uploaded to R2 — the next clip only
      // depends on the provider thumbnail URL, which we already have.
      const submitOrder: string[] = []
      let resolveStreamUpload!: (value: {
        publicUrl: string
        sizeBytes: number
      }) => void
      mockStreamUploadToR2.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            submitOrder.push('r2Upload:start')
            resolveStreamUpload = (value) => {
              submitOrder.push('r2Upload:end')
              resolve(value)
            }
          }),
      )
      mockSubmitVideoToQueue.mockImplementationOnce(async () => {
        submitOrder.push('submitNextClip')
        return {
          requestId: 'request-2',
          statusUrl: 'https://queue.example.com/status-2',
          responseUrl: 'https://queue.example.com/response-2',
        }
      })

      mockVideoPipelineFindUnique.mockResolvedValue(
        pipeline({
          modelId: AI_MODELS.SEEDANCE_15_PRO,
          extensionMethod: 'last_frame_chain',
        }),
      )
      mockCheckVideoQueueStatus.mockResolvedValue({
        status: 'COMPLETED',
        result: {
          videoUrl: 'https://provider.example.com/clip.mp4',
          thumbnailUrl: 'https://provider.example.com/last-frame.png',
          duration: 10,
          width: 1280,
          height: 720,
          requestCount: 1,
        },
      })
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(
        pipeline({
          modelId: AI_MODELS.SEEDANCE_15_PRO,
          extensionMethod: 'last_frame_chain',
          completedClips: 1,
          currentDurationSec: 10,
          clips: [
            clip({
              status: 'COMPLETED',
              videoUrl: 'https://cdn.example.com/clip.mp4',
              storageKey: 'videos/user-1/clip.mp4',
              durationSec: 10,
            }),
            clip({ id: 'clip-1', clipIndex: 1, status: 'QUEUED' }),
          ],
        }),
      )

      const advancePromise = advanceLongVideoPipelineFromWorker('pipeline-1')

      // Yield so the in-flight uploadPromise has the chance to start,
      // and verify the parallel submit didn't wait for it.
      await new Promise((resolve) => setImmediate(resolve))

      expect(submitOrder).toContain('r2Upload:start')
      expect(submitOrder).toContain('submitNextClip')
      // submitNextClip must complete before the R2 upload finishes —
      // that's the whole point of the parallel optimisation.
      expect(submitOrder.indexOf('submitNextClip')).toBeLessThan(
        submitOrder.indexOf('r2Upload:end') === -1
          ? Number.MAX_SAFE_INTEGER
          : submitOrder.indexOf('r2Upload:end'),
      )

      resolveStreamUpload({
        publicUrl: 'https://cdn.example.com/clip.mp4',
        sizeBytes: 1024,
      })
      await advancePromise

      expect(mockSubmitVideoToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImage: 'https://provider.example.com/last-frame.png',
        }),
      )
      // native_extend's `submitExtendVideoToQueue` should not fire on
      // last_frame_chain pipelines.
      expect(mockSubmitExtendVideoToQueue).not.toHaveBeenCalled()
    })

    it('finalizes the pipeline when all clips are completed', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(
        pipeline({
          totalClips: 2,
          completedClips: 2,
          currentDurationSec: 15,
          clips: [
            clip({
              status: 'COMPLETED',
              videoUrl: 'https://cdn.example.com/clip-1.mp4',
              storageKey: 'videos/clip-1.mp4',
              durationSec: 10,
            }),
            clip({
              id: 'clip-1',
              clipIndex: 1,
              status: 'COMPLETED',
              videoUrl: 'https://cdn.example.com/clip-2.mp4',
              storageKey: 'videos/clip-2.mp4',
              durationSec: 5,
            }),
          ],
        }),
      )
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(
        pipeline({
          status: 'COMPLETED',
          totalClips: 2,
          completedClips: 2,
          currentDurationSec: 15,
          generation: BASE_GENERATION,
        }),
      )

      const result = await advanceLongVideoPipelineFromWorker('pipeline-1')

      expect(result).toMatchObject({
        status: 'COMPLETED',
        generation: { id: 'generation-1' },
      })
      expect(mockCreateGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://cdn.example.com/clip-2.mp4',
          storageKey: 'videos/clip-2.mp4',
          duration: 15,
          outputType: 'VIDEO',
          characterCardIds: ['card-1'],
        }),
      )
      expect(mockVideoPipelineUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pipeline-1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            generationId: 'generation-1',
          }),
        }),
      )
    })
  })

  describe('retryPipelineClip', () => {
    it('retries a failed first clip through the normal video queue', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(
        pipeline({
          status: 'FAILED',
          clips: [clip({ status: 'FAILED', errorMessage: 'Provider failed' })],
        }),
      )
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(pipeline())

      const result = await retryPipelineClip('clerk-1', 'pipeline-1', 0)

      expect(result.status).toBe('RUNNING')
      expect(mockSubmitVideoToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: BASE_INPUT.prompt,
          duration: 10,
        }),
      )
      expect(mockVideoPipelineClipUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'clip-0' },
          data: expect.objectContaining({
            status: 'QUEUED',
            errorMessage: null,
          }),
        }),
      )
      expect(mockVideoPipelineUpdate).toHaveBeenCalledWith({
        where: { id: 'pipeline-1' },
        data: { status: 'RUNNING', errorMessage: null },
      })
    })

    it('rejects retry when the previous extension clip is not completed', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(
        pipeline({
          clips: [
            clip({ status: 'FAILED' }),
            clip({ id: 'clip-1', clipIndex: 1, status: 'FAILED' }),
          ],
        }),
      )

      await expect(
        retryPipelineClip('clerk-1', 'pipeline-1', 1),
      ).rejects.toMatchObject({
        code: 'INVALID_JOB',
        status: 400,
      })
    })
  })

  describe('cancelPipeline', () => {
    it('cancels a running pipeline and marks unfinished clips failed', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(pipeline())
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(
        pipeline({
          status: 'CANCELLED',
          clips: [
            clip({ status: 'FAILED', errorMessage: 'Pipeline cancelled' }),
            clip({
              id: 'clip-1',
              clipIndex: 1,
              status: 'FAILED',
              errorMessage: 'Pipeline cancelled',
            }),
          ],
        }),
      )

      const result = await cancelPipeline('clerk-1', 'pipeline-1')

      expect(result.status).toBe('CANCELLED')
      expect(mockVideoPipelineUpdate).toHaveBeenCalledWith({
        where: { id: 'pipeline-1' },
        data: { status: 'CANCELLED' },
      })
      expect(mockVideoPipelineClipUpdateMany).toHaveBeenCalledWith({
        where: {
          pipelineId: 'pipeline-1',
          status: { in: ['PENDING', 'QUEUED', 'RUNNING'] },
        },
        data: { status: 'FAILED', errorMessage: 'Pipeline cancelled' },
      })
    })
  })
})
