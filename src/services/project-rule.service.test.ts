import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  ASSISTANT_PROJECT_RULE_LIMITS,
  PROJECT_RULE_KIND_IDS,
  PROJECT_RULE_SOURCE_IDS,
} from '@/constants/assistant-operator'

// ─── Mocks ──────────────────────────────────────────────────────

const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockDeleteMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    projectRule: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'db_user_1' })),
}))

import {
  ProjectRuleLimitError,
  addProjectRule,
  deleteProjectRule,
  listProjectRules,
  listProjectSourceRules,
} from '@/services/project-rule.service'

const ROW = {
  id: 'rule-1',
  scope: null,
  text: 'Never put text inside the picture.',
  kind: 'NOTE' as const,
  source: 'CREATOR' as const,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
}

describe('project rule service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('列表按 userId 收敛，最新在前', async () => {
    mockFindMany.mockResolvedValue([ROW])

    const rules = await listProjectRules('db_user_1')

    expect(rules).toEqual([
      {
        id: 'rule-1',
        scope: null,
        text: ROW.text,
        kind: PROJECT_RULE_KIND_IDS.note,
        source: PROJECT_RULE_SOURCE_IDS.creator,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ])
    const args = mockFindMany.mock.calls[0][0] as {
      where: { userId: string }
      orderBy: { createdAt: string }
    }
    expect(args.where.userId).toBe('db_user_1')
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
  })

  /** 全域规则在任何工作台上都成立 —— ⛔ 不能被域过滤滤掉。 */
  it('给了 scope 时同时取该域的与全域的', async () => {
    mockFindMany.mockResolvedValue([])

    await listProjectRules('db_user_1', { scope: 'image' })

    const args = mockFindMany.mock.calls[0][0] as {
      where: { OR: unknown[] }
    }
    expect(args.where.OR).toEqual([{ scope: 'image' }, { scope: null }])
  })

  it('scope 掉出域词表的存量行被剥掉，⛔ 不塞进系统提示', async () => {
    mockFindMany.mockResolvedValue([{ ...ROW, scope: 'canvas' }])

    await expect(listProjectRules('db_user_1')).resolves.toEqual([])
  })

  it('写入时把协议侧的小写来源翻成库里的枚举', async () => {
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({ ...ROW, source: 'ASSISTANT' })

    const rule = await addProjectRule('db_user_1', {
      text: ROW.text,
      scope: 'image',
      source: PROJECT_RULE_SOURCE_IDS.assistant,
    })

    const args = mockCreate.mock.calls[0][0] as {
      data: { source: string; userId: string; scope: string | null }
    }
    expect(args.data.source).toBe('ASSISTANT')
    expect(args.data.userId).toBe('db_user_1')
    expect(rule.source).toBe(PROJECT_RULE_SOURCE_IDS.assistant)
  })

  it('撞上限时抛 ProjectRuleLimitError，⛔ 不挤掉最老的一条', async () => {
    mockCount.mockResolvedValue(ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser)

    await expect(
      addProjectRule('db_user_1', { text: 'one more' }),
    ).rejects.toBeInstanceOf(ProjectRuleLimitError)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('删除按 id + userId 双条件；什么都没删就返回 false', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })

    await expect(deleteProjectRule('clerk_1', 'rule-x')).resolves.toBe(false)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'rule-x', userId: 'db_user_1' },
    })
  })
})

describe('来源白 / 黑名单（v2 §9.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('kind 在协议侧与库里的枚举之间双向翻译', async () => {
    mockFindMany.mockResolvedValue([
      { ...ROW, text: 'danbooru.donmai.us', kind: 'SOURCE_ALLOW' as const },
      {
        ...ROW,
        id: 'rule-2',
        text: 'pinterest.com',
        kind: 'SOURCE_DENY' as const,
      },
    ])

    const rules = await listProjectRules('db_user_1')

    expect(rules.map((rule) => rule.kind)).toEqual([
      PROJECT_RULE_KIND_IDS.sourceAllow,
      PROJECT_RULE_KIND_IDS.sourceDeny,
    ])
  })

  /** 名单一条都不能少 —— ⛔ 不按系统提示那条的 maxInPrompt 截。 */
  it('读名单时按 kind 收敛，且取满每用户上限', async () => {
    mockFindMany.mockResolvedValue([])

    await listProjectSourceRules('db_user_1', { scope: 'image' })

    const args = mockFindMany.mock.calls[0][0] as {
      where: { kind: { in: string[] } }
      take: number
    }
    expect(args.where.kind.in).toEqual(['SOURCE_ALLOW', 'SOURCE_DENY'])
    expect(args.take).toBe(ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser)
  })

  it('写入时把 kind 翻成库里的枚举；缺省是普通规则', async () => {
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({
      ...ROW,
      text: 'danbooru.donmai.us',
      kind: 'SOURCE_ALLOW' as const,
    })

    const rule = await addProjectRule('db_user_1', {
      text: 'danbooru.donmai.us',
      kind: PROJECT_RULE_KIND_IDS.sourceAllow,
    })

    const args = mockCreate.mock.calls[0][0] as { data: { kind: string } }
    expect(args.data.kind).toBe('SOURCE_ALLOW')
    expect(rule.kind).toBe(PROJECT_RULE_KIND_IDS.sourceAllow)

    mockCreate.mockResolvedValue(ROW)
    await addProjectRule('db_user_1', { text: ROW.text })
    const plain = mockCreate.mock.calls[1][0] as { data: { kind: string } }
    expect(plain.data.kind).toBe('NOTE')
  })
})
