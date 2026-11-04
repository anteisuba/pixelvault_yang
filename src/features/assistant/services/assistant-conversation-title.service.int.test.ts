import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLlm = vi.fn()
/** `after(fn)` 收下的活：用例里 `settle()` 等它们跑完（就像响应发完之后）。 */
const afterWork = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }))

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({
  after: (fn: () => Promise<unknown>) => {
    afterWork.pending.push(fn())
  },
}))

async function settle() {
  while (afterWork.pending.length)
    await Promise.all(afterWork.pending.splice(0))
}
/** 起标题那一次模型调用只在边界上假；助手路由、会话行都是真库（L2a）。 */
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...args: unknown[]) => mockLlm(...args),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { plainKeyOf, seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestUser, resetDatabase } from '@/test/int/db'
import {
  assistantConversationTitleMaterial,
  normalizeAssistantConversationTitle,
  scheduleAssistantConversationTitle,
} from './assistant-conversation-title.service'

const MESSAGES = [
  {
    role: 'user' as const,
    content: '去标签台，模型换成 NovelAI V4.5 Full，从我素材库里找一张最近的',
  },
  { role: 'assistant' as const, content: '' },
  {
    role: 'assistant' as const,
    content: '换好了，挂上了素材库里最新那张女德拉科。',
  },
]

const AUTO_TITLE = '去标签台，模型换成 NovelAI V4.5 Ful…'

async function setup(options: { withKey?: boolean; title?: string } = {}) {
  const user = await createTestUser()
  if (options.withKey !== false)
    await seedAssistantKeys(user.id, {
      keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI }],
    })
  const conversation = await db.assistantConversation.create({
    data: {
      userId: user.id,
      surface: 'IMAGE_STUDIO',
      title: options.title ?? AUTO_TITLE,
      messages: [],
    },
  })
  const titleNow = async () =>
    (
      await db.assistantConversation.findUniqueOrThrow({
        where: { id: conversation.id },
      })
    ).title
  return { user, conversation, titleNow }
}

beforeEach(async () => {
  mockLlm.mockReset()
  await resetDatabase()
})

describe('assistantConversationTitleMaterial', () => {
  it('第一句 + 第一段有字的回复', () => {
    expect(assistantConversationTitleMaterial(MESSAGES)).toBe(
      'CREATOR: 去标签台，模型换成 NovelAI V4.5 Full，从我素材库里找一张最近的\n\nASSISTANT: 换好了，挂上了素材库里最新那张女德拉科。',
    )
  })

  it('没有用户那一句就不起', () => {
    expect(
      assistantConversationTitleMaterial([
        { role: 'assistant', content: 'hi' },
      ]),
    ).toBeNull()
  })
})

describe('normalizeAssistantConversationTitle', () => {
  it('去前缀、引号、句末标点，只取第一行', () => {
    expect(
      normalizeAssistantConversationTitle(
        '标题：「女德拉科换 NovelAI」。\n多余',
      ),
    ).toBe('女德拉科换 NovelAI')
  })

  it('超长截掉，⛔ 带「…」', () => {
    const title = normalizeAssistantConversationTitle('一'.repeat(40))
    expect(title).toBe('一'.repeat(24))
  })

  it('空回复不算', () => {
    expect(normalizeAssistantConversationTitle('  \n ')).toBeNull()
  })
})

describe('scheduleAssistantConversationTitle（真库）', () => {
  it('⭐ 标题还是自动那一版：换成起好的标题，用的是助手那一家那把 key', async () => {
    const { user, conversation, titleNow } = await setup()
    mockLlm.mockResolvedValue('女德拉科换 NovelAI 标签台')

    scheduleAssistantConversationTitle({
      userId: user.id,
      conversationId: conversation.id,
      autoTitle: AUTO_TITLE,
      messages: MESSAGES,
    })

    await settle()
    expect(await titleNow()).toBe('女德拉科换 NovelAI 标签台')
    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: plainKeyOf(AI_ADAPTER_TYPES.GEMINI),
      }),
    )
  })

  it('⭐ 创作者已经改过名：⛔ 盖掉', async () => {
    const { user, conversation, titleNow } = await setup({
      title: '我自己起的名字',
    })
    mockLlm.mockResolvedValue('女德拉科换 NovelAI 标签台')

    scheduleAssistantConversationTitle({
      userId: user.id,
      conversationId: conversation.id,
      autoTitle: AUTO_TITLE,
      messages: MESSAGES,
    })

    await settle()
    expect(mockLlm).toHaveBeenCalled()
    expect(await titleNow()).toBe('我自己起的名字')
  })

  it('别人的会话：⛔ 写', async () => {
    const { conversation, titleNow } = await setup()
    const stranger = await createTestUser()
    await seedAssistantKeys(stranger.id, {
      keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI, id: 'stranger-key' }],
    })
    mockLlm.mockResolvedValue('偷改的标题')

    scheduleAssistantConversationTitle({
      userId: stranger.id,
      conversationId: conversation.id,
      autoTitle: AUTO_TITLE,
      messages: MESSAGES,
    })

    await settle()
    expect(mockLlm).toHaveBeenCalled()
    expect(await titleNow()).toBe(AUTO_TITLE)
  })

  it('没配助手 key 就只记一行，⛔ 抛、⛔ 调模型、标题不动', async () => {
    const { user, conversation, titleNow } = await setup({ withKey: false })

    scheduleAssistantConversationTitle({
      userId: user.id,
      conversationId: conversation.id,
      autoTitle: AUTO_TITLE,
      messages: MESSAGES,
    })

    await settle()
    expect(mockLlm).not.toHaveBeenCalled()
    expect(await titleNow()).toBe(AUTO_TITLE)
  })
})
