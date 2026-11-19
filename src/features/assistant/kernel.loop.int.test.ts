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
  heldModel,
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
  landedRequest,
  relayOf,
  payloadOf,
  stepsOf,
  turnRecords,
  type KernelUser,
} from '@/test/assistant-bench/kernel-harness'
import { createTestCard } from '@/test/int/cards'
import { createTestGeneration } from '@/test/int/generations'
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
    expect(sent).toContain('HOME — the draft is the bench')
    expect(sent).toContain('THE DRAFT — what is in it right now.')
  })

  describe('有没有台（owner 11-18：去掉「聊天 / 工作」开关，只看这一条）', () => {
    /** 首页、小配方还没挂上 = 没台。 */
    const benchless = (
      message: string,
      overrides: Parameters<typeof imageRequest>[1] = {},
    ) =>
      imageRequest(message, {
        domain: 'home',
        workspaceKey: 'home',
        snapshot: { prompt: '', availableModels: [] },
        ...overrides,
      })
    const xiaoxue = async () => {
      const card = await createTestCard(user.id, {
        name: '小雪',
        persona: { identity: '图书馆管理员', speech: '说话很轻' },
      })
      await db.assistantPersona.create({
        data: { userId: user.id, characterCardId: card.id },
      })
      return card
    }

    it('⭐ 有台 + 选着角色：她的卡与干活规矩都在；改台照常落（⛔ 被拒）', async () => {
      await xiaoxue()
      fakeModels.main = scriptedModel([
        toolTurn(editPrompt),
        textTurn('改好了。'),
      ])
      const events = await run(imageRequest('把 girl 改成 boy'))
      const sent = promptOf(fakeModels.main.doStreamCalls[0]!)
      expect(sent).toContain('THE CHARACTER — you are 小雪')
      expect(sent).toContain('图书馆管理员')
      expect(sent).toContain('HOW YOU WORK')
      expect(sent).toContain('THE BENCH: THE IMAGE WORKBENCH')
      expect(sent).not.toContain('WHAT YOU CAN DO WITHOUT A BENCH')
      // 改动照常落到台上（落一步就停下等浏览器读回，同上面「改提示词」那一例）。
      expect(
        stepsOf(events).map((step) => [step.tool, step.status]),
      ).toContainEqual(['set_prompt', 'done'])
    })

    it('⭐ 有台 + 设置里关了「口吻跟角色」：她的名字与设定照带，说话方式那一段不带（⛔ 静默作废设置）', async () => {
      const card = await createTestCard(user.id, {
        name: '小雪',
        persona: {
          identity: '图书馆管理员',
          speech: '说话很轻，句尾总带个呀',
        },
      })
      await db.assistantPersona.create({
        data: {
          userId: user.id,
          characterCardId: card.id,
          toneFromCharacter: false,
        },
      })
      fakeModels.main = scriptedModel([textTurn('好。')])
      await run(imageRequest('嗨'))
      const sent = promptOf(fakeModels.main.doStreamCalls[0]!)
      expect(sent).toContain('THE CHARACTER — you are 小雪')
      expect(sent).toContain('图书馆管理员')
      expect(sent).not.toContain('句尾总带个呀')

      // 打开那一格：台上照卡上的口吻说话。
      await db.assistantPersona.update({
        where: { userId: user.id },
        data: { toneFromCharacter: true },
      })
      fakeModels.main = scriptedModel([textTurn('好呀。')])
      await run(imageRequest('嗨'))
      expect(promptOf(fakeModels.main.doStreamCalls[0]!)).toContain(
        '句尾总带个呀',
      )
    })

    it('⭐ 没台 + 选着角色：干活规矩照带；改表单 / 出图被拒，拒的那句引她自己开台（⛔ 叫人去那个台再说一遍）', async () => {
      await xiaoxue()
      fakeModels.main = scriptedModel([
        toolTurn(editPrompt, {
          id: 'g1',
          name: 'generate',
          input: { say: '出图' },
        }),
        textTurn('我去开图片台。'),
      ])
      await run(benchless('把 girl 改成 boy'))
      const sent = promptOf(fakeModels.main.doStreamCalls[0]!)
      expect(sent).toContain('THE CHARACTER — you are 小雪')
      expect(sent).toContain('HOW YOU WORK')
      expect(sent).toContain('WHAT YOU CAN DO WITHOUT A BENCH')
      expect(sent).toContain('THE PAGE: NO BENCH OPEN')
      const second = promptOf(fakeModels.main.doStreamCalls[1]!)
      expect(second).toContain('Not run: no bench is open')
      expect(second).toContain('Open the bench this belongs on yourself')
      expect(second).not.toMatch(/ask again there|聊天 \/ 工作/)
    })

    it.each([
      ['默认助手', false],
      ['选着角色', true],
    ])(
      '⭐ 没台 + %s：打标签 / 收藏 / 改设置 / 记一条照常落（⛔ 被拒）',
      async (_label, withCharacter) => {
        if (withCharacter) await xiaoxue()
        const pic = await createTestGeneration(user.id, {
          seq: 1601,
          url: 'https://cdn.test/1601.png',
          outputType: 'IMAGE',
          snapshot: {},
        })
        fakeModels.main = scriptedModel([
          toolTurn({
            id: 'e1',
            name: 'edit',
            input: {
              changes: [
                { op: 'tag_pictures', pictures: ['图_1601'], tags: ['冬装'] },
                { op: 'favorite_pictures', pictures: ['图_1601'] },
                { op: 'assistant_setting', key: 'Verbosity', value: 'concise' },
                { op: 'remember', text: '喜欢冷色调' },
              ],
            },
          }),
          textTurn('都弄好了。'),
        ])
        await run(
          benchless('给图_1601 打上冬装、收藏，回答简短点，记住我喜欢冷色调'),
        )
        const second = promptOf(fakeModels.main.doStreamCalls[1]!)
        expect(second).not.toContain('Not run: no bench is open')
        const row = await db.generation.findUniqueOrThrow({
          where: { id: pic.id },
        })
        expect((row.snapshot as { tags?: string[] } | null)?.tags).toEqual([
          '冬装',
        ])
        expect(
          (
            await db.assistantPersona.findUniqueOrThrow({
              where: { userId: user.id },
            })
          ).verbosity,
        ).toBe('concise')
        expect(
          (
            await db.assistantMemory.findMany({ where: { userId: user.id } })
          ).map((memory) => memory.text),
        ).toContain('喜欢冷色调')
      },
    )

    it('⭐ 没台说「帮我把比例改成 16:9」：她开图片台（bench_open 接力），到了那一跳在台上改成 —— ⛔ 让人重说', async () => {
      fakeModels.main = scriptedModel([
        toolTurn({ id: 'o1', name: 'open', input: { bench: 'image' } }),
      ])
      const hop1 = await run(benchless('帮我把比例改成 16:9'))
      expect(hop1.at(-1)).toMatchObject({
        type: 'stopped',
        reason: 'bench_open',
        open: { workspace: 'image-natural' },
      })

      // 浏览器换好台、带着接力条自动续跳（同一句话，⛔ 创作者重说）。
      fakeModels.main = scriptedModel([
        toolTurn({
          id: 'e1',
          name: 'edit',
          input: { changes: [{ op: 'specs', aspectRatio: '16:9' }] },
        }),
      ])
      const hop2 = await run(
        imageRequest('帮我把比例改成 16:9', {
          v3: { transcript: relayOf(hop1) },
        } as Parameters<typeof imageRequest>[1]),
      )
      expect(promptOf(fakeModels.main.doStreamCalls[0]!)).toContain(
        'Opened the image bench',
      )
      expect(hop2.at(-1)).toMatchObject({
        type: 'stopped',
        reason: 'bench_sync',
      })
      const steps = stepsOf(hop2)
      expect(steps.some((step) => step.status === 'error')).toBe(false)
      expect(JSON.stringify(steps.map(payloadOf))).toContain('16:9')
    })

    it('会话盖过章的旧聊天（chatCharacterId）照它自己的角色；旧客户端带着 chatMode 也照常跑、一律忽略', async () => {
      await xiaoxue()
      const stamped = await createTestCard(user.id, {
        name: '阿澈',
        persona: { identity: '剑道部部长', speech: '说话直接' },
      })
      fakeModels.main = scriptedModel([textTurn('嗯。')])
      await run(benchless('嗨', { chatCharacterId: stamped.id }))
      expect(promptOf(fakeModels.main.doStreamCalls[0]!)).toContain(
        'THE CHARACTER — you are 阿澈',
      )

      // 旧客户端：台上还带着 chatMode「chat」—— 不 400，也不因此收掉干活的工具。
      fakeModels.main = scriptedModel([textTurn('好。')])
      const events = await run(
        imageRequest('改一下', {
          chatMode: 'chat',
        } as Parameters<typeof imageRequest>[1]),
      )
      expect(events.at(-1)).toMatchObject({ type: 'done' })
      expect(promptOf(fakeModels.main.doStreamCalls[0]!)).toContain(
        'HOW YOU WORK',
      )
    })
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

  it('「我的想法」（11-17）：原生思考摘要一句一帧发 thought，⛔ 进正文；系统提示不再教手写 <thought>', async () => {
    fakeModels.main = scriptedModel([
      [
        { type: 'reasoning-start', id: 'r' },
        {
          type: 'reasoning-delta',
          id: 'r',
          delta: '**Planning the edit**\n\n',
        },
        {
          type: 'reasoning-delta',
          id: 'r',
          delta: '台上是雨天那张，只动环境。\n',
        },
        { type: 'reasoning-delta', id: 'r', delta: '没写完的一句' },
        { type: 'reasoning-end', id: 'r' },
        ...textTurn('改好了。'),
      ],
    ])
    const events = await run(imageRequest('改成夜景'))
    expect(
      events.flatMap((event) => (event.type === 'thought' ? [event.line] : [])),
    ).toEqual([
      '**Planning the edit** 台上是雨天那张，只动环境。',
      '没写完的一句',
    ])
    const deltas = events
      .flatMap((event) => (event.type === 'message_delta' ? [event.delta] : []))
      .join('')
    expect(deltas).toBe('改好了。')
    expect(events.find((event) => event.type === 'message')).toMatchObject({
      text: '改好了。',
    })
    expect(promptOf(fakeModels.main.doStreamCalls[0]!)).not.toContain(
      '<thought>',
    )
  })

  it('「我的想法」：没有原生思考的接法什么都不出；正文里的字原样是正文', async () => {
    fakeModels.main = scriptedModel([textTurn('改好了。')])
    const events = await run(imageRequest('改成夜景'))
    expect(events.some((event) => event.type === 'thought')).toBe(false)
  })

  it('改提示词：落一步就停下等浏览器落（bench_sync）；落完那一跳带读回接给模型，模型说完收尾', async () => {
    fakeModels.main = scriptedModel([
      toolTurn(editPrompt),
      textTurn('改好了。'),
    ])
    const request = imageRequest('把女孩换成男孩')
    const hop1 = await run(request)
    const steps = stepsOf(hop1)
    expect(steps.map((step) => [step.tool, step.status])).toEqual([
      ['set_prompt', 'running'],
      ['set_prompt', 'done'],
    ])
    expect(JSON.stringify(payloadOf(steps[1]!))).toContain('a boy in a garden')
    // ⭐ 11-18 改完读回：改了表单就交接力条停下，⛔ 不当场按服务端那份说「改好了」。
    expect(hop1.map((event) => event.type)).toEqual([
      'thinking',
      'step',
      'step',
      'transcript',
      'stopped',
    ])
    expect(hop1.at(-1)).toMatchObject({ reason: 'bench_sync' })
    expect(fakeModels.main.doStreamCalls).toHaveLength(1)

    const hop2 = await run(
      landedRequest(hop1, request, { prompt: 'a boy in a garden' }),
    )
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
    const calls = fakeModels.main.doStreamCalls
    expect(calls).toHaveLength(2)
    // 第二次调用：前一步的整段回复原样在前，工具结果（含读回）接在后面。
    expect(calls[1]!.prompt.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ])
    const sent = promptOf(calls[1]!)
    expect(sent).toContain('1. prompt —')
    expect(sent).toContain('READ BACK FROM THE BENCH')
    expect(sent).toContain('everything landed as requested')
    const records = await turnRecords(user.id, (rows) =>
      rows.some((row) => row.hops === 2),
    )
    expect(records[0]).toMatchObject({ outcome: 'done', hops: 2 })
    expect(records[0]!.promptVersion).toMatch(/^next-/)
  })

  it('⭐ 落完台上没变（11-18 真机 16:9 → 仍 1:1）：读回写「请求 X，实际 Y」，⛔ 不说改好了', async () => {
    fakeModels.main = scriptedModel([
      toolTurn(editPrompt),
      textTurn('没改成。'),
    ])
    const request = imageRequest('把女孩换成男孩')
    const hop1 = await run(request)
    // 浏览器那头落下之后，表单上的提示词还是原样。
    await run(landedRequest(hop1, request))
    const sent = promptOf(fakeModels.main.doStreamCalls[1]!)
    expect(sent).toMatch(/prompt: NOT CHANGED AS ASKED — requested .*boy/)
    expect(sent).toContain('actually a girl in a garden')
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

  it('11-18 真机「比例 7:3、9 张、写提示词，准备生成」：要的值被拒，接力那一跳照样不出确认卡、她先讲清再问', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'e1',
        name: 'edit',
        input: {
          changes: [
            { op: 'prompt', mode: 'replace', text: '一只橘猫跳上窗台' },
            { op: 'specs', aspectRatio: '7:3' },
            { op: 'count', count: 9 },
          ],
        },
      }),
      toolTurn({ id: 'g1', name: 'generate', input: { say: '出图' } }),
      textTurn(
        '比例要 7:3 没改成，仍是 1:1，可选 1:1、16:9；张数要 9 也没改成，仍是 1 张，可选 1、2、4。按哪个来？',
      ),
    ])
    const request = imageRequest(
      '把比例改成 7:3，张数改成 9 张，提示词写『一只橘猫跳上窗台』。然后准备生成，我要先看确认卡。',
    )
    const hop1 = await run(request)
    expect(hop1.at(-1)).toMatchObject({ type: 'stopped', reason: 'bench_sync' })
    // 被拒的两步带着「哪一格 · 要的 · 仍是 · 可选」（面板按它逐条写）。
    const refused = stepsOf(hop1).flatMap((step) =>
      step.status === 'error' && step.error.value ? [step.error.value] : [],
    )
    expect(refused.map((value) => value.field)).toEqual([
      'aspectRatio',
      'count',
    ])

    const hop2 = await run(
      landedRequest(hop1, request, { prompt: '一只橘猫跳上窗台' }),
    )
    // ⭐ 确定性的闸：接力那一跳的 generate 不出卡，回合以她那句话收尾。
    expect(hop2.find((event) => event.type === 'confirm')).toBeUndefined()
    expect(promptOf(fakeModels.main.doStreamCalls[2]!)).toContain(
      'did not land on the bench',
    )
    expect(
      hop2.some(
        (event) => event.type === 'message' && event.text.includes('按哪个来'),
      ),
    ).toBe(true)
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
  })

  it('改的都落成了：接力那一跳照常出确认卡', async () => {
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'e1',
        name: 'edit',
        input: { changes: [{ op: 'count', count: 2 }] },
      }),
      toolTurn({ id: 'g1', name: 'generate', input: { say: '出图' } }),
    ])
    const request = imageRequest('张数改成 2，然后出图')
    const hop1 = await run(request)
    const hop2 = await run(
      landedRequest(hop1, request, {
        count: { value: 2, options: [1, 2, 4] },
      }),
    )
    expect(hop2.find((event) => event.type === 'confirm')).toBeTruthy()
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
    // 改对了那一次落了表单 → 停下等浏览器落（读回见上一条）。
    expect(events.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'bench_sync',
    })
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
    const request = imageRequest('改一下')
    const hop1 = await run(request)
    // 做成的那一步落了表单 → 停一跳等浏览器落，再接着跑。
    await run(landedRequest(hop1, request, { prompt: 'a boy in a garden' }))
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
    expect(events.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'bench_sync',
    })
  })

  /** 这一次调用报 `inputTokens` 这么多（假模型默认只报 10）。 */
  const costing = (
    parts: ReturnType<typeof toolTurn>,
    inputTokens: number,
  ): ReturnType<typeof toolTurn> => {
    const last = parts.at(-1)!
    return [
      ...parts.slice(0, -1),
      {
        ...last,
        ...(last.type === 'finish'
          ? {
              usage: {
                inputTokens: {
                  total: inputTokens,
                  noCache: inputTokens,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: { total: 5, text: 5, reasoning: undefined },
              },
            }
          : {}),
      },
    ]
  }

  it('⭐ 花费上限（owner 11-10）：这一轮输入 token 到顶就停在下一步之前，亮「继续」，⛔ 不再调模型', async () => {
    fakeModels.main = scriptedModel([
      costing(toolTurn(editPrompt), 1_000_000),
      textTurn('不该走到这里。'),
    ])
    const request = imageRequest('把女孩换成男孩')
    const hop1 = await run(request)
    // 改了表单先停一跳等浏览器落（11-18）；落完那一跳在调模型之前就撞上限。
    expect(hop1.at(-1)).toMatchObject({ reason: 'bench_sync' })
    const events = await run(
      landedRequest(hop1, request, { prompt: 'a boy in a garden' }),
    )
    expect(events.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'token_budget',
    })
    expect(fakeModels.main.doStreamCalls).toHaveLength(1)
    // 已经做完的那一步留着。
    expect(stepsOf(hop1).some((step) => step.status === 'done')).toBe(true)
    const records = await turnRecords(user.id, (rows) =>
      rows.some((row) => row.outcome === 'token_budget'),
    )
    expect(records.map((row) => row.outcome)).toContain('token_budget')
  })

  it('接力的各跳算同一轮：上一跳用掉的 token 跟着接力条带过去', async () => {
    fakeModels.main = scriptedModel([costing(toolTurn(editPrompt), 600_000)])
    const request = imageRequest('把女孩换成男孩')
    const hop1 = await run(request, SOFT_NOW)
    // 改了表单那一步先停在 bench_sync（11-18），一样是接力。
    expect(hop1.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'bench_sync',
    })

    fakeModels.main = scriptedModel([
      // 这一跳的调用不落表单（读不懂的入参），走完它才轮到下一步之前那道上限。
      costing(
        toolTurn({
          id: 'call_2',
          name: 'edit',
          input: { changes: [{ op: 'paint' }] },
        }),
        600_000,
      ),
      textTurn('不该走到这里。'),
    ])
    const hop2 = await run(
      landedRequest(hop1, request, { prompt: 'a boy in a garden' }),
    )
    expect(hop2.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'token_budget',
    })
    expect(fakeModels.main.doStreamCalls).toHaveLength(1)
  })

  it('过了软线：存好这一轮、交接力条；下一次请求从原处接着跑', async () => {
    // ⚠ 用一次不落表单的调用（读不懂的入参）：落表单的 edit 会先停在 bench_sync（11-18）。
    fakeModels.main = scriptedModel([
      toolTurn({
        id: 'bad',
        name: 'edit',
        input: { changes: [{ op: 'paint' }] },
      }),
    ])
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

  it('到了我们自己的时间预算硬线、一步都没跑完：报「时间预算用完」，不说成厂商超时', async () => {
    const held = heldModel([], textTurn('太晚了。'))
    fakeModels.main = held.model
    const pending = run(imageRequest('你好'), {
      timeBudget: { softMs: 0, hardMs: 50 },
    })
    await expect(pending).rejects.toMatchObject({
      errorCode: 'ASSISTANT_TIME_BUDGET_EXHAUSTED',
      i18nKey: 'errors.assistant.timeBudgetExhausted',
    })
    held.release()
  })

  // 11-05 owner：「AI 提供商超时」不准确，要说清原因。下面三种原先都会落成那一句或「暂时不可用」。
  it('厂商 / 网关自己超时（504）：记成厂商那边超时并点名是哪一家，不是「暂时不可用」', async () => {
    fakeModels.main = scriptedModel([
      new APICallError({
        message: 'Gateway Timeout',
        url: 'https://api.test',
        requestBodyValues: {},
        statusCode: 504,
        isRetryable: false,
      }),
    ])
    const error = await run(imageRequest('你好')).catch(
      (caught: { toJSON(): unknown }) => caught.toJSON(),
    )
    expect(error).toMatchObject({
      errorCode: 'PROVIDER_UPSTREAM_TIMEOUT',
      provider: { adapterType: 'deepseek' },
    })
  })

  it('连不上 / 连接中途断：记成「连接断了」并点名是哪一家，不是「AI 提供商超时」', async () => {
    fakeModels.main = scriptedModel([
      new APICallError({
        message: 'Cannot connect to API: other side closed',
        url: 'https://api.test',
        requestBodyValues: {},
        isRetryable: false,
        cause: { code: 'UND_ERR_SOCKET' },
      }),
    ])
    const error = await run(imageRequest('你好')).catch(
      (caught: { toJSON(): unknown }) => caught.toJSON(),
    )
    expect(error).toMatchObject({
      errorCode: 'PROVIDER_UNREACHABLE',
      provider: { adapterType: 'deepseek' },
    })
  })

  it('流里厂商原话写着超时（没状态码）：记成厂商那边超时', async () => {
    fakeModels.main = scriptedModel([new Error('upstream request timed out')])
    const error = await run(imageRequest('你好')).catch(
      (caught: { toJSON(): unknown }) => caught.toJSON(),
    )
    expect(error).toMatchObject({
      errorCode: 'PROVIDER_UPSTREAM_TIMEOUT',
      provider: { adapterType: 'deepseek' },
    })
  })

  // 11-19：上面几条都设了 `isRetryable: false`，绕开了 SDK 自己的重发；真实的 503 / 429 是可重发的，
  // 连发三次失败后 SDK 包成没状态码的 `RetryError`，原先一律落成「AI 提供商错误」。
  it('可重发的 503 连发三次都失败（SDK 包成 RetryError）：认出「暂时不可用」，不是笼统的 PROVIDER_ERROR', async () => {
    const overloaded = () =>
      new APICallError({
        message: 'The model is overloaded. Please try again later.',
        url: 'https://generativelanguage.googleapis.com',
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
        // 不等 2 + 4 秒退避（SDK 认 retry-after-ms）。
        responseHeaders: { 'retry-after-ms': '0' },
      })
    fakeModels.main = scriptedModel([overloaded(), overloaded(), overloaded()])
    const error = await run(imageRequest('你好')).catch(
      (caught: { toJSON(): unknown }) => caught.toJSON(),
    )
    expect(fakeModels.main.doStreamCalls).toHaveLength(3)
    expect(error).toMatchObject({
      errorCode: 'PROVIDER_TRANSIENT',
      provider: { adapterType: 'deepseek' },
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

  it('厂商自己联网 / 在想时很久一个分片都没有：⛔ 不掐、不重问，等它说完（owner 11-05）', async () => {
    // 11-05：让角色去推特查热点，第二轮联网流静默过 90 秒被看门狗掐、原样重问又被掐 →「AI 提供商超时」。
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    const held = heldModel(
      [
        {
          type: 'tool-call',
          toolCallId: 'srv_1',
          toolName: 'web_search',
          input: JSON.stringify({ query: '日本 年轻人 今日 热点' }),
          providerExecuted: true,
        },
      ],
      [
        {
          type: 'tool-result',
          toolCallId: 'srv_1',
          toolName: 'web_search',
          result: [{ url: 'https://x.test/trend', title: '热点' }],
        },
        ...textTurn('查到了。'),
      ],
    )
    fakeModels.main = held.model
    const pending = run(imageRequest('去推特看看今天的热点'))
    await held.started
    await vi.advanceTimersByTimeAsync(200_000)
    held.release()
    const events = await pending

    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(events.some((event) => event.type === 'error')).toBe(false)
    expect(held.model.doStreamCalls).toHaveLength(1)
    expect(stepsOf(events).map((step) => [step.tool, step.status])).toEqual([
      ['search_web', 'running'],
      ['search_web', 'done'],
    ])
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
