import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import type { UpsertAssistantConversationRequest } from '@/types/assistant-conversation'

/**
 * 会话历史落库的**接线闸**（P4-B）。
 *
 * 三条都在类型之外，只能靠这里钉住：
 *  ① 写入是**一条防抖**，不是每帧一次 —— 一轮流式回合十几步只该写一次库；
 *  ② `surface` 记的是**线程起始域**，切域**不改它** —— 改了那条线程就从原来
 *    那个域的历史列表里消失了（用户在原地找不回刚才聊的东西）；
 *  ③ 「新对话」之后第一次保存是**新建**（不带 id）—— 带着旧 id 的下场是库里
 *    永远只有一行，而那要读库才发现得了。
 */

const listMock = vi.fn()
const getMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('@/lib/api-client', () => ({
  listAssistantConversationsAPI: (...args: unknown[]) => listMock(...args),
  getAssistantConversationAPI: (...args: unknown[]) => getMock(...args),
  upsertAssistantConversationAPI: (...args: unknown[]) => upsertMock(...args),
}))

type Store = typeof import('@/hooks/use-studio-operator-store')
type HistoryHook = typeof import('@/hooks/use-studio-operator-history')

let store: Store
let historyHook: HistoryHook

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  listMock.mockReset().mockResolvedValue({ success: true, data: [] })
  getMock.mockReset().mockResolvedValue({ success: true, data: null })
  upsertMock
    .mockReset()
    .mockResolvedValue({ success: true, data: { id: 'conv-1' } })
  // ⚠ store 与 hook 必须来自**同一份**新模块图，否则 hook 订阅的是另一个单例。
  store = await import('@/hooks/use-studio-operator-store')
  historyHook = await import('@/hooks/use-studio-operator-history')
})

afterEach(() => {
  vi.useRealTimers()
})

async function mount() {
  const rendered = renderHook(() => historyHook.useStudioOperatorHistory())
  // 水化那一跳（两次 list）是异步的 —— 冲干净再往下走。
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return rendered
}

function say(id: string, text: string) {
  store.appendOperatorEntry({ kind: 'user', id, text, attachments: [] })
}

async function settleDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(
      STUDIO_OPERATOR_HISTORY.saveDebounceMs + 1,
    )
  })
}

function lastUpsertBody(): UpsertAssistantConversationRequest {
  return upsertMock.mock.calls.at(-1)?.[0] as UpsertAssistantConversationRequest
}

describe('会话历史落库', () => {
  it('一轮十几条只写一次库 —— 写入是防抖不是每帧', async () => {
    await mount()

    act(() => {
      say('u1', '第一句')
      say('u2', '第二句')
      say('u3', '第三句')
    })
    await settleDebounce()

    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(lastUpsertBody().messages).toHaveLength(3)
    // ⛔ 存进去的是可读痕迹，不是可操作载荷。
    expect(JSON.stringify(lastUpsertBody())).not.toContain('inverse')
  })

  it('surface 记**起始域**，切域不改它 —— 改了线程就从原域的列表里消失', async () => {
    await mount()

    act(() => say('u1', '在图片档说的'))
    await settleDebounce()
    expect(lastUpsertBody()).toMatchObject({ surface: 'IMAGE_STUDIO' })
    expect(lastUpsertBody().id).toBeUndefined()

    // 切域会往线程里插一条域标记（拍板 8：换工具，不断会话）。
    act(() => store.switchOperatorDomain('video'))
    await settleDebounce()

    expect(upsertMock).toHaveBeenCalledTimes(2)
    // ⭐ 仍然是 IMAGE_STUDIO，而域切换以 domainMark 存在 messages 里。
    expect(lastUpsertBody()).toMatchObject({
      surface: 'IMAGE_STUDIO',
      id: 'conv-1',
    })
    expect(
      lastUpsertBody().messages.some(
        (message) => message.operator?.kind === 'domainMark',
      ),
    ).toBe(true)
  })

  it('「新对话」之后是**新建**一行，⛔ 不覆盖上一条会话', async () => {
    await mount()

    act(() => say('u1', '第一条会话'))
    await settleDebounce()
    expect(lastUpsertBody().id).toBeUndefined()

    act(() => store.resetOperatorThread())
    act(() => say('u2', '第二条会话'))
    await settleDebounce()

    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(lastUpsertBody().id).toBeUndefined()
    expect(lastUpsertBody().messages).toHaveLength(1)
  })

  it('线程空着不写库 —— ⛔ 不留一行空会话', async () => {
    await mount()
    await settleDebounce()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('载回来的历史与新说的话一起存回去 —— 续聊不会把旧的截掉', async () => {
    await mount()

    act(() =>
      store.loadOperatorThread({
        history: [
          { kind: 'user', id: 'old-1', text: '上次说的', attachments: [] },
        ],
        sessionId: 'conv-old',
        sessionSurface: 'VIDEO_STUDIO',
      }),
    )
    act(() => say('u1', '这次说的'))
    await settleDebounce()

    expect(lastUpsertBody()).toMatchObject({
      id: 'conv-old',
      surface: 'VIDEO_STUDIO',
    })
    expect(lastUpsertBody().messages.map((message) => message.content)).toEqual(
      ['上次说的', '这次说的'],
    )
  })
})
