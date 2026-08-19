import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { CanvasImageEditWorkspace } from './CanvasImageEditWorkspace'

const mocks = vi.hoisted(() => ({
  createExtractedElementAPI: vi.fn(),
  editImageAPI: vi.fn(),
  extractElementAPI: vi.fn(),
  focusNode: vi.fn(),
  inpaintImageAPI: vi.fn(),
  placeDerivedImages: vi.fn(),
  updateNodeData: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/lib/api-client', () => ({
  createExtractedElementAPI: mocks.createExtractedElementAPI,
  editImageAPI: mocks.editImageAPI,
  extractElementAPI: mocks.extractElementAPI,
  inpaintImageAPI: mocks.inpaintImageAPI,
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    placeDerivedImages: mocks.placeDerivedImages,
    focusNode: mocks.focusNode,
    updateNodeData: mocks.updateNodeData,
  }),
}))

vi.mock('@/components/business/studio/StudioInpaintEditor', () => ({
  StudioInpaintEditor: ({
    onApply,
    imageWidth,
    imageHeight,
  }: {
    onApply: (maskDataUrl: string, prompt: string) => void
    imageWidth: number
    imageHeight: number
  }) => (
    <>
      {/* 蒙版画布就是按这两个数建的 —— 它们错了，蒙版尺寸就和源图对不上。 */}
      <span data-testid="inpaint-canvas-size">{`${imageWidth}x${imageHeight}`}</span>
      <button
        type="button"
        onClick={() => onApply('data:image/png;base64,mask', 'repair face')}
      >
        editor.inpaint.apply
      </button>
    </>
  ),
}))

const SOURCE_DATA = {
  mediaKind: 'image',
  mediaUrl: 'https://cdn.example.com/source.png',
  mediaWidth: 640,
  mediaHeight: 480,
  generationId: 'source-generation',
  status: 'idle',
} as NodeWorkflowNodeData

function renderWorkspace(
  defaultTask?: Parameters<typeof CanvasImageEditWorkspace>[0]['defaultTask'],
) {
  render(
    <CanvasImageEditWorkspace
      nodeId="source-node"
      data={SOURCE_DATA}
      defaultTask={defaultTask}
    />,
  )
}

/**
 * jsdom 不会真去取图，`new Image()` 永远不 onload。这个替身让它立刻报出一个
 * 与 `SOURCE_DATA` 声明值**不同**的真实边长，好让「量到的赢过字段」这条断言
 * 有意义。
 */
function stubImageProbe(naturalWidth: number, naturalHeight: number) {
  const original = globalThis.Image
  class ProbeImage {
    onload: (() => void) | null = null
    naturalWidth = naturalWidth
    naturalHeight = naturalHeight
    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  globalThis.Image = ProbeImage as unknown as typeof Image
  return () => {
    globalThis.Image = original
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.placeDerivedImages.mockReturnValue(['derived-node'])
  mocks.createExtractedElementAPI.mockResolvedValue({
    success: true,
    data: { id: 'material-1' },
  })
})

describe('CanvasImageEditWorkspace', () => {
  // 清单在这里照抄一份而不是直接 import READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS：
  // 后者会让断言变成同义反复，提级/降级就再也不会被这条测试拦下来。
  //
  // 沿革：2026-08-18 `decompose` / `outpaint` 整条删除，object-replace 与
  // style-transfer 因「全仓零执行路径」退回 hidden；2026-08-19 E3 把
  // object-replace 建出来并提回 ready。ready 现在五条，且每条都在
  // `CANVAS_CAPABILITY_DESCRIPTORS` 里有对应实现。
  it('renders the five ready capabilities and omits hidden placeholders', () => {
    renderWorkspace()

    for (const task of [
      'upscale',
      'remove-background',
      'inpaint',
      'extract-element',
      'object-replace',
    ]) {
      expect(screen.getAllByText(`tasks.${task}.label`).length).toBeGreaterThan(
        0,
      )
    }

    for (const hidden of ['style-transfer', 'text-render']) {
      expect(screen.queryByText(`tasks.${hidden}.label`)).toBeNull()
    }
    expect(screen.getByAltText('sourceAlt')).toHaveAttribute(
      'src',
      SOURCE_DATA.mediaUrl,
    )
  })

  it('places and focuses a single edit result without replacing the source', async () => {
    mocks.editImageAPI.mockResolvedValue({
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/upscaled.png',
        width: 2560,
        height: 1920,
        generation: { id: 'upscaled-generation' },
      },
    })
    renderWorkspace('upscale')

    fireEvent.click(screen.getByRole('button', { name: 'actions.upscale' }))

    await waitFor(() => {
      expect(mocks.placeDerivedImages).toHaveBeenCalledWith('source-node', [
        {
          imageUrl: 'https://cdn.example.com/upscaled.png',
          width: 2560,
          height: 1920,
          generationId: 'upscaled-generation',
          label: 'tasks.upscale.label',
          editCapability: 'upscale',
        },
      ])
    })
    expect(mocks.focusNode).toHaveBeenCalledWith('derived-node')
    expect(mocks.editImageAPI).toHaveBeenCalledWith(
      'upscale',
      SOURCE_DATA.mediaUrl,
      {
        generationId: 'source-generation',
        targetScale: '4x',
        modelId: 'fal-ai/aura-sr',
      },
    )
  })

  it('does not place an output when the edit request fails', async () => {
    mocks.editImageAPI.mockResolvedValue({
      success: false,
      error: 'provider failed',
    })
    renderWorkspace('remove-background')

    fireEvent.click(screen.getByRole('button', { name: 'actions.removeBg' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.placeDerivedImages).not.toHaveBeenCalled()
    expect(mocks.focusNode).not.toHaveBeenCalled()
  })

  it('blocks a second task run while the first request is pending', async () => {
    let resolveRequest: (value: {
      success: false
      error: string
    }) => void = () => undefined
    mocks.editImageAPI.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    renderWorkspace('upscale')
    const runButton = screen.getByRole('button', { name: 'actions.upscale' })

    fireEvent.click(runButton)
    fireEvent.click(runButton)

    expect(mocks.editImageAPI).toHaveBeenCalledTimes(1)
    resolveRequest({ success: false, error: 'provider failed' })
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
  })

  // ⚠ 2026-08-18 E0：画布 `inpaint` 一提交就 500，根因就在这两个数。源图真实
  // 1672×941，而工作区只读 `data.mediaWidth`、读不到就兜底 1024×1024 —— 导入
  // 进来的节点恰恰没有这个字段。蒙版按 1024 建、图是 1672 宽，FLUX Fill 直接
  // 拒绝。换成原尺寸蒙版重放同一个端点就成功，根因已证死。
  it('sizes the mask canvas from the measured bitmap, not the declared metadata', async () => {
    const restoreImage = stubImageProbe(1672, 941)
    try {
      renderWorkspace('inpaint')

      await waitFor(() => {
        expect(screen.getByTestId('inpaint-canvas-size')).toHaveTextContent(
          '1672x941',
        )
      })
      // 声明值（640×480）没赢 —— 它只是备份，位图才是事实源。
      expect(screen.getByTestId('inpaint-canvas-size')).not.toHaveTextContent(
        '640x480',
      )
    } finally {
      restoreImage()
    }
  })

  it('falls back to the declared metadata when the bitmap never loads', () => {
    // 替身不装 onload，模拟图取不到：此时只能退回 `data.mediaWidth`。
    renderWorkspace('inpaint')

    expect(screen.getByTestId('inpaint-canvas-size')).toHaveTextContent(
      '640x480',
    )
  })

  it('connects the inpaint editor callback to the API and placement', async () => {
    mocks.inpaintImageAPI.mockResolvedValue({
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/inpaint.png',
        width: 640,
        height: 480,
        generation: { id: 'inpaint-generation' },
      },
    })
    renderWorkspace('inpaint')

    fireEvent.click(
      screen.getByRole('button', { name: 'editor.inpaint.apply' }),
    )

    await waitFor(() => {
      expect(mocks.inpaintImageAPI).toHaveBeenCalledWith({
        imageUrl: SOURCE_DATA.mediaUrl,
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'repair face',
        sourceGenerationId: 'source-generation',
        modelId: 'fal-ai/flux-pro/v1/fill',
      })
    })
    expect(mocks.placeDerivedImages).toHaveBeenCalledWith(
      'source-node',
      expect.arrayContaining([
        expect.objectContaining({
          imageUrl: 'https://cdn.example.com/inpaint.png',
          editCapability: 'inpaint',
        }),
      ]),
    )
  })

  it('keeps the extracted result on canvas when material saving fails', async () => {
    mocks.extractElementAPI.mockResolvedValue({
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/cutout.png',
        width: 320,
        height: 480,
        generation: { id: 'cutout-generation' },
      },
    })
    mocks.createExtractedElementAPI.mockResolvedValue({
      success: false,
      error: 'materials unavailable',
    })
    renderWorkspace('extract-element')

    fireEvent.click(screen.getByRole('button', { name: 'extract.run' }))

    await waitFor(() => {
      expect(mocks.createExtractedElementAPI).toHaveBeenCalled()
    })
    expect(mocks.placeDerivedImages).toHaveBeenCalledWith(
      'source-node',
      expect.arrayContaining([
        expect.objectContaining({
          imageUrl: 'https://cdn.example.com/cutout.png',
          editCapability: 'extract-element',
        }),
      ]),
    )
    expect(mocks.toastWarning).toHaveBeenCalledWith('extract.success', {
      description: 'extract.saveFailed',
    })
  })
})
