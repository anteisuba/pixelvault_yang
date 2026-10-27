import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  resolveAssistantRoute: vi.fn(),
  complete: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({
  after: () => {
    throw new Error('outside request scope')
  },
}))
vi.mock('@/lib/db', () => ({
  db: { assistantConversation: { updateMany: mocks.updateMany } },
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: mocks.resolveAssistantRoute,
}))
vi.mock('@/services/kernel/assistant-completion.service', () => ({
  completeAssistantTextWithContextRetry: mocks.complete,
}))

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

beforeEach(() => {
  mocks.updateMany.mockReset().mockResolvedValue({ count: 1 })
  mocks.resolveAssistantRoute
    .mockReset()
    .mockResolvedValue({ route: { adapterType: 'GEMINI' }, modelId: 'm' })
  mocks.complete.mockReset()
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

describe('scheduleAssistantConversationTitle', () => {
  it('⭐ 只在标题还是自动那一版时写（改过名 ⛔ 盖掉）', async () => {
    mocks.complete.mockResolvedValue('女德拉科换 NovelAI 标签台')
    scheduleAssistantConversationTitle({
      userId: 'u1',
      conversationId: 'c1',
      autoTitle: '去标签台，模型换成 NovelAI V4.5 Ful…',
      messages: MESSAGES,
    })
    await vi.waitFor(() => expect(mocks.updateMany).toHaveBeenCalled())
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'c1',
        userId: 'u1',
        title: '去标签台，模型换成 NovelAI V4.5 Ful…',
      },
      data: { title: '女德拉科换 NovelAI 标签台' },
    })
  })

  it('没配助手 key 就只记一行，⛔ 抛', async () => {
    mocks.resolveAssistantRoute.mockRejectedValue(new Error('no key'))
    scheduleAssistantConversationTitle({
      userId: 'u1',
      conversationId: 'c1',
      autoTitle: 'x',
      messages: MESSAGES,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
})
