import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImageEditComposerControls } from '@/components/business/studio-shared/editor/ImageEditComposer'
import type { StudioModelOption } from '@/types/model-option'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { CanvasImageEditWorkspace } from './CanvasImageEditWorkspace'

const mocks = vi.hoisted(() => ({
  createExtractedElementAPI: vi.fn(),
  editImageAPI: vi.fn(),
  extractElementAPI: vi.fn(),
  focusNode: vi.fn(),
  inpaintImageAPI: vi.fn(),
  placeDerivedImages: vi.fn(),
  setNodeRunState: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

// jsdom 没有 ResizeObserver：编辑面板里 Radix 的开关挂载时要它。
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

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({ hasLoaded: true }),
}))

vi.mock('@/hooks/use-image-edit-model-options', () => ({
  useImageEditModelOptions: (modelIds: readonly string[]) =>
    modelIds.map((modelId) => ({
      optionId: modelId,
      modelId,
      adapterType: modelId.startsWith('gpt-') ? 'openai' : 'fal',
      sourceType: 'saved',
      keyId: 'edit-key',
    })),
}))

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: () => null,
}))

vi.mock(
  '@/components/business/studio-shared/pickers/ModelPickerPopover',
  () => ({
    ModelPickerPopover: ({
      options,
      value,
      onChange,
      disabled,
    }: {
      options: StudioModelOption[]
      value: string | null
      onChange: (option: StudioModelOption) => void
      disabled: boolean
    }) => (
      <select
        aria-label="modelLabel"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => {
          const option = options.find(
            (item) => item.optionId === event.target.value,
          )
          if (option) onChange(option)
        }}
      >
        {options.map((option) => (
          <option key={option.optionId} value={option.optionId}>
            {option.modelId}
          </option>
        ))}
      </select>
    ),
  }),
)

vi.mock('./nodes/v4/NodeV4ActionsBridge', () => ({
  useNodeCanvasActions: () => ({
    placeDerivedImages: mocks.placeDerivedImages,
    focusNode: mocks.focusNode,
    setNodeRunState: mocks.setNodeRunState,
  }),
}))

vi.mock('@/components/business/studio/StudioInpaintEditor', () => ({
  StudioInpaintEditor: ({
    onApply,
    imageWidth,
    imageHeight,
    renderComposer,
    prompt,
    onPromptChange,
  }: {
    onApply: (maskDataUrl: string, prompt: string) => void
    imageWidth: number
    imageHeight: number
    renderComposer: (controls: ImageEditComposerControls) => React.ReactNode
    prompt: string
    onPromptChange: (value: string) => void
  }) => (
    <>
      {/* 蒙版画布就是按这两个数建的 —— 它们错了，蒙版尺寸就和源图对不上。 */}
      <span data-testid="inpaint-canvas-size">{`${imageWidth}x${imageHeight}`}</span>
      {renderComposer({
        input: (
          <textarea
            aria-label="inpaintPrompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
          />
        ),
        onSubmit: () => onApply('data:image/png;base64,mask', 'repair face'),
        canSubmit: true,
        submitLabel: 'editor.inpaint.apply',
      })}
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

/** 换任务：打开那颗「任务 ▾」chip，点菜单里那一项。 */
function selectTask(task: string) {
  fireEvent.click(screen.getByTestId('image-edit-task-chip'))
  fireEvent.click(
    screen.getByRole('menuitemradio', { name: `tasks.${task}.label` }),
  )
}

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
  it('keeps edit instructions when changing models and restores separate drafts when switching tasks', () => {
    renderWorkspace('edit-image')
    fireEvent.change(screen.getByRole('textbox', { name: 'editPromptLabel' }), {
      target: { value: 'keep the face and change the jacket' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'modelLabel' }), {
      target: { value: 'ideogram-4.5' },
    })
    expect(
      screen.getByRole('textbox', { name: 'editPromptLabel' }),
    ).toHaveValue('keep the face and change the jacket')
    selectTask('inpaint')
    fireEvent.change(screen.getByRole('textbox', { name: 'inpaintPrompt' }), {
      target: { value: 'repair the collar' },
    })
    selectTask('edit-image')
    expect(
      screen.getByRole('textbox', { name: 'editPromptLabel' }),
    ).toHaveValue('keep the face and change the jacket')
    expect(screen.getByRole('combobox', { name: 'modelLabel' })).toHaveValue(
      'ideogram-4.5',
    )
    selectTask('inpaint')
    expect(screen.getByRole('textbox', { name: 'inpaintPrompt' })).toHaveValue(
      'repair the collar',
    )
  })

  it('renders the three primary capabilities and exposes other tools in the menu', () => {
    renderWorkspace('edit-image')
    // 任务收成一颗 chip（owner 2026-10-03）：一个菜单列完六项，主三项在前。
    fireEvent.click(screen.getByTestId('image-edit-task-chip'))
    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent),
    ).toEqual([
      'tasks.edit-image.label',
      'tasks.inpaint.label',
      'tasks.object-replace.label',
      'tasks.upscale.label',
      'tasks.remove-background.label',
      'tasks.extract-element.label',
    ])

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
      expect(mocks.inpaintImageAPI).toHaveBeenCalledWith(
        {
          imageUrl: SOURCE_DATA.mediaUrl,
          maskImageUrl: 'data:image/png;base64,mask',
          prompt: 'repair face',
          options: {},
          sourceGenerationId: 'source-generation',
          modelId: 'fal-ai/flux-pro/v1/fill',
          apiKeyId: 'edit-key',
        },
        { onPreview: expect.any(Function), signal: expect.any(AbortSignal) },
      )
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

  it('sends the selected GPT Image 2.5 model, quality, background and preview settings', async () => {
    mocks.inpaintImageAPI.mockResolvedValue({
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/result.png',
        width: 640,
        height: 480,
      },
    })
    renderWorkspace('inpaint')
    fireEvent.change(screen.getByRole('combobox', { name: 'modelLabel' }), {
      target: { value: 'gpt-image-2.5-sunburst' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'settingsLabel' }))
    fireEvent.click(screen.getByRole('radio', { name: 'qualityOption.max' }))
    fireEvent.click(
      screen.getByRole('radio', { name: 'backgroundOption.transparent' }),
    )
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(
      screen.getByRole('button', { name: 'editor.inpaint.apply' }),
    )
    await waitFor(() =>
      expect(mocks.inpaintImageAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'gpt-image-2.5-sunburst',
          options: { quality: 'max', background: 'transparent', preview: true },
        }),
        { onPreview: expect.any(Function), signal: expect.any(AbortSignal) },
      ),
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
