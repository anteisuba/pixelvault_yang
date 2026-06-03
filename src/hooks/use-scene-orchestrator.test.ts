import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  advanceSceneAPI: vi.fn(),
  getSceneStatusAPI: vi.fn(),
  retrySceneAPI: vi.fn(),
  startOrchestrationAPI: vi.fn(),
}))

vi.mock('next-intl', () => {
  const t = (key: string) => key

  return {
    useTranslations: () => t,
  }
})

import { SCENE_POLL_INTERVAL_MS } from '@/constants/video-scene'
import {
  advanceSceneAPI,
  getSceneStatusAPI,
  retrySceneAPI,
  startOrchestrationAPI,
} from '@/lib/api-client'
import { VideoScriptSceneStatus } from '@/lib/generated/prisma/enums'
import { useSceneOrchestrator } from '@/hooks/use-scene-orchestrator'
import type { SceneOrchestratorStatus } from '@/types/video-script'

const SCRIPT_ID = 'script-1'

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function makeStatus(
  sceneStatus: VideoScriptSceneStatus,
  overrides?: Partial<SceneOrchestratorStatus>,
): SceneOrchestratorStatus {
  return {
    scriptId: SCRIPT_ID,
    scriptStatus: 'GENERATING',
    progress: sceneStatus === VideoScriptSceneStatus.CLIP_READY ? 100 : 0,
    scenes: [
      {
        index: 0,
        action: 'Scene action',
        status: sceneStatus,
        hasFrame: false,
        hasClip: sceneStatus === VideoScriptSceneStatus.CLIP_READY,
        retryCount: 0,
        errorMessage: null,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(advanceSceneAPI).mockResolvedValue({
    success: true,
    data: {
      sceneIndex: 0,
      sceneStatus: VideoScriptSceneStatus.CLIP_GENERATING,
      isComplete: false,
      retriesRemaining: 2,
      totalScenes: 1,
      completedScenes: 0,
    },
  })
  vi.mocked(retrySceneAPI).mockResolvedValue({ success: true, data: null })
  vi.mocked(startOrchestrationAPI).mockResolvedValue({
    success: true,
    data: { started: true, currentSceneIndex: 0 },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSceneOrchestrator', () => {
  it('starts orchestration and refreshes status', async () => {
    vi.mocked(getSceneStatusAPI).mockResolvedValue({
      success: true,
      data: makeStatus(VideoScriptSceneStatus.PENDING),
    })

    const { result } = renderHook(() => useSceneOrchestrator(SCRIPT_ID))
    await waitFor(() => expect(result.current.status).toBeTruthy())

    await act(async () => {
      await result.current.start()
    })

    expect(startOrchestrationAPI).toHaveBeenCalledWith(SCRIPT_ID)
    expect(getSceneStatusAPI).toHaveBeenCalledTimes(2)
  })

  it('polls scene status while a scene is generating', async () => {
    vi.useFakeTimers()
    vi.mocked(getSceneStatusAPI)
      .mockResolvedValueOnce({
        success: true,
        data: makeStatus(VideoScriptSceneStatus.CLIP_GENERATING),
      })
      .mockResolvedValueOnce({
        success: true,
        data: makeStatus(VideoScriptSceneStatus.CLIP_READY, {
          scriptStatus: 'COMPLETED',
        }),
      })

    const { result } = renderHook(() => useSceneOrchestrator(SCRIPT_ID))
    await flushPromises()

    expect(result.current.status?.scenes[0]?.status).toBe(
      VideoScriptSceneStatus.CLIP_GENERATING,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SCENE_POLL_INTERVAL_MS)
    })
    await flushPromises()

    expect(result.current.status?.scenes[0]?.status).toBe(
      VideoScriptSceneStatus.CLIP_READY,
    )
  })

  it('stops polling when the script is complete', async () => {
    vi.useFakeTimers()
    vi.mocked(getSceneStatusAPI).mockResolvedValue({
      success: true,
      data: makeStatus(VideoScriptSceneStatus.CLIP_READY, {
        scriptStatus: 'COMPLETED',
      }),
    })

    const { result } = renderHook(() => useSceneOrchestrator(SCRIPT_ID))
    await flushPromises()

    expect(result.current.status?.progress).toBe(100)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SCENE_POLL_INTERVAL_MS * 2)
    })

    expect(getSceneStatusAPI).toHaveBeenCalledTimes(1)
  })
})
