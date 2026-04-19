import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FAKE_DB_USER,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))
vi.mock('@/services/video-script.service', () => {
  class VideoScriptNotFoundError extends Error {
    constructor(id: string) {
      super(`VideoScript ${id} not found`)
      this.name = 'VideoScriptNotFoundError'
    }
  }
  return {
    getById: vi.fn(),
    updateScenes: vi.fn(),
    confirmScript: vi.fn(),
    deleteScript: vi.fn(),
    VideoScriptNotFoundError,
  }
})

import { DELETE, GET, PATCH } from '@/app/api/video-script/[id]/route'
import { ensureUser } from '@/services/user.service'
import {
  confirmScript,
  deleteScript,
  getById,
  updateScenes,
  VideoScriptNotFoundError,
} from '@/services/video-script.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockGetById = vi.mocked(getById)
const mockUpdateScenes = vi.mocked(updateScenes)
const mockConfirmScript = vi.mocked(confirmScript)
const mockDeleteScript = vi.mocked(deleteScript)

const SCRIPT_ID = 'script-1'

const FAKE_SCRIPT = {
  id: SCRIPT_ID,
  userId: FAKE_DB_USER.id,
  topic: 'A cat learns to fly',
  targetDuration: 30,
  totalScenes: 5,
  status: 'DRAFT',
  consistencyMode: 'first_frame_ref',
  characterCardId: null,
  styleCardId: null,
  videoModelId: 'seedance-2-fast',
  finalVideoUrl: null,
  scenes: [],
  createdAt: new Date('2026-04-19').toISOString(),
  updatedAt: new Date('2026-04-19').toISOString(),
}

const BASE_URL = 'http://localhost:3000'

function createGETById() {
  return new NextRequest(new URL(`/api/video-script/${SCRIPT_ID}`, BASE_URL))
}
function createPATCHById(body: unknown) {
  return new NextRequest(new URL(`/api/video-script/${SCRIPT_ID}`, BASE_URL), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function createDELETEById() {
  return new NextRequest(new URL(`/api/video-script/${SCRIPT_ID}`, BASE_URL), {
    method: 'DELETE',
  })
}
function ctx() {
  return { params: Promise.resolve({ id: SCRIPT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/video-script/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET(createGETById(), ctx())
    expect(res.status).toBe(401)
  })

  it('404 when script not owned', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockGetById.mockRejectedValue(new VideoScriptNotFoundError(SCRIPT_ID))

    const res = await GET(createGETById(), ctx())
    expect(res.status).toBe(404)
  })

  it('200 with full script on success', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockGetById.mockResolvedValue(FAKE_SCRIPT as never)

    const res = await GET(createGETById(), ctx())
    expect(res.status).toBe(200)
    const body = (await parseJSON(res)) as {
      success: boolean
      data: { id: string }
    }
    expect(body.data.id).toBe(SCRIPT_ID)
  })

  it('500 on unexpected error', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockGetById.mockRejectedValue(new Error('db connection lost'))

    const res = await GET(createGETById(), ctx())
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/video-script/[id]', () => {
  const VALID_SCENES = Array.from({ length: 5 }).map((_, i) => ({
    orderIndex: i,
    duration: 6,
    cameraShot: 'wide' as const,
    action: `action ${i}`,
    dialogue: null,
    transition: 'cut' as const,
  }))

  it('401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await PATCH(createPATCHById({ scenes: VALID_SCENES }), ctx())
    expect(res.status).toBe(401)
  })

  it('400 when neither scenes nor status provided', async () => {
    mockAuthenticated()
    const res = await PATCH(createPATCHById({}), ctx())
    expect(res.status).toBe(400)
  })

  it('404 when script not owned', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockUpdateScenes.mockRejectedValue(new VideoScriptNotFoundError(SCRIPT_ID))

    const res = await PATCH(createPATCHById({ scenes: VALID_SCENES }), ctx())
    expect(res.status).toBe(404)
  })

  it('200 when editing scenes', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockUpdateScenes.mockResolvedValue(FAKE_SCRIPT as never)

    const res = await PATCH(createPATCHById({ scenes: VALID_SCENES }), ctx())
    expect(res.status).toBe(200)
    expect(mockUpdateScenes).toHaveBeenCalledWith(
      SCRIPT_ID,
      VALID_SCENES,
      FAKE_DB_USER.id,
    )
  })

  it('200 when advancing to SCRIPT_READY', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockConfirmScript.mockResolvedValue({
      ...FAKE_SCRIPT,
      status: 'SCRIPT_READY',
    } as never)

    const res = await PATCH(createPATCHById({ status: 'SCRIPT_READY' }), ctx())
    expect(res.status).toBe(200)
    expect(mockConfirmScript).toHaveBeenCalledWith(SCRIPT_ID, FAKE_DB_USER.id)
  })

  it('500 on unexpected error', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockUpdateScenes.mockRejectedValue(new Error('db crash'))

    const res = await PATCH(createPATCHById({ scenes: VALID_SCENES }), ctx())
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/video-script/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await DELETE(createDELETEById(), ctx())
    expect(res.status).toBe(401)
  })

  it('404 when script not owned', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockDeleteScript.mockRejectedValue(new VideoScriptNotFoundError(SCRIPT_ID))

    const res = await DELETE(createDELETEById(), ctx())
    expect(res.status).toBe(404)
  })

  it('200 on successful delete', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockDeleteScript.mockResolvedValue(undefined)

    const res = await DELETE(createDELETEById(), ctx())
    expect(res.status).toBe(200)
    const body = (await parseJSON(res)) as { success: boolean }
    expect(body.success).toBe(true)
  })

  it('500 on unexpected error', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockDeleteScript.mockRejectedValue(new Error('fk violation'))

    const res = await DELETE(createDELETEById(), ctx())
    expect(res.status).toBe(500)
  })
})
