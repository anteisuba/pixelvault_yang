import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { Prisma } from '@/lib/generated/prisma/client'
import {
  ASSISTANT_MEMORY_KIND_IDS,
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
  ASSISTANT_MEMORY_SOURCE_IDS,
  normalizeAssistantMemoryText,
} from '@/constants/assistant-memory'
import { db } from '@/lib/db'
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
  restoreAssistantMemory,
  searchAssistantMemories,
  touchAssistantMemories,
  updateAssistantMemory,
} from '@/features/assistant/services/assistant-memory.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

/** 助手记忆——真库（L2a）：记忆、画布项目、角色卡都是库里的行，断言落在行上。 */
let userId = ''
let strangerId = ''

/** 一天前起，每建一条往后挪一秒：updatedAt / lastUsedAt 依次变新。 */
const BASE = Date.now() - 24 * 60 * 60 * 1000
let tick = 0

function mem(data: Partial<Prisma.AssistantMemoryUncheckedCreateInput> = {}) {
  tick += 1
  const at = new Date(BASE + tick * 1000)
  return db.assistantMemory.create({
    data: {
      userId,
      scope: 'IMAGE',
      kind: 'PREFERENCE',
      source: 'ASSISTANT',
      text: `记忆 ${tick}`,
      createdAt: at,
      updatedAt: at,
      lastUsedAt: at,
      ...data,
    },
  })
}

/** 一口气塞 n 条助手记的（上限那几例用）。 */
function fill(
  count: number,
  data: Partial<Prisma.AssistantMemoryCreateManyInput> = {},
) {
  return db.assistantMemory.createMany({
    data: Array.from({ length: count }, (_unused, index) => {
      const at = new Date(BASE - (count - index) * 60_000)
      return {
        userId,
        scope: 'IMAGE' as const,
        kind: 'FACT' as const,
        source: 'ASSISTANT' as const,
        text: `批量 ${index}`,
        createdAt: at,
        updatedAt: at,
        lastUsedAt: at,
        ...data,
      }
    }),
  })
}

function project(owner = userId, name = '马尔福') {
  return db.nodeWorkflowProject.create({
    data: { userId: owner, name, state: {} },
  })
}

function card(owner = userId, name = '芙莉莲', isDeleted = false) {
  return db.characterCard.create({ data: { userId: owner, name, isDeleted } })
}

function rows(where: Prisma.AssistantMemoryWhereInput = {}) {
  return db.assistantMemory.findMany({
    where: { userId, ...where },
    orderBy: { createdAt: 'asc' },
  })
}

const ids = (list: readonly { id: string }[]) => list.map((item) => item.id)
const texts = (list: readonly { text: string }[]) =>
  list.map((item) => item.text)
const PAST = new Date(Date.now() - 60_000)

beforeEach(async () => {
  await resetDatabase()
  tick = 0
  userId = (await createTestUser()).id
  strangerId = (await createTestUser()).id
})

// ─── 读 ─────────────────────────────────────────────────────────

describe('listAssistantMemories（真库）', () => {
  it('按 updatedAt 倒序、按域收敛，只读自己的', async () => {
    const older = await mem({ text: '偏好横构图 16:9，除非我明说要竖的' })
    const newer = await mem()
    await mem({ scope: 'VIDEO' })
    await mem({ userId: strangerId })

    const memories = await listAssistantMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })

    expect(ids(memories)).toEqual([newer.id, older.id])
    expect(memories[1]).toMatchObject({
      id: older.id,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      kind: ASSISTANT_MEMORY_KIND_IDS.preference,
      source: ASSISTANT_MEMORY_SOURCE_IDS.assistant,
      text: '偏好横构图 16:9，除非我明说要竖的',
    })
  })

  it('缺 scope = 全部域；角色的记忆不在这里（在她页上）', async () => {
    const frieren = await card()
    const image = await mem()
    const video = await mem({ scope: 'VIDEO', source: 'CREATOR' })
    await mem({ scope: 'CARDS', characterCardId: frieren.id })

    const memories = await listAssistantMemories(userId)

    expect(ids(memories)).toEqual([video.id, image.id])
  })

  /** ⭐ 你写的单独取满：一个话多的月份不该把你写的规矩挤出列表。 */
  it('你写的单独取满，再与助手记的按 updatedAt 合并', async () => {
    const mineOld = await mem({
      source: 'CREATOR',
      kind: 'RULE',
      updatedAt: new Date(BASE - 90 * 24 * 60 * 60 * 1000),
    })
    await fill(ASSISTANT_MEMORY_LIMITS.maxPerScope)
    const learnedNew = await mem()

    const memories = await listAssistantMemories(userId)

    expect(memories).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxPerScope + 1)
    expect(memories[0]?.id).toBe(learnedNew.id)
    expect(memories.at(-1)?.id).toBe(mineOld.id)
  })

  it('读不出来的那一条被丢掉，⛔ 不连累整张列表', async () => {
    const good = await mem()
    await mem({ text: '   ' })
    const memories = await listAssistantMemories(userId)
    expect(ids(memories)).toEqual([good.id])
  })
})

describe('listAssistantMemoriesForPrompt（真库）', () => {
  /** ⭐ P3：固定一组 —— 最近记下 / 改过的在前，⛔ 不按 lastUsedAt（注入一次就排最前的自我强化）。 */
  it('取当前域 + global 里助手记的、活着的，按 updatedAt 倒序', async () => {
    const global = await mem({ scope: 'GLOBAL' })
    const video = await mem({ scope: 'VIDEO' })
    await mem({ scope: 'IMAGE' })
    // 你写的不在这一段：它们进规则段，⛔ 不占助手记的那份预算。
    await mem({ scope: 'VIDEO', source: 'CREATOR' })
    await mem({ scope: 'VIDEO', dormantAt: PAST })
    await mem({ scope: 'VIDEO', expiresAt: PAST })
    const pinnedExpired = await mem({
      scope: 'VIDEO',
      expiresAt: PAST,
      pinned: true,
    })
    await mem({ scope: 'VIDEO', userId: strangerId })

    const memories = await listAssistantMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.video,
      5,
    )

    expect(ids(memories)).toEqual([pinnedExpired.id, video.id, global.id])
    // 刚被用过（lastUsedAt）⛔ 不算：排序只看最近改过。
    await db.assistantMemory.update({
      where: { id: global.id },
      data: { lastUsedAt: new Date(), updatedAt: global.updatedAt },
    })
    expect(
      ids(
        await listAssistantMemoriesForPrompt(
          userId,
          ASSISTANT_MEMORY_SCOPE_IDS.video,
          2,
        ),
      ),
    ).toEqual([pinnedExpired.id, video.id])
  })

  it('updatedAt 并列时按 id 排（选哪几条每次都一样）', async () => {
    const same = new Date(BASE)
    const first = await mem({ updatedAt: same })
    const second = await mem({ updatedAt: same })

    const memories = await listAssistantMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      5,
    )

    expect(ids(memories)).toEqual([first.id, second.id].sort())
  })

  /** ⭐ owner 2026-10-09：一个项目一份记忆，换了项目之前的记忆不能影响新项目。 */
  it('画布：global + 所有画布 + 本项目，⛔ 不带别的项目', async () => {
    const mine = await project()
    const other = await project(userId, '别的项目')
    const global = await mem({ scope: 'GLOBAL' })
    const allCanvases = await mem({ scope: 'CANVAS' })
    const thisProject = await mem({ scope: 'CANVAS', projectId: mine.id })
    await mem({ scope: 'CANVAS', projectId: other.id })

    const memories = await listAssistantMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      5,
      mine.id,
    )

    expect(ids(memories)).toEqual([thisProject.id, allCanvases.id, global.id])
  })

  it('画布没有项目：只带 global + 所有画布', async () => {
    const mine = await project()
    const global = await mem({ scope: 'GLOBAL' })
    const allCanvases = await mem({ scope: 'CANVAS' })
    await mem({ scope: 'CANVAS', projectId: mine.id })

    const memories = await listAssistantMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      5,
    )

    expect(ids(memories)).toEqual([allCanvases.id, global.id])
  })

  it('预算 <= 0（被卡吃光）时一条都不给', async () => {
    await mem()
    await expect(
      listAssistantMemoriesForPrompt(
        userId,
        ASSISTANT_MEMORY_SCOPE_IDS.image,
        0,
      ),
    ).resolves.toEqual([])
  })

  it('封顶在 maxInPrompt —— 调用方给再大的预算也不放宽', async () => {
    await fill(ASSISTANT_MEMORY_LIMITS.maxInPrompt + 4)
    const memories = await listAssistantMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      999,
    )
    expect(memories).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxInPrompt)
  })
})

describe('listCreatorMemoriesForPrompt（真库）', () => {
  it('只取你写的：当前域 + global、活着的，最近改过的在前', async () => {
    const global = await mem({ scope: 'GLOBAL', source: 'CREATOR' })
    const video = await mem({ scope: 'VIDEO', source: 'CREATOR' })
    await mem({ scope: 'IMAGE', source: 'CREATOR' })
    await mem({ scope: 'VIDEO', source: 'ASSISTANT' })
    await mem({ scope: 'VIDEO', source: 'CREATOR', dormantAt: PAST })

    const memories = await listCreatorMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.video,
      12,
    )

    expect(ids(memories)).toEqual([video.id, global.id])
    expect(memories.every((memory) => memory.source === 'creator')).toBe(true)
    expect(
      ids(
        await listCreatorMemoriesForPrompt(
          userId,
          ASSISTANT_MEMORY_SCOPE_IDS.video,
          1,
        ),
      ),
    ).toEqual([video.id])
  })

  it('limit <= 0 时一条都不给', async () => {
    await mem({ source: 'CREATOR' })
    await expect(
      listCreatorMemoriesForPrompt(userId, ASSISTANT_MEMORY_SCOPE_IDS.image, 0),
    ).resolves.toEqual([])
  })
})

describe('listStandingRuleMemories（真库）', () => {
  it('你写的 + 助手记下的规矩；给了域就是该域 + global', async () => {
    const frieren = await card()
    const minePref = await mem({ scope: 'LORA', source: 'CREATOR' })
    const learnedRule = await mem({ scope: 'LORA', kind: 'RULE' })
    const globalMine = await mem({ scope: 'GLOBAL', source: 'CREATOR' })
    await mem({ scope: 'LORA', kind: 'PREFERENCE' })
    await mem({ scope: 'IMAGE', source: 'CREATOR' })
    await mem({
      scope: 'CARDS',
      source: 'CREATOR',
      characterCardId: frieren.id,
    })

    const memories = await listStandingRuleMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.lora,
      limit: 50,
    })

    expect(ids(memories)).toEqual([globalMine.id, learnedRule.id, minePref.id])
    expect(
      await listStandingRuleMemories(userId, {
        scope: ASSISTANT_MEMORY_SCOPE_IDS.lora,
        limit: 1,
      }),
    ).toHaveLength(1)
  })

  it('缺域 = 全部域，但别的项目、角色的一条都不带', async () => {
    const mine = await project()
    const other = await project(userId, '别的项目')
    const frieren = await card()
    const image = await mem({ scope: 'IMAGE', source: 'CREATOR' })
    const thisProject = await mem({
      scope: 'CANVAS',
      kind: 'RULE',
      projectId: mine.id,
    })
    await mem({ scope: 'CANVAS', kind: 'RULE', projectId: other.id })
    await mem({ scope: 'CARDS', kind: 'RULE', characterCardId: frieren.id })

    const memories = await listStandingRuleMemories(userId, {
      projectId: mine.id,
      limit: 50,
    })

    expect(ids(memories)).toEqual([thisProject.id, image.id])
  })
})

describe('touchAssistantMemories（真库）', () => {
  it('刷新 lastUsedAt，且只刷这个用户的', async () => {
    const a = await mem()
    const b = await mem()
    const theirs = await mem({ userId: strangerId })

    await touchAssistantMemories(userId, [a.id, b.id, theirs.id])

    const after = await db.assistantMemory.findMany()
    const lastUsed = (id: string) =>
      after.find((row) => row.id === id)!.lastUsedAt.getTime()
    expect(lastUsed(a.id)).toBeGreaterThan(a.lastUsedAt.getTime())
    expect(lastUsed(b.id)).toBeGreaterThan(b.lastUsedAt.getTime())
    expect(lastUsed(theirs.id)).toBe(theirs.lastUsedAt.getTime())
  })

  it('空列表什么都不动', async () => {
    const a = await mem()
    await touchAssistantMemories(userId, [])
    expect((await rows())[0]?.lastUsedAt).toEqual(a.lastUsedAt)
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

describe('recordAssistantMemories（真库）', () => {
  it('新候选落库，返回真正记下的条数', async () => {
    const written = await recordAssistantMemories({
      userId,
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
    expect(await rows()).toEqual([
      expect.objectContaining({
        scope: 'IMAGE',
        kind: 'PREFERENCE',
        source: 'ASSISTANT',
        text: '偏好横构图 16:9',
        conversationId: 'conv-1',
        projectId: null,
      }),
    ])
  })

  it('归一化字面命中时只刷旧条（+1、醒过来），⛔ 不新增一行、⛔ 不改原文', async () => {
    const old = await mem({
      text: '偏好横构图 16:9，除非我明说',
      dormantAt: PAST,
    })

    const written = await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.preference,
          text: '偏好横构图16:9, 除非我明说',
        },
      ],
    })

    expect(written).toBe(1)
    const [only, ...rest] = await rows()
    expect(rest).toEqual([])
    expect(only).toMatchObject({
      id: old.id,
      text: '偏好横构图 16:9，除非我明说',
      mentions: 1,
      dormantAt: null,
    })
    expect(only!.lastUsedAt.getTime()).toBeGreaterThan(old.lastUsedAt.getTime())
  })

  it('敏感类目命中：不写、不计数', async () => {
    const written = await recordAssistantMemories({
      userId,
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
    expect(texts(await rows())).toEqual(['偏好冷色调'])
  })

  it('本轮内部重复只写一条', async () => {
    const written = await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调。' },
      ],
    })
    expect(written).toBe(1)
    expect(await rows()).toHaveLength(1)
  })

  it('画布：归当前项目，去重也只比这个项目里的', async () => {
    const mine = await project()
    const other = await project(userId, '别的项目')
    await mem({
      scope: 'CANVAS',
      kind: 'FACT',
      projectId: other.id,
      text: '这个项目画风是 3D 游戏 CG',
    })

    await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      projectId: mine.id,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.fact,
          text: '这个项目画风是 3D 游戏 CG',
        },
      ],
    })

    expect(await rows({ projectId: mine.id })).toEqual([
      expect.objectContaining({
        scope: 'CANVAS',
        text: '这个项目画风是 3D 游戏 CG',
      }),
    ])
    expect(await rows({ projectId: other.id })).toHaveLength(1)
  })

  it('项目不是这个用户的：画布那几条不写，⛔ 不退成所有画布', async () => {
    const theirs = await project(strangerId)
    const written = await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      projectId: theirs.id,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.fact,
          text: '这个项目画风是 3D 游戏 CG',
        },
      ],
    })
    expect(written).toBe(0)
    expect(await db.assistantMemory.count()).toBe(0)
  })

  it('不在画布：projectId 为空', async () => {
    const mine = await project()
    await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      projectId: mine.id,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
      ],
    })
    expect((await rows())[0]).toMatchObject({ scope: 'IMAGE', projectId: null })
  })

  it('⭐ 全部落当前域：模型给不了域（P3 作用域修正）', async () => {
    await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.video,
      candidates: [
        {
          kind: ASSISTANT_MEMORY_KIND_IDS.rule,
          text: '回答用中文，术语保留英文',
        },
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好 24fps' },
      ],
    })
    expect((await rows()).map((row) => row.scope)).toEqual(['VIDEO', 'VIDEO'])
  })

  it('⭐ 改掉第 N 条：原地换字，只认助手记的、这个用户的', async () => {
    const learned = await mem({ kind: 'FACT', text: '偏好 16:9' })
    const mine = await mem({ source: 'CREATOR', text: '我写的' })
    const theirs = await mem({ userId: strangerId, text: '别人的' })
    const replace = (id: string) => ({
      id,
      candidate: {
        kind: ASSISTANT_MEMORY_KIND_IDS.preference,
        text: '现在偏好 3:4 竖图',
      },
    })

    const written = await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [],
      replacements: [replace(learned.id), replace(mine.id), replace(theirs.id)],
    })

    expect(written).toBe(1)
    const after = await db.assistantMemory.findMany()
    const byId = (id: string) => after.find((row) => row.id === id)
    expect(byId(learned.id)).toMatchObject({
      text: '现在偏好 3:4 竖图',
      kind: 'PREFERENCE',
    })
    expect(byId(mine.id)?.text).toBe('我写的')
    expect(byId(theirs.id)?.text).toBe('别人的')
    expect(after).toHaveLength(3)
  })

  it('⭐ 忘掉：只删助手记的；同一条又要改就改赢', async () => {
    const a = await mem({ kind: 'FACT' })
    const b = await mem()
    const mine = await mem({ source: 'CREATOR' })

    await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [],
      replacements: [
        {
          id: a.id,
          candidate: { kind: ASSISTANT_MEMORY_KIND_IDS.fact, text: '新说法' },
        },
      ],
      forget: [a.id, b.id, mine.id],
    })

    const after = await rows()
    expect(ids(after)).toEqual([a.id, mine.id])
    expect(after[0]?.text).toBe('新说法')
  })

  it('改成的新说法命中敏感类目：不改、不计数', async () => {
    const a = await mem({ kind: 'FACT', text: '原来的说法' })
    const written = await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [],
      replacements: [
        {
          id: a.id,
          candidate: {
            kind: ASSISTANT_MEMORY_KIND_IDS.fact,
            text: '我的密码是 hunter2',
          },
        },
      ],
    })
    expect(written).toBe(0)
    expect(texts(await rows())).toEqual(['原来的说法'])
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
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates,
    })
    expect(written).toBe(ASSISTANT_MEMORY_LIMITS.maxPerRound)
    expect(await rows()).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxPerRound)
  })

  it('每域上限 200：超了按 lastUsedAt 最旧的静默删，⛔ 你写的不淘汰', async () => {
    // 你写的那条最旧，但不淘汰、也不占助手记的名额。
    const mine = await mem({
      source: 'CREATOR',
      lastUsedAt: new Date(BASE - 365 * 24 * 60 * 60 * 1000),
    })
    await fill(ASSISTANT_MEMORY_LIMITS.maxPerScope)
    const [oldest] = await rows({ source: 'ASSISTANT', text: '批量 0' })
    // 另一个域的不受影响。
    await mem({ scope: 'VIDEO' })

    await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
      ],
    })

    const image = await rows({ scope: 'IMAGE', source: 'ASSISTANT' })
    expect(image).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxPerScope)
    expect(ids(image)).not.toContain(oldest!.id)
    expect(texts(image)).toContain('偏好冷色调')
    expect(ids(await rows({ source: 'CREATOR' }))).toEqual([mine.id])
    expect(await rows({ scope: 'VIDEO' })).toHaveLength(1)
  })

  it('没超上限时一条都不删', async () => {
    await fill(3)
    await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.preference, text: '偏好冷色调' },
      ],
    })
    expect(await rows()).toHaveLength(4)
  })
})

describe('createCreatorMemory（你写一条，真库）', () => {
  it('落成「你写的 · 规矩」', async () => {
    const memory = await createCreatorMemory(userId, {
      text: '  画面里不要出现文字  ',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
    })
    expect(memory.source).toBe(ASSISTANT_MEMORY_SOURCE_IDS.creator)
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: memory.id,
        scope: 'GLOBAL',
        kind: 'RULE',
        source: 'CREATOR',
        text: '画面里不要出现文字',
      }),
    ])
  })

  /** 同一句话助手已经记过 —— 认领成你写的，⛔ 不存第二行、⛔ 不改原文。 */
  it('同一句已在：改成你写的，⛔ 不新增', async () => {
    const learned = await mem({ text: '画面里不要出现文字。' })
    const memory = await createCreatorMemory(userId, {
      text: '画面里不要出现文字',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })
    expect(memory.id).toBe(learned.id)
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: learned.id,
        source: 'CREATOR',
        text: '画面里不要出现文字。',
      }),
    ])
  })

  it('你写的满了：抛 AssistantMemoryLimitError，⛔ 不挤掉旧的', async () => {
    await fill(ASSISTANT_MEMORY_LIMITS.maxCreatorEntries, {
      source: 'CREATOR',
      kind: 'RULE',
      scope: 'GLOBAL',
    })
    await expect(
      createCreatorMemory(userId, {
        text: '再来一条',
        scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
      }),
    ).rejects.toBeInstanceOf(AssistantMemoryLimitError)
    expect(await rows()).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxCreatorEntries)
  })
})

describe('addAssistantRuleMemory（add_project_rule 的普通规矩，真库）', () => {
  it('落成「助手记的 · 规矩」', async () => {
    const { memory, created } = await addAssistantRuleMemory(userId, {
      text: '以后查资料只信官方站',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })
    expect(created).toBe(true)
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: memory.id,
        scope: 'IMAGE',
        kind: 'RULE',
        source: 'ASSISTANT',
      }),
    ])
  })

  it('也收一次每域上限（只数助手记的）', async () => {
    await fill(ASSISTANT_MEMORY_LIMITS.maxPerScope)
    await addAssistantRuleMemory(userId, {
      text: '以后查资料只信官方站',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })
    const image = await rows({ scope: 'IMAGE' })
    expect(image).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxPerScope)
    expect(texts(image)).toContain('以后查资料只信官方站')
  })

  it('同一句已在：回那一条、created=false，⛔ 不存第二行、⛔ 改原文', async () => {
    const mine = await mem({
      source: 'CREATOR',
      kind: 'RULE',
      text: '以后查资料只信官方站',
    })
    const { memory, created } = await addAssistantRuleMemory(userId, {
      text: '以后查资料只信官方站。',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
    })
    expect(created).toBe(false)
    expect(memory.id).toBe(mine.id)
    // 又提到一次（第 ⑦ 步）：+1。
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: mine.id,
        source: 'CREATOR',
        text: '以后查资料只信官方站',
        mentions: 1,
      }),
    ])
  })

  it('画布上记的归当前项目，回来的那条带项目名', async () => {
    const mine = await project()
    const { memory } = await addAssistantRuleMemory(userId, {
      text: '这个项目一律 3D 游戏 CG',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
      projectId: mine.id,
    })
    expect(memory).toMatchObject({ projectId: mine.id, projectName: '马尔福' })
    expect((await rows())[0]).toMatchObject({
      scope: 'CANVAS',
      projectId: mine.id,
    })
  })
})

// ─── 改 / 删 / 清空 ─────────────────────────────────────────────

describe('updateAssistantMemory（真库）', () => {
  it('不属于这个用户 → null（路由据此 404），⛔ 不改', async () => {
    const theirs = await mem({ userId: strangerId, text: '别人的' })
    expect(
      await updateAssistantMemory(userId, theirs.id, { text: '改过的话' }),
    ).toBeNull()
    expect(
      (await db.assistantMemory.findUniqueOrThrow({ where: { id: theirs.id } }))
        .text,
    ).toBe('别人的')
  })

  it('只改 text', async () => {
    const a = await mem({ scope: 'VIDEO' })
    const memory = await updateAssistantMemory(userId, a.id, {
      text: '改过的话',
    })
    expect(memory?.text).toBe('改过的话')
    expect((await rows())[0]).toMatchObject({
      text: '改过的话',
      scope: 'VIDEO',
    })
  })

  it('只改用在哪：换了范围就不再只属于那个项目', async () => {
    const mine = await project()
    const a = await mem({ scope: 'CANVAS', projectId: mine.id, text: '原话' })
    await updateAssistantMemory(userId, a.id, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
    })
    expect((await rows())[0]).toMatchObject({
      scope: 'GLOBAL',
      projectId: null,
      characterCardId: null,
      text: '原话',
    })
  })
})

describe('deleteAssistantMemory（真库）', () => {
  it('真删，且只删自己的', async () => {
    const a = await mem()
    const theirs = await mem({ userId: strangerId })
    expect(await deleteAssistantMemory(userId, a.id)).toBe(true)
    expect(await deleteAssistantMemory(userId, theirs.id)).toBe(false)
    expect(ids(await db.assistantMemory.findMany())).toEqual([theirs.id])
  })

  it('什么都没删 → false', async () => {
    expect(
      await deleteAssistantMemory(
        userId,
        '00000000-0000-4000-8000-000000000000',
      ),
    ).toBe(false)
  })
})

describe('clearAssistantMemories（真库）', () => {
  it('只清这个用户工作台的（角色的、别人的都留着）', async () => {
    const frieren = await card()
    await mem()
    await mem({ source: 'CREATOR' })
    const hers = await mem({ scope: 'CARDS', characterCardId: frieren.id })
    const theirs = await mem({ userId: strangerId })

    expect(await clearAssistantMemories(userId)).toBe(2)
    expect(ids(await db.assistantMemory.findMany()).sort()).toEqual(
      [hers.id, theirs.id].sort(),
    )
  })

  /** 清空跟着筛选走：筛着「助手记的」就只清助手记的。 */
  it('给了来源就只清那一栏', async () => {
    await mem()
    const mine = await mem({ source: 'CREATOR' })
    expect(
      await clearAssistantMemories(
        userId,
        ASSISTANT_MEMORY_SOURCE_IDS.assistant,
      ),
    ).toBe(1)
    expect(ids(await rows())).toEqual([mine.id])
  })
})

/** P3 读取：助手翻记忆（`search_library kind "memories"`）。 */
describe('searchAssistantMemories（真库）', () => {
  it('按词翻（任一个词，大小写不敏感），当前域 + global、活着的，两种来源都翻', async () => {
    const wide = await mem({ text: '偏好横构图' })
    const ratio = await mem({
      scope: 'GLOBAL',
      source: 'CREATOR',
      text: '16:9 优先',
    })
    const english = await mem({ text: 'Prefer WIDE shots' })
    await mem({ text: '偏好冷色调' })
    await mem({ scope: 'VIDEO', text: '横构图也行' })
    await mem({ text: '横构图 睡着的', dormantAt: PAST })

    const found = await searchAssistantMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '横构图, 16:9, wide',
    })

    expect(ids(found)).toEqual([english.id, ratio.id, wide.id])
  })

  it('空查询 = 最近的那批', async () => {
    const a = await mem()
    const b = await mem({ text: '另一条' })
    const found = await searchAssistantMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '  ',
    })
    expect(ids(found)).toEqual([b.id, a.id])
  })

  it('翻到的最多给 maxSearchResults 条', async () => {
    await fill(ASSISTANT_MEMORY_LIMITS.maxSearchResults + 3)
    const found = await searchAssistantMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '批量',
    })
    expect(found).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxSearchResults)
  })

  it('⭐ 翻到的助手记的刷 lastUsedAt、+1（真被用到才算），你写的不刷', async () => {
    const learned = await mem({ text: '偏好横构图' })
    const mine = await mem({
      source: 'CREATOR',
      kind: 'RULE',
      text: '构图别太满',
    })

    const found = await searchAssistantMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '构图',
    })

    expect(ids(found)).toEqual([mine.id, learned.id])
    const [learnedAfter, mineAfter] = await rows()
    expect(learnedAfter!.lastUsedAt.getTime()).toBeGreaterThan(
      learned.lastUsedAt.getTime(),
    )
    expect(learnedAfter!.mentions).toBe(1)
    expect(mineAfter).toMatchObject({
      lastUsedAt: mine.lastUsedAt,
      mentions: 0,
    })
  })

  it('什么都没翻到：不刷', async () => {
    const a = await mem({ text: '偏好横构图' })
    await searchAssistantMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      query: '不存在',
    })
    expect((await rows())[0]).toMatchObject({
      lastUsedAt: a.lastUsedAt,
      mentions: 0,
    })
  })
})

describe('和角色聊天：记忆按角色分开（附录L 第二片，真库）', () => {
  /** 她的、别的角色的、工作里的、你写的全局规矩各一条。 */
  async function seedChat() {
    const frieren = await card()
    const himmel = await card(userId, '辛美尔')
    const hers = await mem({ scope: 'CARDS', characterCardId: frieren.id })
    await mem({ scope: 'CARDS', characterCardId: himmel.id })
    const work = await mem({ scope: 'IMAGE' })
    const globalRule = await mem({
      scope: 'GLOBAL',
      source: 'CREATOR',
      kind: 'RULE',
    })
    return { frieren, hers, work, globalRule }
  }

  it('注入只读这个角色的，⛔ 不读工作里的、别的角色的', async () => {
    const { frieren, hers } = await seedChat()
    const memories = await listAssistantMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      8,
      null,
      frieren.id,
    )
    // 这一段只取助手记的；你写的全局规矩走规则段。
    expect(ids(memories)).toEqual([hers.id])
  })

  it('工作里的注入 ⛔ 不读任何角色的', async () => {
    const { work } = await seedChat()
    const memories = await listAssistantMemoriesForPrompt(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.image,
      8,
    )
    expect(ids(memories)).toEqual([work.id])
    expect(
      await listAssistantMemoriesForPrompt(
        userId,
        ASSISTANT_MEMORY_SCOPE_IDS.cards,
        8,
      ),
    ).toEqual([])
  })

  it('翻记忆只翻这个角色的 + 你写的全局规矩', async () => {
    const { frieren, hers, globalRule } = await seedChat()
    const found = await searchAssistantMemories(userId, {
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      characterCardId: frieren.id,
      query: '',
    })
    expect(ids(found)).toEqual([globalRule.id, hers.id])
  })

  it('结账写进 cards + 这个角色，去重也只看这个角色的', async () => {
    const frieren = await card()
    const himmel = await card(userId, '辛美尔')
    await mem({
      scope: 'CARDS',
      kind: 'FACT',
      characterCardId: himmel.id,
      text: '我们约好周六去海边',
    })

    const written = await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.image,
      characterCardId: frieren.id,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.fact, text: '我们约好周六去海边' },
      ],
    })

    expect(written).toBe(1)
    expect(await rows({ characterCardId: frieren.id })).toEqual([
      expect.objectContaining({ scope: 'CARDS', text: '我们约好周六去海边' }),
    ])
  })

  it('角色那份满了去睡（第 ⑦ 步）：最久没用的睡、钉住的不睡，⛔ 不删', async () => {
    const frieren = await card()
    await fill(ASSISTANT_MEMORY_LIMITS.maxPerScope, {
      scope: 'CARDS',
      characterCardId: frieren.id,
    })
    const [oldest] = await rows({ text: '批量 0' })
    await db.assistantMemory.update({
      where: { id: oldest!.id },
      data: { pinned: true },
    })
    const [secondOldest] = await rows({ text: '批量 1' })

    await recordAssistantMemories({
      userId,
      scope: ASSISTANT_MEMORY_SCOPE_IDS.cards,
      characterCardId: frieren.id,
      candidates: [
        { kind: ASSISTANT_MEMORY_KIND_IDS.fact, text: '我们约好周六去海边' },
      ],
    })

    const hers = await rows({ characterCardId: frieren.id })
    expect(hers).toHaveLength(ASSISTANT_MEMORY_LIMITS.maxPerScope + 1)
    const sleeping = hers.filter((row) => row.dormantAt !== null)
    expect(ids(sleeping)).toEqual([secondOldest!.id])
  })

  it('角色不是你的 / 删了：一条都不写，⛔ 不退成角色页的记忆', async () => {
    const theirs = await card(strangerId)
    const deleted = await card(userId, '旧角色', true)
    for (const characterCardId of [theirs.id, deleted.id]) {
      const written = await recordAssistantMemories({
        userId,
        scope: ASSISTANT_MEMORY_SCOPE_IDS.cards,
        characterCardId,
        candidates: [
          { kind: ASSISTANT_MEMORY_KIND_IDS.fact, text: '我们约好周六去海边' },
        ],
      })
      expect(written).toBe(0)
    }
    expect(await db.assistantMemory.count()).toBe(0)
  })

  it('聊天里记的规矩也归这个角色，回来的那条带角色名', async () => {
    const frieren = await card()
    const { memory } = await addAssistantRuleMemory(userId, {
      text: '叫我旅人',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.global,
      characterCardId: frieren.id,
    })
    expect(memory.characterName).toBe('芙莉莲')
    expect((await rows())[0]).toMatchObject({
      scope: 'CARDS',
      kind: 'RULE',
      characterCardId: frieren.id,
    })
  })
})

describe('新内核（第 6 步，真库）', () => {
  it('注入：「关于你」+ 开着的那个角色自己那份，⛔ 各台旧的不带；钉住的在前', async () => {
    const frieren = await card()
    const himmel = await card(userId, '辛美尔')
    const aboutYou = await mem({ scope: 'GLOBAL' })
    const hersLearned = await mem({
      scope: 'CARDS',
      characterCardId: frieren.id,
    })
    const hersMine = await mem({
      scope: 'CARDS',
      source: 'CREATOR',
      characterCardId: frieren.id,
    })
    const pinned = await mem({
      scope: 'GLOBAL',
      pinned: true,
      updatedAt: new Date(BASE - 1e7),
    })
    await mem({ scope: 'GLOBAL', source: 'CREATOR' })
    await mem({ scope: 'IMAGE' })
    await mem({ scope: 'CARDS', characterCardId: himmel.id })
    await mem({ scope: 'GLOBAL', dormantAt: PAST })

    const memories = await listNextAssistantMemoriesForPrompt(userId, {
      characterCardId: frieren.id,
      limit: 12,
    })

    expect(ids(memories)).toEqual([
      pinned.id,
      hersMine.id,
      hersLearned.id,
      aboutYou.id,
    ])
    expect(
      await listNextAssistantMemoriesForPrompt(userId, {
        characterCardId: frieren.id,
        limit: 2,
      }),
    ).toHaveLength(2)
  })

  it('按编号认一条；原话认到不止一条就要编号', async () => {
    const a = await mem({ text: '横构图' })
    await mem({ text: '横构图优先' })
    await mem({ userId: strangerId, text: '构图' })

    expect(
      await findAssistantMemoryByRef(userId, {
        idPrefix: a.id.slice(0, 8),
        text: `记忆·${a.id.slice(0, 8)}`,
      }),
    ).toMatchObject({ ok: true, memory: { id: a.id } })
    expect(
      await findAssistantMemoryByRef(userId, { idPrefix: null, text: '构图' }),
    ).toEqual({ ok: false, reason: 'ambiguous' })
    // 原话全等的那一条优先。
    expect(
      await findAssistantMemoryByRef(userId, {
        idPrefix: null,
        text: '横构图',
      }),
    ).toMatchObject({ ok: true, memory: { id: a.id } })
  })

  it('撤销忘掉：原样再记回去；同一句已在不记第二行；角色已经没了就不记', async () => {
    const frieren = await card()
    const snapshot = {
      text: '冬装',
      scope: ASSISTANT_MEMORY_SCOPE_IDS.cards,
      kind: ASSISTANT_MEMORY_KIND_IDS.preference,
      source: ASSISTANT_MEMORY_SOURCE_IDS.assistant,
      projectId: null,
      characterCardId: frieren.id,
    }
    expect(await restoreAssistantMemory(userId, snapshot)).toBe(true)
    expect(await rows()).toEqual([
      expect.objectContaining({
        scope: 'CARDS',
        kind: 'PREFERENCE',
        source: 'ASSISTANT',
        text: '冬装',
        characterCardId: frieren.id,
      }),
    ])
    expect(await restoreAssistantMemory(userId, snapshot)).toBe(false)

    await db.characterCard.update({
      where: { id: frieren.id },
      data: { isDeleted: true },
    })
    await db.assistantMemory.deleteMany()
    expect(await restoreAssistantMemory(userId, snapshot)).toBe(false)
    expect(await db.assistantMemory.count()).toBe(0)
  })
})
