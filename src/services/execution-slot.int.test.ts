/**
 * L2a 真库：按账号排队（execution-slot.service）。事务、advisory lock、计数全走真库；
 * 核库里的 slotKey / slotAcquiredAt 与返回值。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  acquireExecutionSlot,
  isWaitingForSlot,
} from '@/services/execution-slot.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

let tick = 0
function seedJob(
  adapterType: string,
  extra: Partial<{
    status: 'RUNNING' | 'CANCELLED'
    slotKey: string
    slotAcquiredAt: Date
    updatedAt: Date
  }> = {},
) {
  tick += 1
  return db.generationJob.create({
    data: {
      userId: me.id,
      adapterType,
      provider: adapterType,
      modelId: 'm',
      status: 'RUNNING',
      // 排队按 createdAt 先后：每条错开一秒，顺序确定
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, tick)),
      ...extra,
    },
  })
}

const row = (id: string) =>
  db.generationJob.findUniqueOrThrow({ where: { id } })

describe('acquireExecutionSlot（真库）', () => {
  it('NovelAI 一次 1 张：先来的排上，后来的排队；先来的出完轮到下一张', async () => {
    const jobs = [
      await seedJob(AI_ADAPTER_TYPES.NOVELAI),
      await seedJob(AI_ADAPTER_TYPES.NOVELAI),
      await seedJob(AI_ADAPTER_TYPES.NOVELAI),
    ]
    const ask = (i: number) =>
      acquireExecutionSlot({ runId: jobs[i].id, apiKeyId: 'k1' })

    expect(await ask(0)).toEqual({ state: 'granted' })
    expect(await ask(1)).toEqual({ state: 'waiting', ahead: 1 })
    expect(await ask(2)).toEqual({ state: 'waiting', ahead: 2 })

    const first = await row(jobs[0].id)
    expect(first).toMatchObject({ slotKey: 'key:k1' })
    expect(first.slotAcquiredAt).not.toBeNull()
    expect(isWaitingForSlot(await row(jobs[1].id))).toBe(true)

    await db.generationJob.update({
      where: { id: jobs[0].id },
      data: { status: 'COMPLETED' },
    })
    expect(await ask(1)).toEqual({ state: 'granted' })
    expect(await ask(2)).toEqual({ state: 'waiting', ahead: 1 })
  })

  it('排上号的再来问还是排上；取消了的、不存在的回 cancelled', async () => {
    const job = await seedJob(AI_ADAPTER_TYPES.NOVELAI)
    expect(await acquireExecutionSlot({ runId: job.id })).toEqual({
      state: 'granted',
    })
    expect(await acquireExecutionSlot({ runId: job.id })).toEqual({
      state: 'granted',
    })
    const cancelled = await seedJob(AI_ADAPTER_TYPES.NOVELAI, {
      status: 'CANCELLED',
    })
    expect(await acquireExecutionSlot({ runId: cancelled.id })).toEqual({
      state: 'cancelled',
    })
    expect(await acquireExecutionSlot({ runId: 'missing' })).toEqual({
      state: 'cancelled',
    })
  })

  it('fal 一次 2 张；不在表里的 adapter 不排队', async () => {
    const fal = [
      await seedJob(AI_ADAPTER_TYPES.FAL),
      await seedJob(AI_ADAPTER_TYPES.FAL),
      await seedJob(AI_ADAPTER_TYPES.FAL),
    ]
    const states = []
    for (const job of fal) {
      states.push((await acquireExecutionSlot({ runId: job.id })).state)
    }
    expect(states).toEqual(['granted', 'granted', 'waiting'])

    const free = await seedJob('some-unlisted-adapter')
    const again = await seedJob('some-unlisted-adapter')
    expect(await acquireExecutionSlot({ runId: free.id })).toEqual({
      state: 'granted',
    })
    expect(await acquireExecutionSlot({ runId: again.id })).toEqual({
      state: 'granted',
    })
  })

  it('兜底：占位太久的、排队不再来问的都不算', async () => {
    const slotKey = `user:${me.id}:${AI_ADAPTER_TYPES.NOVELAI}`
    await seedJob(AI_ADAPTER_TYPES.NOVELAI, {
      slotKey,
      slotAcquiredAt: new Date(Date.now() - 30 * 60 * 1000),
    })
    await seedJob(AI_ADAPTER_TYPES.NOVELAI, { slotKey })
    await db.generationJob.updateMany({
      where: { slotKey, slotAcquiredAt: null },
      data: { updatedAt: new Date(Date.now() - 5 * 60 * 1000) },
    })
    const mine = await seedJob(AI_ADAPTER_TYPES.NOVELAI)
    expect(await acquireExecutionSlot({ runId: mine.id })).toEqual({
      state: 'granted',
    })
  })

  it('平台 key 按 adapter 一条队；没指定 key 按人', async () => {
    const sys = await seedJob(AI_ADAPTER_TYPES.NOVELAI)
    await acquireExecutionSlot({ runId: sys.id, useSystemKey: true })
    expect((await row(sys.id)).slotKey).toBe(
      `system:${AI_ADAPTER_TYPES.NOVELAI}`,
    )

    const own = await seedJob(AI_ADAPTER_TYPES.NOVELAI)
    // 和平台 key 不在一条队里：不用等
    expect(await acquireExecutionSlot({ runId: own.id })).toEqual({
      state: 'granted',
    })
    expect((await row(own.id)).slotKey).toBe(
      `user:${me.id}:${AI_ADAPTER_TYPES.NOVELAI}`,
    )
  })
})
