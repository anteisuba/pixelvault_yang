import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeV4, NodeV4ImageData } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/gallery-revision', () => ({ notifyGalleryChanged: vi.fn() }))

const splitImageIntoCells = vi.fn()
vi.mock('@/lib/storyboard-grid', () => ({
  splitImageIntoCells: (...args: unknown[]) => splitImageIntoCells(...args),
}))
const uploadImageMediaPatch = vi.fn()
vi.mock('@/hooks/node/use-node-upload-v4', () => ({
  uploadImageMediaPatch: (...args: unknown[]) => uploadImageMediaPatch(...args),
}))

import { useStoryboardGridSplit } from './use-storyboard-grid-split'

const NOW = '2026-09-29T00:00:00.000Z'

function sheet(
  versions: number,
  params: NodeV4ImageData['params'] = { storyboardGrid: true },
): NodeV4 {
  const list = Array.from({ length: versions }, (_, i) => ({
    id: `ov_${i}`,
    url: `https://cdn/sheet-${i}.png`,
    createdAt: NOW,
    meta: {
      imageSource: 'generated' as const,
      mediaWidth: 2048,
      mediaHeight: 1152,
    },
  }))
  return {
    id: 'sheet',
    position: { x: 100, y: 50 },
    data: {
      kind: 'image',
      subtype: 'shot',
      name: '天台',
      status: 'idle',
      createdAt: NOW,
      params,
      ...(versions > 0
        ? {
            url: list[versions - 1]!.url,
            mediaWidth: 2048,
            mediaHeight: 1152,
            outputs: { versions: list, cur: versions - 1 },
          }
        : {}),
    } as NodeV4ImageData,
  }
}

function cells(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    file: new File(['x'], `cell-${i}.jpg`, { type: 'image/jpeg' }),
    width: 680,
    height: 384,
  }))
}

function renderSplit(initial: readonly NodeV4[]) {
  const dispatchBatchWithMedia = vi.fn(() => ({
    applied: 9,
    skipped: 0,
    failedConnects: 0,
    createdNodeIds: Array.from({ length: 9 }, (_, i) => `c${i}`),
  }))
  const onReveal = vi.fn()
  const graphOf = (nodes: readonly NodeV4[]) =>
    ({ nodes, dispatchBatchWithMedia }) as unknown as NodeGraphV4
  const view = renderHook(
    ({ nodes }: { nodes: readonly NodeV4[] }) =>
      useStoryboardGridSplit({ graph: graphOf(nodes), onReveal }),
    { initialProps: { nodes: initial } },
  )
  return { view, dispatchBatchWithMedia, onReveal }
}

describe('useStoryboardGridSplit', () => {
  beforeEach(() => {
    splitImageIntoCells
      .mockReset()
      .mockResolvedValue({ ok: true, cells: cells(9), detected: true })
    uploadImageMediaPatch
      .mockReset()
      .mockImplementation(async (file: File) => ({
        ok: true,
        patch: {
          url: `https://cdn/${file.name}`,
          mediaWidth: 680,
          mediaHeight: 384,
        },
      }))
  })

  it('打开画布时已有的版本不切', async () => {
    renderSplit([sheet(1)])
    await Promise.resolve()
    expect(splitImageIntoCells).not.toHaveBeenCalled()
  })

  it('新出来的一版生成图：切成九张、一批落在原图右边、镜头移过去', async () => {
    const { view, dispatchBatchWithMedia, onReveal } = renderSplit([sheet(0)])
    act(() => view.rerender({ nodes: [sheet(1)] }))
    await waitFor(() => expect(dispatchBatchWithMedia).toHaveBeenCalled())

    expect(splitImageIntoCells).toHaveBeenCalledWith(
      'https://cdn/sheet-0.png',
      3,
      {
        mode: 'detect',
        baseName: '天台',
      },
    )
    expect(uploadImageMediaPatch).toHaveBeenCalledTimes(9)
    const [ops, seeds] = dispatchBatchWithMedia.mock.calls[0] as unknown as [
      Array<{ name: string; position: { x: number; y: number } }>,
      Array<{ media: { source: { kind: string } } }>,
    ]
    expect(ops).toHaveLength(9)
    expect(ops[0]!.name).toBe('cellName:天台/1')
    // 同一行等高、下一行更低；都在原图右边。
    expect(ops[1]!.position.y).toBe(ops[0]!.position.y)
    expect(ops[3]!.position.y).toBeGreaterThan(ops[0]!.position.y)
    expect(ops[0]!.position.x).toBeGreaterThan(100)
    expect(seeds[4]!.media.source.kind).toBe('grid')
    expect(onReveal).toHaveBeenCalledWith([
      'sheet',
      ...Array.from({ length: 9 }, (_, i) => `c${i}`),
    ])
    expect(view.result.current.landing?.sourceId).toBe('sheet')
  })

  it('开关关着：新版本照常，不切', async () => {
    const { view } = renderSplit([sheet(0, {})])
    act(() => view.rerender({ nodes: [sheet(1, {})] }))
    await Promise.resolve()
    expect(splitImageIntoCells).not.toHaveBeenCalled()
  })

  it('认不出九宫格：不落卡，卡上记一句', async () => {
    splitImageIntoCells.mockResolvedValue({ ok: false, reason: 'notDetected' })
    const { view, dispatchBatchWithMedia } = renderSplit([sheet(0)])
    act(() => view.rerender({ nodes: [sheet(1)] }))
    await waitFor(() =>
      expect(view.result.current.issues.sheet).toBe('notDetected'),
    )
    expect(dispatchBatchWithMedia).not.toHaveBeenCalled()

    act(() => view.result.current.dismissIssue('sheet'))
    expect(view.result.current.issues.sheet).toBeUndefined()
  })

  it('一格没存进素材库：整组不落', async () => {
    uploadImageMediaPatch
      .mockResolvedValueOnce({ ok: true, patch: { url: 'u' } })
      .mockResolvedValueOnce({
        ok: false,
        error: 'boom',
      })
    const { view, dispatchBatchWithMedia } = renderSplit([sheet(1)])
    act(() => view.result.current.split('sheet', 3))
    await waitFor(() => expect(view.result.current.splitting.size).toBe(0))
    expect(dispatchBatchWithMedia).not.toHaveBeenCalled()
  })

  it('手动切：认不出就等分', async () => {
    const { view } = renderSplit([sheet(1)])
    act(() => view.result.current.split('sheet', 2))
    await waitFor(() => expect(splitImageIntoCells).toHaveBeenCalled())
    expect(splitImageIntoCells).toHaveBeenCalledWith(
      'https://cdn/sheet-0.png',
      2,
      {
        mode: 'detectOrEqual',
        baseName: '天台',
      },
    )
  })
})
