// @vitest-environment jsdom
/**
 * 真 hook + 真认格切图（`splitImageIntoCells`）+ 真逐格入库（`uploadImageMediaPatch`）；
 * 只假网络（api-client）与浏览器的读图层：jsdom 不会解码图片，`Image` / `<canvas>` 用小桩替，
 * 按地址登记这张图「长什么样」——带 n×n 白缝的宫格，或一整片认不出缝的画面。
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeGraphV4 } from '@/features/canvas/hooks/use-node-graph-v4'
import type { NodeV4, NodeV4ImageData } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({ uploadImageFileAPI }))

import { useStoryboardGridSplit } from './use-storyboard-grid-split'

/** 一张图在浏览器里读出来的样子：n×n 白缝宫格，或认不出缝的一整片。 */
type Picture = { width: number; height: number; grid: number | null }
let pictures: Map<string, Picture>
let loadedUrls: string[]

function luma(picture: Picture, x: number, y: number, w: number, h: number) {
  const { grid } = picture
  if (grid) {
    for (let k = 1; k < grid; k += 1) {
      if (Math.abs(x - (w * k) / grid) < 2 || Math.abs(y - (h * k) / grid) < 2)
        return 255
    }
  }
  return 40 + ((x * 7 + y * 13) % 160)
}

function installBrowserPictures() {
  class FakeImage {
    crossOrigin: string | null = null
    naturalWidth = 0
    naturalHeight = 0
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    picture: Picture | undefined
    set src(url: string) {
      loadedUrls.push(url)
      this.picture = pictures.get(url)
      queueMicrotask(() => {
        if (!this.picture) return this.onerror?.()
        this.naturalWidth = this.picture.width
        this.naturalHeight = this.picture.height
        this.onload?.()
      })
    }
  }
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 680, height: 384, close: vi.fn() })),
  )
  const original = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return original(tag)
    let drawn: Picture | undefined
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (image: FakeImage) => {
          drawn = image.picture
        },
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4)
          for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
              const v = luma(drawn!, x, y, w, h)
              data.set([v, v, v, 255], (y * w + x) * 4)
            }
          }
          return { data, width: w, height: h }
        },
      }),
      toBlob: (callback: (blob: Blob) => void, type: string) =>
        queueMicrotask(() => callback(new Blob(['cell'], { type }))),
    } as unknown as HTMLCanvasElement
  }) as typeof document.createElement)
}

const NOW = '2026-09-29T00:00:00.000Z'

function sheet(
  versions: number,
  params: NodeV4ImageData['params'] = { promptTemplate: 'grid3' },
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

/** 第 i 版生成图读出来是 n×n 宫格（null = 认不出缝）。 */
function sheetLooksLike(version: number, grid: number | null) {
  pictures.set(`https://cdn/sheet-${version}.png`, {
    width: 2048,
    height: 1152,
    grid,
  })
}

describe('useStoryboardGridSplit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pictures = new Map()
    loadedUrls = []
    installBrowserPictures()
    for (let i = 0; i < 3; i += 1) sheetLooksLike(i, 3)
    uploadImageFileAPI.mockImplementation(async (file: File) => ({
      success: true,
      data: { generation: { url: `https://cdn/${file.name}` } },
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('打开画布时已有的版本不切', async () => {
    renderSplit([sheet(1)])
    await Promise.resolve()
    expect(loadedUrls).toEqual([])
  })

  it('新出来的一版生成图：切成九张、一批落在原图右边、镜头移过去', async () => {
    const { view, dispatchBatchWithMedia, onReveal } = renderSplit([sheet(0)])
    act(() => view.rerender({ nodes: [sheet(1)] }))
    await waitFor(() => expect(dispatchBatchWithMedia).toHaveBeenCalled())

    expect(loadedUrls).toEqual(['https://cdn/sheet-0.png'])
    const [ops, seeds] = dispatchBatchWithMedia.mock.calls[0] as unknown as [
      Array<{ name: string; position: { x: number; y: number } }>,
      Array<{
        media: { url: string; source: { kind: string } }
      }>,
    ]
    // 九格各自存进素材库，卡上挂的是存好的地址。
    expect(seeds.map((seed) => seed.media.url)).toEqual(
      Array.from({ length: 9 }, (_, i) => `https://cdn/天台-${i + 1}.jpg`),
    )
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

  it('没挂宫格模板（含连贯分镜）：新版本照常，不切', async () => {
    const { view } = renderSplit([sheet(0, {})])
    act(() => view.rerender({ nodes: [sheet(1, {})] }))
    const sequence = { promptTemplate: 'sequence4' } as const
    act(() => view.rerender({ nodes: [sheet(2, sequence)] }))
    await Promise.resolve()
    expect(loadedUrls).toEqual([])
  })

  it('四宫格模板：按 2×2 切', async () => {
    sheetLooksLike(0, 2)
    const grid2 = { promptTemplate: 'grid2' } as const
    const { view, dispatchBatchWithMedia } = renderSplit([sheet(0, grid2)])
    act(() => view.rerender({ nodes: [sheet(1, grid2)] }))
    await waitFor(() => expect(dispatchBatchWithMedia).toHaveBeenCalled())
    const [ops] = dispatchBatchWithMedia.mock.calls[0] as unknown as [unknown[]]
    expect(ops).toHaveLength(4)
  })

  it('认不出九宫格：不落卡，卡上记一句', async () => {
    sheetLooksLike(0, null)
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
    uploadImageFileAPI
      .mockResolvedValueOnce({
        success: true,
        data: { generation: { url: 'https://cdn/1.jpg' } },
      })
      .mockResolvedValueOnce({ success: false, error: 'boom' })
    const { view, dispatchBatchWithMedia } = renderSplit([sheet(1)])
    act(() => view.result.current.split('sheet', 3))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    await waitFor(() => expect(view.result.current.splitting.size).toBe(0))
    expect(toastError).toHaveBeenCalledWith('uploadFailed:2')
    expect(uploadImageFileAPI).toHaveBeenCalledTimes(2)
    expect(dispatchBatchWithMedia).not.toHaveBeenCalled()
  })

  it('手动切：认不出就等分', async () => {
    sheetLooksLike(0, null)
    const { view, dispatchBatchWithMedia } = renderSplit([sheet(1)])
    act(() => view.result.current.split('sheet', 2))
    await waitFor(() => expect(dispatchBatchWithMedia).toHaveBeenCalled())
    const [ops] = dispatchBatchWithMedia.mock.calls[0] as unknown as [unknown[]]
    expect(ops).toHaveLength(4)
    expect(view.result.current.issues.sheet).toBeUndefined()
  })
})
