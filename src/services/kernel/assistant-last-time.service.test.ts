import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  conversationFirst: vi.fn(),
  memoryFind: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    assistantConversation: { findFirst: mocks.conversationFirst },
    assistantMemory: { findMany: mocks.memoryFind },
  },
}))

import {
  loadAssistantLastTime,
  renderAssistantLastTime,
} from './assistant-last-time.service'

describe('上次停在哪（第 3 批）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.conversationFirst.mockResolvedValue({
      title: '逆光的猫',
      updatedAt: new Date('2026-10-27T10:00:00.000Z'),
      messages: [
        { kind: 'user', id: 'u1', text: '先这样', attachments: [] },
        { kind: 'user', id: 'u2', text: '手还是糊', attachments: [] },
        { kind: 'message', id: 'm1', text: '下次我只重画手那一块' },
        { kind: 'domainMark', id: 'd1', domain: 'image' },
      ],
    })
    mocks.memoryFind.mockResolvedValue([{ text: '偏好柔和逆光' }])
  })

  it('读上一段（不含这一段）最后的一问一答，和从那以后新记下的偏好', async () => {
    const lastTime = await loadAssistantLastTime('u', 'conv-now')
    expect(mocks.conversationFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u', id: { not: 'conv-now' } },
      }),
    )
    expect(lastTime).toEqual({
      title: '逆光的猫',
      day: '2026-10-27',
      lastAsked: '手还是糊',
      lastReply: '下次我只重画手那一块',
      newTaste: ['偏好柔和逆光'],
    })
  })

  it('没有上一段 / 读不出来就当没有', async () => {
    mocks.conversationFirst.mockResolvedValueOnce(null)
    expect(await loadAssistantLastTime('u', undefined)).toBeNull()
    mocks.conversationFirst.mockRejectedValueOnce(new Error('db down'))
    expect(await loadAssistantLastTime('u', undefined)).toBeNull()
  })

  it('渲染：有内容才出这一段，并写明只提一次', async () => {
    expect(renderAssistantLastTime(null)).toBe('')
    const text = renderAssistantLastTime(
      await loadAssistantLastTime('u', undefined),
    )
    expect(text).toContain('WHERE YOU LEFT OFF')
    expect(text).toContain('手还是糊')
    expect(text).toContain('偏好柔和逆光')
    expect(text).toContain('Never repeat it')
  })
})
