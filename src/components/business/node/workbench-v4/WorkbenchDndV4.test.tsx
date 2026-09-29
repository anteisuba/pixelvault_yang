import { act, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeV4MediaPatch } from '../nodes/v4/NodeV4Context'
import { useWorkbenchDndV4, WorkbenchUploadStatus } from './WorkbenchDndV4'

const upload =
  vi.fn<
    (kind: string, file: File, note: string) => Promise<NodeV4MediaPatch | null>
  >()
vi.mock('@/hooks/node/use-node-upload-v4', () => ({
  useNodeUploadV4: () => ({ upload, isUploading: false }),
}))
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ screenToFlowPosition: (point: unknown) => point }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name: string }) =>
    values ? `${key}: ${values.name}` : key,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const fadeInNodeCards = vi.fn<(nodeIds: readonly string[]) => void>()
vi.mock('@/hooks/node/node-ingest-dom', () => ({
  fadeInNodeCards: (nodeIds: readonly string[]) => fadeInNodeCards(nodeIds),
}))

beforeEach(() => {
  upload.mockReset()
  fadeInNodeCards.mockReset()
})

describe('画布文件上传状态', () => {
  it('立即显示每个文件，单个完成或失败不清掉其他在飞上传', async () => {
    const completions: Array<(patch: NodeV4MediaPatch | null) => void> = []
    upload.mockImplementation(
      () => new Promise((resolve) => completions.push(resolve)),
    )
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
    await act(async () => completions[0]!({ url: '/uploaded.png' }))
    expect(setMedia).toHaveBeenCalledWith('image-1', { url: '/uploaded.png' })
    expect(result.current.isUploading).toBe(true)
    view.rerender(
      <WorkbenchUploadStatus items={result.current.pendingUploads} />,
    )
    expect(screen.getByRole('status')).not.toHaveTextContent('first.png')
    expect(screen.getByRole('status')).toHaveTextContent('second.wav')
    await act(async () => completions[1]!(null))
    expect(result.current.isUploading).toBe(false)
    expect(setMedia).toHaveBeenCalledTimes(1)
    view.rerender(
      <WorkbenchUploadStatus items={result.current.pendingUploads} />,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  /** 摆放与连线 · 动效表「逐张淡入（错开 40）」：建出来的卡按落下的顺序交给淡入。 */
  it('多文件落下后把建出来的卡按顺序交给逐张淡入，没建成的不算', () => {
    upload.mockImplementation(() => new Promise(() => undefined))
    const nodes: Array<{ id: string }> = []
    const graph = {
      nodes,
      addNode: vi
        .fn()
        .mockImplementationOnce(() => {
          nodes.push({ id: 'image-1' })
          return 'image-1'
        })
        .mockImplementationOnce(() => null)
        .mockImplementationOnce(() => {
          nodes.push({ id: 'video-3' })
          return 'video-3'
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
    expect(fadeInNodeCards).toHaveBeenCalledTimes(1)
    expect(fadeInNodeCards).toHaveBeenCalledWith(['image-1', 'video-3'])
  })
})
