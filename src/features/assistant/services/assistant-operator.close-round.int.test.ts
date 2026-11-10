/**
 * **v3 收尾**（P2 §2.5）：⛔ 不起结账那一跳；证据编号确定性地落一条会话记录；记忆在后台
 * （`after`）抽、不挡 `done`，用这一轮的那一家、那个型号、`low` 档；隐身 / 「让助手记住」关 /
 * 空账本一条不写。真库（L2a）：会话、记录、记忆、人设、角色卡都是库里的行；只假模型那一跳。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@/services/llm-text.service', async (importOriginal) =>
  (await import('@/test/int/fake-llm-text')).fakeLlmTextModule(
    await importOriginal(),
  ),
)

import { after } from 'next/server'

import { ASSISTANT_OPERATOR_VERB_IDS } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  closeRoundV3,
  closeRoundV3BeforeStop,
  prepareOperatorTurn,
  recordLedgerStep,
} from '@/features/assistant/services/assistant-operator.service'
import {
  operatorRequest,
  operatorUser,
  type OperatorUser,
} from '@/test/assistant-bench/operator-plan'
import { createTestCard } from '@/test/int/cards'
import { resetDatabase } from '@/test/int/db'
import { fakeLlm } from '@/test/int/fake-llm-text'

const MEMORIES = JSON.stringify({
  memories: [{ kind: 'preference', text: '偏好横构图 16:9' }],
})

let user: OperatorUser
let conversationId = ''

beforeEach(async () => {
  await resetDatabase()
  fakeLlm.reset()
  vi.mocked(after).mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network disabled in tests')
    }),
  )
  user = await operatorUser()
  conversationId = (
    await db.assistantConversation.create({
      data: { userId: user.id, surface: 'IMAGE_STUDIO', messages: [] },
    })
  ).id
})

async function prepare(
  extra: Partial<AssistantOperatorRequest> = {},
  options: { skipPriorRounds?: boolean } = {},
) {
  const prepared = await prepareOperatorTurn(
    user.clerkId,
    operatorRequest({ conversationId, ...extra }),
    new AbortController().signal,
    options,
  )
  fakeLlm.calls = []
  vi.mocked(after).mockClear()
  return prepared
}

/**
 * 后台抽记忆只在角色页 / 画布 / 角色聊天还跑（owner 11-10：图片 / 视频 / LoRA 三台不抽），
 * 抽记忆那几组用角色页那张脸。
 */
async function prepareCards(
  extra: Partial<AssistantOperatorRequest> = {},
  options: { skipPriorRounds?: boolean } = {},
) {
  await db.assistantConversation.update({
    where: { id: conversationId },
    data: { surface: 'CARDS' },
  })
  return prepare(
    {
      domain: 'cards',
      snapshot: {
        prompt: '',
        availableModels: [],
        cards: { total: 0, characters: [], open: null },
      },
      ...extra,
    },
    options,
  )
}

/** `after` 收下的那几样 —— 等它们跑完（Vercel 上函数也是等它们跑完才退）。 */
async function settleAfter() {
  await Promise.all(
    vi
      .mocked(after)
      .mock.calls.map(([task]) =>
        typeof task === 'function' ? (task as () => unknown)() : task,
      ),
  )
}

const close = (run: Awaited<ReturnType<typeof prepare>>['run'], extra = {}) =>
  closeRoundV3(run, { clerkId: user.clerkId, userId: user.id, ...extra })

const look = (run: Awaited<ReturnType<typeof prepare>>['run']) =>
  recordLedgerStep(run, ASSISTANT_OPERATOR_VERB_IDS.look, '看图', '黑长直')

const memories = () =>
  db.assistantMemory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })

const storedRounds = async () =>
  (
    await db.assistantConversation.findUniqueOrThrow({
      where: { id: conversationId },
    })
  ).rounds as Record<string, unknown>[]

describe('v3 收尾 · 后台抽记忆', () => {
  it('⭐ 不起结账那一跳；记忆在后台抽，收尾不等它', async () => {
    const { run } = await prepareCards()
    look(run)
    let release: (raw: string) => void = () => undefined
    fakeLlm.queue = [
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    ]

    const summary = await close(run, { closingMessage: '挑好了。' })

    // 收尾已经回来了，抽记忆那一跳还挂着：`done` 不等它。
    expect(summary).toBeUndefined()
    expect(after).toHaveBeenCalled()
    // 后台那一跳先翻已有的记忆，再问模型。
    await vi.waitFor(() => expect(fakeLlm.calls).toHaveLength(1))
    expect(await memories()).toEqual([])
    expect(fakeLlm.calls[0]?.systemPrompt).toMatch(/^You pick what/)
    // 后台那一跳有自己的时限，⛔ 不挂这一轮的 signal。
    expect(fakeLlm.calls[0]?.signal).toBeDefined()
    expect(fakeLlm.calls[0]?.signal).not.toBe(run.signal)

    release(MEMORIES)
    await settleAfter()
    expect(await memories()).toMatchObject([
      {
        scope: 'CARDS',
        kind: 'PREFERENCE',
        source: 'ASSISTANT',
        text: '偏好横构图 16:9',
        conversationId,
      },
    ])
  })

  it('这一轮的那一家、那个型号、那把 key（全跟助手），low 档；材料里有这一轮的账本与收尾那句', async () => {
    const { run } = await prepareCards()
    look(run)
    fakeLlm.queue = [MEMORIES]

    await close(run, { closingMessage: '挑好了。' })
    await settleAfter()

    const call = fakeLlm.calls[0]!
    expect(call.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(call.apiKey).toBe(run.route.apiKey)
    expect(run.modelId).toBeTruthy()
    expect(call.modelId).toBe(run.modelId)
    expect(call.reasoningEffort).toBe('low')
    expect(call.userPrompt).toContain('看图: 黑长直')
    expect(call.userPrompt).toContain('HOW THE ASSISTANT CLOSED:\n挑好了。')
  })

  it('⛔ 不换同一家的快档：选了 Claude Opus，抽记忆也用 Opus', async () => {
    const { run } = await prepareCards()
    run.route = { ...run.route, adapterType: AI_ADAPTER_TYPES.ANTHROPIC }
    run.modelId = LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5
    look(run)
    fakeLlm.queue = [MEMORIES]

    await close(run)
    await settleAfter()

    expect(fakeLlm.calls[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId: LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5,
    })
  })

  it('⛔ 隐身开着：后台那一跳不起，一条都不写；证据记录照常', async () => {
    const { run } = await prepareCards({ incognito: true })
    look(run)
    run.evidenceRefs.push('#e1')

    const summary = await close(run)
    await settleAfter()

    expect(fakeLlm.calls).toEqual([])
    expect(await memories()).toEqual([])
    expect(summary).toMatchObject({ evidenceRefs: ['#e1'], incognito: true })
  })

  it('⛔ 「让助手记住」关着 / 账本是空的：后台那一跳不起', async () => {
    await db.assistantPersona.create({
      data: { userId: user.id, memoryCapture: false },
    })
    const off = await prepareCards()
    look(off.run)
    await close(off.run)
    await settleAfter()
    expect(fakeLlm.calls).toEqual([])

    await db.assistantPersona.update({
      where: { userId: user.id },
      data: { memoryCapture: true },
    })
    const empty = await prepareCards()
    await close(empty.run, { closingMessage: '你好呀。' })
    await settleAfter()

    expect(fakeLlm.calls).toEqual([])
    expect(await memories()).toEqual([])
  })

  it('抽记忆失败：只记一行，⛔ 不抛', async () => {
    const warn = vi.spyOn(logger, 'warn')
    const { run } = await prepareCards()
    look(run)
    fakeLlm.queue = [new Error('provider down')]

    await expect(close(run)).resolves.toBeUndefined()
    await settleAfter()

    expect(await memories()).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      'assistant round memories not stored',
      expect.objectContaining({ error: 'provider down' }),
    )
  })

  it('以确认卡收：一步都没跑成就不收；跑过的把那条待办记进原料，一次运行只收一次', async () => {
    const idle = await prepareCards()
    expect(
      await closeRoundV3BeforeStop(idle.run, {
        clerkId: user.clerkId,
        userId: user.id,
        todo: '等你确认生成 2 张',
      }),
    ).toBeUndefined()
    expect(fakeLlm.calls).toEqual([])

    const { run } = await prepareCards()
    look(run)
    fakeLlm.fallback = MEMORIES
    await closeRoundV3BeforeStop(run, {
      clerkId: user.clerkId,
      userId: user.id,
      todo: '等你确认生成 2 张',
    })
    await close(run)
    await settleAfter()

    expect(fakeLlm.calls).toHaveLength(1)
    expect(fakeLlm.calls[0]?.userPrompt).toContain('等你确认生成 2 张')
    expect(await memories()).toHaveLength(1)
  })
})

describe('v3 收尾 · 改已有的记忆（P3）', () => {
  async function seedMemory(
    kind: 'PREFERENCE' | 'FACT',
    text: string,
    updatedAt: string,
  ) {
    return db.assistantMemory.create({
      data: {
        userId: user.id,
        scope: 'CARDS',
        kind,
        text,
        updatedAt: new Date(updatedAt),
      },
    })
  }

  it('⭐ 已有的编好号给模型看；replaces / forget 的编号换成 id，对不上的 replaces 当新加、对不上的 forget 丢掉', async () => {
    // 给模型看的按最近改过的排：#1 是竖构图那条，#2 是小林那条。
    const vertical = await seedMemory(
      'PREFERENCE',
      '偏好竖构图 9:16',
      '2026-10-20T08:00:00.000Z',
    )
    const hero = await seedMemory(
      'FACT',
      '主角叫小林',
      '2026-09-01T08:00:00.000Z',
    )
    const { run } = await prepareCards()
    look(run)
    fakeLlm.queue = [
      JSON.stringify({
        memories: [
          { kind: 'preference', text: '偏好横构图 16:9', replaces: 1 },
          { kind: 'fact', text: '同一条改两次只认第一次', replaces: 1 },
          { kind: 'fact', text: '编号不存在就当新加', replaces: 9 },
        ],
        forget: [2, 7],
      }),
    ]

    await close(run)
    await settleAfter()

    const prompt = fakeLlm.calls[0]!.userPrompt
    expect(prompt).toContain(
      '#1 [preference, noted 2026-10-20] 偏好竖构图 9:16',
    )
    expect(prompt).toContain('#2 [fact, noted 2026-09-01] 主角叫小林')
    const rows = await memories()
    expect(rows.find((row) => row.id === vertical.id)).toMatchObject({
      kind: 'PREFERENCE',
      text: '偏好横构图 16:9',
    })
    expect(rows.some((row) => row.id === hero.id)).toBe(false)
    expect(rows.map((row) => row.text)).toContain('编号不存在就当新加')
  })

  it('什么都不改（全空）就一行不动', async () => {
    const kept = await seedMemory(
      'FACT',
      '主角叫小林',
      '2026-09-01T08:00:00.000Z',
    )
    const { run } = await prepareCards()
    look(run)
    fakeLlm.queue = [JSON.stringify({ memories: [], forget: [] })]

    await close(run)
    await settleAfter()

    expect(await memories()).toMatchObject([
      { id: kept.id, text: '主角叫小林', updatedAt: kept.updatedAt },
    ])
  })
})

describe('v3 收尾 · 记进哪一份', () => {
  it('⭐ 聊天会话记进这个角色（附录L 第二片：cards + 角色，故事里的事不进工作记忆）', async () => {
    const card = await createTestCard(user.id, {
      persona: { identity: '图书馆管理员' },
    })
    await db.assistantMemory.create({
      data: {
        userId: user.id,
        scope: 'CARDS',
        kind: 'FACT',
        text: '她喜欢猫',
        characterCardId: card.id,
      },
    })
    const { run } = await prepare({ chatCharacterId: card.id })
    look(run)
    fakeLlm.fallback = MEMORIES

    await close(run)
    await settleAfter()

    // 给模型看的是这个角色那份。
    expect(fakeLlm.calls[0]?.userPrompt).toContain('她喜欢猫')
    const written = (await memories()).filter(
      (row) => row.text === '偏好横构图 16:9',
    )
    expect(written).toMatchObject([
      { scope: 'CARDS', characterCardId: card.id },
    ])
  })

  it('⛔ 会话角色没读成（卡删了，退回工作人设）：这一轮不自动记', async () => {
    const card = await createTestCard(user.id, {
      persona: { identity: '图书馆管理员' },
      isDeleted: true,
    })
    const { run } = await prepare({ chatCharacterId: card.id })
    look(run)
    fakeLlm.fallback = MEMORIES

    await close(run)
    await settleAfter()

    expect(await memories()).toEqual([])
  })

  it('⭐ 角色页记进自己的 cards 域（⛔ 不往全局漏）', async () => {
    const { run } = await prepareCards()
    look(run)
    fakeLlm.fallback = MEMORIES

    await close(run)
    await settleAfter()

    expect(await memories()).toMatchObject([
      { scope: 'CARDS', characterCardId: null, text: '偏好横构图 16:9' },
    ])
  })

  it('⛔ 图片 / 视频 / LoRA 三台：后台那一跳不起（owner 11-10：这三台的记忆不再进提示）', async () => {
    for (const domain of ['image', 'video', 'lora'] as const) {
      const { run } = await prepare({ domain, conversationId: undefined })
      look(run)
      fakeLlm.fallback = MEMORIES

      await close(run)
      await settleAfter()
      expect(fakeLlm.calls, domain).toEqual([])
    }

    expect(await memories()).toEqual([])
  })
})

describe('v3 收尾 · 证据记录与下一轮', () => {
  it('⭐ 这一轮落了证据：确定性地写一条只带编号的记录，三栏空着；空账本不起后台那一跳', async () => {
    const { run } = await prepare()
    run.evidenceRefs.push('#e1', '#e2')

    const summary = await close(run)

    expect(await storedRounds()).toMatchObject([
      {
        facts: [],
        decisions: [],
        todos: [],
        evidenceRefs: ['#e1', '#e2'],
        roundIndex: 0,
      },
    ])
    expect(summary).toMatchObject({
      evidenceRefs: ['#e1', '#e2'],
      roundIndex: 0,
    })
    expect(fakeLlm.calls).toEqual([])
  })

  it('没落证据：不写记录（面板不画结论记录，三栏没有读者）', async () => {
    const { run } = await prepare()
    look(run)
    fakeLlm.queue = [MEMORIES]

    expect(await close(run)).toBeUndefined()
    await settleAfter()
    expect(await storedRounds()).toEqual([])
  })

  /** v3 用不上上几轮的结论记录（P2）：准备时 ⛔ 不读。 */
  it('⛔ skipPriorRounds：开跑前不读上几轮的记录', async () => {
    const first = await prepare()
    first.run.evidenceRefs.push('#e1')
    await close(first.run)

    const read = await prepare()
    expect(read.run.priorRounds).toHaveLength(1)

    const skipped = await prepare({}, { skipPriorRounds: true })
    expect(skipped.run.priorRounds).toEqual([])
    expect(skipped.priorRoundsSkipped).toBe(true)
  })
})
