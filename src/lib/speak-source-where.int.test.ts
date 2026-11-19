/**
 * L2a 真库：「默认不含助手朗读」的排除判据（11-19）。
 * ⚠ 锁的是 SQL 三值逻辑：快照为 NULL / 没这个键的行 ⛔ 被 `NOT (json 路径比较)` 误挡掉。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { Prisma } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'
import { SPEAK_SOURCE } from '@/constants/studio-operator-voice'
import {
  ASSISTANT_REPLY_SPEECH_WHERE,
  EXCLUDE_ASSISTANT_REPLY_SPEECH_WHERE,
  excludeAssistantReplySpeechSql,
} from '@/lib/speak-source-where'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

function row(
  prompt: string,
  outputType: 'IMAGE' | 'AUDIO',
  snapshot: Prisma.InputJsonValue | typeof Prisma.DbNull,
) {
  return db.generation.create({
    data: {
      userId: me.id,
      outputType,
      url: `https://cdn.test/${prompt}`,
      storageKey: prompt,
      prompt,
      model: 'm',
      provider: 'p',
      snapshot,
    },
  })
}

async function seed() {
  await row('image-null', 'IMAGE', Prisma.DbNull)
  await row('image-tagged', 'IMAGE', {
    speakSource: SPEAK_SOURCE.ASSISTANT_REPLY,
  })
  await row('audio-null', 'AUDIO', Prisma.DbNull)
  await row('audio-legacy', 'AUDIO', { voiceId: 'v1' })
  await row('audio-bench', 'AUDIO', {
    voiceId: 'v1',
    speakSource: SPEAK_SOURCE.VOICE_BENCH,
  })
  await row('audio-reply', 'AUDIO', {
    voiceId: 'v1',
    speakSource: SPEAK_SOURCE.ASSISTANT_REPLY,
  })
  await row('audio-array', 'AUDIO', ['x'])
}

const KEPT = [
  'audio-array',
  'audio-bench',
  'audio-legacy',
  'audio-null',
  'image-null',
  'image-tagged',
]

describe('speak-source-where（真库）', () => {
  it('Prisma 判据：只挡带 assistant_reply 标记的音频；没快照 / 没标记 / 别的形状都留下', async () => {
    await seed()
    const rows = await db.generation.findMany({
      where: { userId: me.id, ...EXCLUDE_ASSISTANT_REPLY_SPEECH_WHERE },
      select: { prompt: true },
    })
    expect(rows.map((r) => r.prompt).sort()).toEqual(KEPT)
    expect(
      await db.generation.count({
        where: { userId: me.id, ...EXCLUDE_ASSISTANT_REPLY_SPEECH_WHERE },
      }),
    ).toBe(KEPT.length)
  })

  it('正向判据只认出那一条朗读（格子上的小标记用它）', async () => {
    await seed()
    const rows = await db.generation.findMany({
      where: { userId: me.id, ...ASSISTANT_REPLY_SPEECH_WHERE },
      select: { prompt: true },
    })
    expect(rows.map((r) => r.prompt)).toEqual(['audio-reply'])
  })

  it('原生 SQL 版与 Prisma 版同一口径', async () => {
    await seed()
    const rows = await db.$queryRaw<{ prompt: string }[]>`
      SELECT g."prompt" FROM "Generation" AS g
      WHERE g."userId" = ${me.id} ${excludeAssistantReplySpeechSql('g')}
      ORDER BY g."prompt"
    `
    expect(rows.map((r) => r.prompt)).toEqual(KEPT)
  })
})
