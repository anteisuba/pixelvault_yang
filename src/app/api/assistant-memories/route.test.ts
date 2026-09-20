import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { ASSISTANT_MEMORY_SCOPE_IDS } from '@/constants/assistant-memory'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/assistant-memory.service', () => ({
  listAssistantMemoriesForClerkId: vi.fn(),
}))

import { GET } from './route'
import { listAssistantMemoriesForClerkId } from '@/services/assistant-memory.service'

const mockList = vi.mocked(listAssistantMemoriesForClerkId)

const MEMORY = {
  id: 'mem-1',
  scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
  kind: 'preference' as const,
  text: '偏好横构图 16:9',
  createdAt: '2026-09-20T02:00:00.000Z',
  updatedAt: '2026-09-20T02:00:00.000Z',
}

describe('GET /api/assistant-memories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockList.mockResolvedValue([MEMORY])
  })

  it('未登录时 401（⛔ 不返回任何人的记忆）', async () => {
    mockUnauthenticated()
    const res = await GET(createGET('/api/assistant-memories'))
    expect(res.status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('缺 scope = 全部', async () => {
    const res = await GET(createGET('/api/assistant-memories'))
    expect(res.status).toBe(200)
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', { scope: null })
    expect(await parseJSON(res)).toMatchObject({ data: [MEMORY] })
  })

  it('带 scope 时原样透传（ownership 仍在服务端按 userId 收敛）', async () => {
    await GET(
      createGET('/api/assistant-memories', {
        scope: ASSISTANT_MEMORY_SCOPE_IDS.video,
      }),
    )
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.video,
    })
  })

  it('词表外的 scope 400', async () => {
    const res = await GET(
      createGET('/api/assistant-memories', { scope: 'audio' }),
    )
    expect(res.status).toBe(400)
    expect(mockList).not.toHaveBeenCalled()
  })
})
