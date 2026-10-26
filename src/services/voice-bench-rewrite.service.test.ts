import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  llmTextCompletion: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { assistantPersona: { findUnique: mocks.findUnique } },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: vi.fn(async () => ({
    route: { adapterType: 'deepseek', apiKey: 'k', providerConfig: {} },
    modelId: 'deepseek-chat',
  })),
}))
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: mocks.llmTextCompletion,
}))

import {
  cleanRewrittenLines,
  rewriteAsPersona,
} from './voice-bench-rewrite.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('配音台「按她说」（③-2a）', () => {
  it('用她的卡改写：说法、学到的话进提示，回来的几行清干净', async () => {
    mocks.findUnique.mockResolvedValue({
      characterCard: {
        name: '晴',
        isDeleted: false,
        persona: { speech: '说话软软的，爱用「呢」', learnedPhrases: ['绝了'] },
      },
    })
    mocks.llmTextCompletion.mockResolvedValue(
      '1. 「欢迎来到图书馆呢。」\n\n2. [whispering] 嘘，小声点呢\n',
    )
    await expect(
      rewriteAsPersona('clerk-1', {
        text: '欢迎来到图书馆。\n[whispering] 嘘，小声点',
      }),
    ).resolves.toEqual({
      text: '欢迎来到图书馆呢。\n[whispering] 嘘，小声点呢',
    })
    const call = mocks.llmTextCompletion.mock.calls[0]![0]
    expect(call.systemPrompt).toContain('说话软软的')
    expect(call.systemPrompt).toContain('「绝了」')
    expect(call.userPrompt).toBe('欢迎来到图书馆。\n[whispering] 嘘，小声点')
  })

  it('默认助手 / 卡删了：说清楚，⛔ 调模型', async () => {
    for (const characterCard of [
      null,
      { name: '晴', isDeleted: true, persona: {} },
    ]) {
      mocks.findUnique.mockResolvedValue({ characterCard })
      await expect(
        rewriteAsPersona('clerk-1', { text: '你好' }),
      ).rejects.toMatchObject({ errorCode: 'VOICE_BENCH_NO_PERSONA' })
    }
    expect(mocks.llmTextCompletion).not.toHaveBeenCalled()
  })

  it('空回复算失败', async () => {
    expect(cleanRewrittenLines('```\n\n```')).toBe('')
    mocks.findUnique.mockResolvedValue({
      characterCard: { name: '晴', isDeleted: false, persona: {} },
    })
    mocks.llmTextCompletion.mockResolvedValue('  \n')
    await expect(
      rewriteAsPersona('clerk-1', { text: '你好' }),
    ).rejects.toMatchObject({ errorCode: 'VOICE_BENCH_REWRITE_EMPTY' })
  })
})
