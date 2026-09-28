import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import type {
  NodeWorkflowProjectRecord,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  dismiss: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const api = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  activate: vi.fn(),
  remove: vi.fn(),
  backup: vi.fn(),
}))
vi.mock('@/lib/api-client', () => ({
  listNodeWorkflowProjectsAPI: (...args: unknown[]) => api.list(...args),
  updateNodeWorkflowProjectAPI: (...args: unknown[]) => api.update(...args),
  getNodeWorkflowProjectAPI: (...args: unknown[]) => api.get(...args),
  createNodeWorkflowProjectAPI: (...args: unknown[]) => api.create(...args),
  activateNodeWorkflowProjectAPI: (...args: unknown[]) => api.activate(...args),
  deleteNodeWorkflowProjectAPI: (...args: unknown[]) => api.remove(...args),
  backupNodeWorkflowV3StateAPI: (...args: unknown[]) => api.backup(...args),
}))

import {
  NODE_WORKFLOW_READ_ONLY_REASONS,
  SERVER_WRITE_DEBOUNCE_MS,
  useNodeWorkflowStore,
} from './use-node-workflow-store'

const V1 = '2026-09-28T00:00:00.000Z'
const V2 = '2026-09-28T00:01:00.000Z'
const V3 = '2026-09-28T00:02:00.000Z'

function stateWith(body: string): NodeWorkflowStateV4 {
  return {
    version: 4,
    nodes: [
      {
        id: 'n_script',
        position: { x: 0, y: 0 },
        data: {
          kind: NODE_MEDIA_KIND_IDS.text,
          subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
          name: 'S01·剧本',
          body,
          status: 'idle',
          createdAt: V1,
        },
      },
    ],
    edges: [],
  } as NodeWorkflowStateV4
}

function record(
  updatedAt: string,
  state: NodeWorkflowStateV4 = stateWith('开场'),
): NodeWorkflowProjectRecord {
  return {
    id: 'p1',
    userId: 'db_user',
    name: '走廊',
    state,
    lastActiveAt: V1,
    createdAt: V1,
    updatedAt,
  }
}

/** 让挂起的 promise 与定时器都跑完一轮（假定时器下不能用 waitFor）。 */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function renderHydratedStore() {
  const view = renderHook(() =>
    useNodeWorkflowStore({ defaultProjectName: '未命名', clerkId: 'user_1' }),
  )
  await flush()
  await flush()
  expect(view.result.current.currentProject.id).toBe('p1')
  return view
}

function edit(
  view: Awaited<ReturnType<typeof renderHydratedStore>>,
  body: string,
) {
  act(() => {
    view.result.current.commitCurrentProjectState(() => stateWith(body))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  vi.clearAllMocks()
  api.list.mockResolvedValue({ success: true, data: [record(V1)] })
  api.update.mockImplementation(
    (_id: string, body: { state?: NodeWorkflowStateV4 }) =>
      Promise.resolve({ success: true, data: record(V2, body.state) }),
  )
  api.activate.mockResolvedValue({ success: true, data: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNodeWorkflowStore · 保存冲突保护（owner 2026-09-28）', () => {
  it('水化之后什么都没改：不写回（⛔ 不把手上这份整份推上去）', async () => {
    await renderHydratedStore()
    await flush(SERVER_WRITE_DEBOUNCE_MS * 2)
    expect(api.update).not.toHaveBeenCalled()
  })

  it('改了才写，并带上这边看到的服务端版本；下一次带新版本', async () => {
    const view = await renderHydratedStore()

    edit(view, '改一句')
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({
        baseUpdatedAt: V1,
        state: stateWith('改一句'),
      }),
    )

    edit(view, '再改一句')
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    expect(api.update).toHaveBeenCalledTimes(2)
    expect(api.update).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ baseUpdatedAt: V2 }),
    )
  })

  it('409：停写 + 常驻提示（载入最新 / 另存为副本），之后再改也不写', async () => {
    api.update.mockResolvedValue({
      success: false,
      status: 409,
      error: 'changed elsewhere',
    })
    const view = await renderHydratedStore()

    edit(view, '这边的改动')
    await flush(SERVER_WRITE_DEBOUNCE_MS)

    expect(view.result.current.readOnlyReason).toBe(
      NODE_WORKFLOW_READ_ONLY_REASONS.conflict,
    )
    expect(toastMock.warning).toHaveBeenCalledWith(
      'conflict',
      expect.objectContaining({
        duration: Number.POSITIVE_INFINITY,
        action: expect.objectContaining({ label: 'conflictLoadLatest' }),
        cancel: expect.objectContaining({ label: 'conflictSaveAsCopy' }),
      }),
    )
    // ⛔ 不说成「备份失败所以只读」。
    expect(toastMock.error).not.toHaveBeenCalledWith('v3UpgradeReadOnly')

    edit(view, '接着改')
    await flush(SERVER_WRITE_DEBOUNCE_MS * 2)
    expect(api.update).toHaveBeenCalledTimes(1)
  })

  it('「载入最新」：换成服务端那一份、解除只读、换一段撤销历史', async () => {
    api.update.mockResolvedValue({ success: false, status: 409 })
    api.get.mockResolvedValue({
      success: true,
      data: record(V3, stateWith('别处存的')),
    })
    const view = await renderHydratedStore()
    edit(view, '这边的改动')
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    const epochBefore = view.result.current.stateEpoch

    const options = toastMock.warning.mock.calls.at(-1)?.[1] as {
      action: { onClick: () => void }
    }
    act(() => {
      options.action.onClick()
    })
    await flush()

    expect(api.get).toHaveBeenCalledWith('p1')
    expect(view.result.current.state).toEqual(stateWith('别处存的'))
    expect(view.result.current.readOnlyReason).toBeNull()
    expect(view.result.current.stateEpoch).toBe(epochBefore + 1)

    // 载入的就是服务端那份：不改不写；再改则带上它的版本。
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    expect(api.update).toHaveBeenCalledTimes(1)
    api.update.mockResolvedValue({ success: true, data: record(V3) })
    edit(view, '在最新版上接着改')
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    expect(api.update).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ baseUpdatedAt: V3 }),
    )
  })

  it('同一个项目的写入排队：慢请求没回来之前，下一枪不带旧版本出发', async () => {
    let release: (() => void) | undefined
    api.update.mockImplementationOnce(
      (_id: string, body: { state?: NodeWorkflowStateV4 }) =>
        new Promise((resolve) => {
          release = () =>
            resolve({ success: true, data: record(V2, body.state) })
        }),
    )
    const view = await renderHydratedStore()

    edit(view, '第一次')
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    edit(view, '第二次')
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    // 第一枪还在路上：第二枪排着，⛔ 不先发。
    expect(api.update).toHaveBeenCalledTimes(1)

    release?.()
    await flush()
    expect(api.update).toHaveBeenCalledTimes(2)
    expect(api.update).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ baseUpdatedAt: V2 }),
    )
  })

  it('保存点读的是真实的在飞写入', async () => {
    let release: (() => void) | undefined
    api.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ success: true, data: record(V2) })
        }),
    )
    const view = await renderHydratedStore()
    expect(view.result.current.isSaving).toBe(false)

    edit(view, '改一句')
    await flush(SERVER_WRITE_DEBOUNCE_MS)
    expect(view.result.current.isSaving).toBe(true)

    release?.()
    await flush()
    expect(view.result.current.isSaving).toBe(false)
  })
})
