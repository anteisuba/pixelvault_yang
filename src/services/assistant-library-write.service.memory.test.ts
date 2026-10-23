import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantMemory } from '@/types/assistant-memory'

/**
 * 新内核记忆（第 6 步）：记下 / 改 / 忘掉一条，形状同改库那份：**做 → 撤 → 回到原状**。
 * 记忆表本身的读写（去重、淘汰、归属）由 `assistant-memory.service` 自己的测试守，这里换成一份内存表。
 */

const store = vi.hoisted(() => ({
  rows: [] as AssistantMemory[],
  seq: 0,
}))

function row(input: Partial<AssistantMemory> & { text: string }) {
  store.seq += 1
  const memory: AssistantMemory = {
    id: `${String(store.seq).padStart(8, '0')}-0000-4000-8000-000000000000`,
    scope: 'global',
    kind: 'preference',
    source: 'assistant',
    projectId: null,
    projectName: null,
    characterCardId: null,
    characterName: null,
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    ...input,
  }
  store.rows.push(memory)
  return memory
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/services/assistant-memory.service', () => ({
  isSensitiveMemoryText: (text: string) => /password|密码/i.test(text),
  addAssistantRuleMemory: async (
    _userId: string,
    input: {
      text: string
      scope: AssistantMemory['scope']
      characterCardId: string | null
      kind: AssistantMemory['kind']
    },
  ) => {
    const same = store.rows.find(
      (item) =>
        item.text === input.text &&
        item.characterCardId === input.characterCardId,
    )
    if (same) return { memory: same, created: false }
    return {
      memory: row({
        text: input.text,
        scope: input.scope,
        kind: input.kind,
        characterCardId: input.characterCardId,
      }),
      created: true,
    }
  },
  findAssistantMemoryByRef: async (
    _userId: string,
    ref: { idPrefix: string | null; text: string },
  ) => {
    const hits = store.rows.filter((item) =>
      ref.idPrefix ? item.id.startsWith(ref.idPrefix) : item.text === ref.text,
    )
    return hits.length === 1
      ? { ok: true, memory: hits[0] }
      : { ok: false, reason: hits.length ? 'ambiguous' : 'missing' }
  },
  updateAssistantMemory: async (
    _userId: string,
    id: string,
    input: { text: string },
  ) => {
    const hit = store.rows.find((item) => item.id === id)
    if (!hit) return null
    hit.text = input.text
    return hit
  },
  deleteAssistantMemory: async (_userId: string, id: string) => {
    const before = store.rows.length
    store.rows = store.rows.filter((item) => item.id !== id)
    return store.rows.length < before
  },
  restoreAssistantMemory: async (
    _userId: string,
    snapshot: Omit<AssistantMemory, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    row({ ...snapshot })
    return true
  },
}))

import {
  editMemory,
  forgetMemory,
  rememberMemory,
  revertLibraryWrite,
} from './assistant-library-write.service'

const owner = { userId: 'user-1', clerkId: 'clerk-1' }
const handle = (id: string) => `记忆·${id.slice(0, 8)}`
const aboutYou = { characterCardId: null, label: '关于你' }

beforeEach(() => {
  store.rows = []
  store.seq = 0
})

describe('新内核记忆：做 → 撤 → 回到原状', () => {
  it('记下一条进「关于你」；撤销 = 删掉它', async () => {
    const outcome = await rememberMemory(owner, {
      text: '  人物图默认   3:4 ',
      target: aboutYou,
      handle,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.payload.summary).toBe('记下了（关于你）：人物图默认 3:4')
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({
      scope: 'global',
      text: '人物图默认 3:4',
    })
    await revertLibraryWrite('user-1', outcome.inverse)
    expect(store.rows).toHaveLength(0)
  })

  it('角色那一份挂在她身上；同一句不记第二行；敏感的不记', async () => {
    const target = { characterCardId: 'card-7', label: '马尔福' }
    const first = await rememberMemory(owner, { text: '冬装', target, handle })
    expect(first.ok).toBe(true)
    expect(store.rows[0]).toMatchObject({
      scope: 'cards',
      characterCardId: 'card-7',
    })
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
    expect(store.rows).toHaveLength(1)
  })

  it('按编号改一条；撤销写回原文', async () => {
    const memory = row({ text: '人物图默认 3:4' })
    const outcome = await editMemory(owner, {
      ref: { idPrefix: memory.id.slice(0, 8), text: handle(memory.id) },
      text: '人物图默认 2:3',
      handle,
    })
    expect(outcome.ok).toBe(true)
    expect(store.rows[0]!.text).toBe('人物图默认 2:3')
    if (outcome.ok) await revertLibraryWrite('user-1', outcome.inverse)
    expect(store.rows[0]!.text).toBe('人物图默认 3:4')
  })

  it('忘掉一条；撤销按原样再记回去', async () => {
    const memory = row({
      text: '冬装',
      scope: 'cards',
      characterCardId: 'card-7',
    })
    const outcome = await forgetMemory(owner, {
      ref: { idPrefix: memory.id.slice(0, 8), text: handle(memory.id) },
      handle,
    })
    expect(outcome.ok).toBe(true)
    expect(store.rows).toHaveLength(0)
    if (outcome.ok) await revertLibraryWrite('user-1', outcome.inverse)
    expect(store.rows[0]).toMatchObject({
      text: '冬装',
      scope: 'cards',
      characterCardId: 'card-7',
    })
  })

  it('创作者自己写的那条不改、不忘', async () => {
    const memory = row({ text: '永远用中文', source: 'creator', kind: 'rule' })
    const ref = { idPrefix: memory.id.slice(0, 8), text: handle(memory.id) }
    expect((await forgetMemory(owner, { ref, handle })).ok).toBe(false)
    expect((await editMemory(owner, { ref, text: '用英文', handle })).ok).toBe(
      false,
    )
    expect(store.rows[0]!.text).toBe('永远用中文')
  })
})
