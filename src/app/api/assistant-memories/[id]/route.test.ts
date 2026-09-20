import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createDELETE,
  createPATCH,
  mockAuthenticated,
  mockUnauthenticated,
} from '@/test/api-helpers'
import {
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
} from '@/constants/assistant-memory'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/assistant-memory.service', () => ({
  updateAssistantMemoryForClerkId: vi.fn(),
  deleteAssistantMemoryForClerkId: vi.fn(),
}))

import { PATCH, DELETE } from './route'
import {
  deleteAssistantMemoryForClerkId,
  updateAssistantMemoryForClerkId,
} from '@/services/assistant-memory.service'

const mockUpdate = vi.mocked(updateAssistantMemoryForClerkId)
const mockDelete = vi.mocked(deleteAssistantMemoryForClerkId)

const MEMORY_ID = 'mem-1'
const routeParams = { params: Promise.resolve({ id: MEMORY_ID }) }
const PATH = `/api/assistant-memories/${MEMORY_ID}`

const MEMORY = {
  id: MEMORY_ID,
  scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
  kind: 'preference' as const,
  text: '改过的那行字',
  createdAt: '2026-09-20T02:00:00.000Z',
  updatedAt: '2026-09-20T03:00:00.000Z',
}

describe('PATCH /api/assistant-memories/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockUpdate.mockResolvedValue(MEMORY)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await PATCH(
      createPATCH(PATH, { text: '改过的那行字' }),
      routeParams,
    )
    expect(res.status).toBe(401)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('就地改只收 text', async () => {
    const res = await PATCH(
      createPATCH(PATH, { text: '改过的那行字' }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      'clerk_test_user',
      MEMORY_ID,
      '改过的那行字',
    )
  })

  it('⛔ 改 scope / kind 400（界面上没有这个动作）', async () => {
    const res = await PATCH(
      createPATCH(PATH, { text: '还行', scope: 'global' }),
      routeParams,
    )
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('空串 400', async () => {
    const res = await PATCH(createPATCH(PATH, { text: '   ' }), routeParams)
    expect(res.status).toBe(400)
  })

  it('超长 400', async () => {
    const res = await PATCH(
      createPATCH(PATH, {
        text: 'x'.repeat(ASSISTANT_MEMORY_LIMITS.maxTextChars + 1),
      }),
      routeParams,
    )
    expect(res.status).toBe(400)
  })

  it('不属于这个用户时 404', async () => {
    mockUpdate.mockResolvedValue(null)
    const res = await PATCH(createPATCH(PATH, { text: '抢一条' }), routeParams)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/assistant-memories/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockDelete.mockResolvedValue(true)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await DELETE(createDELETE(PATH), routeParams)
    expect(res.status).toBe(401)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('真删一条', async () => {
    const res = await DELETE(createDELETE(PATH), routeParams)
    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalledWith('clerk_test_user', MEMORY_ID)
  })

  it('不属于这个用户时 404（⛔ 不与「什么都没删」混成成功）', async () => {
    mockDelete.mockResolvedValue(false)
    const res = await DELETE(createDELETE(PATH), routeParams)
    expect(res.status).toBe(404)
  })
})
