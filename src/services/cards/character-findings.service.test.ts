import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  store: vi.fn(),
  forget: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: { characterFinding: { findMany: mocks.findMany } },
}))
vi.mock('@/services/semantic-search.service', () => ({
  searchByMeaning: mocks.search,
  storeByMeaning: mocks.store,
  forgetByMeaning: mocks.forget,
}))

import {
  forgetFindings,
  indexFindings,
  recallFindings,
  renderFindingsRecall,
} from './character-findings.service'

const seenAt = new Date('2026-10-28T12:50:00.000Z')

describe('她的见闻怎么被想起来（4c）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('存进这张卡自己那一区，key 是见闻 id', async () => {
    await indexFindings('card-1', [
      { id: 'f1', title: '美式松饼', note: '热热软软的', source: 'bilibili' },
    ])
    expect(mocks.store).toHaveBeenCalledWith(
      [
        {
          kind: 'character-finding',
          key: 'f1',
          text: '美式松饼\n热热软软的',
          meta: { source: 'bilibili' },
        },
      ],
      'card-card-1',
    )
  })

  it('索引挂了只记日志，⛔ 抛', async () => {
    mocks.store.mockRejectedValue(new Error('down'))
    mocks.forget.mockRejectedValue(new Error('down'))
    await expect(
      indexFindings('c', [{ id: 'f', title: 't', note: 'n', source: 'web' }]),
    ).resolves.toBeUndefined()
    await expect(forgetFindings('c', ['f'])).resolves.toBeUndefined()
  })

  it('按意思想起：只在这张卡那一区查，再按 userId + cardId 回表，按相近程度排', async () => {
    mocks.search.mockResolvedValue([
      { key: 'f2', score: 0.8, meta: {} },
      { key: 'f1', score: 0.7, meta: {} },
    ])
    mocks.findMany.mockResolvedValue([
      { id: 'f1', source: 'web', title: '知乎', note: '西西', seenAt },
      { id: 'f2', source: 'bilibili', title: '松饼', note: '好吃', seenAt },
    ])
    const found = await recallFindings({
      userId: 'u',
      cardId: 'card-1',
      text: '想吃甜的',
    })
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'card-card-1', text: '想吃甜的' }),
    )
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['f2', 'f1'] },
          userId: 'u',
          characterCardId: 'card-1',
        },
      }),
    )
    expect(found.map((item) => item.title)).toEqual(['松饼', '知乎'])
  })

  it('一条都对不上：带最近两天最新的一条', async () => {
    mocks.search.mockResolvedValue([])
    mocks.findMany.mockResolvedValue([
      { id: 'f1', source: 'web', title: '知乎', note: '西西', seenAt },
    ])
    const found = await recallFindings({ userId: 'u', cardId: 'c', text: '嗯' })
    expect(mocks.findMany.mock.calls[0]?.[0]).toMatchObject({ take: 1 })
    expect(found).toHaveLength(1)
  })

  it('渲染：没有就是空串；有就写明只在合适时提', () => {
    expect(renderFindingsRecall([])).toBe('')
    const text = renderFindingsRecall([
      {
        source: 'bilibili',
        title: '松饼',
        note: '好吃',
        day: '2026-10-28',
      },
    ])
    expect(text).toContain('THINGS YOU CAME ACROSS ONLINE LATELY')
    expect(text).toContain('松饼 — you thought: 好吃')
    expect(text).toContain('never force them in')
  })
})
