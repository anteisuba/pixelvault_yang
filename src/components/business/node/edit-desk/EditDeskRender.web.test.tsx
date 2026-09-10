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
      },
      settings: { aspect: '16:9', resolution: '1080p', magnetic: true },
    },
  } as NodeWorkflowStateV4
}

function renderDesk(
  state: NodeWorkflowStateV4,
  overrides: Partial<React.ComponentProps<typeof EditDesk>> = {},
) {
  const addNode = vi.fn(() => 'n_cut')
  const setMedia = vi.fn()
  const connect = vi.fn(() => true)
  const onExit = vi.fn()
  render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <EditDesk
        state={state}
        projectId="proj_1"
        dispatchBatch={() => ({ applied: 1 })}
        mintId={(prefix) => `${prefix}_1`}
        addNode={addNode}
        setMedia={setMedia}
        connect={connect}
        canUndo={false}
        onUndo={vi.fn()}
        onExit={onExit}
        onBackToNode={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>,
  )
  return { addNode, setMedia, connect, onExit }
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

  it('完成 + 导出到画布 → 落一张成片卡并连回每个来源段', async () => {
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
    const { addNode, setMedia, connect } = renderDesk(stateWithTimeline())
    confirmExport()
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_200)
    })

    await waitFor(() => expect(addNode).toHaveBeenCalled())
    expect(addNode).toHaveBeenCalledWith('video', 'shot', { name: '我的成片' })
    expect(setMedia).toHaveBeenCalledWith(
      'n_cut',
      expect.objectContaining({
        url: 'https://cdn.test/renders/proj_1/job_1.mp4',
        videoThumbnailUrl: 'https://cdn.test/renders/proj_1/job_1.jpg',
        generationId: 'gen_1',
      }),
    )
    // 两段来自两个不同的节点 → 两条边，都落在端口表允许的 `reference` 口上。
    expect(connect.mock.calls).toEqual([
      ['v1', 'n_cut', 'reference'],
      ['v2', 'n_cut', 'reference'],
    ])
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
