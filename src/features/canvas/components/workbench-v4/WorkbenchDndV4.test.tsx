/**
 * 真落文件 hook + 真 `useNodeUploadV4`（压图 / 入库）+ 真逐张淡入；只假网络（api-client）
 * 与 React Flow 的坐标换算。淡入看的是画布上那几张卡的 DOM 有没有被按顺序动起来。
 */
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_DROP_FADE_MOTION } from '@/constants/motion'
import type { NodeGraphV4 } from '@/features/canvas/hooks/use-node-graph-v4'

/** 每一条上传请求都先挂着（按文件名记），由测试决定回什么。 */
const server = vi.hoisted(() => {
  const pending = new Map<string, (response: unknown) => void>()
  return {
    pending,
    parked: (file: File) =>
      new Promise((resolve) => {
        pending.set(file.name, resolve)
      }),
  }
})
vi.mock('@/lib/api-client', () => ({
  uploadImageFileAPI: vi.fn(server.parked),
  uploadVideoFileAPI: vi.fn(server.parked),
}))
vi.mock('@/lib/api-client/voices', () => ({
  uploadReferenceAudioAPI: vi.fn(server.parked),
}))
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ screenToFlowPosition: (point: unknown) => point }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name: string }) =>
    values ? `${key}: ${values.name}` : key,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useWorkbenchDndV4, WorkbenchUploadStatus } from './WorkbenchDndV4'

/** 那条上传请求到了服务端（压图读像素是异步的，图片那条要晚一点才发出去）。 */
async function answer(fileName: string, response: unknown) {
  await waitFor(() => expect(server.pending.has(fileName)).toBe(true))
  await act(async () => server.pending.get(fileName)!(response))
}

beforeEach(() => {
  server.pending.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

/** 画布上已经渲染出来的那张卡（React Flow 的外壳），记下它被怎么动画。 */
function cardOnCanvas(nodeId: string) {
  const wrapper = document.createElement('div')
  wrapper.className = 'react-flow__node'
  wrapper.setAttribute('data-id', nodeId)
  const animate = vi.fn()
  Object.assign(wrapper, { animate })
  document.body.append(wrapper)
  return animate
}

describe('画布文件上传状态', () => {
  it('立即显示每个文件，单个完成或失败不清掉其他在飞上传', async () => {
    const setMedia = vi.fn()
    const nodes: Array<{ id: string }> = []
    const graph = {
      nodes,
      addNode: vi
        .fn()
        .mockImplementationOnce(() => {
          nodes.push({ id: 'image-1' })
          return 'image-1'
        })
        .mockImplementationOnce(() => {
          nodes.push({ id: 'audio-2' })
          return 'audio-2'
        }),
      setMedia,
    } as unknown as NodeGraphV4
    const { result } = renderHook(() =>
      useWorkbenchDndV4({ graph, pasteEnabled: false }),
    )
    act(() =>
      result.current.dropFilesAtFlow(
        [
          new File(['image'], 'first.png', { type: 'image/png' }),
          new File(['audio'], 'second.wav', { type: 'audio/wav' }),
        ],
        { x: 0, y: 0 },
      ),
    )
    expect(result.current.isUploading).toBe(true)
    const view = render(
      <WorkbenchUploadStatus items={result.current.pendingUploads} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('first.png')
    expect(screen.getByRole('status')).toHaveTextContent('second.wav')
    await answer('first.png', {
      success: true,
      data: { generation: { url: '/uploaded.png' } },
    })
    expect(setMedia).toHaveBeenCalledWith(
      'image-1',
      expect.objectContaining({ url: '/uploaded.png' }),
    )
    expect(result.current.isUploading).toBe(true)
    view.rerender(
      <WorkbenchUploadStatus items={result.current.pendingUploads} />,
    )
    expect(screen.getByRole('status')).not.toHaveTextContent('first.png')
    expect(screen.getByRole('status')).toHaveTextContent('second.wav')
    await answer('second.wav', { success: false, error: 'x' })
    expect(result.current.isUploading).toBe(false)
    expect(setMedia).toHaveBeenCalledTimes(1)
    view.rerender(
      <WorkbenchUploadStatus items={result.current.pendingUploads} />,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  /** 摆放与连线 · 动效表「逐张淡入（错开 40）」：建出来的卡按落下的顺序交给淡入。 */
  it('多文件落下后把建出来的卡按顺序交给逐张淡入，没建成的不算', async () => {
    // ⚠ 和上一例不同的 id：上一例的淡入还在逐帧等它那两张卡出现。
    const fadeImage = cardOnCanvas('image-a')
    const fadeVideo = cardOnCanvas('video-c')
    const nodes: Array<{ id: string }> = []
    const graph = {
      nodes,
      addNode: vi
        .fn()
        .mockImplementationOnce(() => {
          nodes.push({ id: 'image-a' })
          return 'image-a'
        })
        .mockImplementationOnce(() => null)
        .mockImplementationOnce(() => {
          nodes.push({ id: 'video-c' })
          return 'video-c'
        }),
      setMedia: vi.fn(),
    } as unknown as NodeGraphV4
    const { result } = renderHook(() =>
      useWorkbenchDndV4({ graph, pasteEnabled: false }),
    )
    act(() =>
      result.current.dropFilesAtFlow(
        [
          new File(['image'], 'first.png', { type: 'image/png' }),
          new File(['audio'], 'second.wav', { type: 'audio/wav' }),
          new File(['text'], 'notes.txt', { type: 'text/plain' }),
          new File(['video'], 'third.mp4', { type: 'video/mp4' }),
        ],
        { x: 0, y: 0 },
      ),
    )
    await waitFor(() => expect(fadeVideo).toHaveBeenCalledTimes(1))
    expect(fadeImage).toHaveBeenCalledTimes(1)
    // 按落下的顺序错开：第一张不等，第二张（建成的里第二个）晚一拍。
    expect(fadeImage.mock.calls[0]![1]).toMatchObject({ delay: 0 })
    expect(fadeVideo.mock.calls[0]![1]).toMatchObject({
      delay: NODE_DROP_FADE_MOTION.staggerMs,
    })
  })
})
