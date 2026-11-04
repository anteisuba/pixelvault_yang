import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { Prisma } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  editMemory,
  forgetMemory,
  rememberMemory,
  revertLibraryWrite,
} from './assistant-library-write.service'

/**
 * 新内核记忆（第 6 步）：记下 / 改 / 忘掉一条，形状同改库那份：**做 → 撤 → 回到原状**。
 * 真库（L2a）：记忆表、角色卡都是库里的行。
 */
let owner = { userId: '', clerkId: '' }
const handle = (id: string) => `记忆·${id.slice(0, 8)}`
const aboutYou = { characterCardId: null, label: '关于你' }

function memories() {
  return db.assistantMemory.findMany({
    where: { userId: owner.userId },
    orderBy: { createdAt: 'asc' },
  })
}

function seed(data: Partial<Prisma.AssistantMemoryUncheckedCreateInput>) {
  return db.assistantMemory.create({
    data: {
      userId: owner.userId,
      scope: 'GLOBAL',
      kind: 'PREFERENCE',
      source: 'ASSISTANT',
      text: '一条',
      ...data,
    },
  })
}

const refOf = (id: string) => ({ idPrefix: id.slice(0, 8), text: handle(id) })

beforeEach(async () => {
  await resetDatabase()
  const user = await createTestUser()
  owner = { userId: user.id, clerkId: user.clerkId }
})

describe('新内核记忆：做 → 撤 → 回到原状（真库）', () => {
  it('记下一条进「关于你」；撤销 = 删掉它', async () => {
    const outcome = await rememberMemory(owner, {
      text: '  人物图默认   3:4 ',
      target: aboutYou,
      handle,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.payload.summary).toBe('记下了（关于你）：人物图默认 3:4')
    expect(await memories()).toEqual([
      expect.objectContaining({
        scope: 'GLOBAL',
        text: '人物图默认 3:4',
        characterCardId: null,
      }),
    ])
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(await memories()).toHaveLength(0)
  })

  it('角色那一份挂在她身上；同一句不记第二行；敏感的不记', async () => {
    const card = await db.characterCard.create({
      data: { userId: owner.userId, name: '马尔福' },
    })
    const target = { characterCardId: card.id, label: '马尔福' }
    const first = await rememberMemory(owner, { text: '冬装', target, handle })
    expect(first.ok).toBe(true)
    expect(await memories()).toEqual([
      expect.objectContaining({ scope: 'CARDS', characterCardId: card.id }),
    ])
    const again = await rememberMemory(owner, { text: '冬装', target, handle })
    expect(again).toEqual({
      ok: false,
      error: expect.stringContaining('Already remembered'),
    })
    const secret = await rememberMemory(owner, {
      text: '我的密码是 1234',
      target: aboutYou,
      handle,
    })
    expect(secret.ok).toBe(false)
    expect(await memories()).toHaveLength(1)
  })

  it('按编号改一条；撤销写回原文', async () => {
    const memory = await seed({ text: '人物图默认 3:4' })
    const outcome = await editMemory(owner, {
      ref: refOf(memory.id),
      text: '人物图默认 2:3',
      handle,
    })
    expect(outcome.ok).toBe(true)
    expect((await memories())[0]!.text).toBe('人物图默认 2:3')
    if (outcome.ok) await revertLibraryWrite(owner.userId, outcome.inverse)
    expect((await memories())[0]!.text).toBe('人物图默认 3:4')
  })

  it('忘掉一条；撤销按原样再记回去', async () => {
    const card = await db.characterCard.create({
      data: { userId: owner.userId, name: '马尔福' },
    })
    const memory = await seed({
      text: '冬装',
      scope: 'CARDS',
      characterCardId: card.id,
    })
    const outcome = await forgetMemory(owner, {
      ref: refOf(memory.id),
      handle,
    })
    expect(outcome.ok).toBe(true)
    expect(await memories()).toHaveLength(0)
    if (outcome.ok) await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(await memories()).toEqual([
      expect.objectContaining({
        text: '冬装',
        scope: 'CARDS',
        characterCardId: card.id,
      }),
    ])
  })

  it('创作者自己写的那条不改、不忘', async () => {
    const memory = await seed({
      text: '永远用中文',
      source: 'CREATOR',
      kind: 'RULE',
    })
    const ref = refOf(memory.id)
    expect((await forgetMemory(owner, { ref, handle })).ok).toBe(false)
    expect((await editMemory(owner, { ref, text: '用英文', handle })).ok).toBe(
      false,
    )
    expect((await memories())[0]!.text).toBe('永远用中文')
  })

  it('别人的那条按编号也认不到', async () => {
    const stranger = await createTestUser()
    const theirs = await db.assistantMemory.create({
      data: {
        userId: stranger.id,
        scope: 'GLOBAL',
        kind: 'PREFERENCE',
        text: '别人的',
      },
    })
    expect(
      (await forgetMemory(owner, { ref: refOf(theirs.id), handle })).ok,
    ).toBe(false)
    expect(await db.assistantMemory.count()).toBe(1)
  })
})
