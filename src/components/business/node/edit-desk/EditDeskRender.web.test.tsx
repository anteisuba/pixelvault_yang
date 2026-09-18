/**
 * 剪辑台**导出与进度**的真机形状（S9）。
 *
 * ⚠ 断的是用户看得见的那条链：确认 → 发出去的**请求体** → 顶栏进度 → 完成落卡 /
 * 失败说人话。⛔ 不断样式数值（那是对稿的事）。
 */

import * as React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import messages from '@/messages/zh.json'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

const mockSubmit = vi.fn()
const mockGet = vi.fn()
const mockCancel = vi.fn()

vi.mock('@/lib/api-client', () => ({
  submitRenderAPI: (...args: unknown[]) => mockSubmit(...args),
  getRenderJobAPI: (...args: unknown[]) => mockGet(...args),
  cancelRenderJobAPI: (...args: unknown[]) => mockCancel(...args),
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

const { EditDesk } = await import('./EditDesk')

const NOW = '2026-09-10T00:00:00.000Z'

function videoNode(id: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: id,
      label: id,
      status: 'idle',
      createdAt: NOW,
      url: `https://cdn.test/${id}.mp4`,
      durationSec: 6,
    },
  } as NodeV4
}

function stateWithTimeline(): NodeWorkflowStateV4 {
  return {
    version: 4,
    nodes: [videoNode('v1'), videoNode('v2')],
    edges: [],
    edit: {
      name: '我的成片',
      tracks: {
        video: [
          {
            id: 'c1',
            sourceNodeId: 'v1',
            in: 0,
            out: 4,
            speed: 1,
            muted: false,
          },
          {
            id: 'c2',
            sourceNodeId: 'v2',
            in: 0,
            out: 4,
            speed: 1,
            muted: false,
          },
        ],
        audio: [],
        music: [],
        text: [],
      },
      settings: { aspect: '16:9', resolution: '1080p', magnetic: true },
    },
  } as NodeWorkflowStateV4
}

/**
 * 一台**真的会落图**的台面：`addNode` / `setMedia` / `connect` 各自闭包着**调用
 * 时那一帧**的图 —— 与 `use-node-graph-v4.ts` 里三个动作的真实形状一致。
 *
 * ⚠ 这份「会漂的闭包」是本文件最重要的一件道具：S9 那一版把三者塞在同一 tick，
 * 于是成片卡刚建出来就被 `setMedia` 那一份旧图抹掉（owner 真机撞见「渲完了画布上
 * 什么都没有」）。桩成一个不会漂的 mock 就永远测不出这条 —— ⛔ 别改回 `vi.fn()`。
 */
function renderDesk(
  initial: NodeWorkflowStateV4,
  overrides: Partial<React.ComponentProps<typeof EditDesk>> = {},
) {
  let state = initial
  let counter = 0
  const addNode = vi.fn()
  const setMedia = vi.fn()
  const connect = vi.fn()
  const onExit = vi.fn()

  function Host() {
    const [current, setCurrent] = React.useState(state)

    const addNodeReal = (
      kind: NodeV4['data']['kind'],
      subtype: NodeV4['data']['subtype'],
      options?: { readonly name?: string },
    ): string => {
      const id = `n_${(counter += 1)}`
      const next: NodeWorkflowStateV4 = {
        ...current,
        nodes: [
          ...current.nodes,
          {
            id,
            position: { x: 0, y: 0 },
            data: {
              kind,
              subtype,
              name: options?.name ?? id,
              status: 'idle',
              createdAt: NOW,
            },
          } as NodeV4,
        ],
      }
      state = next
      setCurrent(next)
      addNode(kind, subtype, options)
      return id
    }

    const setMediaReal = (nodeId: string, patch: Record<string, unknown>) => {
      const next: NodeWorkflowStateV4 = {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? ({ ...node, data: { ...node.data, ...patch } } as NodeV4)
            : node,
        ),
      }
      state = next
      setCurrent(next)
      setMedia(nodeId, patch)
    }

    const connectReal = (
      source: string,
      target: string,
      slot: 'reference',
    ): boolean => {
      const next: NodeWorkflowStateV4 = {
        ...current,
        edges: [
          ...current.edges,
          {
            id: `e_${(counter += 1)}`,
            source,
            sourceHandle: 'out' as const,
            target,
            slot,
          },
        ],
      }
      state = next
      setCurrent(next)
      connect(source, target, slot)
      return true
    }

    return (
      <NextIntlClientProvider locale="zh" messages={messages}>
        <EditDesk
          state={current}
          projectId="proj_1"
          dispatchBatch={() => ({ applied: 1 })}
          mintId={(prefix) => `${prefix}_1`}
          addNode={addNodeReal}
          setMedia={setMediaReal}
          connect={connectReal}
          canUndo={false}
          onUndo={vi.fn()}
          onExit={onExit}
          onBackToNode={vi.fn()}
          {...overrides}
        />
      </NextIntlClientProvider>
    )
  }

  render(<Host />)
  return { addNode, setMedia, connect, onExit, read: () => state }
}

function confirmExport(): void {
  fireEvent.click(screen.getByTestId('edit-desk-export'))
  fireEvent.click(screen.getByTestId('edit-desk-export-confirm'))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mockGet.mockResolvedValue({ success: false })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('导出确认 → 请求体', () => {
  it('整条：两段都在，转场按段属性，输出规格来自时间线设置', async () => {
    mockSubmit.mockResolvedValue({
      success: true,
      data: { jobId: 'job_1', status: 'queued', name: '我的成片' },
    })
    renderDesk(stateWithTimeline())
    confirmExport()

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled())
    const body = mockSubmit.mock.calls[0]![0] as {
      plan: {
        name: string
        projectId: string
        output: Record<string, unknown>
        video: { id: string; src: string }[]
        totalDurationSec: number
      }
      toCanvas: boolean
    }
    expect(body.toCanvas).toBe(true)
    expect(body.plan.name).toBe('我的成片')
    expect(body.plan.projectId).toBe('proj_1')
    expect(body.plan.output).toEqual({
      aspect: '16:9',
      resolution: '1080p',
      width: 1920,
      height: 1080,
      fps: 25,
    })
    expect(body.plan.video.map((segment) => segment.id)).toEqual(['c1', 'c2'])
    expect(body.plan.video[0]!.src).toBe('https://cdn.test/v1.mp4')
    expect(body.plan.totalDurationSec).toBe(8)
  })

  it('空表：一条人话，⛔ 不发请求', async () => {
    renderDesk({ version: 4, nodes: [], edges: [] } as NodeWorkflowStateV4)
    confirmExport()
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('入队失败**大声**显示（worker 没部署就是这条）', async () => {
    mockSubmit.mockResolvedValue({
      success: false,
      error: 'RENDER_WORKER_BASE_URL is not set',
    })
    renderDesk(stateWithTimeline())
    confirmExport()
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'RENDER_WORKER_BASE_URL is not set',
        expect.anything(),
      ),
    )
    expect(screen.queryByTestId('edit-desk-render-bar')).toBeNull()
  })
})

describe('顶栏进度', () => {
  it('入队后出进度条；轮询推进度', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSubmit.mockResolvedValue({
      success: true,
      data: { jobId: 'job_1', status: 'queued', name: '我的成片' },
    })
    mockGet.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job_1',
        status: 'running',
        name: '我的成片',
        step: 'encode',
        progress: 0.58,
      },
    })
    renderDesk(stateWithTimeline())
    confirmExport()

    await waitFor(() =>
      expect(screen.getByTestId('edit-desk-render-bar')).toBeTruthy(),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_200)
    })
    await waitFor(() =>
      expect(
        screen.getByTestId('edit-desk-render-status').textContent,
      ).toContain('58%'),
    )
    expect(screen.getByTestId('edit-desk-render-progress').style.width).toBe(
      '58%',
    )
  })

  it('完成 + 导出到画布 → 成片卡**留在图上**并连回每个来源段（S8d 修同 tick 回填）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSubmit.mockResolvedValue({
      success: true,
      data: { jobId: 'job_1', status: 'queued', name: '我的成片' },
    })
    mockGet.mockResolvedValue({
      success: true,
      data: {
        jobId: 'job_1',
        status: 'completed',
        name: '我的成片',
        progress: 1,
        url: 'https://cdn.test/renders/proj_1/job_1.mp4',
        thumbnailUrl: 'https://cdn.test/renders/proj_1/job_1.jpg',
        generationId: 'gen_1',
      },
    })
    const { addNode, read } = renderDesk(stateWithTimeline())
    confirmExport()
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_200)
    })

    await waitFor(() => expect(addNode).toHaveBeenCalled())
    expect(addNode).toHaveBeenCalledWith('video', 'shot', { name: '我的成片' })

    // ⚠ 断的是**图上还剩下什么**而不是「谁被调用过」：S9 那一版三条调用一条不少，
    // 结果是最后一条把前面写的全抹了。
    // ⚠ 超时放宽：落卡链是**逐帧**推进的（三步 + 每条边一帧），机器忙的时候
    // 默认那 1s 不够 —— ⛔ 不因为它慢就把断言改回「谁被调用过」。
    await waitFor(
      () => {
        const landed = read().nodes.find(
          (node) => node.data.name === '我的成片',
        )
        expect(landed).toBeDefined()
        const data = landed?.data as {
          url?: string
          source?: { kind?: string }
        }
        expect(data.url).toBe('https://cdn.test/renders/proj_1/job_1.mp4')
        expect(data.source?.kind).toBe('render')
      },
      { timeout: 5_000 },
    )

    await waitFor(
      () => {
        const landed = read().nodes.find(
          (node) => node.data.name === '我的成片',
        )
        const edges = read().edges.filter((edge) => edge.target === landed?.id)
        expect(edges.map((edge) => edge.source).sort()).toEqual(['v1', 'v2'])
        expect(edges.every((edge) => edge.slot === 'reference')).toBe(true)
      },
      { timeout: 5_000 },
    )
  })
})

describe('上次导出未完成', () => {
  it('进模式时读到一条没跑完的 → 出「继续 / 重来」', async () => {
    window.localStorage.setItem('pixelvault:edit-render:proj_1', 'job_old')
    mockGet.mockResolvedValue({
      success: true,
      data: { jobId: 'job_old', status: 'running', name: '上一条' },
    })
    renderDesk(stateWithTimeline())
    await waitFor(() =>
      expect(screen.getByTestId('edit-desk-resume-bar')).toBeTruthy(),
    )
    fireEvent.click(screen.getByTestId('edit-desk-resume-continue'))
    await waitFor(() =>
      expect(screen.getByTestId('edit-desk-render-bar')).toBeTruthy(),
    )
  })

  it('已经跑完的那条不再问 —— 忘掉它', async () => {
    window.localStorage.setItem('pixelvault:edit-render:proj_1', 'job_old')
    mockGet.mockResolvedValue({
      success: true,
      data: { jobId: 'job_old', status: 'completed', name: '上一条' },
    })
    renderDesk(stateWithTimeline())
    await waitFor(() =>
      expect(
        window.localStorage.getItem('pixelvault:edit-render:proj_1'),
      ).toBeNull(),
    )
    expect(screen.queryByTestId('edit-desk-resume-bar')).toBeNull()
  })
})
