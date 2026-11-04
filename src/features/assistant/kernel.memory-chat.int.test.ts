/**
 * 新内核：记忆、之前几轮的摘要、和角色聊天、「/」点名的技能（第 6 步）。
 * 真库（L2a）：记忆、会话摘要、角色卡、日记、技能都是库里的行；只假模型那一头
 * （主模型见 `fake-model.ts`；聊天前想的那一步与后台摘要走 `llmTextCompletion`）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
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
const sideModel = vi.hoisted(() => ({
  /** 聊天前想的那一步回什么（`null` = 没想出来）。 */
  chatPlan: null as unknown,
  calls: [] as { purpose?: string; systemPrompt: string }[],
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: async (input: {
    purpose?: string
    systemPrompt: string
  }) => {
    sideModel.calls.push(input)
    if (input.purpose === 'character-chat-mood') {
      if (!sideModel.chatPlan) throw new Error('no plan')
      return JSON.stringify(sideModel.chatPlan)
    }
    if (input.systemPrompt.includes('These messages are leaving her view'))
      return JSON.stringify({
        decisions: ['他说起了冬天的图书馆'],
        preferences: [],
        openItems: [],
        names: [],
      })
    return '{}'
  },
}))

import { after } from 'next/server'

import { db } from '@/lib/db'
import { assistantV3TurnFingerprint } from '@/lib/assistant-v3-history'
import {
  fakeModels,
  promptOf,
  resetFakeModels,
  scriptedModel,
  textTurn,
} from '@/test/assistant-bench/fake-model'
import {
  collect,
  imageRequest,
  kernelUser,
  type KernelUser,
} from '@/test/assistant-bench/kernel-harness'
import { createTestCard } from '@/test/int/cards'
import { resetDatabase } from '@/test/int/db'

import { runAssistantNext } from './kernel'

let user: KernelUser

beforeEach(async () => {
  await resetDatabase()
  resetFakeModels()
  vi.mocked(after).mockClear()
  sideModel.chatPlan = null
  sideModel.calls = []
  user = await kernelUser()
})

const run = (request: Parameters<typeof runAssistantNext>[1]) =>
  collect(runAssistantNext(user.clerkId, request))

const sentPrompt = () => promptOf(fakeModels.main.doStreamCalls[0]!)

/** 响应发完之后排队的那几件，一件一件跑完（假模型回什么见上面）。 */
async function runAfterTasks() {
  for (const [task] of vi.mocked(after).mock.calls)
    if (typeof task === 'function') await task()
}

function memory(text: string, characterCardId: string | null = null) {
  return db.assistantMemory.create({
    data: {
      userId: user.id,
      scope: 'GLOBAL',
      kind: 'PREFERENCE',
      source: 'ASSISTANT',
      text,
      characterCardId,
    },
  })
}

async function malfoyCard() {
  const card = await createTestCard(user.id, {
    name: '马尔福',
    persona: {
      identity: '斯莱特林的学生',
      behavior: '嘴硬心软',
      speech: '说话带点傲慢。偶尔叫你「笨蛋」。',
      boundaries: '不会当着别人面道谢',
      learnedPhrases: ['摸鱼', '绝了'],
      relationship: '叫你「波特」，嘴上嫌弃其实很在意',
      scenario: '图书馆的午后',
      examples: [{ user: '', reply: '哼，别以为我会谢你。' }],
    },
  })
  await db.characterJournal.create({
    data: {
      userId: user.id,
      characterCardId: card.id,
      text: '今天他又来借书，我假装没看见。',
    },
  })
  return card
}

describe('记忆与之前几轮（第 6 步）', () => {
  it('「关于你」那几条带编号进系统提示；隐身一条都不读', async () => {
    const row = await memory('人物图默认 3:4')
    fakeModels.main = scriptedModel([textTurn('好。')])
    await run(imageRequest('出一张人物'))
    expect(sentPrompt()).toContain(
      `[记忆·${row.id.slice(0, 8)}] 人物图默认 3:4`,
    )

    fakeModels.main = scriptedModel([textTurn('好。')])
    await run(imageRequest('出一张人物', { incognito: true }))
    expect(sentPrompt()).not.toContain('人物图默认 3:4')
  })

  it('滑出去的那几轮：摘要接在系统提示里，管过的那一轮不再原样发', async () => {
    const first = [
      { role: 'user' as const, content: '主角是马尔福，冬装' },
      { role: 'assistant' as const, content: '记住了。' },
    ]
    const conversation = await db.assistantConversation.create({
      data: {
        userId: user.id,
        surface: 'IMAGE_STUDIO',
        title: '马尔福',
        messages: [],
        historySummary: [
          {
            through: assistantV3TurnFingerprint(first),
            turns: 1,
            decisions: ['主角是马尔福、冬装'],
            preferences: [],
            openItems: [],
            names: [],
          },
        ],
      },
    })
    fakeModels.main = scriptedModel([textTurn('好。')])
    await run(
      imageRequest('再来一张', {
        conversationId: conversation.id,
        messages: [
          ...first,
          { role: 'user', content: '换个背景' },
          { role: 'assistant', content: '换成雪地了。' },
          { role: 'user', content: '再来一张' },
        ],
      }),
    )
    const prompt = sentPrompt()
    expect(prompt).toContain('EARLIER IN THIS CONVERSATION')
    expect(prompt).toContain('主角是马尔福、冬装')
    expect(prompt).not.toContain('主角是马尔福，冬装')
    expect(prompt).toContain('换成雪地了。')
  })

  it('和角色聊天：自己的系统提示、角色卡打头、记忆读她那份、故事向摘要、每轮末尾一句别出戏', async () => {
    const card = await malfoyCard()
    const other = await createTestCard(user.id, {
      name: '小雪',
      persona: { identity: '图书馆管理员' },
    })
    await memory('他怕冷', card.id)
    await memory('她喜欢猫', other.id)
    sideModel.chatPlan = {
      mood: '别扭',
      intensity: 2,
      why: '他突然跑来打招呼',
      stance: '嘴上嫌弃',
      reply: 'full',
    }
    // 聊得够久：最早那几条滑出窗口，后台按故事补一份摘要。
    const earlier = Array.from({ length: 24 }, (_, index) => [
      { role: 'user' as const, content: `第 ${index + 1} 句` },
      { role: 'assistant' as const, content: `回第 ${index + 1} 句` },
    ]).flat()
    const conversation = await db.assistantConversation.create({
      data: {
        userId: user.id,
        surface: 'HOME',
        title: '和马尔福',
        messages: [],
      },
    })
    fakeModels.main = scriptedModel([textTurn('哼，又是你。')])
    const events = await run(
      imageRequest('你好呀', {
        conversationId: conversation.id,
        chatCharacterId: card.id,
        chatVoice: { expressive: false },
        messages: [...earlier, { role: 'user', content: '你好呀' }],
      }),
    )
    // ②c-2：她说的那几段带记号，界面拆成气泡。
    const said = events.filter(
      (event) => event.type === 'message' || event.type === 'message_delta',
    )
    expect(said.length).toBeGreaterThan(0)
    expect(
      said.every(
        (event) =>
          'chat' in event && event.chat && 'spoken' in event && event.spoken,
      ),
    ).toBe(true)
    const prompt = sentPrompt()
    expect(prompt).toContain('you are them, talking the way they really talk')
    expect(prompt).not.toContain('STAY IN CHARACTER')
    expect(prompt).not.toContain("You are ANTEI's creative assistant")
    expect(prompt.indexOf('THIS CHAT — you are 马尔福')).toBeLessThan(
      prompt.indexOf("THIS CREATOR'S SETTINGS"),
    )
    expect(prompt).toContain('图书馆的午后')
    // C：她自己写的关系和最近一篇日记跟着聊天走。
    expect(prompt).toContain('叫你「波特」，嘴上嫌弃其实很在意')
    expect(prompt).toContain('「今天他又来借书，我假装没看见。」')
    expect(prompt).toContain('(You are 马尔福 — 说话带点傲慢。')
    // 示例对白不再跟着提醒走（10-26：英文示例把中文聊天带成英文、照着示例说）。
    expect(prompt).not.toContain('You sound like')
    expect(prompt).toContain(
      'Answer what the creator just said, in the language they wrote it in — only the words you would send, no actions or narration.',
    )
    expect(prompt).toContain(
      "What you won't do, and your flaws: 不会当着别人面道谢",
    )
    // 10-31 三层：回之前想的那一步（心情、怎么对你）跟着提醒走；她不用讨好你。
    expect(prompt).toContain(
      'Right now you feel 别扭 (他突然跑来打招呼) — let it show in how you answer, never say it. How you take this message: 嘴上嫌弃.',
    )
    expect(prompt).toContain('you are not here to keep the creator happy')
    // F：学到的说法在卡上、像发消息一样一行一个气泡。
    expect(prompt).toContain(
      "Words you've picked up from the creator: 「摸鱼」 「绝了」",
    )
    expect(prompt).toContain('one line is one message bubble')
    // 开着声音：方括号语气提示的写法进这一轮（10-26 换内核后丢了，念出来没情绪）。
    expect(prompt).toContain('HOW YOUR VOICE SOUNDS')
    expect(prompt).toContain('[laughing]')
    // 记忆读她那份，⛔ 别的角色那份。
    expect(prompt).toContain('他怕冷')
    expect(prompt).not.toContain('她喜欢猫')

    // 后台那一跳按故事写摘要，存在会话上。
    await runAfterTasks()
    const stored = await db.assistantConversation.findUniqueOrThrow({
      where: { id: conversation.id },
      select: { historySummary: true },
    })
    expect(JSON.stringify(stored.historySummary)).toContain(
      '他说起了冬天的图书馆',
    )
  })

  it('她决定不回（10-31 三层）：⛔ 调主模型、⛔ 发任何字，只收尾', async () => {
    const card = await malfoyCard()
    sideModel.chatPlan = {
      mood: '生气',
      intensity: 3,
      why: '他拿我和别人比',
      stance: '不理他',
      reply: 'none',
    }
    fakeModels.main = scriptedModel([textTurn('不该出现')])
    const events = await run(
      imageRequest('别不理我啊', { chatCharacterId: card.id }),
    )
    expect(
      sideModel.calls.some((call) => call.purpose === 'character-chat-mood'),
    ).toBe(true)
    expect(fakeModels.main.doStreamCalls).toHaveLength(0)
    expect(
      events.some(
        (event) => event.type === 'message' || event.type === 'message_delta',
      ),
    ).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('「/」点名的技能：全文进这一轮的消息；关掉的内置在设置那段点名', async () => {
    await db.assistantSkill.createMany({
      data: [
        {
          userId: user.id,
          name: '冬装三视图',
          description: '冬装角色出三视图',
          body: '三视图一律白底，正侧背。',
        },
        {
          userId: user.id,
          name: '参考图分工',
          description: '',
          builtinSlug: 'reference-roles',
          enabled: false,
        },
      ],
    })
    fakeModels.main = scriptedModel([textTurn('好。')])
    await run(imageRequest('/冬装三视图 马尔福'))
    const prompt = sentPrompt()
    expect(prompt).toContain('THE CREATOR CALLED THIS SKILL WITH /冬装三视图')
    expect(prompt).toContain('三视图一律白底，正侧背。')
    expect(prompt).toContain('what they wrote after it: 马尔福')
    expect(prompt).toContain(
      'SKILLS THE CREATOR TURNED OFF — do not read these: 技能·参考图分工',
    )
    expect(prompt).not.toContain('- 技能·冬装三视图')
  })
})
