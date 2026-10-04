import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_EVIDENCE_RECALL_LIMITS } from '@/constants/assistant-operator'
import {
  ResearchSourceReceiptSchema,
  type EvidenceItem,
} from '@/types/research'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockConversation: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
    researchRun: { findMany: mocks.findMany, create: mocks.create },
  },
}))

import {
  appendAssistantEvidenceBook,
  recallAssistantEvidence,
} from '@/services/research/assistant-evidence-book.service'

const ITEM = {
  id: 'moegirl:shiye',
  sourceId: 'moegirl' as const,
  sourceTier: 'community' as const,
  retrievedAt: '2026-09-11T00:00:00.000Z',
  title: '萌娘百科 · 时夜',
  kind: 'text' as const,
  excerpt: '黑色长发。',
}

function args(items: EvidenceItem[] = [ITEM]) {
  return {
    userId: 'owner-id',
    workspaceKey: 'image-natural',
    surface: 'IMAGE_STUDIO' as const,
    conversationId: 'conv-1',
    entries: [{ goal: '外貌', queries: ['时夜 外貌'], items, receipts: [] }],
  }
}

function transactionalEvidence(failCreateAt?: number) {
  type Row = { id: string; evidence: (typeof ITEM & { ref: string })[] }
  const committed: Row[] = []
  let queue = Promise.resolve()
  let created = 0
  mocks.transaction.mockImplementation(
    async (action: (tx: unknown) => Promise<unknown>) => {
      let release = () => {}
      const staged: Row[] = []
      const tx = {
        $queryRaw: async () => {
          const previous = queue
          queue = new Promise<void>((resolve) => {
            release = resolve
          })
          await previous
          return [{ id: 'conv-1' }]
        },
        researchRun: {
          findMany: async () => [...committed, ...staged],
          create: async (input: { data: { evidence: Row['evidence'] } }) => {
            created += 1
            if (created === failCreateAt) throw new Error('write failed')
            const row = {
              id: `run-${created}`,
              evidence: structuredClone(input.data.evidence),
            }
            staged.push(row)
            await Promise.resolve()
            return { id: row.id }
          },
        },
      }
      try {
        const result = await action(tx)
        committed.push(...staged)
        return result
      } finally {
        release()
      }
    },
  )
  return committed
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lockConversation.mockResolvedValue([{ id: 'conv-1' }])
  mocks.transaction.mockImplementation(
    (action: (tx: unknown) => Promise<unknown>) =>
      action({
        $queryRaw: mocks.lockConversation,
        researchRun: { findMany: mocks.findMany, create: mocks.create },
      }),
  )
  mocks.findMany.mockResolvedValue([])
  mocks.create.mockResolvedValue({ id: 'run-1' })
})

describe('证据本（assistant-shell-v2 §7.3）', () => {
  it('原生源实际查询原样进入回执，旧回执不填充查询', async () => {
    const receipt = {
      sourceId: 'web_search' as const,
      status: 'ok' as const,
      count: 1,
      tookMs: 0,
    }
    expect(ResearchSourceReceiptSchema.parse(receipt)).not.toHaveProperty(
      'queries',
    )
    const actual = ResearchSourceReceiptSchema.parse({
      ...receipt,
      queries: ['时夜 外貌 实际调用查询'],
    })
    const input = args()
    await appendAssistantEvidenceBook({
      ...input,
      entries: [{ ...input.entries[0]!, receipts: [actual] }],
    })
    expect(mocks.create.mock.calls[0]?.[0]?.data.perSource).toEqual([actual])
    expect(actual.queries).toEqual(['时夜 外貌 实际调用查询'])
  })

  it.each(['answer_fragment', 'source_excerpt', 'none'] as const)(
    '保存与召回保留摘要来源语义 %s',
    async (excerptKind) => {
      await appendAssistantEvidenceBook(args([{ ...ITEM, excerptKind }]))
      const evidence = mocks.create.mock.calls[0]?.[0]?.data.evidence
      expect(evidence[0]).toMatchObject({ ref: '#e1', excerptKind })
      mocks.findMany.mockResolvedValue([{ evidence }])
      const recalled = await recallAssistantEvidence({
        userId: 'owner-id',
        conversationId: 'conv-1',
        refs: ['#e1'],
      })
      expect(recalled.items[0]).toMatchObject({
        ref: '#e1',
        body: ITEM.excerpt,
        excerptKind,
      })
    },
  )

  it('同一会话并发分号与保存时引用分别指回自己的内容', async () => {
    const rows = transactionalEvidence()
    const [first, second] = await Promise.all([
      appendAssistantEvidenceBook(args([{ ...ITEM, excerpt: 'first' }])),
      appendAssistantEvidenceBook(args([{ ...ITEM, excerpt: 'second' }])),
    ])
    expect(first.refs).toEqual(['#e1'])
    expect(second.refs).toEqual(['#e2'])
    expect(rows.map((row) => row.evidence[0])).toMatchObject([
      { ref: '#e1', excerpt: 'first' },
      { ref: '#e2', excerpt: 'second' },
    ])
  })

  it('多条ResearchRun中途失败整批回滚，返回的空编号不会指向部分记录', async () => {
    const rows = transactionalEvidence(2)
    const input = args()
    expect(
      await appendAssistantEvidenceBook({
        ...input,
        entries: [...input.entries, ...input.entries],
      }),
    ).toEqual({ refs: [], researchRunIds: [] })
    expect(rows).toEqual([])
    expect((await appendAssistantEvidenceBook(input)).refs).toEqual(['#e1'])
  })

  it('锁不住所属工作区会话时不读取证据、不创建弱引用记录', async () => {
    mocks.lockConversation.mockResolvedValueOnce([])
    expect(await appendAssistantEvidenceBook(args())).toEqual({
      refs: [],
      researchRunIds: [],
    })
    const query = mocks.lockConversation.mock.calls[0][0]
    expect(query.sql).toContain('FOR UPDATE')
    expect(query.values).toEqual([
      'conv-1',
      'owner-id',
      'IMAGE_STUDIO',
      null,
      'image-tags',
    ])
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('返回本次保存的全部真实编号，摘要容量不截断证据卡的来源身份', async () => {
    const items = Array.from({ length: 13 }, (_, index) => ({
      ...ITEM,
      id: `item-${index}`,
    }))
    expect((await appendAssistantEvidenceBook(args(items))).refs).toHaveLength(
      13,
    )
  })
  it('编号落在 evidence 每一项上，正文原样跟着走', async () => {
    const result = await appendAssistantEvidenceBook(args())

    expect(result.refs).toEqual(['#e1'])
    const data = mocks.create.mock.calls[0]?.[0]?.data as {
      evidence: { ref: string; excerpt: string }[]
      conversationId: string
    }
    expect(data.conversationId).toBe('conv-1')
    expect(data.evidence[0]).toMatchObject({
      ref: '#e1',
      excerpt: '黑色长发。',
    })
  })

  it('⭐ 序号在**会话内**接着数，⛔ 不从每次检索重新开始', async () => {
    mocks.findMany.mockResolvedValue([
      {
        evidence: [
          { ...ITEM, ref: '#e1' },
          { ...ITEM, ref: '#e7' },
        ],
      },
    ])

    const result = await appendAssistantEvidenceBook(
      args([ITEM, { ...ITEM, id: 'danbooru:x' }]),
    )

    expect(result.refs).toEqual(['#e8', '#e9'])
  })

  it('一条证据都没有时不写行，也不占编号', async () => {
    expect(await appendAssistantEvidenceBook(args([]))).toEqual({
      refs: [],
      researchRunIds: [],
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('⚠ 写不进去时回空编号、⛔ 不抛 —— 结账不许阻塞 done', async () => {
    mocks.create.mockRejectedValue(new Error('db down'))

    expect(await appendAssistantEvidenceBook(args())).toEqual({
      refs: [],
      researchRunIds: [],
    })
  })
})

/**
 * **按编号翻证据本**（§7.3 的读端，commit #12）——`recall_evidence` 落在这里。
 */
describe('按编号翻证据本', () => {
  it('⭐ 两道闸都在 where 里：userId **与** conversationId', async () => {
    mocks.findMany.mockResolvedValue([])
    await recallAssistantEvidence({
      userId: 'owner-id',
      conversationId: 'conv-1',
      refs: ['#e1'],
    })
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner-id', conversationId: 'conv-1' },
      }),
    )
  })

  it('命中：按**模型问的顺序**回，正文与出处跟着走', async () => {
    mocks.findMany.mockResolvedValue([
      {
        evidence: [
          { ...ITEM, ref: '#e1', excerpt: '黑色长发。' },
          { ...ITEM, ref: '#e2', excerpt: '金色瞳孔。' },
        ],
      },
    ])
    const result = await recallAssistantEvidence({
      userId: 'owner-id',
      conversationId: 'conv-1',
      refs: ['#e2', '#e1'],
    })
    expect(result.items.map((item) => item.ref)).toEqual(['#e2', '#e1'])
    expect(result.items[0]).toMatchObject({
      body: '金色瞳孔。',
      source: 'moegirl',
      title: '萌娘百科 · 时夜',
    })
    expect(result.items[0]).not.toHaveProperty('excerptKind')
    expect(result.missing).toEqual([])
  })

  it('⚠ 翻不到的号进 missing，⛔ 不抛（部分命中照样有用）', async () => {
    mocks.findMany.mockResolvedValue([{ evidence: [{ ...ITEM, ref: '#e1' }] }])
    const result = await recallAssistantEvidence({
      userId: 'owner-id',
      conversationId: 'conv-1',
      refs: ['#e1', '#e9'],
    })
    expect(result.items).toHaveLength(1)
    expect(result.missing).toEqual(['#e9'])
  })

  it('标签型证据压平成一段可读正文（三种 kind 一个出口）', async () => {
    mocks.findMany.mockResolvedValue([
      {
        evidence: [
          {
            ...ITEM,
            kind: 'tags',
            ref: '#e3',
            tags: ['black hair', 'yellow eyes'],
            provenance: '萌百分类',
            excerpt: undefined,
          },
        ],
      },
    ])
    const result = await recallAssistantEvidence({
      userId: 'owner-id',
      conversationId: 'conv-1',
      refs: ['#e3'],
    })
    expect(result.items[0]?.body).toBe('black hair, yellow eyes（萌百分类）')
  })

  it('⛔ 一次最多翻几条：超出的那些压根不查', async () => {
    mocks.findMany.mockResolvedValue([])
    const result = await recallAssistantEvidence({
      userId: 'owner-id',
      conversationId: 'conv-1',
      refs: ['#e1', '#e2', '#e3', '#e4', '#e5', '#e6'],
    })
    expect(result.missing).toHaveLength(
      ASSISTANT_EVIDENCE_RECALL_LIMITS.maxRefsPerCall,
    )
  })
})
