import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FAKE_DB_USER,
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))
vi.mock('@/services/video-script.service', () => ({
  generateScript: vi.fn(),
  listByUser: vi.fn(),
}))

import { GET, POST } from '@/app/api/video-script/route'
import { ensureUser } from '@/services/user.service'
import { generateScript, listByUser } from '@/services/video-script.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockGenerateScript = vi.mocked(generateScript)
const mockListByUser = vi.mocked(listByUser)

const VALID_POST_BODY = {
  topic: 'A cat learns to fly',
  targetDuration: 30,
  consistencyMode: 'first_frame_ref',
  videoModelId: 'seedance-2-fast',
}

const FAKE_SCRIPT = {
  id: 'script-1',
  userId: FAKE_DB_USER.id,
  topic: VALID_POST_BODY.topic,
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/video-script', () => {
  it('401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(createPOST('/api/video-script', VALID_POST_BODY))
    expect(res.status).toBe(401)
  })

  it('400 when body fails Zod validation', async () => {
    mockAuthenticated()
    const res = await POST(
      createPOST('/api/video-script', { topic: 'x' }), // missing required fields
    )
    expect(res.status).toBe(400)
    const body = (await parseJSON(res)) as Record<string, unknown>
    expect(body.success).toBe(false)
  })

  it('400 when character_card mode missing characterCardId', async () => {
    mockAuthenticated()
    const res = await POST(
      createPOST('/api/video-script', {
        ...VALID_POST_BODY,
        consistencyMode: 'character_card',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('200 with created script on success', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockGenerateScript.mockResolvedValue(FAKE_SCRIPT as never)

    const res = await POST(createPOST('/api/video-script', VALID_POST_BODY))
    expect(res.status).toBe(200)
    const body = (await parseJSON(res)) as {
      success: boolean
      data: { id: string }
    }
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('script-1')
    expect(mockGenerateScript).toHaveBeenCalledWith(
      expect.objectContaining({ topic: VALID_POST_BODY.topic }),
      FAKE_DB_USER.id,
    )
  })

  it('500 when service throws unexpectedly', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockGenerateScript.mockRejectedValue(new Error('LLM provider down'))

    const res = await POST(createPOST('/api/video-script', VALID_POST_BODY))
    expect(res.status).toBe(500)
  })
})

describe('GET /api/video-script', () => {
  it('401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET(createGET('/api/video-script'))
    expect(res.status).toBe(401)
  })

  it('200 with paginated list', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockListByUser.mockResolvedValue({
      scripts: [FAKE_SCRIPT as never],
      page: 1,
      size: 20,
      total: 1,
    })

    const res = await GET(createGET('/api/video-script'))
    expect(res.status).toBe(200)
    const body = (await parseJSON(res)) as {
      success: boolean
      data: { total: number; page: number }
    }
    expect(body.data.total).toBe(1)
    expect(body.data.page).toBe(1)
  })

  it('honours ?page and ?size query params', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockListByUser.mockResolvedValue({
      scripts: [],
      page: 3,
      size: 5,
      total: 0,
    })

    await GET(createGET('/api/video-script', { page: '3', size: '5' }))
    expect(mockListByUser).toHaveBeenCalledWith(FAKE_DB_USER.id, {
      page: 3,
      size: 5,
    })
  })

  it('400 when size exceeds max', async () => {
    mockAuthenticated()
    const res = await GET(createGET('/api/video-script', { size: '9999' }))
    expect(res.status).toBe(400)
  })

  it('500 on service failure', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockListByUser.mockRejectedValue(new Error('db down'))

    const res = await GET(createGET('/api/video-script'))
    expect(res.status).toBe(500)
  })
})
