import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/assistant-memory.service', () => ({
  clearAssistantMemoriesForClerkId: vi.fn(),
}))

import { POST } from './route'
import { clearAssistantMemoriesForClerkId } from '@/services/assistant-memory.service'

const mockClear = vi.mocked(clearAssistantMemoriesForClerkId)
const PATH = '/api/assistant-memories/clear'

describe('POST /api/assistant-memories/clear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockClear.mockResolvedValue(38)
  })

  it('未登录时 401（⛔ 不清任何人的记忆）', async () => {
    mockUnauthenticated()
    const res = await POST(createPOST(PATH, { confirm: true }))
    expect(res.status).toBe(401)
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('⛔ 没有 confirm 的空 POST 400', async () => {
    const res = await POST(createPOST(PATH, {}))
    expect(res.status).toBe(400)
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('confirm: true 才清，并回清了几条', async () => {
    const res = await POST(createPOST(PATH, { confirm: true }))
    expect(res.status).toBe(200)
    expect(mockClear).toHaveBeenCalledWith('clerk_test_user')
    expect(await parseJSON(res)).toMatchObject({ data: { cleared: 38 } })
  })
})
