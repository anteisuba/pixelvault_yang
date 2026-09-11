import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_EVIDENCE_RECALL_LIMITS } from '@/constants/assistant-operator'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: { researchRun: { findMany: mocks.findMany, create: mocks.create } },
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

function args(items = [ITEM]) {
  return {
    userId: 'owner-id',
    surface: 'IMAGE_STUDIO' as const,
    conversationId: 'conv-1',
    entries: [{ goal: '外貌', queries: ['时夜 外貌'], items, receipts: [] }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.create.mockResolvedValue({ id: 'run-1' })
})

describe('证据本（assistant-shell-v2 §7.3）', () => {
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
