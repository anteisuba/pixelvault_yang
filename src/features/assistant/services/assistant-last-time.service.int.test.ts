import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  loadAssistantLastTime,
  renderAssistantLastTime,
} from './assistant-last-time.service'

/** 上次停在哪（第 3 批）——真库（L2a）：上一段对话、之后记下的偏好都是库里的行。 */
const LEFT_OFF_AT = new Date('2026-10-27T10:00:00.000Z')

async function setup() {
  const user = await createTestUser()
  const previous = await db.assistantConversation.create({
    data: {
      userId: user.id,
      surface: 'IMAGE_STUDIO',
      title: '逆光的猫',
      updatedAt: LEFT_OFF_AT,
      messages: [
        { kind: 'user', id: 'u1', text: '先这样', attachments: [] },
        { kind: 'user', id: 'u2', text: '手还是糊', attachments: [] },
        { kind: 'message', id: 'm1', text: '下次我只重画手那一块' },
        { kind: 'domainMark', id: 'd1', domain: 'image' },
      ],
    },
  })
  const memory = (text: string, createdAt: Date, extra: object = {}) =>
    db.assistantMemory.create({
      data: {
        userId: user.id,
        scope: 'GLOBAL',
        kind: 'PREFERENCE',
        source: 'ASSISTANT',
        text,
        createdAt,
        ...extra,
      },
    })
  await memory('偏好柔和逆光', new Date('2026-10-28T00:00:00.000Z'))
  // 停下之前就有的、创作者自己写的：都不算「从那以后新记下的」。
  await memory('早就知道的', new Date('2026-10-01T00:00:00.000Z'))
  await memory('自己写的', new Date('2026-10-28T00:00:00.000Z'), {
    source: 'CREATOR',
  })
  return { user, previous }
}

describe('上次停在哪（第 3 批，真库）', () => {
  beforeEach(resetDatabase)

  it('读上一段（不含这一段）最后的一问一答，和从那以后新记下的偏好', async () => {
    const { user } = await setup()
    const now = await db.assistantConversation.create({
      data: {
        userId: user.id,
        surface: 'IMAGE_STUDIO',
        title: '这一段',
        messages: [{ kind: 'user', id: 'x', text: '新的', attachments: [] }],
      },
    })

    const lastTime = await loadAssistantLastTime(user.id, now.id)

    expect(lastTime).toEqual({
      title: '逆光的猫',
      day: '2026-10-27',
      lastAsked: '手还是糊',
      lastReply: '下次我只重画手那一块',
      newTaste: ['偏好柔和逆光'],
    })
  })

  it('没有上一段就当没有；别人的对话不算我的上一段', async () => {
    const lonely = await createTestUser()
    expect(await loadAssistantLastTime(lonely.id, undefined)).toBeNull()

    await setup()
    expect(await loadAssistantLastTime(lonely.id, undefined)).toBeNull()
  })

  it('读不出来（库报错）也当没有，⛔ 不抛', async () => {
    const { user } = await setup()
    // 让查询本身真报错：Postgres 的文本收不下 `\u0000`。
    expect(await loadAssistantLastTime(user.id, 'bad\u0000id')).toBeNull()
  })

  it('渲染：有内容才出这一段，并写明只提一次', async () => {
    const { user } = await setup()
    expect(renderAssistantLastTime(null)).toBe('')
    const text = renderAssistantLastTime(
      await loadAssistantLastTime(user.id, undefined),
    )
    expect(text).toContain('WHERE YOU LEFT OFF')
    expect(text).toContain('手还是糊')
    expect(text).toContain('偏好柔和逆光')
    expect(text).toContain('Never repeat it')
  })
})
