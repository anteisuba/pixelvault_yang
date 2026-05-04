import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VideoScriptSceneStatus, VideoScriptStatus } from '@/types/video-script'

const mockVideoScriptFindFirst = vi.fn()
const mockVideoScriptUpdate = vi.fn()
const mockVideoScriptSceneUpdate = vi.fn()
const mockVideoScriptSceneUpdateMany = vi.fn()
const mockCharacterCardFindFirst = vi.fn()
const mockStyleCardFindFirst = vi.fn()
const mockGenerationFindFirst = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    videoScript: {
      findFirst: (...args: unknown[]) => mockVideoScriptFindFirst(...args),
      update: (...args: unknown[]) => mockVideoScriptUpdate(...args),
    },
    videoScriptScene: {
      update: (...args: unknown[]) => mockVideoScriptSceneUpdate(...args),
      updateMany: (...args: unknown[]) =>
        mockVideoScriptSceneUpdateMany(...args),
    },
    characterCard: {
      findFirst: (...args: unknown[]) => mockCharacterCardFindFirst(...args),
    },
    styleCard: {
      findFirst: (...args: unknown[]) => mockStyleCardFindFirst(...args),
    },
    generation: {
      findFirst: (...args: unknown[]) => mockGenerationFindFirst(...args),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/generate-video.service', () => ({
  submitVideoGenerationForUserId: vi.fn(),
  checkVideoGenerationStatusForUserId: vi.fn(),
}))

vi.mock('@/services/video-script.service', () => ({
  VideoScriptNotFoundError: class VideoScriptNotFoundError extends Error {},
}))

import {
  checkVideoGenerationStatusForUserId,
  submitVideoGenerationForUserId,
} from '@/services/generate-video.service'
import {
  advanceScene,
  getSceneStatus,
  retryScene,
  startSceneOrchestration,
} from '@/services/video-scene-orchestrator.service'

const userId = 'user-1'

interface SceneFixture {
  id: string
  orderIndex: number
  duration: number
  cameraShot: string
  action: string
  dialogue: string | null
  transition: string
  frameGenerationId: string | null
  clipGenerationId: string | null
  status: VideoScriptSceneStatus
  errorMessage: string | null
}

interface ScriptFixture {
  id: string
  userId: string
  status: VideoScriptStatus
  characterCardId: string | null
  styleCardId: string | null
  videoModelId: string
  scenes: SceneFixture[]
}

function createScene(overrides: Partial<SceneFixture> = {}): SceneFixture {
  return {
    id: 'scene-0',
    orderIndex: 0,
    duration: 6,
    cameraShot: 'medium',
    action: 'A courier crosses a rain-soaked alley.',
    dialogue: null,
    transition: 'cut',
    frameGenerationId: null,
    clipGenerationId: null,
    status: VideoScriptSceneStatus.PENDING,
    errorMessage: null,
    ...overrides,
  }
}

function createScript(overrides: Partial<ScriptFixture> = {}): ScriptFixture {
  return {
    id: 'script-1',
    userId,
    status: VideoScriptStatus.SCRIPT_READY,
    characterCardId: null,
    styleCardId: null,
    videoModelId: 'kling-pro',
    scenes: [createScene()],
    ...overrides,
  }
}

describe('video scene orchestrator service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCharacterCardFindFirst.mockResolvedValue(null)
    mockStyleCardFindFirst.mockResolvedValue(null)
    mockGenerationFindFirst.mockResolvedValue(null)
    mockVideoScriptSceneUpdateMany.mockResolvedValue({ count: 1 })
    vi.mocked(submitVideoGenerationForUserId).mockResolvedValue({
      jobId: 'job-1',
      requestId: 'request-1',
    })
  })

  it('starts orchestration for the first pending scene', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(createScript())

    const result = await startSceneOrchestration('script-1', userId)

    expect(result).toEqual({ started: true, currentSceneIndex: 0 })
    expect(mockVideoScriptSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'scene-0',
          status: VideoScriptSceneStatus.PENDING,
        }),
        data: expect.objectContaining({
          status: VideoScriptSceneStatus.CLIP_GENERATING,
        }),
      }),
    )
    expect(submitVideoGenerationForUserId).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        modelId: 'kling-v3-pro',
        prompt: expect.stringContaining('rain-soaked alley'),
      }),
    )
    expect(mockVideoScriptSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clipGenerationId: 'job-1',
        }),
      }),
    )
  })

  it('returns active scene instead of starting a later pending scene', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(
      createScript({
        scenes: [
          createScene({
            status: VideoScriptSceneStatus.CLIP_GENERATING,
            clipGenerationId: 'job-0',
          }),
          createScene({ id: 'scene-1', orderIndex: 1 }),
        ],
      }),
    )

    const result = await startSceneOrchestration('script-1', userId)

    expect(result).toEqual({
      started: false,
      currentSceneIndex: 0,
      reason: 'scene_active',
    })
    expect(submitVideoGenerationForUserId).not.toHaveBeenCalled()
  })

  it('does not submit to provider when scene claim fails', async () => {
    mockVideoScriptSceneUpdateMany.mockResolvedValue({ count: 0 })
    mockVideoScriptFindFirst.mockResolvedValue(createScript())

    const result = await startSceneOrchestration('script-1', userId)

    expect(result).toEqual({
      started: false,
      currentSceneIndex: 0,
      reason: 'claim_lost',
    })
    expect(submitVideoGenerationForUserId).not.toHaveBeenCalled()
  })

  it('advances from a ready clip to the next pending scene', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(
      createScript({
        scenes: [
          createScene({
            status: VideoScriptSceneStatus.CLIP_READY,
            clipGenerationId: 'gen-0',
          }),
          createScene({ id: 'scene-1', orderIndex: 1 }),
        ],
      }),
    )

    const result = await advanceScene('script-1', userId)

    expect(result).toMatchObject({
      sceneIndex: 1,
      sceneStatus: VideoScriptSceneStatus.CLIP_GENERATING,
      isComplete: false,
      completedScenes: 1,
    })
    expect(submitVideoGenerationForUserId).toHaveBeenCalledTimes(1)
  })

  it('marks the script completed when all scenes are ready', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(
      createScript({
        scenes: [
          createScene({
            status: VideoScriptSceneStatus.CLIP_READY,
            clipGenerationId: 'gen-0',
          }),
        ],
      }),
    )

    const result = await advanceScene('script-1', userId)

    expect(result.isComplete).toBe(true)
    expect(mockVideoScriptUpdate).toHaveBeenCalledWith({
      where: { id: 'script-1' },
      data: { status: VideoScriptStatus.COMPLETED },
    })
  })

  it('automatically retries a failed scene while retries remain', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(
      createScript({
        scenes: [
          createScene({
            status: VideoScriptSceneStatus.FAILED,
            errorMessage: '[scene-retry-count:0] provider failed',
          }),
        ],
      }),
    )

    const result = await advanceScene('script-1', userId)

    expect(result).toMatchObject({
      sceneIndex: 0,
      sceneStatus: VideoScriptSceneStatus.CLIP_GENERATING,
      retriesRemaining: 1,
    })
    expect(submitVideoGenerationForUserId).toHaveBeenCalledTimes(1)
  })

  it('manually retries a failed scene', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(
      createScript({
        scenes: [
          createScene({
            status: VideoScriptSceneStatus.FAILED,
            errorMessage: '[scene-retry-count:1] provider failed',
          }),
        ],
      }),
    )

    await retryScene('script-1', 0, userId)

    expect(mockVideoScriptSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'scene-0',
          status: VideoScriptSceneStatus.FAILED,
        }),
        data: expect.objectContaining({
          status: VideoScriptSceneStatus.CLIP_GENERATING,
          clipGenerationId: null,
          errorMessage: '[scene-retry-count:2]',
        }),
      }),
    )
    expect(submitVideoGenerationForUserId).toHaveBeenCalledTimes(1)
  })

  it('returns scene status with progress and retry metadata', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(
      createScript({
        scenes: [
          createScene({
            status: VideoScriptSceneStatus.CLIP_READY,
            clipGenerationId: 'gen-0',
          }),
          createScene({
            id: 'scene-1',
            orderIndex: 1,
            status: VideoScriptSceneStatus.FAILED,
            errorMessage: '[scene-retry-count:2] provider failed',
          }),
        ],
      }),
    )

    const result = await getSceneStatus('script-1', userId)

    expect(result.progress).toBe(50)
    expect(result.scriptStatus).toBe('GENERATING')
    expect(result.scenes[1]).toMatchObject({
      retryCount: 2,
      errorMessage: 'provider failed',
    })
  })

  it('keeps an in-progress clip in generating status', async () => {
    mockVideoScriptFindFirst.mockResolvedValue(
      createScript({
        scenes: [
          createScene({
            status: VideoScriptSceneStatus.CLIP_GENERATING,
            clipGenerationId: 'job-1',
          }),
        ],
      }),
    )
    vi.mocked(checkVideoGenerationStatusForUserId).mockResolvedValue({
      jobId: 'job-1',
      status: 'IN_PROGRESS',
    })

    const result = await advanceScene('script-1', userId)

    expect(result.sceneStatus).toBe(VideoScriptSceneStatus.CLIP_GENERATING)
    expect(checkVideoGenerationStatusForUserId).toHaveBeenCalledWith(
      userId,
      'job-1',
    )
  })
})
