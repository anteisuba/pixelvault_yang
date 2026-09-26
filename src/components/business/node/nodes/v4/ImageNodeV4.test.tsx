import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join('/')}` : key,
      { has: () => true },
    ),
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src as string} alt="" />
  ),
}))

vi.mock('@xyflow/react', () => ({
  // S6e：卡壳从 RF 拿自己的 id（拖线反馈）。桩里给一个固定值就够。
  useNodeId: () => 'node-1',
  Handle: (props: Record<string, unknown>) => (
    <span data-testid="handle" data-slot={props['data-slot'] as string} />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-testid={`flow-toolbar-${String(props.position)}`}>
        {props.children as ReactNode}
      </div>
    ) : null,
}))

/** 上传 / 生成 / 模型清单三条外部路径桩掉：本组只看图片卡自己的行为。 */
const uploadFn = vi.fn(async () => ({ url: 'https://cdn.test/up.png' }))
vi.mock('@/hooks/node/use-node-upload-v4', () => ({
  useNodeUploadV4: () => ({
    upload: uploadFn,
    retry: vi.fn(),
    isUploading: false,
    progress: 0,
    error: null,
    canRetry: false,
    cancel: vi.fn(),
  }),
}))

type GenerateNode = ReturnType<typeof useNodeMediaGenerationV4>['generateNode']
const generateNode = vi.fn<GenerateNode>(async () => ({
  success: false,
  error: 'noPlan',
}))
vi.mock('@/hooks/node/use-node-media-generation-v4', () => ({
  useNodeMediaGenerationV4: () => ({ generateNode, isLoading: false }),
}))

vi.mock(
  '@/components/business/studio-shared/pickers/ModelPickerPopover',
  () => ({
    ModelPickerPopover: (props: Record<string, unknown>) => (
      <button
        type="button"
        data-testid="model-chip"
        data-value={String(props.value)}
        data-count={(props.options as unknown[]).length}
        onClick={() =>
          (props.onChange as (option: { optionId: string }) => void)({
            optionId: 'opt_b',
          })
        }
      />
    ),
  }),
)

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => <div data-testid="asset-picker" />,
}))

vi.mock('../../CanvasImageEditWorkspace', () => ({
  CanvasImageEditWorkspace: (props: Record<string, unknown>) => (
    <div data-testid="image-edit" data-task={String(props.defaultTask)} />
  ),
}))

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

import { ImageNodeV4 } from './ImageNodeV4'
import {
  collapsedImageHeight,
  collapsedImageWidth,
  imageFrameReadout,
  imageVersions,
  toStudioModelOption,
} from './image/image-node-model'
import { IMAGE_EDIT_MENU_TASKS } from './image/ImageNodeMenus'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

const NOW = '2026-09-10T00:00:00.000Z'

function imageNode(id: string, data: Record<string, unknown> = {}): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'reference',
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    },
  } as NodeV4
}

function harness(
  nodes: readonly NodeV4[],
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes,
    edges: [],
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
    selectedNodeIds: [],
    modelOptionsByKind: {},
    onToggleExpanded: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onFocusNode: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
    onSetPrompt: vi.fn(),
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(),
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

function renderImage(
  context: NodeV4CanvasContextValue,
  nodeId = 'i_1',
  selected = false,
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <ImageNodeV4 id={nodeId} data={target.data} selected={selected} />
    </NodeV4CanvasProvider>,
  )
}

function renderSubmittingImage(data: Record<string, unknown> = {}) {
  const onSetMedia = vi.fn()
  function Fixture() {
    const [node, setNode] = useState(
      imageNode('i_1', { prompt: '站台', ...data }),
    )
    const context = harness([node], {
      selectedNodeIds: ['i_1'],
      onSetMedia: (id, patch) => {
        onSetMedia(id, patch)
        setNode(
          (current) =>
            ({
              ...current,
              data: { ...current.data, ...patch },
            }) as NodeV4,
        )
      },
    })
    return (
      <NodeV4CanvasProvider value={context}>
        {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
        <ImageNodeV4 id="i_1" data={node.data} selected />
      </NodeV4CanvasProvider>
    )
  }
  render(<Fixture />)
  return {
    onSetMedia,
    submit: () =>
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }),
  }
}

describe('图片生成失败反馈', () => {
  beforeEach(() => {
    generateNode
      .mockReset()
      .mockResolvedValue({ success: false, error: 'noPlan' })
  })

  it('提交尚未创建任务就失败时持久化并显示具体错误', async () => {
    const failure = {
      success: false as const,
      error: 'Reference image could not be read',
      errorCode: 'reference_image_unreachable',
      i18nKey: 'errors.generation.reference_image_unreachable',
    }
    generateNode.mockImplementationOnce(async (_id, _graph, options) => {
      options?.onEach?.(failure)
      return failure
    })
    const { submit, onSetMedia } = renderSubmittingImage()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'generation.reference_image_unreachable',
    )
    expect(onSetMedia).toHaveBeenCalledWith('i_1', {
      mediaJobId: undefined,
      generationFailure: {
        error: failure.error,
        errorCode: failure.errorCode,
        i18nKey: failure.i18nKey,
      },
    })
    expect(document.querySelector('[data-node-kind="image"]')).toHaveAttribute(
      'data-generating',
      'false',
    )
  })

  it('未识别的服务端错误仍显示原有具体原因', async () => {
    const failure = {
      success: false as const,
      error: 'Execution dispatch outcome unknown',
    }
    generateNode.mockImplementationOnce(async (_id, _graph, options) => {
      options?.onEach?.(failure)
      return failure
    })
    const { submit } = renderSubmittingImage()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(failure.error)
  })

  it('刷新恢复的错误保持可见并保留此前图片', () => {
    renderImage(
      harness([
        imageNode('i_1', {
          url: 'https://cdn.test/previous.png',
          generationFailure: { error: 'Execution dispatch outcome unknown' },
        }),
      ]),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Execution dispatch outcome unknown',
    )
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.test/previous.png',
    )
  })

  it('未创建生成计划也显示已有的选模型提示', async () => {
    const { submit } = renderSubmittingImage()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'generateDesk.noModel',
    )
  })

  it('服务器仍在运行时保留任务，不显示失败', async () => {
    const result = {
      success: false as const,
      error: 'poll window ended',
      pending: true as const,
      jobId: 'job-pending',
    }
    generateNode.mockImplementationOnce(async (_id, _graph, options) => {
      options?.onJobCreated?.(result.jobId)
      options?.onEach?.(result)
      return result
    })
    const { submit, onSetMedia } = renderSubmittingImage()
    await act(async () => submit())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSetMedia).toHaveBeenLastCalledWith('i_1', {
      mediaJobId: 'job-pending',
    })
    expect(document.querySelector('[data-node-kind="image"]')).toHaveAttribute(
      'data-generating',
      'true',
    )
  })

  it('服务器确认取消后清理任务，不把取消显示成生成失败', async () => {
    const result = {
      success: false as const,
      error: 'Node media generation failed',
      cancelled: true as const,
    }
    generateNode.mockImplementationOnce(async (_id, _graph, options) => {
      options?.onJobCreated?.('job-cancelled')
      options?.onEach?.(result)
      return result
    })
    const { submit, onSetMedia } = renderSubmittingImage()
    await act(async () => submit())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSetMedia).toHaveBeenLastCalledWith('i_1', {
      mediaJobId: undefined,
      generationFailure: undefined,
    })
    expect(document.querySelector('[data-node-kind="image"]')).toHaveAttribute(
      'data-generating',
      'false',
    )
  })

  it('再次提交立即清除旧失败状态', async () => {
    let finish:
      | ((result: Awaited<ReturnType<GenerateNode>>) => void)
      | undefined
    generateNode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { submit, onSetMedia } = renderSubmittingImage({
      generationFailure: { error: 'previous failure' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('previous failure')
    submit()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSetMedia).toHaveBeenCalledWith('i_1', {
      generationFailure: undefined,
    })
    await act(async () => finish?.({ success: false, error: 'noPlan' }))
  })

  it('本地取消后迟到的失败不再显示或持久化为生成失败', async () => {
    let finish: (() => void) | undefined
    generateNode.mockImplementationOnce(
      (_id, _graph, options) =>
        new Promise((resolve) => {
          finish = () => {
            const failure = {
              success: false as const,
              error: 'late provider failure',
            }
            options?.onEach?.(failure)
            resolve(failure)
          }
        }),
    )
    const { submit, onSetMedia } = renderSubmittingImage()
    submit()
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await act(async () => finish?.())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      onSetMedia.mock.calls.every(([, patch]) => !patch.generationFailure),
    ).toBe(true)
    expect(document.querySelector('[data-node-kind="image"]')).toHaveAttribute(
      'data-generating',
      'false',
    )
  })
})

describe('卡宽卡高随媒体比例', () => {
  it('缺尺寸时退回收起态定宽与 16:9', () => {
    expect(collapsedImageWidth({ kind: 'image' } as never)).toBe(320)
    expect(collapsedImageHeight({ kind: 'image' } as never)).toBe(180)
  })

  it('竖图卡不变宽，高按真实比例长出来', () => {
    const data = {
      kind: 'image',
      mediaWidth: 1024,
      mediaHeight: 1792,
    } as never
    expect(collapsedImageWidth(data)).toBe(320)
    expect(collapsedImageHeight(data)).toBe(560)
  })

  it('横图变宽但钳在展开宽以内', () => {
    expect(
      collapsedImageWidth({
        kind: 'image',
        mediaWidth: 4000,
        mediaHeight: 1000,
      } as never),
    ).toBe(480)
  })
})

describe('空卡 / 有图两态', () => {
  it('拖入本地图片后，新节点在上传完成前显示加载态', () => {
    renderImage(
      harness([imageNode('i_1')], {
        pendingUploads: [{ id: 'i_1', name: 'sample.png' }],
      }),
    )
    expect(
      document.querySelector('[data-image-surface="uploading"]'),
    ).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('uploading')
    expect(document.querySelector('[data-node-card-add]')).toBeNull()
  })

  it('空卡是虚线框 + 加号 + 一句提示，⛔ 没有图', () => {
    renderImage(harness([imageNode('i_1')]))
    const card = screen.getByTestId
    void card
    expect(
      document
        .querySelector('[data-node-chrome="card"]')
        ?.getAttribute('data-empty'),
    ).toBe('true')
    expect(document.querySelector('[data-node-card-add]')).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('有图但缺尺寸时，解码后按 naturalWidth/Height 回填当前版', () => {
    const context = harness([
      imageNode('i_1', { url: 'https://cdn.test/portrait.png' }),
    ])
    renderImage(context)
    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    Object.defineProperty(img, 'naturalWidth', { value: 1024 })
    Object.defineProperty(img, 'naturalHeight', { value: 1792 })
    fireEvent.load(img!)
    expect(context.onSetMedia).toHaveBeenCalledWith('i_1', {
      mediaWidth: 1024,
      mediaHeight: 1792,
    })
  })

  it('已有尺寸不再回填', () => {
    const context = harness([
      imageNode('i_1', {
        url: 'https://cdn.test/a.png',
        mediaWidth: 1600,
        mediaHeight: 900,
      }),
    ])
    renderImage(context)
    const img = document.querySelector('img')
    Object.defineProperty(img, 'naturalWidth', { value: 1024 })
    Object.defineProperty(img, 'naturalHeight', { value: 1792 })
    fireEvent.load(img!)
    expect(context.onSetMedia).not.toHaveBeenCalled()
  })

  it('有图收起态卡即图，⛔ 无读数角标', () => {
    renderImage(
      harness([
        imageNode('i_1', {
          url: 'https://cdn.test/a.png',
          mediaWidth: 1600,
          mediaHeight: 900,
          imageSource: 'generated',
        }),
      ]),
    )
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/a.png',
    )
    expect(document.querySelector('[data-image-readout]')).toBeNull()
    expect(document.querySelector('[data-image-source]')).toBeNull()
  })

  it('端口点按端口表渲染，卡面上不占位置', () => {
    renderImage(harness([imageNode('i_1')]))
    expect(screen.getAllByTestId('handle').length).toBeGreaterThan(0)
  })
})

describe('选中态：工具条 + 提示词栏', () => {
  const selectedContext = () =>
    harness(
      [imageNode('i_1', { url: 'https://cdn.test/a.png', prompt: '站台' })],
      { selectedNodeIds: ['i_1'] },
    )

  it('工具条四键：生镜头 · 编辑 · 下载 · ⋯', () => {
    renderImage(selectedContext(), 'i_1', true)
    const ids = Array.from(
      document.querySelectorAll('[data-toolbar-action]'),
    ).map((element) => element.getAttribute('data-toolbar-action'))
    expect(ids).toEqual(['shot', 'edit', 'download', 'more'])
  })

  it('提示词栏预填上次的词', () => {
    renderImage(selectedContext(), 'i_1', true)
    const input = document.querySelector(
      '[data-prompt-bar-input]',
    ) as HTMLTextAreaElement
    expect(input.value).toBe('站台')
  })

  it('多选时工具条与提示词栏都收起（⛔ 每张卡各弹一条）', () => {
    const context = harness(
      [imageNode('i_1', { url: 'https://cdn.test/a.png' })],
      { selectedNodeIds: ['i_1', 'i_2'] },
    )
    renderImage(context, 'i_1', true)
    expect(document.querySelector('[data-toolbar-action]')).toBeNull()
    expect(document.querySelector('[data-prompt-bar-input]')).toBeNull()
  })

  it('回车 = 生成新版本，先落提示词再发', () => {
    const context = selectedContext()
    renderImage(context, 'i_1', true)
    const input = document.querySelector(
      '[data-prompt-bar-input]',
    ) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '站台，夜' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(context.onSetPrompt).toHaveBeenCalledWith('i_1', '站台，夜')
    expect(generateNode).toHaveBeenCalled()
  })

  /**
   * ⚠ **阻塞在 S0**：`chrome/NodeToolbar` 的 `ToolbarCell` 把 `{...rest}` 展开在
   * `onClick={action.onSelect}` **之后**，而 Radix Tooltip 的触发器会经由 `rest`
   * 递一个自己的 `onClick` 下来 —— 于是每一格的点击都被覆盖掉，四个键一个都不响应。
   * 修法是一行（`{...rest}` 挪到 `onClick` 之前）—— S0 已经修掉，所以这条从
   * `it.fails` 转回正的断言。
   */
  it('连到镜头弹层顶行「新建镜头」是**一批**：建镜头 + 把这张图连成它的首帧', () => {
    const context = selectedContext()
    renderImage(context, 'i_1', true)
    fireEvent.click(
      document.querySelector('[data-toolbar-action="shot"]') as HTMLElement,
    )
    fireEvent.click(
      document.querySelector('[data-connect-to-shot-new]') as HTMLElement,
    )
    // ⚠ 断言的是 `onApplyBatch` 而不是两次 `onApplyOp`：两条必须同批才解得开
    // `ref`，也才收成一个撤销条目。
    expect(context.onApplyBatch).toHaveBeenCalledTimes(1)
    const [ops] = (context.onApplyBatch as Mock).mock.calls[0] as [
      readonly { op: string; ref?: string; target?: string; slot?: string }[],
    ]
    expect(ops[0]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: 'video',
      subtype: 'shot',
    })
    expect(ops[1]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      source: 'i_1',
      slot: 'firstFrame',
    })
    // 第二条指的就是第一条建出来的那张（批内别名）。
    expect(ops[1]?.target).toBe(ops[0]?.ref)
  })
})

describe('画面弹层与模型 chip', () => {
  it('比例弹层底部算的是**真的会发出去**的那个尺寸 + 单价', () => {
    expect(imageFrameReadout('16:9', undefined)).toBe('1792×1024')
    expect(imageFrameReadout(undefined, undefined)).toBe('')
  })

  it('规格 chip 上写的是全量摘要（第 12 项：一颗 chip · 比例 · 清晰度）', () => {
    const context = harness(
      [
        imageNode('i_1', {
          url: 'https://cdn.test/a.png',
          params: { aspectRatio: '1:1' },
        }),
      ],
      { selectedNodeIds: ['i_1'] },
    )
    renderImage(context, 'i_1', true)
    expect(
      document.querySelector('[data-testid="image-frame-chip"]')?.textContent,
    ).toContain('1:1')
  })

  it('模型 chip 单选：选中回落 onSetModel', () => {
    const options = [
      {
        optionId: 'opt_a',
        modelId: 'model-a',
        adapterType: 'fal',
        providerConfig: {},
        requestCount: 0,
        sourceType: 'workspace',
      },
      {
        optionId: 'opt_b',
        modelId: 'model-b',
        adapterType: 'fal',
        providerConfig: {},
        requestCount: 0,
        sourceType: 'saved',
      },
    ] as never
    const context = harness(
      [
        imageNode('i_1', {
          url: 'https://cdn.test/a.png',
          model: { optionId: 'opt_a', modelId: 'model-a' },
        }),
      ],
      { selectedNodeIds: ['i_1'], modelOptionsByKind: { image: options } },
    )
    renderImage(context, 'i_1', true)
    const chip = screen.getByTestId('model-chip')
    expect(chip.getAttribute('data-value')).toBe('opt_a')
    expect(chip.getAttribute('data-count')).toBe('2')
    fireEvent.click(chip)
    expect(context.onSetModel).toHaveBeenCalledWith(
      'i_1',
      expect.objectContaining({ optionId: 'opt_b', modelId: 'model-b' }),
    )
  })

  it('选项映射与 WorkflowModelPicker 同口径（apiKeyId → keyId）', () => {
    expect(
      toStudioModelOption({
        optionId: 'o',
        modelId: 'm',
        adapterType: 'fal',
        providerConfig: {},
        requestCount: 0,
        sourceType: 'saved',
        apiKeyId: 'k1',
      } as never),
    ).toMatchObject({ keyId: 'k1', isBuiltIn: false })
  })
})

describe('编辑子菜单', () => {
  it('四项都映射到已经跑得通的能力 id', () => {
    expect(IMAGE_EDIT_MENU_TASKS.map((entry) => entry.task)).toEqual([
      'inpaint',
      'upscale',
      'remove-background',
      'object-replace',
    ])
  })
})

describe('粘贴 / 上传落卡', () => {
  it('选中态 ⌘V 图片落进这张卡（⛔ 不另开一张）', async () => {
    uploadFn.mockClear()
    const context = harness([imageNode('i_1')], { selectedNodeIds: ['i_1'] })
    renderImage(context, 'i_1', true)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
    window.dispatchEvent(event)
    expect(uploadFn).toHaveBeenCalledWith('image', file, 'i_1')
    await Promise.resolve()
    await Promise.resolve()
    expect(context.onSetMedia).toHaveBeenCalledWith(
      'i_1',
      expect.objectContaining({ url: 'https://cdn.test/up.png' }),
    )
  })

  it('未选中时不接管粘贴', () => {
    uploadFn.mockClear()
    renderImage(harness([imageNode('i_1')]), 'i_1', false)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
    window.dispatchEvent(event)
    expect(uploadFn).not.toHaveBeenCalled()
  })
})

describe('生成中 / 版本 / 快速看', () => {
  it('在飞的 job 让卡进裱框显影，提示词栏变灰可取消', () => {
    renderImage(
      harness(
        [imageNode('i_1', { url: 'https://cdn.test/a.png', mediaJobId: 'j1' })],
        {
          selectedNodeIds: ['i_1'],
        },
      ),
      'i_1',
      true,
    )
    expect(
      document
        .querySelector('[data-node-chrome="prompt-bar"]')
        ?.getAttribute('data-generating'),
    ).toBe('true')
    expect(document.querySelector('[data-prompt-bar-cancel]')).not.toBeNull()
  })

  it('产出版本今天只有一版，版本点自己不渲染', () => {
    expect(imageVersions({ kind: 'image' } as never)).toEqual([])
    expect(
      imageVersions({ kind: 'image', url: 'https://cdn.test/a.png' } as never),
    ).toEqual(['https://cdn.test/a.png'])
    renderImage(
      harness([imageNode('i_1', { url: 'https://cdn.test/a.png' })], {
        selectedNodeIds: ['i_1'],
      }),
      'i_1',
      true,
    )
    expect(
      document.querySelector('[data-node-chrome="version-dots"]'),
    ).toBeNull()
  })

  it('双击 = 快速看（有图才开）', () => {
    renderImage(
      harness([imageNode('i_1', { url: 'https://cdn.test/a.png' })]),
      'i_1',
    )
    fireEvent.doubleClick(
      document.querySelector('[data-node-kind="image"]') as HTMLElement,
    )
    expect(
      document.querySelector('[data-node-chrome="quick-look"]'),
    ).not.toBeNull()
  })

  it('空卡双击不开快速看', () => {
    renderImage(harness([imageNode('i_1')]))
    fireEvent.doubleClick(
      document.querySelector('[data-node-kind="image"]') as HTMLElement,
    )
    expect(document.querySelector('[data-node-chrome="quick-look"]')).toBeNull()
  })
})

describe('提示词栏参考图轨', () => {
  it('叶子参考图不显示轨（没有 reference 入口）', () => {
    renderImage(
      harness([imageNode('i_1', { url: 'https://cdn.test/a.png' })], {
        selectedNodeIds: ['i_1'],
      }),
      'i_1',
      true,
    )
    expect(document.querySelector('[data-image-ref-rail]')).toBeNull()
  })

  it('镜头图选中时显示参考轨，可把画布上已生成的图挂上去', async () => {
    const onApplyOp = vi.fn()
    renderImage(
      harness(
        [
          imageNode('i_shot', {
            subtype: 'shot',
            url: 'https://cdn.test/shot.png',
            prompt: '夜景',
          }),
          imageNode('i_gen', {
            subtype: 'shot',
            url: 'https://cdn.test/gen.png',
            name: '成图 A',
          }),
        ],
        { selectedNodeIds: ['i_shot'], onApplyOp },
      ),
      'i_shot',
      true,
    )
    expect(document.querySelector('[data-image-ref-rail]')).not.toBeNull()
    fireEvent.pointerDown(document.querySelector('[data-image-rail-add]')!, {
      button: 0,
    })
    const candidate = await waitFor(
      () =>
        document.querySelector(
          '[data-image-rail-candidate="i_gen"]',
        ) as HTMLElement,
    )
    fireEvent.click(candidate)
    expect(onApplyOp).toHaveBeenCalledWith(
      expect.objectContaining({
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: 'i_gen',
        target: 'i_shot',
        slot: 'reference',
      }),
    )
  })

  it('已有图的镜头图 ⌘V 进参考轨，不覆盖本卡', () => {
    uploadFn.mockClear()
    const context = harness(
      [
        imageNode('i_shot', {
          subtype: 'shot',
          url: 'https://cdn.test/shot.png',
        }),
      ],
      { selectedNodeIds: ['i_shot'] },
    )
    renderImage(context, 'i_shot', true)
    const file = new File(['x'], 'ref.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
    window.dispatchEvent(event)
    expect(uploadFn).toHaveBeenCalledWith('image', file, 'i_shot')
    expect(context.onSetMedia).not.toHaveBeenCalled()
  })
})
