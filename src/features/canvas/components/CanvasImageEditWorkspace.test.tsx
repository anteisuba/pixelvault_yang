/**
 * 画布改图工作区：真 key 名单（`ApiKeysProvider`）→ 真改图模型清单 → 真模型选择器、
 * 真配 key 弹窗、真蒙版编辑器（`StudioInpaintEditor`）。
 * 只假网络（api-client 上 key 名单与改图那几条）、浏览器缺的 2D 画布 / 位图量尺、
 * 宿主注入的画布动作出口（`NodeCanvasActionsProvider`）、toast 与 next-intl。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'
import { apiKeyRecord, runIdleTasksImmediately } from '@/test/api-keys'
import { installFakeCanvas2d } from '@/test/fake-canvas-2d'

import { CanvasImageEditWorkspace } from './CanvasImageEditWorkspace'
import {
  NodeCanvasActionsProvider,
  type NodeCanvasActions,
} from './nodes/v4/NodeV4ActionsBridge'

const mocks = vi.hoisted(() => ({
  listApiKeys: vi.fn(),
  createExtractedElementAPI: vi.fn(),
  editImageAPI: vi.fn(),
  extractElementAPI: vi.fn(),
  inpaintImageAPI: vi.fn(),
  appendImageVersions: vi.fn(),
  setNodeRunState: vi.fn(),
  focusNode: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => true }),
}))

// ⚠ key 名单缓存按用户存：每例换一个 userId，每例都真去拉一次名单。
const user = vi.hoisted(() => ({ seq: 0 }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: `edit-user-${user.seq}`,
  }),
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
    info: vi.fn(),
  },
}))

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  listApiKeys: mocks.listApiKeys,
  createExtractedElementAPI: mocks.createExtractedElementAPI,
  editImageAPI: mocks.editImageAPI,
  extractElementAPI: mocks.extractElementAPI,
  inpaintImageAPI: mocks.inpaintImageAPI,
}))

/** 改图用得上的几把 key：FLUX Fill 走 fal、Ideogram 走自家、GPT Image 走 OpenAI。 */
const EDIT_KEYS = [
  apiKeyRecord({
    id: 'edit-key',
    modelId: 'fal-ai/flux-pro/v1/fill',
    adapterType: AI_ADAPTER_TYPES.FAL,
  }),
  apiKeyRecord({
    id: 'edit-key-ideogram',
    modelId: 'ideogram-4.5',
    adapterType: AI_ADAPTER_TYPES.IDEOGRAM,
  }),
  apiKeyRecord({
    id: 'edit-key-openai',
    modelId: 'gpt-image-2.5-sunburst',
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  }),
]

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

/** 真模型选择器：点开 chip，点那一行（每条都只有一把 key，点了直接选上）。 */
async function pickModel(modelId: string) {
  fireEvent.click(document.querySelector('[data-model-chip]')!)
  const row = await waitFor(() => {
    const found = document.querySelector(
      `[role="option"][data-model-key="${modelId}"]`,
    )
    expect(found).not.toBeNull()
    return found!
  })
  fireEvent.click(row)
}

/** 当前 chip 上写的模型名。 */
const chipModel = () =>
  document.querySelector('[data-model-chip]')?.getAttribute('title')

/** 局部重绘的提示词框（真蒙版编辑器的那一格）。 */
const inpaintPrompt = () =>
  document.querySelector<HTMLTextAreaElement>('#inpaint-prompt')!

const maskCanvas = () =>
  screen.getByLabelText('canvasLabel') as HTMLCanvasElement

/**
 * 在蒙版画布上涂一笔。画布量尺是浏览器排版给的，jsdom 里是 0 —— 这里按画布自己的
 * 像素尺寸答一个矩形，指针坐标才换算得出来。
 */
function paintMask() {
  const canvas = maskCanvas()
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: canvas.width,
    height: canvas.height,
  } as DOMRect)
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 40, pointerId: 1 })
}

/** 写一句、涂一笔、按「应用」。 */
function applyInpaint(prompt = 'repair face') {
  fireEvent.change(inpaintPrompt(), { target: { value: prompt } })
  paintMask()
  fireEvent.click(screen.getByRole('button', { name: 'apply' }))
}

/** 宿主（工作台）注入的画布动作出口：本组只用得到落版本与运行态两条。 */
const ACTIONS = new Proxy(
  {},
  {
    get: (_target, key) =>
      key === 'appendImageVersions'
        ? mocks.appendImageVersions
        : key === 'setNodeRunState'
          ? mocks.setNodeRunState
          : mocks.focusNode,
  },
) as NodeCanvasActions

async function renderWorkspace(
  defaultTask?: Parameters<typeof CanvasImageEditWorkspace>[0]['defaultTask'],
) {
  render(
    <ApiKeysProvider>
      <NodeCanvasActionsProvider value={ACTIONS}>
        <CanvasImageEditWorkspace
          nodeId="source-node"
          data={SOURCE_DATA}
          defaultTask={defaultTask}
        />
      </NodeCanvasActionsProvider>
    </ApiKeysProvider>,
  )
  // key 名单回来（挂上就拉）。
  await waitFor(() => expect(mocks.listApiKeys).toHaveBeenCalled())
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
  user.seq += 1
  // jsdom 没有 ResizeObserver：编辑面板里 Radix 的开关挂载时要它。
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  runIdleTasksImmediately()
  installFakeCanvas2d()
  mocks.listApiKeys.mockResolvedValue({ success: true, data: EDIT_KEYS })
  mocks.appendImageVersions.mockReturnValue(1)
  mocks.createExtractedElementAPI.mockResolvedValue({
    success: true,
    data: { id: 'material-1' },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CanvasImageEditWorkspace', () => {
  it('keeps edit instructions when changing models and restores separate drafts when switching tasks', async () => {
    await renderWorkspace('edit-image')
    fireEvent.change(screen.getByRole('textbox', { name: 'editPromptLabel' }), {
      target: { value: 'keep the face and change the jacket' },
    })
    await pickModel('ideogram-4.5')
    expect(chipModel()).toContain('Ideogram · 4.5')
    expect(
      screen.getByRole('textbox', { name: 'editPromptLabel' }),
    ).toHaveValue('keep the face and change the jacket')
    selectTask('inpaint')
    fireEvent.change(inpaintPrompt(), {
      target: { value: 'repair the collar' },
    })
    selectTask('edit-image')
    expect(
      screen.getByRole('textbox', { name: 'editPromptLabel' }),
    ).toHaveValue('keep the face and change the jacket')
    expect(chipModel()).toContain('Ideogram · 4.5')
    selectTask('inpaint')
    expect(inpaintPrompt()).toHaveValue('repair the collar')
  })

  it('renders the three primary capabilities and exposes other tools in the menu', async () => {
    await renderWorkspace('edit-image')
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
    await renderWorkspace('upscale')

    fireEvent.click(screen.getByRole('button', { name: 'actions.upscale' }))

    await waitFor(() => {
      expect(mocks.appendImageVersions).toHaveBeenCalledWith('source-node', [
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
    await renderWorkspace('remove-background')

    fireEvent.click(screen.getByRole('button', { name: 'actions.removeBg' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.appendImageVersions).not.toHaveBeenCalled()
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
    await renderWorkspace('upscale')
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
  it('sizes the exported mask from the measured bitmap, not the declared metadata', async () => {
    mocks.inpaintImageAPI.mockResolvedValue({ success: false, error: 'x' })
    const restoreImage = stubImageProbe(1672, 941)
    try {
      await renderWorkspace('inpaint')
      // 位图量到之后，绘制画布按 1672:941 的比例重建。
      await waitFor(() =>
        expect(maskCanvas().width / maskCanvas().height).toBeCloseTo(
          1672 / 941,
          2,
        ),
      )
      applyInpaint()
      // 发出去的蒙版是源图的逐像素尺寸 —— 声明值（640×480）没赢，它只是备份。
      await waitFor(() =>
        expect(mocks.inpaintImageAPI).toHaveBeenCalledWith(
          expect.objectContaining({
            maskImageUrl: 'data:image/png;base64,canvas-1672x941',
          }),
          expect.anything(),
        ),
      )
    } finally {
      restoreImage()
    }
  })

  it('falls back to the declared metadata when the bitmap never loads', async () => {
    mocks.inpaintImageAPI.mockResolvedValue({ success: false, error: 'x' })
    // jsdom 的图永远不 onload，模拟图取不到：此时只能退回 `data.mediaWidth`。
    await renderWorkspace('inpaint')
    expect([maskCanvas().width, maskCanvas().height]).toEqual([640, 480])
    applyInpaint()
    await waitFor(() =>
      expect(mocks.inpaintImageAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          maskImageUrl: 'data:image/png;base64,canvas-640x480',
        }),
        expect.anything(),
      ),
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
    await renderWorkspace('inpaint')

    applyInpaint('repair face')

    await waitFor(() => {
      expect(mocks.inpaintImageAPI).toHaveBeenCalledWith(
        {
          imageUrl: SOURCE_DATA.mediaUrl,
          maskImageUrl: 'data:image/png;base64,canvas-640x480',
          prompt: 'repair face',
          options: {},
          sourceGenerationId: 'source-generation',
          modelId: 'fal-ai/flux-pro/v1/fill',
          apiKeyId: 'edit-key',
        },
        { onPreview: expect.any(Function), signal: expect.any(AbortSignal) },
      )
    })
    await waitFor(() =>
      expect(mocks.appendImageVersions).toHaveBeenCalledWith(
        'source-node',
        expect.arrayContaining([
          expect.objectContaining({
            imageUrl: 'https://cdn.example.com/inpaint.png',
            editCapability: 'inpaint',
          }),
        ]),
      ),
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
    await renderWorkspace('inpaint')
    await pickModel('gpt-image-2.5-sunburst')
    fireEvent.click(screen.getByRole('button', { name: 'settingsLabel' }))
    fireEvent.click(screen.getByRole('radio', { name: 'qualityOption.max' }))
    fireEvent.click(
      screen.getByRole('radio', { name: 'backgroundOption.transparent' }),
    )
    fireEvent.click(screen.getByRole('switch'))
    applyInpaint()
    await waitFor(() =>
      expect(mocks.inpaintImageAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'gpt-image-2.5-sunburst',
          apiKeyId: 'edit-key-openai',
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
    await renderWorkspace('extract-element')

    fireEvent.click(screen.getByRole('button', { name: 'extract.run' }))

    await waitFor(() => {
      expect(mocks.createExtractedElementAPI).toHaveBeenCalled()
    })
    expect(mocks.appendImageVersions).toHaveBeenCalledWith(
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
