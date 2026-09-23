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

const translate = (key: string) => key
vi.mock('next-intl', () => ({ useTranslations: () => translate }))
const renameMock = vi.fn()
const deleteMock = vi.fn()
const listMock = vi.fn()
const getMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('@/lib/api-client', () => ({
  renameAssistantConversationAPI: (...args: unknown[]) => renameMock(...args),
  deleteAssistantConversationAPI: (...args: unknown[]) => deleteMock(...args),
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
  renameMock
    .mockReset()
    .mockResolvedValue({ success: true, data: { title: 'New title' } })
  deleteMock.mockReset().mockResolvedValue({ success: true, data: null })
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

const session = {
  id: 'conv-delete',
  surface: 'IMAGE_STUDIO' as const,
  projectId: null,
  title: 'Delete me',
  updatedAt: '2026-09-09T00:00:00Z',
  messageCount: 1,
  operatorThread: true,
}

it('deletes the active conversation and does not autosave it back', async () => {
  const hook = await mount()
  act(() => {
    store.setOperatorSession(session.id, session.surface)
    say('u1', 'Draft')
  })
  await act(async () => {
    expect(await hook.result.current.deleteSession(session)).toBe(true)
  })
  expect(deleteMock).toHaveBeenCalledWith(session.id)
  expect(store.getOperatorState().sessionId).toBeNull()
  expect(store.getOperatorState().entries).toHaveLength(0)
  await settleDebounce()
  expect(upsertMock).not.toHaveBeenCalled()
})

it('preserves the current conversation when deletion fails', async () => {
  deleteMock.mockResolvedValue({ success: false, error: 'Offline' })
  const hook = await mount()
  act(() => {
    store.setOperatorSession(session.id, session.surface)
    say('u1', 'Keep me')
  })
  await act(async () => {
    expect(await hook.result.current.deleteSession(session)).toBe(false)
  })
  expect(store.getOperatorState().sessionId).toBe(session.id)
  expect(store.getOperatorState().entries).toHaveLength(1)
  expect(hook.result.current.error).toBe('deleteFailed')
})

it('ignores a late save response after deleting the current conversation', async () => {
  let finishSave!: (value: unknown) => void
  upsertMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = resolve
      }),
  )
  const hook = await mount()
  act(() => {
    store.setOperatorSession(session.id, session.surface)
    say('u1', 'Saved')
  })
  await settleDebounce()
  expect(upsertMock).toHaveBeenCalledOnce()
  await act(async () => {
    await hook.result.current.deleteSession(session)
  })
  await act(async () => {
    finishSave({ success: true, data: { id: session.id } })
  })
  expect(store.getOperatorState().sessionId).toBeNull()
  await settleDebounce()
  expect(upsertMock).toHaveBeenCalledOnce()
})

it('deletes another conversation without resetting the active one', async () => {
  const hook = await mount()
  act(() => {
    store.setOperatorSession('keep', session.surface)
    say('u1', 'Keep me')
  })
  await act(async () => {
    await hook.result.current.deleteSession(session)
  })
  expect(store.getOperatorState().sessionId).toBe('keep')
  expect(store.getOperatorState().entries).toHaveLength(1)
})

it('shows pending state and keeps the old conversation on load failure', async () => {
  const hook = await mount()
  act(() => store.setOperatorSession('old', session.surface))
  let finish!: (value: unknown) => void
  getMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  act(() => hook.result.current.selectSession(session))
  expect(hook.result.current.loadingSessionId).toBe(session.id)
  expect(store.getOperatorState().sessionId).toBe('old')
  await act(async () => finish({ success: false, error: 'Offline' }))
  expect(hook.result.current.loadingSessionId).toBeNull()
  expect(hook.result.current.error).toBe('loadFailed')
  expect(store.getOperatorState().sessionId).toBe('old')
})
it('ignores an older selection when requests finish out of order', async () => {
  const hook = await mount()
  const finishes: ((value: unknown) => void)[] = []
  getMock.mockImplementation(
    () => new Promise((resolve) => finishes.push(resolve)),
  )
  act(() => hook.result.current.selectSession(session))
  act(() => hook.result.current.selectSession({ ...session, id: 'newer' }))
  await act(async () =>
    finishes[1]({
      success: true,
      data: { id: 'newer', surface: session.surface, messages: [] },
    }),
  )
  await act(async () =>
    finishes[0]({
      success: true,
      data: { id: session.id, surface: session.surface, messages: [] },
    }),
  )
  expect(store.getOperatorState().sessionId).toBe('newer')
  expect(hook.result.current.loadingSessionId).toBeNull()
})
it('载回一条会话时把 `rounds` 那一列一起回填（v2 §7.7，commit #13）', async () => {
  const hook = await mount()
  const round = {
    roundIndex: 0,
    createdAt: '2026-09-11T03:26:00.000Z',
    facts: ['参考图是冷蓝夜景'],
    decisions: ['用 16:9'],
    todos: [],
    evidenceRefs: ['#e12'],
  }
  getMock.mockResolvedValue({
    success: true,
    data: {
      id: session.id,
      surface: session.surface,
      messages: [],
      rounds: [round],
    },
  })
  await act(async () => {
    hook.result.current.selectSession(session)
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(store.getOperatorState().historyRounds).toEqual([round])
})

it('updates a renamed title only after a successful save', async () => {
  const hook = await mount()
  listMock.mockResolvedValue({ success: true, data: [session] })
  await act(async () => hook.result.current.refreshSessions(true))
  await act(async () => {
    expect(
      await hook.result.current.renameSession(session, ' New title '),
    ).toBe(true)
  })
  expect(renameMock).toHaveBeenCalledWith(session.id, 'New title')
  expect(hook.result.current.sessions[0].title).toBe('New title')
  renameMock.mockResolvedValue({ success: false, error: 'Offline' })
  await act(async () => {
    expect(await hook.result.current.renameSession(session, 'Lost')).toBe(false)
  })
  expect(hook.result.current.sessions[0].title).toBe('New title')
})

it('coalesces menu refreshes while the initial list is still loading', async () => {
  listMock.mockImplementation(() => new Promise(() => {}))
  const hook = renderHook(() => historyHook.useStudioOperatorHistory())
  const initialCalls = listMock.mock.calls.length
  act(() => {
    hook.result.current.refreshSessions()
    hook.result.current.refreshSessions()
  })
  expect(listMock).toHaveBeenCalledTimes(initialCalls)
})

it('loads the combined list once and reuses it for repeated menu opens', async () => {
  const hook = await mount()
  expect(listMock).toHaveBeenCalledTimes(1)
  expect(listMock).toHaveBeenCalledWith(
    expect.objectContaining({ operatorOnly: true }),
  )
  act(() => hook.result.current.refreshSessions())
  expect(listMock).toHaveBeenCalledTimes(1)
  await act(async () =>
    vi.advanceTimersByTimeAsync(STUDIO_OPERATOR_HISTORY.listFreshMs),
  )
  await act(async () => hook.result.current.refreshSessions())
  expect(listMock).toHaveBeenCalledTimes(2)
})

/**
 * D12 U7：画布的会话**单独、按画布项目分**；图片 / 视频 / LoRA 仍共用一个列表。
 */
describe('会话按画布项目分（D12 U7）', () => {
  it('画布只列这个项目的会话，存的时候带上项目 id', async () => {
    const rendered = renderHook(() =>
      historyHook.useStudioOperatorHistory('canvas-project-1'),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'NODE_CANVAS',
        projectId: 'canvas-project-1',
        operatorOnly: true,
      }),
    )

    say('user-1', '把第三镜换成夜景')
    await settleDebounce()
    const payload = upsertMock.mock
      .calls[0]?.[0] as UpsertAssistantConversationRequest
    expect(payload.surface).toBe('NODE_CANVAS')
    expect(payload.projectId).toBe('canvas-project-1')
    rendered.unmount()
  })

  it('从工作台走到画布：线程整条换掉，⛔ 画布的话不写进工作台那一段', async () => {
    const studio = await mount()
    say('user-1', '出一张橘猫')
    await settleDebounce()
    expect(store.getOperatorState().sessionId).toBe('conv-1')
    studio.unmount()

    renderHook(() => historyHook.useStudioOperatorHistory('canvas-project-1'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(store.getOperatorState().entries).toHaveLength(0)
    expect(store.getOperatorState().sessionId).toBeNull()
    expect(store.getOperatorState().threadScope).toBe('canvas:canvas-project-1')
  })
})
