import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { CanvasImageEditWorkspace } from './CanvasImageEditWorkspace'

const mocks = vi.hoisted(() => ({
  createExtractedElementAPI: vi.fn(),
  decomposeImageAPI: vi.fn(),
  editImageAPI: vi.fn(),
  extractElementAPI: vi.fn(),
  focusNode: vi.fn(),
  inpaintImageAPI: vi.fn(),
  outpaintImageAPI: vi.fn(),
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
  decomposeImageAPI: mocks.decomposeImageAPI,
  editImageAPI: mocks.editImageAPI,
  extractElementAPI: mocks.extractElementAPI,
  inpaintImageAPI: mocks.inpaintImageAPI,
  outpaintImageAPI: mocks.outpaintImageAPI,
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
  }: {
    onApply: (maskDataUrl: string, prompt: string) => void
  }) => (
    <button
      type="button"
      onClick={() => onApply('data:image/png;base64,mask', 'repair face')}
    >
      editor.inpaint.apply
    </button>
  ),
}))

vi.mock('@/components/business/studio/StudioOutpaintEditor', () => ({
  StudioOutpaintEditor: ({
    onApply,
  }: {
    onApply: (
      padding: { top: number; right: number; bottom: number; left: number },
      prompt: string,
    ) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        onApply({ top: 32, right: 64, bottom: 32, left: 64 }, 'continue scene')
      }
    >
      editor.outpaint.apply
    </button>
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.placeDerivedImages.mockReturnValue(['derived-node'])
  mocks.createExtractedElementAPI.mockResolvedValue({
    success: true,
    data: { id: 'material-1' },
  })
})

describe('CanvasImageEditWorkspace', () => {
  it('renders the six ready capabilities and omits hidden placeholders', () => {
    renderWorkspace()

    for (const task of [
      'upscale',
      'remove-background',
      'inpaint',
      'outpaint',
      'decompose',
      'extract-element',
    ]) {
      expect(screen.getAllByText(`tasks.${task}.label`).length).toBeGreaterThan(
        0,
      )
    }

    expect(screen.queryByText('tasks.object-replace.label')).toBeNull()
    expect(screen.queryByText('tasks.style-transfer.label')).toBeNull()
    expect(screen.queryByText('tasks.text-render.label')).toBeNull()
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

  it('batches only persistable decomposed layers into one placement', async () => {
    mocks.decomposeImageAPI.mockResolvedValue({
      success: true,
      data: {
        layers: [
          {
            name: 'front hair',
            imageUrl: 'https://cdn.example.com/front-hair.png',
          },
          {
            name: 'body',
            imageUrl: 'https://cdn.example.com/body.png',
          },
          {
            name: 'temporary',
            imageUrl: 'data:image/png;base64,temporary',
          },
        ],
        psdUrl: 'https://cdn.example.com/layers.psd',
        layerCount: 3,
      },
    })
    mocks.placeDerivedImages.mockReturnValue(['layer-1', 'layer-2'])
    renderWorkspace('decompose')

    fireEvent.click(screen.getByRole('button', { name: 'actions.decompose' }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'decomposePlace' }),
      ).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'decomposePlace' }))

    expect(mocks.placeDerivedImages).toHaveBeenCalledWith('source-node', [
      {
        imageUrl: 'https://cdn.example.com/front-hair.png',
        width: 640,
        height: 480,
        label: 'front hair',
        editCapability: 'decompose',
        batchId: expect.any(String),
        sourceGenerationId: 'source-generation',
      },
      {
        imageUrl: 'https://cdn.example.com/body.png',
        width: 640,
        height: 480,
        label: 'body',
        editCapability: 'decompose',
        batchId: expect.any(String),
        sourceGenerationId: 'source-generation',
      },
    ])
    expect(mocks.focusNode).toHaveBeenCalledWith('layer-1')
    expect(mocks.decomposeImageAPI).toHaveBeenCalledWith(SOURCE_DATA.mediaUrl, {
      modelId: 'xiuruisu/see-through',
      persist: true,
      generationId: 'source-generation',
    })
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

  it('connects the outpaint editor callback to the API and placement', async () => {
    mocks.outpaintImageAPI.mockResolvedValue({
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/outpaint.png',
        width: 768,
        height: 544,
        generation: { id: 'outpaint-generation' },
      },
    })
    renderWorkspace('outpaint')

    fireEvent.click(
      screen.getByRole('button', { name: 'editor.outpaint.apply' }),
    )

    await waitFor(() => {
      expect(mocks.outpaintImageAPI).toHaveBeenCalledWith({
        imageUrl: SOURCE_DATA.mediaUrl,
        padding: { top: 32, right: 64, bottom: 32, left: 64 },
        prompt: 'continue scene',
        sourceGenerationId: 'source-generation',
        modelId: 'fal-ai/image-apps-v2/outpaint',
      })
    })
    expect(mocks.placeDerivedImages).toHaveBeenCalledWith(
      'source-node',
      expect.arrayContaining([
        expect.objectContaining({
          imageUrl: 'https://cdn.example.com/outpaint.png',
          editCapability: 'outpaint',
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
