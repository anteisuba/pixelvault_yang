/**
 * 剪辑台**导出与进度**的真机形状（S9）。
 *
 * ⚠ 断的是用户看得见的那条链：确认 → 发出去的**请求体** → 顶栏进度 → 完成拉回 /
 * 失败说人话。⛔ 不断样式数值（那是对稿的事）。
 */

import * as React from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

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

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

const { EditDesk } = await import('./EditDesk')

// jsdom 没有 ResizeObserver：Radix 的滑杆（缩放 / 音量）挂载时要它。
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
})

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
      settings: { aspect: '16:9', resolution: '1080p' },
    },
  } as NodeWorkflowStateV4
}

function renderDesk(
  initial: NodeWorkflowStateV4,
  overrides: Partial<React.ComponentProps<typeof EditDesk>> = {},
) {
  const addNode = vi.fn()
  const refreshProject = vi.fn()
  const onExit = vi.fn()

  render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <EditDesk
        state={initial}
        projectId="proj_1"
        dispatchBatch={() => ({ applied: 1 })}
        mintId={(prefix) => `${prefix}_1`}
        addNode={addNode}
        setMedia={vi.fn()}
        refreshProject={refreshProject}
        canUndo={false}
        onUndo={vi.fn()}
        onExit={onExit}
        onBackToNode={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>,
  )
  return { addNode, refreshProject, onExit }
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
      locale: string
    }
    expect(body.toCanvas).toBe(true)
    // 成片卡上那行「来源」由服务端按它拼（docs/references/mcp.md §7）。
    expect(body.locale).toBe('zh')
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
    // 错走舞台底部那一摞（换皮第二轮 ⑧ B），带「!」的一条
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.StudioNode.editDesk.render.planError.emptyTimeline,
    )
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('入队失败**大声**显示（worker 没部署就是这条）', async () => {
    mockSubmit.mockResolvedValue({
      success: false,
      error: 'RENDER_WORKER_BASE_URL is not set',
    })
    renderDesk(stateWithTimeline())
    confirmExport()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'RENDER_WORKER_BASE_URL is not set',
    )
    expect(screen.queryByTestId('edit-desk-render-bar')).toBeNull()
  })
})

describe('顶栏进度', () => {
  it('入队后顶栏读数换成进度（⛔ 不另起一条栏）；轮询推进度', async () => {
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
      expect(
        within(screen.getByTestId('edit-desk-top-bar')).getByTestId(
          'edit-desk-render-bar',
        ),
      ).toBeTruthy(),
    )
    expect(screen.queryByTestId('edit-desk-readout')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_200)
    })
    await waitFor(() =>
      expect(screen.getByTestId('edit-desk-render-status').textContent).toBe(
        '导出中 · 编码 58%',
      ),
    )
    expect(screen.getByTestId('edit-desk-render-progress').style.width).toBe(
      '58%',
    )
  })

  it('完成 + 导出到画布 → 拉回服务端落好的卡、回执说一声；⛔ 不自动退出，⛔ 浏览器不自己建卡', async () => {
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
        generationId: 'gen_1',
      },
    })
    const { addNode, refreshProject, onExit } = renderDesk(stateWithTimeline())
    confirmExport()
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_200)
    })

    await waitFor(() => expect(refreshProject).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('edit-desk-receipt-text').textContent).toContain(
      '我的成片',
    )
    // owner 2026-09-28：留在剪辑台，⛔ 不自动回画布。
    expect(onExit).not.toHaveBeenCalled()
    // 结果由回执说：顶栏那一格回到读数（⛔ 两处说同一件事）。
    expect(screen.queryByTestId('edit-desk-render-bar')).toBeNull()
    expect(screen.getByTestId('edit-desk-readout')).toBeInTheDocument()
    // ⚠ 服务端已经落了一张（在把任务标成完成之前）—— 这边再建就是两张。
    expect(addNode).not.toHaveBeenCalled()

    // 「回画布看」= 回画布；这里还没拉回那张卡，就只回画布。
    fireEvent.click(screen.getByTestId('edit-desk-receipt-action'))
    expect(onExit).toHaveBeenCalled()
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
