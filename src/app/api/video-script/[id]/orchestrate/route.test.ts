import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FAKE_DB_USER,
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { VideoScriptSceneStatus } from '@/types/video-script'

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/video-scene-orchestrator.service', () => ({
  startSceneOrchestration: vi.fn(),
  advanceScene: vi.fn(),
  retryScene: vi.fn(),
  getSceneStatus: vi.fn(),
}))

vi.mock('@/services/video-script.service', () => {
  class VideoScriptNotFoundError extends Error {
    constructor(id: string) {
      super(`VideoScript ${id} not found`)
      this.name = 'VideoScriptNotFoundError'
    }
  }

  return { VideoScriptNotFoundError }
})

import { POST as ADVANCE } from '@/app/api/video-script/[id]/advance/route'
import { POST as ORCHESTRATE } from '@/app/api/video-script/[id]/orchestrate/route'
import { GET as SCENE_STATUS } from '@/app/api/video-script/[id]/scene-status/route'
import { POST as RETRY_SCENE } from '@/app/api/video-script/[id]/scenes/[index]/retry/route'
import { ensureUser } from '@/services/user.service'
import {
  advanceScene,
  getSceneStatus,
  retryScene,
  startSceneOrchestration,
} from '@/services/video-scene-orchestrator.service'
import { VideoScriptNotFoundError } from '@/services/video-script.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockStartSceneOrchestration = vi.mocked(startSceneOrchestration)
const mockAdvanceScene = vi.mocked(advanceScene)
const mockRetryScene = vi.mocked(retryScene)
const mockGetSceneStatus = vi.mocked(getSceneStatus)

const SCRIPT_ID = 'script-1'

function idContext() {
  return { params: Promise.resolve({ id: SCRIPT_ID }) }
}

function retryContext(index = '0') {
  return { params: Promise.resolve({ id: SCRIPT_ID, index }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/video-script/[id]/orchestrate', () => {
  it('401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await ORCHESTRATE(
      createPOST(`/api/video-script/${SCRIPT_ID}/orchestrate`, {}),
      idContext(),
    )

    expect(res.status).toBe(401)
  })

  it('200 when orchestration starts', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockStartSceneOrchestration.mockResolvedValue({
      started: true,
      currentSceneIndex: 0,
    })

    const res = await ORCHESTRATE(
      createPOST(`/api/video-script/${SCRIPT_ID}/orchestrate`, {}),
      idContext(),
    )

    expect(res.status).toBe(200)
    expect(mockStartSceneOrchestration).toHaveBeenCalledWith(
      SCRIPT_ID,
      FAKE_DB_USER.id,
    )
  })

  it('404 when script is not found', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockStartSceneOrchestration.mockRejectedValue(
      new VideoScriptNotFoundError(SCRIPT_ID),
    )

    const res = await ORCHESTRATE(
      createPOST(`/api/video-script/${SCRIPT_ID}/orchestrate`, {}),
      idContext(),
    )

    expect(res.status).toBe(404)
  })
})

describe('POST /api/video-script/[id]/advance', () => {
  it('200 when scene advances', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockAdvanceScene.mockResolvedValue({
      sceneIndex: 1,
      sceneStatus: VideoScriptSceneStatus.CLIP_GENERATING,
      isComplete: false,
      retriesRemaining: 2,
      totalScenes: 3,
      completedScenes: 1,
    })

    const res = await ADVANCE(
      createPOST(`/api/video-script/${SCRIPT_ID}/advance`, {}),
      idContext(),
    )
    const body = (await parseJSON(res)) as {
      success: boolean
      data: { sceneIndex: number }
    }

    expect(res.status).toBe(200)
    expect(body.data.sceneIndex).toBe(1)
  })
})

describe('GET /api/video-script/[id]/scene-status', () => {
  it('200 with orchestration status', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockGetSceneStatus.mockResolvedValue({
      scriptId: SCRIPT_ID,
      scriptStatus: 'GENERATING',
      scenes: [],
      progress: 0,
    })

    const res = await SCENE_STATUS(
      createGET(`/api/video-script/${SCRIPT_ID}/scene-status`),
      idContext(),
    )

    expect(res.status).toBe(200)
    expect(mockGetSceneStatus).toHaveBeenCalledWith(SCRIPT_ID, FAKE_DB_USER.id)
  })

  it('404 when script is not found', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockGetSceneStatus.mockRejectedValue(
      new VideoScriptNotFoundError(SCRIPT_ID),
    )

    const res = await SCENE_STATUS(
      createGET(`/api/video-script/${SCRIPT_ID}/scene-status`),
      idContext(),
    )

    expect(res.status).toBe(404)
  })
})

describe('POST /api/video-script/[id]/scenes/[index]/retry', () => {
  it('401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await RETRY_SCENE(
      createPOST(`/api/video-script/${SCRIPT_ID}/scenes/0/retry`, {}),
      retryContext(),
    )

    expect(res.status).toBe(401)
  })

  it('400 when scene index is invalid', async () => {
    mockAuthenticated()

    const res = await RETRY_SCENE(
      createPOST(`/api/video-script/${SCRIPT_ID}/scenes/nope/retry`, {}),
      retryContext('nope'),
    )

    expect(res.status).toBe(400)
  })

  it('200 when retry succeeds', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockRetryScene.mockResolvedValue(undefined)

    const res = await RETRY_SCENE(
      createPOST(`/api/video-script/${SCRIPT_ID}/scenes/0/retry`, {}),
      retryContext(),
    )

    expect(res.status).toBe(200)
    expect(mockRetryScene).toHaveBeenCalledWith(SCRIPT_ID, 0, FAKE_DB_USER.id)
  })

  it('404 when script is not found', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockRetryScene.mockRejectedValue(new VideoScriptNotFoundError(SCRIPT_ID))

    const res = await RETRY_SCENE(
      createPOST(`/api/video-script/${SCRIPT_ID}/scenes/0/retry`, {}),
      retryContext(),
    )

    expect(res.status).toBe(404)
  })
})
