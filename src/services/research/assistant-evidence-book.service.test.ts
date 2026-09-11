import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: { researchRun: { findMany: mocks.findMany, create: mocks.create } },
}))

import { appendAssistantEvidenceBook } from '@/services/research/assistant-evidence-book.service'

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
