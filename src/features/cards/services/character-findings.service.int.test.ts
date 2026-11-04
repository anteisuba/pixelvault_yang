/**
 * L2a 真库：她的见闻怎么被想起来（4c）。按意思搜 Worker 在网络边界上假掉，
 * 真 semantic-search.service 照常拼请求；断言索引里的条目、返回值与库里的 recalledAt。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { characterNamespace } from '@/constants/semantic-search'
import { db } from '@/lib/db'
import { fakeSemanticIndex } from '@/test/fake-semantic-index'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  forgetFindings,
  indexFindings,
  recallFindings,
  renderFindingsRecall,
} from './character-findings.service'

let me: Awaited<ReturnType<typeof createTestUser>>
let card: Awaited<ReturnType<typeof createTestCard>>
let index: ReturnType<typeof fakeSemanticIndex>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  card = await createTestCard(me.id)
  index = fakeSemanticIndex()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function finding(
  title: string,
  extra: { userId?: string; cardId?: string; seenAt?: Date } = {},
) {
  return db.characterFinding.create({
    data: {
      userId: extra.userId ?? me.id,
      characterCardId: extra.cardId ?? card.id,
      source: 'bilibili',
      url: `https://example.test/${title}`,
      title,
      note: `${title}的感想`,
      ...(extra.seenAt ? { seenAt: extra.seenAt } : {}),
    },
  })
}

describe('她的见闻怎么被想起来（4c）', () => {
  it('存进这张卡自己那一区，key 是见闻 id；忘掉就从那一区删', async () => {
    await indexFindings(card.id, [
      { id: 'f1', title: '美式松饼', note: '热热软软的', source: 'bilibili' },
      { id: 'f2', title: '知乎', note: '西西', source: 'web' },
    ])
    expect(index.entries(characterNamespace(card.id))).toEqual({
      f1: '美式松饼\n热热软软的',
      f2: '知乎\n西西',
    })

    await forgetFindings(card.id, ['f1'])
    expect(index.entries(characterNamespace(card.id))).toEqual({
      f2: '知乎\n西西',
    })
  })

  it('索引挂了只记日志，⛔ 抛', async () => {
    index.down()
    await expect(
      indexFindings(card.id, [
        { id: 'f', title: 't', note: 'n', source: 'web' },
      ]),
    ).resolves.toBeUndefined()
    await expect(forgetFindings(card.id, ['f'])).resolves.toBeUndefined()
  })

  it('按意思想起：只在这张卡那一区查，按相近程度排，别人的 / 别的卡的回不来；想起的记下时间', async () => {
    const pancake = await finding('松饼')
    const zhihu = await finding('知乎')
    const otherCard = await createTestCard(me.id, { name: '别的卡' })
    const elsewhere = await finding('别的卡的', { cardId: otherCard.id })
    index.answer([pancake.id, elsewhere.id, zhihu.id])

    const found = await recallFindings({
      userId: me.id,
      cardId: card.id,
      text: '想吃甜的',
    })

    expect(index.queries).toEqual([
      {
        namespace: characterNamespace(card.id),
        kind: 'character-finding',
        text: '想吃甜的',
      },
    ])
    expect(found.map((item) => item.title)).toEqual(['松饼', '知乎'])
    const rows = await db.characterFinding.findMany({
      where: { recalledAt: { not: null } },
    })
    expect(rows.map((row) => row.id).sort()).toEqual(
      [pancake.id, zhihu.id].sort(),
    )
  })

  it('一条都对不上：带最近两天最新的一条（太旧的不带）', async () => {
    await finding('旧的', { seenAt: new Date(Date.now() - 2 * 86_400_000) })
    await finding('今天的', { seenAt: new Date(Date.now() - 60_000) })
    await finding('更早的今天', { seenAt: new Date(Date.now() - 3_600_000) })
    index.answer([])

    const found = await recallFindings({
      userId: me.id,
      cardId: card.id,
      text: '嗯',
    })

    expect(found.map((item) => item.title)).toEqual(['今天的'])
  })

  it('索引不在（没配置）也照常带最新那一条', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('SEMANTIC_INDEX_URL', '')
    await finding('今天的')

    const found = await recallFindings({
      userId: me.id,
      cardId: card.id,
      text: '嗯',
    })

    expect(found.map((item) => item.title)).toEqual(['今天的'])
  })

  it('渲染：没有就是空串；有就写明只在合适时提', () => {
    expect(renderFindingsRecall([])).toBe('')
    const text = renderFindingsRecall([
      { source: 'bilibili', title: '松饼', note: '好吃', day: '2026-10-28' },
    ])
    expect(text).toContain('THINGS YOU CAME ACROSS ONLINE LATELY')
    expect(text).toContain('松饼 — you thought: 好吃')
    expect(text).toContain('never force them in')
  })
})
