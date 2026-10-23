import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  ASSISTANT_MEMORY_KIND_IDS,
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
  ASSISTANT_MEMORY_SOURCE_IDS,
  normalizeAssistantMemoryText,
} from '@/constants/assistant-memory'

// ─── Mocks ──────────────────────────────────────────────────────

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockDeleteMany = vi.fn()
const mockProjectFindFirst = vi.fn()
const mockCardFindFirst = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    nodeWorkflowProject: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    characterCard: {
      findFirst: (...args: unknown[]) => mockCardFindFirst(...args),
    },
    assistantMemory: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'db_user_1' })),
}))

import {
  AssistantMemoryLimitError,
  addAssistantRuleMemory,
  clearAssistantMemories,
  createCreatorMemory,
  deleteAssistantMemory,
  findAssistantMemoryByRef,
  isSensitiveMemoryText,
  listAssistantMemories,
  listAssistantMemoriesForPrompt,
  listCreatorMemoriesForPrompt,
  listNextAssistantMemoriesForPrompt,
  listStandingRuleMemories,
  recordAssistantMemories,
  searchAssistantMemories,
  touchAssistantMemories,
  restoreAssistantMemory,
  updateAssistantMemory,
} from '@/services/assistant-memory.service'

const NOW = new Date('2026-09-20T02:00:00.000Z')

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'mem-1',
    scope: 'IMAGE' as const,
    kind: 'PREFERENCE' as const,
    source: 'ASSISTANT' as const,
    text: '偏好横构图 16:9，除非我明说要竖的',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue([])
  mockCount.mockResolvedValue(0)
  mockCreate.mockResolvedValue({ id: 'mem-new' })
  mockDeleteMany.mockResolvedValue({ count: 0 })
  mockProjectFindFirst.mockResolvedValue({ id: 'proj-1' })
})

// ─── 读 ─────────────────────────────────────────────────────────

describe('listAssistantMemories', () => {
  it('按 updatedAt 倒序、按域收敛，并且永远带 userId', async () => {
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([row()])
    const memories = await listAssistantMemories('db_user_1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })

    expect(memories).toHaveLength(1)
    expect(memories[0]).toMatchObject({
      id: 'mem-1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      kind: ASSISTANT_MEMORY_KIND_IDS.preference,
      source: ASSISTANT_MEMORY_SOURCE_IDS.assistant,
    })
    for (const [args] of mockFindMany.mock.calls) {
      expect(args.where).toMatchObject({ userId: 'db_user_1', scope: 'IMAGE' })
      expect(args.orderBy).toEqual({ updatedAt: 'desc' })
    }
  })

  it('缺 scope = 全部（chip 默认那一档）', async () => {
    await listAssistantMemories('db_user_1')
    expect(mockFindMany.mock.calls.map(([args]) => args.where)).toEqual([
      { userId: 'db_user_1', source: 'CREATOR' },
      { userId: 'db_user_1', source: 'ASSISTANT' },
    ])
  })

  /** ⭐ 你写的单独取满：一个话多的月份不该把你写的规矩挤出列表。 */
  it('你写的单独取满，再与助手记的按 updatedAt 合并', async () => {
    mockFindMany
      .mockResolvedValueOnce([
        row({
          id: 'mine-old',
          source: 'CREATOR',
          kind: 'RULE',
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ])
      .mockResolvedValueOnce([row({ id: 'learned-new' })])

    const memories = await listAssistantMemories('db_user_1')

    expect(memories.map((memory) => memory.id)).toEqual([
      'learned-new',
      'mine-old',
    ])
    expect(mockFindMany.mock.calls[0][0].take).toBe(
      ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
    )
    expect(mockFindMany.mock.calls[1][0].take).toBe(
      ASSISTANT_MEMORY_LIMITS.maxPerScope,
    )
  })

  it('读不出来的那一条被丢掉，⛔ 不连累整张列表', async () => {
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row(), row({ id: 'mem-2', text: '   ' })])
    const memories = await listAssistantMemories('db_user_1')
    expect(memories.map((memory) => memory.id)).toEqual(['mem-1'])
  })
})

describe('listAssistantMemoriesForPrompt', () => {
  /** ⭐ P3：固定一组 —— 最近记下 / 改过的在前，⛔ 不按 lastUsedAt（注入一次就排最前的自我强化）。 */
  it('取当前域 + global，按 updatedAt 倒序、并列按 id（选哪几条每次都一样）', async () => {
    mockFindMany.mockResolvedValue([row()])
    await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.video,
      5,
    )
    const args = mockFindMany.mock.calls[0][0]
    expect(args.where.scope.in).toEqual(['VIDEO', 'GLOBAL'])
    expect(args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }])
    expect(args.take).toBe(5)
  })

  /** 你写的不在这一段：它们进规则段，⛔ 不占助手记的那份预算。 */
  it('只取助手记的', async () => {
    await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      5,
    )
    expect(mockFindMany.mock.calls[0][0].where.source).toBe('ASSISTANT')
  })

  /** ⭐ owner 2026-10-09：一个项目一份记忆，换了项目之前的记忆不能影响新项目。 */
  it('画布：global + 所有画布 + 本项目，⛔ 不带别的项目', async () => {
    await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      5,
      'proj-1',
    )
    const { where } = mockFindMany.mock.calls[0][0]
    expect(where).not.toHaveProperty('scope')
    expect(where.OR).toEqual([
      { scope: 'GLOBAL' },
      { scope: 'CANVAS', projectId: null },
      { scope: 'CANVAS', projectId: 'proj-1' },
    ])
  })

  it('画布没有项目：只带 global + 所有画布', async () => {
    await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      5,
    )
    expect(mockFindMany.mock.calls[0][0].where.OR).toEqual([
      { scope: 'GLOBAL' },
      { scope: 'CANVAS', projectId: null },
    ])
  })

  it('预算 <= 0（被卡吃光）时一条都不查', async () => {
    const memories = await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      0,
    )
    expect(memories).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('封顶在 maxInPrompt —— 调用方给再大的预算也不放宽', async () => {
    await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      999,
    )
    expect(mockFindMany.mock.calls[0][0].take).toBe(
      ASSISTANT_MEMORY_LIMITS.maxInPrompt,
    )
  })
})

describe('listCreatorMemoriesForPrompt', () => {
  it('只取你写的：当前域 + global，最近改过的在前', async () => {
    mockFindMany.mockResolvedValue([
      row({ source: 'CREATOR', kind: 'RULE', scope: 'GLOBAL' }),
    ])
    const memories = await listCreatorMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.video,
      12,
    )
    expect(memories[0]?.source).toBe(ASSISTANT_MEMORY_SOURCE_IDS.creator)
    const args = mockFindMany.mock.calls[0][0]
    expect(args.where).toMatchObject({
      userId: 'db_user_1',
      source: 'CREATOR',
      scope: { in: ['VIDEO', 'GLOBAL'] },
    })
    expect(args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }])
    expect(args.take).toBe(12)
  })

  it('limit <= 0 时一条都不查', async () => {
    await expect(
      listCreatorMemoriesForPrompt(
        'db_user_1',
        ASSISTANT_MEMORY_SCOPE_IDS.image,
        0,
      ),
    ).resolves.toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

describe('listStandingRuleMemories', () => {
  it('你写的 + 助手记下的规矩；给了域就是该域 + global', async () => {
    await listStandingRuleMemories('db_user_1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.lora,
      limit: 50,
    })
    const args = mockFindMany.mock.calls[0][0]
    expect(args.where).toEqual({
      userId: 'db_user_1',
      AND: [
        { OR: [{ source: 'CREATOR' }, { kind: 'RULE' }] },
        { scope: { in: ['LORA', 'GLOBAL'] }, characterCardId: null },
      ],
    })
    expect(args.take).toBe(50)
  })

  it('缺域 = 全部域，但别的项目的一条都不带', async () => {
    await listStandingRuleMemories('db_user_1', {
      projectId: 'proj-1',
      limit: 50,
    })
    const { where } = mockFindMany.mock.calls[0][0]
    expect(where).not.toHaveProperty('scope')
    expect(where.AND[1]).toEqual({
      characterCardId: null,
      OR: [{ projectId: null }, { projectId: 'proj-1' }],
    })
  })
})

describe('touchAssistantMemories', () => {
  it('一次 updateMany 更新 lastUsedAt，且仍然带 userId', async () => {
    await touchAssistantMemories('db_user_1', ['a', 'b'])
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
    expect(mockUpdateMany.mock.calls[0][0].where).toEqual({
      userId: 'db_user_1',
      id: { in: ['a', 'b'] },
    })
  })

  it('空列表不打库', async () => {
    await touchAssistantMemories('db_user_1', [])
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
})

// ─── 写 ─────────────────────────────────────────────────────────

describe('normalizeAssistantMemoryText', () => {
  it('大小写 / 空白 / 中英标点都归一', () => {
    expect(normalizeAssistantMemoryText('偏好 16:9，除非我明说')).toBe(
      normalizeAssistantMemoryText('偏好16:9, 除非我明说'),
    )
    expect(normalizeAssistantMemoryText('Reply in English.')).toBe(
      normalizeAssistantMemoryText('reply in english'),
    )
  })

  it('两句不同的话不会被归一成同一条', () => {
    expect(normalizeAssistantMemoryText('偏好横构图')).not.toBe(
      normalizeAssistantMemoryText('偏好竖构图'),
    )
  })
})

describe('isSensitiveMemoryText', () => {
  it.each([
    ['身份证号是 330106199001011234', true],
    ['我的 API key 是 sk-abcdefghijklmnop12345', true],
    ['最近在吃抗抑郁症的处方药', true],
    ['去年离婚了', true],
    ['工资每个月发到银行卡上', true],
    ['我女儿今年 8 岁', true],
    ['偏好横构图 16:9，除非我明说要竖的', false],
    ['角色「伞下少女」是黑长直 + 校服', false],
  ])('%s → %s', (text, expected) => {
    expect(isSensitiveMemoryText(text)).toBe(expected)
  })
})

describe('recordAssistantMemories', () => {
  it('新候选落库，返回真正记下的条数', async () => {
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.preference,
          text: '偏好横构图 16:9',
        },
      ],
      conversationId: 'conv-1',
    })

    expect(written).toBe(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      userId: 'db_user_1',
      scope: 'IMAGE',
      kind: 'PREFERENCE',
      conversationId: 'conv-1',
    })
  })

  it('归一化字面命中时只更新旧条，⛔ 不新增一行、⛔ 不改原文', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'mem-old', text: '偏好横构图 16:9，除非我明说' },
    ])

    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.preference,
          text: '偏好横构图16:9, 除非我明说',
        },
      ],
    })

    expect(written).toBe(1)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const args = mockUpdate.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'mem-old' })
    expect(args.data).toHaveProperty('lastUsedAt')
    expect(args.data).not.toHaveProperty('text')
  })

  it('敏感类目命中：不写、不计数、⛔ 不出现在回执里', async () => {
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.fact,
          text: '身份证号是 330106199001011234',
        },
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
      ],
    })

    expect(written).toBe(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].data.text).toBe('偏好冷色调')
  })

  it('本轮内部重复只写一条', async () => {
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调。' },
      ],
    })
    expect(written).toBe(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('画布：归当前项目，去重也只比这个项目里的', async () => {
    await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      projectId: 'proj-1',
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.fact,
          text: '这个项目画风是 3D 游戏 CG',
        },
      ],
    })
    expect(mockProjectFindFirst.mock.calls[0][0].where).toEqual({
      id: 'proj-1',
      userId: 'db_user_1',
    })
    expect(mockFindMany.mock.calls[0][0].where).toMatchObject({
      scope: 'CANVAS',
      projectId: 'proj-1',
    })
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      scope: 'CANVAS',
      projectId: 'proj-1',
    })
  })

  it('项目不是这个用户的：画布那几条不写，⛔ 不退成所有画布', async () => {
    mockProjectFindFirst.mockResolvedValue(null)
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      projectId: 'someone-elses',
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.fact,
          text: '这个项目画风是 3D 游戏 CG',
        },
      ],
    })
    expect(written).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('不在画布：不查项目，projectId 为空', async () => {
    await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      projectId: 'proj-1',
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
      ],
    })
    expect(mockProjectFindFirst).not.toHaveBeenCalled()
    expect(mockCreate.mock.calls[0][0].data.projectId).toBeNull()
  })

  it('⭐ 全部落当前域：模型给不了域（P3 作用域修正）', async () => {
    await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.video,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.rule,
          text: '回答用中文，术语保留英文',
        },
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好 24fps' },
      ],
    })
    expect(mockCreate.mock.calls[0][0].data.scope).toBe('VIDEO')
    expect(mockCreate.mock.calls[1][0].data.scope).toBe('VIDEO')
  })

  it('⭐ 改掉第 N 条：原地换字，只认助手记的、这个用户的', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [],
      replacements: [
        {
          id: 'mem-old',
          candidate: {
            kind: ASSISTANT_MEMORY_KIND_IDS.preference,
            text: '现在偏好 3:4 竖图',
          },
        },
      ],
    })
    expect(written).toBe(1)
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'db_user_1', source: 'ASSISTANT', id: 'mem-old' },
      data: expect.objectContaining({
        text: '现在偏好 3:4 竖图',
        kind: 'PREFERENCE',
      }),
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('⭐ 忘掉：只删助手记的；同一条又要改就改赢', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [],
      replacements: [
        {
          id: 'mem-a',
          candidate: { kind: ASSISTANT_MEMORY_KIND_IDS.fact, text: '新说法' },
        },
      ],
      forget: ['mem-a', 'mem-b'],
    })
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'db_user_1',
        source: 'ASSISTANT',
        id: { in: ['mem-b'] },
      },
    })
  })

  it('改成的新说法命中敏感类目：不改、不计数', async () => {
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [],
      replacements: [
        {
          id: 'mem-a',
          candidate: {
            kind: ASSISTANT_MEMORY_KIND_IDS.fact,
            text: '我的密码是 hunter2',
          },
        },
      ],
    })
    expect(written).toBe(0)
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it('一轮最多收 maxPerRound 条', async () => {
    const candidates = Array.from(
      { length: ASSISTANT_MEMORY_LIMITS.maxPerRound + 4 },
      (_unused, index) => ({
        kind: ASSISTANT_MEMORY_KIND_IDS.fact,
        text: `事实 ${index}`,
      }),
    )
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates,
    })
    expect(written).toBe(ASSISTANT_MEMORY_LIMITS.maxPerRound)
  })

  it('每域上限 200：超了按 lastUsedAt 最旧的静默删', async () => {
    mockCount.mockResolvedValue(ASSISTANT_MEMORY_LIMITS.maxPerScope + 2)
    mockFindMany
      // ① 字面去重那一次
      .mockResolvedValueOnce([])
      // ② 淘汰那一次
      .mockResolvedValueOnce([{ id: 'oldest-1' }, { id: 'oldest-2' }])

    await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
      ],
    })

    const evictQuery = mockFindMany.mock.calls[1][0]
    // ⛔ 你写的不淘汰：数与删都只看助手记的。
    expect(mockCount.mock.calls[0][0].where.source).toBe('ASSISTANT')
    expect(evictQuery.where.source).toBe('ASSISTANT')
    expect(evictQuery.orderBy).toEqual({ lastUsedAt: 'asc' })
    expect(evictQuery.take).toBe(2)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'db_user_1', id: { in: ['oldest-1', 'oldest-2'] } },
    })
  })

  it('没超上限时一条都不删', async () => {
    mockCount.mockResolvedValue(3)
    await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
      ],
    })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })
})

describe('createCreatorMemory（你写一条）', () => {
  it('落成「你写的 · 规矩」', async () => {
    mockCreate.mockResolvedValue(
      row({ id: 'mine-1', source: 'CREATOR', kind: 'RULE', scope: 'GLOBAL' }),
    )
    const memory = await createCreatorMemory('db_user_1', {
      text: '  画面里不要出现文字  ',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
    })
    expect(memory.source).toBe(ASSISTANT_MEMORY_SOURCE_IDS.creator)
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      userId: 'db_user_1',
      scope: 'GLOBAL',
      kind: 'RULE',
      source: 'CREATOR',
      text: '画面里不要出现文字',
    })
  })

  /** 同一句话助手已经记过 —— 认领成你写的，⛔ 不存第二行、⛔ 不改原文。 */
  it('同一句已在：改成你写的，⛔ 不新增', async () => {
    mockFindMany.mockResolvedValue([
      row({ id: 'learned', text: '画面里不要出现文字。' }),
    ])
    mockUpdate.mockResolvedValue(
      row({ id: 'learned', source: 'CREATOR', text: '画面里不要出现文字。' }),
    )
    const memory = await createCreatorMemory('db_user_1', {
      text: '画面里不要出现文字',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })
    expect(memory.id).toBe('learned')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({
      source: 'CREATOR',
    })
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('text')
  })

  it('你写的满了：抛 AssistantMemoryLimitError，⛔ 不挤掉旧的', async () => {
    mockCount.mockResolvedValue(ASSISTANT_MEMORY_LIMITS.maxCreatorEntries)
    await expect(
      createCreatorMemory('db_user_1', {
        text: '再来一条',
        scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
      }),
    ).rejects.toBeInstanceOf(AssistantMemoryLimitError)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('addAssistantRuleMemory（add_project_rule 的普通规矩）', () => {
  it('落成「助手记的 · 规矩」并收一次每域上限', async () => {
    mockCreate.mockResolvedValue(row({ id: 'rule-1', kind: 'RULE' }))
    mockCount.mockResolvedValue(1)
    const { memory, created } = await addAssistantRuleMemory('db_user_1', {
      text: '以后查资料只信官方站',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })
    expect(created).toBe(true)
    expect(memory.id).toBe('rule-1')
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      scope: 'IMAGE',
      kind: 'RULE',
      source: 'ASSISTANT',
    })
    expect(mockCount.mock.calls[0][0].where).toMatchObject({
      source: 'ASSISTANT',
    })
  })

  it('同一句已在：回那一条、created=false，⛔ 不存第二行', async () => {
    mockFindMany.mockResolvedValue([
      row({
        id: 'mine',
        source: 'CREATOR',
        kind: 'RULE',
        text: '以后查资料只信官方站',
      }),
    ])
    const { memory, created } = await addAssistantRuleMemory('db_user_1', {
      text: '以后查资料只信官方站。',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })
    expect(created).toBe(false)
    expect(memory.id).toBe('mine')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('画布上记的归当前项目，回来的那条带项目名', async () => {
    mockCreate.mockResolvedValue(
      row({
        id: 'rule-2',
        kind: 'RULE',
        scope: 'CANVAS',
        projectId: 'proj-1',
        project: { name: '马尔福' },
      }),
    )
    const { memory } = await addAssistantRuleMemory('db_user_1', {
      text: '这个项目一律 3D 游戏 CG',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      projectId: 'proj-1',
    })
    expect(mockFindMany.mock.calls[0][0].where).toMatchObject({
      scope: 'CANVAS',
      projectId: 'proj-1',
    })
    expect(mockCreate.mock.calls[0][0].data.projectId).toBe('proj-1')
    expect(memory).toMatchObject({ projectId: 'proj-1', projectName: '马尔福' })
  })
})

// ─── 改 / 删 / 清空 ─────────────────────────────────────────────

describe('updateAssistantMemory', () => {
  it('不属于这个用户 → null（路由据此 404）', async () => {
    mockFindFirst.mockResolvedValue(null)
    expect(
      await updateAssistantMemory('db_user_1', 'someone-else', {
        text: '改过的话',
      }),
    ).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('只改 text', async () => {
    mockFindFirst.mockResolvedValue({ id: 'mem-1' })
    mockUpdate.mockResolvedValue(row({ text: '改过的话' }))
    const memory = await updateAssistantMemory('db_user_1', 'mem-1', {
      text: '改过的话',
    })
    expect(memory?.text).toBe('改过的话')
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ text: '改过的话' })
  })

  it('只改用在哪', async () => {
    mockFindFirst.mockResolvedValue({ id: 'mem-1' })
    mockUpdate.mockResolvedValue(row({ scope: 'GLOBAL' }))
    await updateAssistantMemory('db_user_1', 'mem-1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
    })
    // 换了范围就不再只属于那个项目。
    expect(mockUpdate.mock.calls[0][0].data).toEqual({
      scope: 'GLOBAL',
      projectId: null,
      characterCardId: null,
    })
  })
})

describe('deleteAssistantMemory', () => {
  it('真删，且按 userId 收敛', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })
    expect(await deleteAssistantMemory('db_user_1', 'mem-1')).toBe(true)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'mem-1', userId: 'db_user_1' },
    })
  })

  it('什么都没删 → false', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    expect(await deleteAssistantMemory('db_user_1', 'mem-1')).toBe(false)
  })
})

describe('clearAssistantMemories', () => {
  it('只清这个用户的', async () => {
    mockDeleteMany.mockResolvedValue({ count: 38 })
    expect(await clearAssistantMemories('db_user_1')).toBe(38)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'db_user_1' },
    })
  })

  /** 清空跟着筛选走：筛着「助手记的」就只清助手记的。 */
  it('给了来源就只清那一栏', async () => {
    await clearAssistantMemories(
      'db_user_1',
      ASSISTANT_MEMORY_SOURCE_IDS.assistant,
    )
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'db_user_1', source: 'ASSISTANT' },
    })
  })
})

/** P3 读取：助手翻记忆（`search_library kind "memories"`）。 */
describe('searchAssistantMemories', () => {
  it('按词翻（任一个词，大小写不敏感），当前域 + global，两种来源都翻', async () => {
    await searchAssistantMemories('db_user_1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '横构图, 16:9',
    })
    const args = mockFindMany.mock.calls[0][0]
    expect(args.where.userId).toBe('db_user_1')
    expect(args.where.source).toBeUndefined()
    expect(args.where.AND[0]).toEqual({
      scope: { in: ['IMAGE', 'GLOBAL'] },
      characterCardId: null,
    })
    expect(args.where.AND[1]).toEqual({
      OR: [
        { text: { contains: '横构图', mode: 'insensitive' } },
        { text: { contains: '16:9', mode: 'insensitive' } },
      ],
    })
    expect(args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }])
    expect(args.take).toBe(ASSISTANT_MEMORY_LIMITS.maxSearchResults)
  })

  it('空查询 = 最近的那批', async () => {
    await searchAssistantMemories('db_user_1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '  ',
    })
    expect(mockFindMany.mock.calls[0][0].where.AND).toHaveLength(1)
  })

  it('⭐ 翻到的助手记的刷 lastUsedAt（真被用到才算），你写的不刷', async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ id: 'mem-a' }),
      row({ id: 'mem-c', source: 'CREATOR', kind: 'RULE' }),
    ])
    const found = await searchAssistantMemories('db_user_1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '构图',
    })
    expect(found.map((memory) => memory.id)).toEqual(['mem-a', 'mem-c'])
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'db_user_1', id: { in: ['mem-a'] } },
      data: { lastUsedAt: expect.any(Date) },
    })
  })

  it('什么都没翻到：不刷', async () => {
    await searchAssistantMemories('db_user_1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '不存在',
    })
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
})

describe('和角色聊天：记忆按角色分开（附录L 第二片）', () => {
  const CHAT_ONLY = {
    OR: [
      { characterCardId: 'card-1' },
      { scope: 'GLOBAL', source: 'CREATOR', characterCardId: null },
    ],
  }

  it('注入只读这个角色的 + 你写的全局规矩，⛔ 不读工作里的', async () => {
    await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      8,
      null,
      'card-1',
    )
    expect(mockFindMany.mock.calls[0][0].where).toEqual({
      userId: 'db_user_1',
      source: 'ASSISTANT',
      ...CHAT_ONLY,
    })
  })

  it('工作里的注入 ⛔ 不读任何角色的', async () => {
    await listAssistantMemoriesForPrompt(
      'db_user_1',
      ASSISTANT_MEMORY_SCOPE_IDS.cards,
      8,
    )
    expect(mockFindMany.mock.calls[0][0].where.characterCardId).toBeNull()
  })

  it('翻记忆同样只翻这个角色的 + 你写的全局规矩', async () => {
    await searchAssistantMemories('db_user_1', {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      characterCardId: 'card-1',
      query: '',
    })
    expect(mockFindMany.mock.calls[0][0].where.AND[0]).toEqual(CHAT_ONLY)
  })

  it('结账写进 cards + 这个角色，去重 / 上限也只看这个角色的', async () => {
    mockCardFindFirst.mockResolvedValue({ id: 'card-1' })
    mockCount.mockResolvedValue(1)
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      characterCardId: 'card-1',
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.fact, text: '我们约好周六去海边' },
      ],
    })
    expect(written).toBe(1)
    expect(mockCardFindFirst.mock.calls[0][0].where).toEqual({
      id: 'card-1',
      userId: 'db_user_1',
      isDeleted: false,
    })
    expect(mockFindMany.mock.calls[0][0].where).toMatchObject({
      scope: 'CARDS',
      characterCardId: 'card-1',
    })
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      scope: 'CARDS',
      characterCardId: 'card-1',
    })
    expect(mockCount.mock.calls[0][0].where).toMatchObject({
      scope: 'CARDS',
      characterCardId: 'card-1',
    })
  })

  it('角色不是你的 / 删了：一条都不写，⛔ 不退成角色页的记忆', async () => {
    mockCardFindFirst.mockResolvedValue(null)
    const written = await recordAssistantMemories({
      userId: 'db_user_1',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.cards,
      characterCardId: 'card-x',
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.fact, text: '我们约好周六去海边' },
      ],
    })
    expect(written).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('聊天里记的规矩也归这个角色，回来的那条带角色名', async () => {
    mockCardFindFirst.mockResolvedValue({ id: 'card-1' })
    mockCreate.mockResolvedValue(
      row({
        id: 'rule-1',
        scope: 'CARDS',
        kind: 'RULE',
        characterCardId: 'card-1',
        characterCard: { name: '芙莉莲' },
      }),
    )
    const { memory } = await addAssistantRuleMemory('db_user_1', {
      text: '叫我旅人',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
      characterCardId: 'card-1',
    })
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      scope: 'CARDS',
      characterCardId: 'card-1',
    })
    expect(memory.characterName).toBe('芙莉莲')
  })
})

describe('新内核（第 6 步）', () => {
  it('注入：「关于你」+ 开着的那个角色自己那份，⛔ 各台旧的不带', async () => {
    mockFindMany.mockResolvedValue([row({ scope: 'GLOBAL' })])
    const memories = await listNextAssistantMemoriesForPrompt('db_user_1', {
      characterCardId: 'card-7',
      limit: 12,
    })
    expect(memories).toHaveLength(1)
    expect(mockFindMany.mock.calls[0]![0].where).toEqual({
      userId: 'db_user_1',
      source: 'ASSISTANT',
      OR: [
        { scope: 'GLOBAL', projectId: null, characterCardId: null },
        { characterCardId: 'card-7' },
      ],
    })
    expect(mockFindMany.mock.calls[0]![0].take).toBe(12)
  })

  it('按编号认一条；原话认到不止一条就要编号', async () => {
    mockFindMany.mockResolvedValueOnce([row()])
    expect(
      await findAssistantMemoryByRef('db_user_1', {
        idPrefix: 'mem-1',
        text: '记忆·mem-1',
      }),
    ).toMatchObject({ ok: true, memory: { id: 'mem-1' } })
    expect(mockFindMany.mock.calls[0]![0].where).toEqual({
      userId: 'db_user_1',
      id: { startsWith: 'mem-1' },
    })
    mockFindMany.mockResolvedValueOnce([
      row({ id: 'a', text: '横构图' }),
      row({ id: 'b', text: '横构图优先' }),
    ])
    expect(
      await findAssistantMemoryByRef('db_user_1', {
        idPrefix: null,
        text: '构图',
      }),
    ).toEqual({ ok: false, reason: 'ambiguous' })
  })

  it('撤销忘掉：原样再记回去；角色已经没了就不记', async () => {
    mockFindMany.mockResolvedValue([])
    mockCardFindFirst.mockResolvedValueOnce({ id: 'card-7' })
    const snapshot = {
      text: '冬装',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.cards,
      kind: ASSISTANT_MEMORY_KIND_IDS.preference,
      source: ASSISTANT_MEMORY_SOURCE_IDS.assistant,
      projectId: null,
      characterCardId: 'card-7',
    }
    expect(await restoreAssistantMemory('db_user_1', snapshot)).toBe(true)
    expect(mockCreate.mock.calls[0]![0].data).toMatchObject({
      scope: 'CARDS',
      kind: 'PREFERENCE',
      source: 'ASSISTANT',
      characterCardId: 'card-7',
    })
    mockCardFindFirst.mockResolvedValueOnce(null)
    expect(await restoreAssistantMemory('db_user_1', snapshot)).toBe(false)
  })
})
