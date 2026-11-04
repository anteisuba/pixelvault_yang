/**
 * L2a 真库：配音台「按她说」（voice-bench-rewrite.service）。人设、角色卡、助手 key 都走真库，
 * 路由真选（只有一把 DeepSeek key → 走 DeepSeek，key 真解密）；只假文本模型（llm-text.service）。
 * 核交给模型的提示、用的哪家哪把 key、清干净后的返回。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llm = vi.hoisted(() => ({
  reply: '',
  calls: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: async (input: Record<string, unknown>) => {
    llm.calls.push(input)
    return llm.reply
  },
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import {
  cleanRewrittenLines,
  rewriteAsPersona,
} from '@/services/voice-bench-rewrite.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
  llm.reply = ''
  llm.calls = []
})

async function useCard(persona: Record<string, unknown>, isDeleted = false) {
  const card = await db.characterCard.create({
    data: {
      userId: me.id,
      name: '晴',
      persona: persona as Prisma.InputJsonValue,
      isDeleted,
    },
  })
  await db.assistantPersona.upsert({
    where: { userId: me.id },
    create: { userId: me.id, characterCardId: card.id },
    update: { characterCardId: card.id },
  })
  return card
}

describe('rewriteAsPersona（真库）', () => {
  it('用她的卡改写：说法、学到的话进提示，走助手那把 key；回来的几行清干净', async () => {
    await useCard({
      speech: '说话软软的，爱用「呢」',
      learnedPhrases: ['绝了'],
    })
    llm.reply = '1. 「欢迎来到图书馆呢。」\n\n2. [whispering] 嘘，小声点呢\n'

    expect(
      await rewriteAsPersona(me.clerkId, {
        text: '欢迎来到图书馆。\n[whispering] 嘘，小声点',
      }),
    ).toEqual({ text: '欢迎来到图书馆呢。\n[whispering] 嘘，小声点呢' })

    expect(llm.calls).toHaveLength(1)
    const call = llm.calls[0]
    expect(call).toMatchObject({
      purpose: 'voice-bench-rewrite',
      userPrompt: '欢迎来到图书馆。\n[whispering] 嘘，小声点',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      apiKey: 'sk-test-not-a-real-key',
    })
    expect(call.systemPrompt).toContain('Name: 晴')
    expect(call.systemPrompt).toContain('说话软软的')
    expect(call.systemPrompt).toContain('「绝了」')
  })

  it('没用角色卡 / 卡删了：说清楚，不调模型', async () => {
    await expect(
      rewriteAsPersona(me.clerkId, { text: '你好' }),
    ).rejects.toMatchObject({ errorCode: 'VOICE_BENCH_NO_PERSONA' })

    await db.assistantPersona.create({ data: { userId: me.id } })
    await expect(
      rewriteAsPersona(me.clerkId, { text: '你好' }),
    ).rejects.toMatchObject({ errorCode: 'VOICE_BENCH_NO_PERSONA' })

    await useCard({}, true)
    await expect(
      rewriteAsPersona(me.clerkId, { text: '你好' }),
    ).rejects.toMatchObject({ errorCode: 'VOICE_BENCH_NO_PERSONA' })
    expect(llm.calls).toHaveLength(0)
  })

  it('空回复算失败', async () => {
    expect(cleanRewrittenLines('```\n\n```')).toBe('')
    await useCard({})
    llm.reply = '  \n'
    await expect(
      rewriteAsPersona(me.clerkId, { text: '你好' }),
    ).rejects.toMatchObject({ errorCode: 'VOICE_BENCH_REWRITE_EMPTY' })
  })
})
