import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import type { UpsertAssistantConversationRequest } from '@/types/assistant-conversation'
import type { AssistantWorkspace } from '@/types/assistant-workspace'

const IMAGE_SCOPE = { userId: 'user-1', workspace: 'image-natural' as const }

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
  const rendered = renderHook(() =>
    historyHook.useStudioOperatorHistory(IMAGE_SCOPE),
  )
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
  it('一张还没决定的卡跟着会话落库；这段会话载回时它回到面板上（owner 09-27 刷新丢卡）', async () => {
    await mount()
    act(() => say('u1', '给她找几张图'))
    await settleDebounce()
    const proposal = {
      characterId: 'denia',
      images: [
        {
          key: 'asset:gen-1',
          source: 'library' as const,
          url: 'https://cdn.test/1.png',
          reason: '正面半身',
          assetId: 'gen-1',
        },
      ],
    }
    act(() =>
      store.setOperatorConfirm({
        id: 'c1',
        kind: 'characterImages',
        status: 'idle',
        proposal,
      }),
    )
    await settleDebounce()
    const saved = lastUpsertBody().messages
    expect(saved.at(-1)?.operatorPending).toEqual({
      kind: 'characterImages',
      proposal,
    })

    // 刷新：同一段会话载回来，卡回到面板上。
    getMock.mockResolvedValue({
      success: true,
      data: {
        id: 'conv-1',
        surface: 'IMAGE_STUDIO',
        workspaceKey: 'image-natural',
        messages: saved,
      },
    })
    act(() => store.resetOperatorThread())
    const { result } = await mount()
    await act(async () => {
      result.current.selectSession({
        id: 'conv-1',
        surface: 'IMAGE_STUDIO',
        workspaceKey: 'image-natural',
      } as never)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(store.getOperatorState().confirm).toMatchObject({
      kind: 'characterImages',
      status: 'idle',
      proposal,
    })
    expect(store.getOperatorState().status).toBe('awaitingConfirm')
  })

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

  it('切工作区分别保存，返回后继续原线程', async () => {
    const rendered = renderHook(
      ({ workspace }: { workspace: AssistantWorkspace }) =>
        historyHook.useStudioOperatorHistory({ ...IMAGE_SCOPE, workspace }),
      { initialProps: { workspace: 'image-natural' } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => say('u1', '在图片档说的'))
    await settleDebounce()
    expect(lastUpsertBody()).toMatchObject({
      surface: 'IMAGE_STUDIO',
      workspaceKey: 'image-natural',
    })
    rendered.rerender({ workspace: 'video' })
    expect(store.getOperatorState().entries).toEqual([])
    act(() => say('v1', '在视频档说的'))
    await settleDebounce()
    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(lastUpsertBody()).toMatchObject({
      surface: 'VIDEO_STUDIO',
      workspaceKey: 'video',
    })
    expect(lastUpsertBody().id).toBeUndefined()
    rendered.rerender({ workspace: 'image-natural' })
    expect(store.getOperatorState().entries.map((entry) => entry.id)).toEqual([
      'u1',
    ])
    expect(store.getOperatorState().sessionId).toBe('conv-1')
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
        sessionSurface: 'IMAGE_STUDIO',
      }),
    )
    act(() => say('u1', '这次说的'))
    await settleDebounce()

    expect(lastUpsertBody()).toMatchObject({
      id: 'conv-old',
      surface: 'IMAGE_STUDIO',
    })
    expect(lastUpsertBody().messages.map((message) => message.content)).toEqual(
      ['上次说的', '这次说的'],
    )
  })
})

const session = {
  id: 'conv-delete',
  surface: 'IMAGE_STUDIO' as const,
  workspaceKey: 'image-natural',
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
      data: {
        id: 'newer',
        surface: session.surface,
        workspaceKey: 'image-natural',
        messages: [],
      },
    }),
  )
  await act(async () =>
    finishes[0]({
      success: true,
      data: {
        id: session.id,
        surface: session.surface,
        workspaceKey: 'image-natural',
        messages: [],
      },
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
      workspaceKey: 'image-natural',
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
  const hook = renderHook(() =>
    historyHook.useStudioOperatorHistory(IMAGE_SCOPE),
  )
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
      historyHook.useStudioOperatorHistory({
        userId: 'user-1',
        workspace: 'canvas',
        projectId: 'canvas-project-1',
      }),
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

    renderHook(() =>
      historyHook.useStudioOperatorHistory({
        userId: 'user-1',
        workspace: 'canvas',
        projectId: 'canvas-project-1',
      }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(store.getOperatorState().entries).toHaveLength(0)
    expect(store.getOperatorState().sessionId).toBeNull()
    expect(store.getOperatorState().threadScope).toBe(
      'user-1:canvas:canvas-project-1',
    )
  })
})

/**
 * 卡片助手（第五张脸，owner 09-26）：会话单独一份，只在角色页里看得到。
 */
describe('卡片助手的会话单独一份（owner 09-26）', () => {
  it('只列 CARDS 的会话，存的时候落 CARDS；从工作台过来整条线程换掉', async () => {
    const studio = await mount()
    say('user-1', '出一张橘猫')
    await settleDebounce()
    studio.unmount()
    upsertMock.mockClear()

    const rendered = renderHook(() =>
      historyHook.useStudioOperatorHistory({
        userId: 'user-1',
        workspace: 'cards',
      }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ surface: 'CARDS', operatorOnly: true }),
    )
    expect(store.getOperatorState().entries).toHaveLength(0)
    expect(store.getOperatorState().threadScope).toBe('user-1:cards')

    say('user-2', '查一下达妮娅的设定')
    await settleDebounce()
    const payload = upsertMock.mock
      .calls[0]?.[0] as UpsertAssistantConversationRequest
    expect(payload.surface).toBe('CARDS')
    rendered.unmount()
  })
})

describe('作用域和本地线程身份的异步边界', () => {
  it('保存失败可见，保留消息且只在用户重试时再次保存', async () => {
    upsertMock.mockResolvedValueOnce({ success: false, error: 'Offline' })
    const rendered = await mount()
    act(() => say('u1', '还没有保存的消息'))
    await settleDebounce()
    expect(rendered.result.current.error).toBe('saveFailed')
    expect(store.getOperatorState().entries).toHaveLength(1)
    await settleDebounce()
    expect(upsertMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      expect(await rendered.result.current.retrySave()).toBe(true)
    })
    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(lastUpsertBody().messages[0].content).toBe('还没有保存的消息')
    expect(rendered.result.current.error).toBeNull()
  })

  it('只有主动查看才请求旧历史，旧记录只读且不会再落成当前工作区会话', async () => {
    const rendered = await mount()
    expect(listMock.mock.calls[0][0].includeLegacy).toBeUndefined()
    act(() => say('u1', '旧消息'))
    await settleDebounce()
    const messages = lastUpsertBody().messages
    const legacy = { ...session, id: 'legacy-conversation', workspaceKey: null }
    listMock.mockResolvedValue({ success: true, data: [legacy] })
    await act(async () => {
      rendered.result.current.refreshSessions(true, true)
    })
    expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceKey: 'image-natural',
        includeLegacy: true,
      }),
    )
    getMock.mockResolvedValue({
      success: true,
      data: {
        ...legacy,
        messages,
        rounds: [
          {
            roundIndex: 0,
            createdAt: '2026-09-11T00:00:00Z',
            facts: ['旧结论'],
            decisions: [],
            todos: [],
            evidenceRefs: [],
          },
        ],
      },
    })
    await act(async () => {
      rendered.result.current.selectSession(legacy)
    })
    expect(getMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeLegacy: true, operatorOnly: true }),
    )
    expect(store.getOperatorState()).toMatchObject({
      readOnlyHistory: true,
      sessionId: null,
      autoGenerate: false,
      confirm: null,
      question: null,
      historyRounds: [],
    })
    expect(store.getOperatorState().history).toHaveLength(1)
    upsertMock.mockClear()
    await act(async () => {
      expect(await rendered.result.current.retrySave()).toBe(false)
    })
    await settleDebounce()
    expect(upsertMock).not.toHaveBeenCalled()
    act(() => store.resetOperatorThread())
    expect(store.getOperatorState()).toMatchObject({
      readOnlyHistory: false,
      history: [],
    })
  })

  it('首次保存期间新建线程，旧 null 会话回包不能回填新 null 会话', async () => {
    let finish!: (value: unknown) => void
    upsertMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await mount()
    act(() => say('a1', '旧会话'))
    await settleDebounce()
    const firstId = store.getOperatorState().localThreadId
    act(() => store.resetOperatorThread())
    expect(store.getOperatorState().localThreadId).not.toBe(firstId)
    await act(async () =>
      finish({ success: true, data: { id: 'old-conversation' } }),
    )
    expect(store.getOperatorState().sessionId).toBeNull()
    act(() => say('b1', '新会话'))
    await settleDebounce()
    expect(lastUpsertBody().id).toBeUndefined()
    expect(lastUpsertBody().messages.map((item) => item.content)).toEqual([
      '新会话',
    ])
  })

  it('图片和标签各自查询精确工作区，旧列表回包不启动跨区加载', async () => {
    let finishImage!: (value: unknown) => void
    listMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishImage = resolve
        }),
    )
    const rendered = renderHook(
      ({ workspace }: { workspace: AssistantWorkspace }) =>
        historyHook.useStudioOperatorHistory({ ...IMAGE_SCOPE, workspace }),
      { initialProps: { workspace: 'image-natural' } },
    )
    rendered.rerender({ workspace: 'image-tags' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
      finishImage({ success: true, data: [session] })
    })
    expect(listMock.mock.calls.map(([args]) => args.workspaceKey)).toEqual([
      'image-natural',
      'image-tags',
    ])
    expect(getMock).not.toHaveBeenCalled()
    expect(store.getOperatorState().threadScope).toBe('user-1:image-tags')
    expect(store.getOperatorState().sessionId).toBeNull()
    expect(rendered.result.current.sessions).toEqual([])
  })

  it('离开工作区后旧历史详情不能覆盖目标工作区', async () => {
    let finish!: (value: unknown) => void
    getMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const rendered = renderHook(
      ({ workspace }: { workspace: AssistantWorkspace }) =>
        historyHook.useStudioOperatorHistory({ ...IMAGE_SCOPE, workspace }),
      { initialProps: { workspace: 'image-natural' } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => rendered.result.current.selectSession(session))
    rendered.rerender({ workspace: 'lora' })
    await act(async () =>
      finish({ success: true, data: { ...session, messages: [] } }),
    )
    expect(store.getOperatorState().threadScope).toBe('user-1:lora')
    expect(store.getOperatorState().sessionId).toBeNull()
  })

  it('未保存的工作区切走会保存其自己的快照，晚回包只绑定原缓存', async () => {
    let finish!: (value: unknown) => void
    upsertMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const rendered = renderHook(
      ({ workspace }: { workspace: AssistantWorkspace }) =>
        historyHook.useStudioOperatorHistory({ ...IMAGE_SCOPE, workspace }),
      { initialProps: { workspace: 'image-natural' } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => say('a1', '图片请求'))
    rendered.rerender({ workspace: 'lora' })
    expect(lastUpsertBody()).toMatchObject({ workspaceKey: 'image-natural' })
    await act(async () =>
      finish({ success: true, data: { id: 'image-conversation' } }),
    )
    expect(store.getOperatorState().sessionId).toBeNull()
    rendered.rerender({ workspace: 'image-natural' })
    expect(store.getOperatorState().sessionId).toBe('image-conversation')
    expect(store.getOperatorState().entries.map((item) => item.id)).toEqual([
      'a1',
    ])
  })

  it('串行保存同一线程时，后续快照使用首次保存返回的数据库身份', async () => {
    let finish!: (value: unknown) => void
    upsertMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await mount()
    act(() => say('a1', '第一句'))
    await settleDebounce()
    act(() => say('a2', '第二句'))
    await settleDebounce()
    expect(upsertMock).toHaveBeenCalledTimes(1)
    await act(async () =>
      finish({ success: true, data: { id: 'conversation-a' } }),
    )
    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(lastUpsertBody().id).toBe('conversation-a')
    expect(lastUpsertBody().messages).toHaveLength(2)
  })

  it('账号切换清掉缓存，旧账号排队中的未发送保存不能借新账号写出', async () => {
    let finish!: (value: unknown) => void
    upsertMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const rendered = renderHook(
      ({ userId }: { userId: string | null }) =>
        historyHook.useStudioOperatorHistory({ ...IMAGE_SCOPE, userId }),
      { initialProps: { userId: 'user-1' } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => say('a1', '账号 A'))
    await settleDebounce()
    act(() => say('a2', 'A 未发送的更新'))
    await settleDebounce()
    rendered.rerender({ userId: 'user-2' })
    await act(async () =>
      finish({ success: true, data: { id: 'a-conversation' } }),
    )
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(store.getOperatorState().entries).toEqual([])
    expect(store.getOperatorState().sessionId).toBeNull()
    rendered.rerender({ userId: 'user-1' })
    expect(store.getOperatorState().entries).toEqual([])
  })

  it('没有账号或画布项目身份时不读取或保存会话', async () => {
    const rendered = renderHook(
      ({
        userId,
        workspace,
      }: {
        userId: string | null
        workspace: AssistantWorkspace
      }) => historyHook.useStudioOperatorHistory({ userId, workspace }),
      { initialProps: { userId: null, workspace: 'image-natural' } },
    )
    act(() => say('u1', '没有账号'))
    await settleDebounce()
    rendered.rerender({ userId: 'user-1', workspace: 'canvas' })
    await settleDebounce()
    expect(listMock).not.toHaveBeenCalled()
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
