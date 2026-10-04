import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
} from '@/constants/assistant-memory'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/assistant-memory.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/assistant-memory.service')
  >('@/services/assistant-memory.service')
  return {
    AssistantMemoryLimitError: actual.AssistantMemoryLimitError,
    listAssistantMemoriesForClerkId: vi.fn(),
    createCreatorMemoryForClerkId: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({ db: {} }))

import { GET, POST } from './route'
import {
  AssistantMemoryLimitError,
  createCreatorMemoryForClerkId,
  listAssistantMemoriesForClerkId,
} from '@/services/assistant-memory.service'

const mockList = vi.mocked(listAssistantMemoriesForClerkId)
const mockCreate = vi.mocked(createCreatorMemoryForClerkId)

const MEMORY = {
  id: 'mem-1',
  scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
  workspaceKey: 'image-natural',
  kind: 'preference' as const,
  source: 'assistant' as const,
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

/** 你写一条（助手设置 B）—— 只写「你写的」，类别由服务端定。 */
describe('POST /api/assistant-memories', () => {
  const MINE = {
    ...MEMORY,
    id: 'mine-1',
    scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
    kind: 'rule' as const,
    source: 'creator' as const,
    text: '画面里不要出现文字',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreate.mockResolvedValue(MINE)
  })

  it('未登录时 401', async () => {
    mockUnauthenticated()
    const res = await POST(
      createPOST('/api/assistant-memories', { text: '画面里不要出现文字' }),
    )
    expect(res.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('显式选择全局后写入全部工作台', async () => {
    const res = await POST(
      createPOST('/api/assistant-memories', {
        text: '  画面里不要出现文字 ',
        scope: 'global',
      }),
    )
    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith('clerk_test_user', {
      text: '画面里不要出现文字',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
    })
  })

  it('未选择工作台或全局时拒绝创建', async () => {
    const res = await POST(
      createPOST('/api/assistant-memories', { text: '一句偏好' }),
    )
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('⛔ 客户端不能自称来源或类别', async () => {
    for (const extra of [{ source: 'assistant' }, { kind: 'fact' }]) {
      const res = await POST(
        createPOST('/api/assistant-memories', { text: '一句', ...extra }),
      )
      expect(res.status).toBe(400)
    }
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('空串与超长 400', async () => {
    for (const text of [
      '   ',
      'x'.repeat(ASSISTANT_MEMORY_LIMITS.maxTextChars + 1),
    ]) {
      const res = await POST(createPOST('/api/assistant-memories', { text }))
      expect(res.status).toBe(400)
    }
  })

  it('你写的满了 409 且带 i18n 键', async () => {
    mockCreate.mockRejectedValue(
      new AssistantMemoryLimitError(ASSISTANT_MEMORY_LIMITS.maxCreatorEntries),
    )
    const res = await POST(
      createPOST('/api/assistant-memories', {
        text: '再来一条',
        scope: 'global',
      }),
    )
    expect(res.status).toBe(409)
    await expect(parseJSON(res)).resolves.toMatchObject({
      success: false,
      errorCode: 'ASSISTANT_MEMORY_LIMIT_REACHED',
      i18nKey: 'errors.assistantMemory.limitReached',
    })
  })
})
