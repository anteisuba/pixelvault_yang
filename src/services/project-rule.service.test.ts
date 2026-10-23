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
  listProjectSourceRules,
} from '@/services/project-rule.service'

const ROW = {
  id: 'rule-1',
  scope: null,
  text: 'danbooru.donmai.us',
  kind: 'SOURCE_ALLOW' as const,
  source: 'CREATOR' as const,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
}

/**
 * 项目规则表现在只装来源白 / 黑名单（v2 §9.3）——普通规则已并进记忆（助手设置 B）。
 */
describe('来源白 / 黑名单（v2 §9.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('按 userId 收敛、只取来源两种，最新在前', async () => {
    mockFindMany.mockResolvedValue([ROW])

    const rules = await listProjectSourceRules('db_user_1')

    expect(rules).toEqual([
      {
        id: 'rule-1',
        scope: null,
        text: ROW.text,
        kind: PROJECT_RULE_KIND_IDS.sourceAllow,
        source: PROJECT_RULE_SOURCE_IDS.creator,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ])
    const args = mockFindMany.mock.calls[0][0] as {
      where: { userId: string; kind: { in: string[] } }
      orderBy: { createdAt: string }
    }
    expect(args.where.userId).toBe('db_user_1')
    expect(args.where.kind.in).toEqual(['SOURCE_ALLOW', 'SOURCE_DENY'])
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
  })

  /** 名单一条都不能少 —— ⛔ 不按「最近几条」截。 */
  it('取满每用户上限', async () => {
    mockFindMany.mockResolvedValue([])

    await listProjectSourceRules('db_user_1')

    const args = mockFindMany.mock.calls[0][0] as { take: number }
    expect(args.take).toBe(ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser)
  })

  /** 全域名单在任何工作台上都成立 —— ⛔ 不能被域过滤滤掉。 */
  it('给了 scope 时同时取该域的与全域的', async () => {
    mockFindMany.mockResolvedValue([])

    await listProjectSourceRules('db_user_1', { scope: 'image' })

    const args = mockFindMany.mock.calls[0][0] as {
      where: { OR: unknown[] }
    }
    expect(args.where.OR).toEqual([{ scope: 'image' }, { scope: null }])
  })

  /**
   * ⛔ 别把这条用例删掉：它守的是「库里存量行的 scope 掉出词表时被剥掉」。
   * 举例用的值要**真的**不在域词表里（`canvas` 2026-09-19 已经进表）。
   */
  it('scope 掉出域词表的存量行被剥掉，⛔ 不塞进系统提示', async () => {
    mockFindMany.mockResolvedValue([{ ...ROW, scope: 'audio' }])

    await expect(listProjectSourceRules('db_user_1')).resolves.toEqual([])
  })

  it('canvas 是词表里的域 —— 它的名单读得出来', async () => {
    mockFindMany.mockResolvedValue([{ ...ROW, scope: 'canvas' }])

    await expect(listProjectSourceRules('db_user_1')).resolves.toHaveLength(1)
  })

  it('写入时把协议侧的小写 kind / 来源翻成库里的枚举', async () => {
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({
      ...ROW,
      text: 'pinterest.com',
      kind: 'SOURCE_DENY' as const,
      source: 'ASSISTANT' as const,
    })

    const rule = await addProjectRule('db_user_1', {
      text: 'pinterest.com',
      scope: 'image',
      kind: PROJECT_RULE_KIND_IDS.sourceDeny,
      source: PROJECT_RULE_SOURCE_IDS.assistant,
    })

    const args = mockCreate.mock.calls[0][0] as {
      data: { kind: string; source: string; userId: string }
    }
    expect(args.data.kind).toBe('SOURCE_DENY')
    expect(args.data.source).toBe('ASSISTANT')
    expect(args.data.userId).toBe('db_user_1')
    expect(rule.kind).toBe(PROJECT_RULE_KIND_IDS.sourceDeny)
    expect(rule.source).toBe(PROJECT_RULE_SOURCE_IDS.assistant)
  })

  it('撞上限时抛 ProjectRuleLimitError，⛔ 不挤掉最老的一条', async () => {
    mockCount.mockResolvedValue(ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser)

    await expect(
      addProjectRule('db_user_1', {
        text: 'pixiv.net',
        kind: PROJECT_RULE_KIND_IDS.sourceDeny,
      }),
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
