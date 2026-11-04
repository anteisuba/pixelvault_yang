/**
 * 新内核主循环（`runAssistantNext`）。真库（L2a）：真开轮（`prepareOperatorTurn`）、真执行器（`planTool`）、
 * 真板子、真过程记录。只假模型那一头（SDK 包换成排好回合的假模型，见 `fake-model.ts`）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError } from 'ai'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  // 响应发完之后那几件（学说法、反思、口味、摘要、调用日志）只排队、不跑。
  after: vi.fn(),
}))
vi.mock('@ai-sdk/anthropic', async (importOriginal) =>
  (await import('@/test/assistant-bench/fake-model')).fakeAnthropic(
    await importOriginal(),
  ),
)
vi.mock('@ai-sdk/openai', async (importOriginal) =>
  (await import('@/test/assistant-bench/fake-model')).fakeOpenAI(
    await importOriginal(),
  ),
)

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { db } from '@/lib/db'
import {
  fakeModels,
  finish,
  promptOf,
  resetFakeModels,
  scriptedModel,
  textTurn,
  toolTurn,
} from '@/test/assistant-bench/fake-model'
import {
  collect,
  IMAGE_SNAPSHOT,
  imageRequest,
  kernelUser,
  relayOf,
  payloadOf,
  stepsOf,
  turnRecords,
  type KernelUser,
} from '@/test/assistant-bench/kernel-harness'
import { createTestCard } from '@/test/int/cards'
import { resetDatabase } from '@/test/int/db'

import { runAssistantNext } from './kernel'

let user: KernelUser

beforeEach(async () => {
  await resetDatabase()
  resetFakeModels()
  user = await kernelUser()
})

afterEach(() => {
  vi.useRealTimers()
})

const editPrompt = {
  id: 'call_1',
  name: 'edit',
  // Claude 式：只写用到的那几格。
  input: {
    changes: [
      { op: 'prompt', mode: 'edit', edits: [{ find: 'girl', replace: 'boy' }] },
    ],
  },
}

/** 过了软线就交接力条：软线 0 = 第一步落完就停。 */
const SOFT_NOW = { timeBudget: { softMs: 0, hardMs: 600_000 } }

const run = (
  request: Parameters<typeof runAssistantNext>[1],
  options?: Parameters<typeof runAssistantNext>[2],
) => collect(runAssistantNext(user.clerkId, request, options))

describe('新内核主循环', () => {
  it('首页带着小配方（第 9g 步）：照图片台跑，系统提示按首页写', async () => {
    fakeModels.main = scriptedModel([textTurn('好。')])
    await run(imageRequest('来张猫', { domain: 'home', workspaceKey: 'home' }))
    const sent = promptOf(fakeModels.main.doStreamCalls[0]!)
    expect(sent).toContain('THE PAGE: HOME')
    expect(sent).toContain('HOME — no bench is open')
    expect(sent).toContain('THE DRAFT — what is in it right now.')
  })

  it('没开台 = 和现在这位聊天（用户 10-26）：首页按设置里那张卡聊；台上 / 盖过章的照旧', async () => {
    const card = await createTestCard(user.id, {
      name: '小雪',
      persona: { identity: '图书馆管理员', speech: '说话很轻' },
    })
    const stamped = await createTestCard(user.id, {
      name: '阿澈',
      persona: { identity: '剑道部部长', speech: '说话直接' },
    })
    await db.assistantPersona.create({
      data: { userId: user.id, characterCardId: card.id },
    })

    fakeModels.main = scriptedModel([textTurn('在呢。')])
    await run(imageRequest('嗨', { domain: 'home', workspaceKey: 'home' }))
    expect(promptOf(fakeModels.main.doStreamCalls[0]!)).toContain(
      'THIS CHAT — you are 小雪',
    )

    fakeModels.main = scriptedModel([textTurn('好。')])
    await run(imageRequest('改一下'))
    expect(promptOf(fakeModels.main.doStreamCalls[0]!)).not.toContain(
      'THIS CHAT — you are',
    )

    fakeModels.main = scriptedModel([textTurn('嗯。')])
    await run(
      imageRequest('嗨', {
        domain: 'home',
        workspaceKey: 'home',
        chatCharacterId: stamped.id,
      }),
    )
    expect(promptOf(fakeModels.main.doStreamCalls[0]!)).toContain(
      'THIS CHAT — you are 阿澈',
    )
  })

  it('思考摘要流出来：摘要逐段发 thinking.delta，开口那一刻收一帧 thinking.ms', async () => {
    fakeModels.main = scriptedModel([
      [
        { type: 'reasoning-start', id: 'r' },
        { type: 'reasoning-delta', id: 'r', delta: '**Planning the edit**\n' },
        { type: 'reasoning-delta', id: 'r', delta: 'One edit is enough.' },
        { type: 'reasoning-end', id: 'r' },
        ...textTurn('好。'),
      ],
    ])
    const events = await run(imageRequest('改一下'))
    const thinking = events.flatMap((event) =>
      event.type === 'thinking' ? [event] : [],
    )
    expect(thinking.map((event) => event.delta).filter(Boolean)).toEqual([
      '**Planning the edit**\n',
      'One edit is enough.',
    ])
    // 秒数只收一次，并且在第一个字之前。
    expect(thinking.filter((event) => event.ms !== undefined)).toHaveLength(1)
    const types = events.map((event) => event.type)
    expect(types.lastIndexOf('thinking')).toBeLessThan(
      types.indexOf('message_delta'),
    )
  })

  it('改提示词：落一步，结果接回给模型，模型说完收尾；过程记录落一行', async () => {
    fakeModels.main = scriptedModel([
      toolTurn(editPrompt),
      textTurn('改好了。'),
    ])
    const events = await run(imageRequest('把女孩换成男孩'))
    const steps = stepsOf(events)
    expect(steps.map((step) => [step.tool, step.status])).toEqual([
      ['set_prompt', 'running'],
      ['set_prompt', 'done'],
    ])
    expect(JSON.stringify(payloadOf(steps[1]!))).toContain('a boy in a garden')
    // 每次调用开口那一刻收一帧思考秒数（10-27）：工具调用前一帧、说话前一帧。
    expect(events.map((event) => event.type)).toEqual([
      'thinking',
      'step',
      'step',
      'thinking',
      'message_delta',
      'message',
      'done',
    ])
    const calls = fakeModels.main.doStreamCalls
    expect(calls).toHaveLength(2)
    // 第二次调用：前一步的整段回复原样在前，工具结果接在后面。
    expect(calls[1]!.prompt.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ])
    expect(promptOf(calls[1]!)).toContain('1. prompt —')
    const [record] = await turnRecords(user.id)
    expect(record).toMatchObject({ outcome: 'done', hops: 1 })
    expect(record!.promptVersion).toMatch(/^next-/)
  })

  it('出图：只出确认卡、停下等创作者（钱闸不变）', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({ id: 'g1', name: 'generate', input: { say: '出一张看看' } }),
    ])
    const events = await run(imageRequest('出一张'))
    expect(events.find((event) => event.type === 'confirm')).toBeTruthy()
    expect(events.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'awaiting_confirm',
    })
    // ⛔ 一张都没出：库里没有 generation。
    expect(await db.generation.count()).toBe(0)
  })

  it('同一步里改动没落下：后面的出图不出卡，让模型先改好', async () => {
    fakeModels.main = scriptedModel([
      toolTurn(
        {
          id: 'e1',
          name: 'edit',
          input: { changes: [{ op: 'prompt', mode: 'replace', text: null }] },
        },
        { id: 'g1', name: 'generate', input: { say: '出一张' } },
      ),
      textTurn('提示词没改成，先停一下。'),
    ])
    const events = await run(imageRequest('换衣服再出一张'))
    expect(events.find((event) => event.type === 'confirm')).toBeUndefined()
    expect(promptOf(fakeModels.main.doStreamCalls[1]!)).toContain(
      'Fix that edit first',
    )
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('读不懂的入参回一句哪一格不对，模型改了再来（⛔ 不判死）', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'bad',
        name: 'edit',
        input: { changes: [{ op: 'paint' }] },
      }),
      toolTurn(editPrompt),
      textTurn('好了。'),
    ])
    const events = await run(imageRequest('改一下'))
    expect(promptOf(fakeModels.main.doStreamCalls[1]!)).toContain(
      'changes.0.op',
    )
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('同一调用失败后原样再来、中间没做成任何一步：不跑，告诉模型别再试（软拦，不断回合）', async () => {
    const bad = { changes: [{ op: 'paint' }] }
    fakeModels.main = scriptedModel([
      toolTurn({ id: 'bad1', name: 'edit', input: bad }),
      toolTurn({ id: 'bad2', name: 'edit', input: bad }),
      textTurn('这一步做不了。'),
    ])
    const events = await run(imageRequest('改一下'))
    expect(promptOf(fakeModels.main.doStreamCalls[2]!)).toContain(
      'Not run: you made this exact call already',
    )
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('失败之后中间有一步做成了：同样的调用照常再跑（条件可能已经变了）', async () => {
    const bad = { changes: [{ op: 'paint' }] }
    fakeModels.main = scriptedModel([
      toolTurn({ id: 'bad1', name: 'edit', input: bad }),
      toolTurn(editPrompt),
      toolTurn({ id: 'bad2', name: 'edit', input: bad }),
      textTurn('好了。'),
    ])
    await run(imageRequest('改一下'))
    expect(promptOf(fakeModels.main.doStreamCalls[3]!)).not.toContain(
      'Not run: you made this exact call already',
    )
  })

  it('入参不是合法 JSON：只回一条结果（两条同 id 厂商会拒收），模型重发', async () => {
    fakeModels.main = scriptedModel([
      [
        {
          type: 'tool-call',
          toolCallId: 'broken',
          toolName: 'edit',
          input: '{"changes":[{"op":"prompt","text":"a "cat',
        },
        finish('tool-calls'),
      ],
      toolTurn(editPrompt),
      textTurn('好了。'),
    ])
    const events = await run(imageRequest('改一下'))
    const second = fakeModels.main.doStreamCalls[1]!.prompt
    const results = second.flatMap((message) =>
      message.role === 'tool'
        ? message.content.filter(
            (part) =>
              part.type === 'tool-result' && part.toolCallId === 'broken',
          )
        : [],
    )
    expect(results).toHaveLength(1)
    expect(JSON.stringify(results)).toContain('not a valid JSON object')
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('过了软线：存好这一轮、交接力条；下一次请求从原处接着跑', async () => {
    fakeModels.main = scriptedModel([toolTurn(editPrompt)])
    const hop1 = await run(imageRequest('把女孩换成男孩'), SOFT_NOW)
    expect(hop1.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'time_budget',
    })
    const transcript = relayOf(hop1)
    expect(transcript).toHaveLength(1)
    expect(transcript[0]).toMatchObject({ type: 'board', turn: { hop: 1 } })

    fakeModels.main = scriptedModel([textTurn('接着说完。')])
    const hop2 = await run(
      imageRequest('把女孩换成男孩', { v3: { transcript } }),
    )
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
    // 接着跑的那一次：上一跳的完整回复与工具结果都在。
    expect(
      fakeModels.main.doStreamCalls[0]!.prompt.map((message) => message.role),
    ).toEqual(['system', 'user', 'assistant', 'tool'])
    const records = await turnRecords(user.id, (rows) =>
      rows.some((row) => row.hops === 2),
    )
    expect(records.map((row) => row.hops)).toContain(2)
  })

  it.each([
    ['同一型号接着跑：思考块原样交回', undefined, true],
    [
      '接力时换了型号：旧型号的思考块先拿掉',
      LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      false,
    ],
  ] as const)('%s', async (_name, nextModel, keepsReasoning) => {
    fakeModels.main = scriptedModel([
      [
        { type: 'reasoning-start', id: 'r' },
        { type: 'reasoning-delta', id: 'r', delta: '先改提示词' },
        { type: 'reasoning-end', id: 'r' },
        ...toolTurn(editPrompt),
      ],
    ])
    const hop1 = await run(imageRequest('把女孩换成男孩'), {
      ...SOFT_NOW,
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    })
    const transcript = relayOf(hop1)

    fakeModels.main = scriptedModel([textTurn('接着说完。')])
    await run(imageRequest('把女孩换成男孩', { v3: { transcript } }), {
      routeModel: nextModel ?? LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    })
    const sent = JSON.stringify(fakeModels.main.doStreamCalls[0]!.prompt)
    expect(sent.includes('先改提示词')).toBe(keepsReasoning)
    // 改动记录（我们的工具调用与结果）两种情况都留着。
    expect(sent).toContain('"tool-result"')
  })

  it('新接法被厂商拒了（400）：整轮换成保守接法再试', async () => {
    fakeModels.main = scriptedModel([
      new APICallError({
        message: 'unknown tool type',
        url: 'https://api.test',
        requestBodyValues: {},
        statusCode: 400,
      }),
    ])
    fakeModels.fallback = scriptedModel([textTurn('好。')])
    const events = await run(imageRequest('你好'))
    expect(fakeModels.fallback.doStreamCalls).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('厂商说联网调用没有对应结果：拿掉厂商调用，同一接法重来一次', async () => {
    fakeModels.main = scriptedModel([
      new APICallError({
        message:
          'messages.1: `code_execution` tool use with id `srvtoolu_01` was found without a corresponding `code_execution_tool_result` block',
        url: 'https://api.anthropic.com/v1/messages',
        requestBodyValues: {},
        statusCode: 400,
      }),
      textTurn('好。'),
    ])
    fakeModels.fallback = scriptedModel([textTurn('不该到这里。')])
    const events = await run(imageRequest('你好'))
    expect(fakeModels.main.doStreamCalls).toHaveLength(2)
    expect(fakeModels.fallback.doStreamCalls).toHaveLength(0)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('厂商 403 额度用完：认出原因、带余额文案，点名是哪一家哪个型号', async () => {
    fakeModels.main = scriptedModel([
      new APICallError({
        message: 'Forbidden',
        url: 'https://api.x.ai/v1/responses',
        requestBodyValues: {},
        statusCode: 403,
        responseBody: JSON.stringify({
          code: 'permission-denied',
          error:
            'Your team t-1 has either used all available credits or reached its monthly spending limit.',
        }),
      }),
    ])
    await expect(
      run(imageRequest('你好'), {
        routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      }),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_INSUFFICIENT_BALANCE',
      i18nKey: 'errors.provider.insufficientBalance',
      adapterType: 'deepseek',
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    })
    const [record] = await turnRecords(user.id)
    expect(record).toMatchObject({
      outcome: 'error',
      errorCode: 'PROVIDER_INSUFFICIENT_BALANCE',
    })
  })

  it('预付额度用完（402）：记成余额不足并点名是哪一家，不是笼统的 PROVIDER_ERROR', async () => {
    fakeModels.main = scriptedModel([
      new APICallError({
        message:
          'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.',
        url: 'https://generativelanguage.googleapis.com',
        requestBodyValues: {},
        statusCode: 402,
      }),
    ])
    const error = await run(imageRequest('你好')).catch(
      (caught: { toJSON(): unknown }) => caught.toJSON(),
    )
    expect(error).toMatchObject({
      errorCode: 'PROVIDER_INSUFFICIENT_BALANCE',
      provider: { adapterType: 'deepseek' },
    })
  })

  it('认不出原因的 400（如思考块签名对不上）：照旧带厂商原话，不硬套一个码', async () => {
    const rejected = () =>
      new APICallError({
        message: 'Invalid `signature` in `thinking` block.',
        url: 'https://api.anthropic.com',
        requestBodyValues: {},
        statusCode: 400,
      })
    fakeModels.main = scriptedModel([rejected()])
    fakeModels.fallback = scriptedModel([rejected()])
    await expect(run(imageRequest('你好'))).rejects.toMatchObject({
      errorCode: 'PROVIDER_ERROR',
      message: expect.stringContaining('signature'),
    })
  })

  it('厂商自己跑的联网：时间线上一行「联网查」，结果留给模型自己读', async () => {
    fakeModels.main = scriptedModel([
      [
        {
          type: 'tool-call',
          toolCallId: 'srv_1',
          toolName: 'web_search',
          input: JSON.stringify({ query: '长离 官方设定' }),
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'srv_1',
          toolName: 'web_search',
          result: [{ url: 'https://wiki.test/changli', title: '长离' }],
        },
        {
          type: 'source',
          sourceType: 'url',
          id: 's1',
          url: 'https://wiki.test/changli',
          title: '长离',
        },
        ...textTurn('查到了。'),
      ],
    ])
    const events = await run(imageRequest('长离长什么样'))
    const steps = stepsOf(events)
    expect(steps.map((step) => [step.tool, step.status])).toEqual([
      ['search_web', 'running'],
      ['search_web', 'done'],
    ])
    expect(steps[0]!.title).toContain('长离 官方设定')
  })

  it('台上没带那一块（LoRA 台没带 LoRA）：说清做不了，⛔ 不调模型', async () => {
    const events = await run(
      imageRequest('挂上', {
        domain: 'lora',
        workspaceKey: 'lora',
        snapshot: IMAGE_SNAPSHOT,
      }),
    )
    expect(events.at(-1)).toMatchObject({ type: 'error' })
    expect(fakeModels.main.doStreamCalls).toHaveLength(0)
  })
})
