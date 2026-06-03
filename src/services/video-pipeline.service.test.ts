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

vi.mock('@/services/image/generate-image.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/image/generate-image.service')
  >('@/services/image/generate-image.service')

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
  applyLongVideoPipelineWorkerUpdate,
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
    it('creates a pipeline and dispatches provider-owned execution to the worker', async () => {
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
      expect(mockSubmitVideoToQueue).not.toHaveBeenCalled()
      expect(mockVideoPipelineCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            status: 'RUNNING',
            totalClips: 3,
            clips: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ clipIndex: 0, status: 'PENDING' }),
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
          resolveKeyUrl:
            'https://app.example.com/api/internal/execution/resolve-key',
          providerId: AI_ADAPTER_TYPES.FAL,
          apiKeyId: 'key-1',
          maxAttempts: 600,
          providerInput: expect.objectContaining({
            prompt: BASE_INPUT.prompt,
            modelId: EXECUTION_ROUTE.modelId,
            externalModelId: 'fal-ai/kling-video/v3/pro/text-to-video',
            firstClipDuration: 10,
            extensionClipDuration: 5,
            totalClips: 3,
            extensionMethod: 'native_extend',
            outputStorageKeys: [
              'videos/user-1/clip.mp4',
              'videos/user-1/clip.mp4',
              'videos/user-1/clip.mp4',
            ],
          }),
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

  describe('pipeline status and worker updates', () => {
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

    it('keeps legacy advance ticks read-only', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(pipeline())

      const result = await advanceLongVideoPipelineFromWorker('pipeline-1')

      expect(result.status).toBe('RUNNING')
      expect(mockCheckVideoQueueStatus).not.toHaveBeenCalled()
      expect(mockStreamUploadToR2).not.toHaveBeenCalled()
      expect(mockSubmitExtendVideoToQueue).not.toHaveBeenCalled()
    })

    it('persists a queued clip from a worker update', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(pipeline())
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(
        pipeline({
          clips: [
            clip({ status: 'QUEUED' }),
            clip({ id: 'clip-1', clipIndex: 1, status: 'PENDING' }),
          ],
        }),
      )

      const result = await applyLongVideoPipelineWorkerUpdate({
        runId: 'pipeline-1',
        pipelineId: 'pipeline-1',
        action: 'clip-queued',
        clipIndex: 0,
        requestId: 'request-1',
        statusUrl: 'https://queue.example.com/status',
        responseUrl: 'https://queue.example.com/response',
      })

      expect(result.clips[0].status).toBe('QUEUED')
      expect(mockVideoPipelineClipUpdate).toHaveBeenCalledWith({
        where: { id: 'clip-0' },
        data: expect.objectContaining({
          status: 'QUEUED',
          externalRequestId: expect.stringContaining('request-1'),
        }),
      })
      expect(mockSubmitVideoToQueue).not.toHaveBeenCalled()
    })

    it('stores a completed worker-uploaded clip without provider polling', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(pipeline())
      mockVideoPipelineFindUniqueOrThrow
        .mockResolvedValueOnce(
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
              clip({ id: 'clip-1', clipIndex: 1, status: 'PENDING' }),
            ],
          }),
        )
        .mockResolvedValueOnce(
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
              clip({ id: 'clip-1', clipIndex: 1, status: 'PENDING' }),
            ],
          }),
        )

      const result = await applyLongVideoPipelineWorkerUpdate({
        runId: 'pipeline-1',
        pipelineId: 'pipeline-1',
        action: 'clip-completed',
        clipIndex: 0,
        videoUrl: 'https://cdn.example.com/clip.mp4',
        storageKey: 'videos/user-1/clip.mp4',
        lastFrameUrl: 'https://provider.example.com/last-frame.png',
        durationSec: 10,
        requestCount: 1,
        width: 1280,
        height: 720,
      })

      expect(result.completedClips).toBe(1)
      expect(mockStreamUploadToR2).not.toHaveBeenCalled()
      expect(mockCreateApiUsageEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          provider: 'fal.ai',
          modelId: AI_MODELS.KLING_V3_PRO,
          width: 1280,
          height: 720,
          wasSuccessful: true,
        }),
      )
      expect(mockVideoPipelineClipUpdate).toHaveBeenCalledWith({
        where: { id: 'clip-0' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          videoUrl: 'https://cdn.example.com/clip.mp4',
          storageKey: 'videos/user-1/clip.mp4',
        }),
      })
    })

    it('finalizes after the worker completes the last clip', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(
        pipeline({
          totalClips: 2,
          completedClips: 1,
          currentDurationSec: 10,
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
              status: 'QUEUED',
            }),
          ],
        }),
      )
      mockVideoPipelineFindUniqueOrThrow
        .mockResolvedValueOnce(
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
        .mockResolvedValueOnce(
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
        .mockResolvedValueOnce(
          pipeline({
            status: 'COMPLETED',
            totalClips: 2,
            completedClips: 2,
            currentDurationSec: 15,
            generation: BASE_GENERATION,
          }),
        )

      const result = await applyLongVideoPipelineWorkerUpdate({
        runId: 'pipeline-1',
        pipelineId: 'pipeline-1',
        action: 'clip-completed',
        clipIndex: 1,
        videoUrl: 'https://cdn.example.com/clip-2.mp4',
        storageKey: 'videos/clip-2.mp4',
        durationSec: 5,
      })

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
    })
  })

  describe('retryPipelineClip', () => {
    it('retries a failed first clip by dispatching a new worker run', async () => {
      mockVideoPipelineFindUnique.mockResolvedValue(
        pipeline({
          status: 'FAILED',
          clips: [clip({ status: 'FAILED', errorMessage: 'Provider failed' })],
        }),
      )
      mockVideoPipelineFindUniqueOrThrow.mockResolvedValue(pipeline())

      const result = await retryPipelineClip('clerk-1', 'pipeline-1', 0)

      expect(result.status).toBe('RUNNING')
      expect(mockSubmitVideoToQueue).not.toHaveBeenCalled()
      expect(mockVideoPipelineClipUpdateMany).toHaveBeenCalledWith({
        where: {
          pipelineId: 'pipeline-1',
          clipIndex: { gte: 0 },
        },
        data: expect.objectContaining({
          status: 'PENDING',
          errorMessage: null,
          externalRequestId: null,
        }),
      })
      expect(mockVideoPipelineUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pipeline-1' },
          data: expect.objectContaining({
            status: 'RUNNING',
            errorMessage: null,
            completedClips: 0,
            currentDurationSec: 0,
          }),
        }),
      )
      expect(mockDispatchLongVideoPipelineWorkerRun).toHaveBeenCalledWith(
        expect.objectContaining({
          pipelineId: 'pipeline-1',
          startClipIndex: 0,
          providerInput: expect.objectContaining({
            firstClipDuration: 10,
            extensionClipDuration: 5,
          }),
        }),
      )
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
