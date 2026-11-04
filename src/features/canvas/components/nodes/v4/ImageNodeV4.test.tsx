import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest'

// 图片卡的卡面 / 菜单 / 参考轨 / 模板 / 来源没了：真上传 hook、真素材库弹窗、真「我的模板」、
// 真媒体探测；只假网络（上传那一跳在 api-client 边界上假，其余走 fakeServer）。
// 生成那一路（真生成 hook + 真模型选择器 + 真配 key 弹窗）在 ImageNodeV4.generate.test.tsx。

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join('/')}` : key,
      {
        has: () => true,
        rich: (key: string) => key,
        markup: (key: string) => key,
        raw: (key: string) => key,
      },
    ),
  useLocale: () => 'zh',
  useFormatter: () => ({
    number: (value: number) => String(value),
    dateTime: () => 'date',
    relativeTime: () => 'relative-time',
  }),
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
  // 加载态 A：卡在屏幕上窄没窄按画布缩放算 —— 桩里固定 100%。
  useStore: <T,>(
    selector: (state: { transform: [number, number, number] }) => T,
  ) => selector({ transform: [0, 0, 1] }),
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

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-image' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/canvas',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

/** 上传那一跳（浏览器直传 R2 的一整条）在 api-client 边界上假。 */
const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  uploadImageFileAPI,
}))

import { API_ENDPOINTS } from '@/constants/config'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { __resetRecipesCacheForTests } from '@/features/prompts/hooks/use-recipes'
import { fakeServer } from '@/test/app-harness'
import {
  fakeAssetLibraryRoutes,
  stubBrowserObservers,
} from '@/test/fake-routes'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
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

const ok = (data: unknown) => Response.json({ success: true, data })

/** 「我的模板」里的两条：一条图片、一条视频（视频模板 ⛔ 出现在图片卡上）。 */
const RECIPES = [
  {
    id: 'r_cat',
    outputType: 'IMAGE',
    name: '橘猫',
    compiledPrompt: '一只橘猫',
  },
  {
    id: 'r_video',
    outputType: 'VIDEO',
    name: '运镜',
    compiledPrompt: '推镜头',
  },
].map((recipe) => ({
  ...recipe,
  userId: 'user-image',
  negativePrompt: null,
  modelId: 'gpt-image-2',
  provider: 'openai',
  parentGenerationId: null,
  version: 1,
  isDeleted: false,
  createdAt: NOW,
  updatedAt: NOW,
}))

let server: ReturnType<typeof fakeServer>
/** CDN 对读不出来的那张图回什么（404 = 素材库删了）。 */
let cdnStatus = 404
let recipeUses: string[] = []

beforeEach(() => {
  stubBrowserObservers()
  __resetRecipesCacheForTests()
  cdnStatus = 404
  recipeUses = []
  uploadImageFileAPI.mockReset().mockResolvedValue({
    success: true,
    data: { generation: { url: 'https://cdn.test/up.png' } },
  })
  // jsdom 不解码图片：浏览器解出来是 640×480。
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 640, height: 480, close: () => {} })),
  )
  server = fakeAssetLibraryRoutes(fakeServer())
    .on('GET', API_ENDPOINTS.API_KEYS, () => ok([]))
    .on('GET', API_ENDPOINTS.CHARACTER_CARDS, () => ok([]))
    .on('GET', API_ENDPOINTS.RECIPES, () =>
      ok({ recipes: RECIPES, total: RECIPES.length }),
    )
    .on(
      'POST',
      `${API_ENDPOINTS.RECIPES}/:id/use`,
      async (_request, { params }) => {
        recipeUses.push((await params).id!)
        return ok(null)
      },
    )
    // 读不出来的那张图：探一次 CDN。
    .on('HEAD', '/:file', () => new Response(null, { status: cdnStatus }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Host({ children }: { children: ReactNode }) {
  return <ApiKeysProvider>{children}</ApiKeysProvider>
}

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
    // 卡在发送那一下读「op 之后的图」—— 测试里就是这份上下文自己的 nodes / edges。
    readGraph() {
      return { nodes: this.nodes, edges: this.edges }
    },
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(),
    onTidyLayout: vi.fn(),
    onPlaceBeside: vi.fn(() => undefined),
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
    { wrapper: Host },
  )
}

it('手动把机器名改成另一种默认外形时走统一 set_field 改名', () => {
  const context = harness([
    imageNode('i_1', { subtype: 'result', name: '生成图2' }),
  ])
  renderImage(context)
  fireEvent.doubleClick(screen.getByRole('button', { name: 'renameNode' }))
  const input = screen.getByRole('textbox', { name: 'renameNode' })
  fireEvent.change(input, { target: { value: '生成图3' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(context.onApplyOp).toHaveBeenCalledWith({
    op: NODE_ASSISTANT_OP_V4_IDS.setField,
    target: 'i_1',
    field: 'name',
    value: '生成图3',
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

  it('空卡透明虚线、说明和两颗字键，选中只出提示词栏', () => {
    renderImage(harness([imageNode('i_1')]))
    expect(document.querySelector('[data-node-chrome="card"]')).toHaveAttribute(
      'data-empty',
      'true',
    )
    expect(document.querySelector('[data-node-card-surface]')).toHaveClass(
      'border-dashed',
      'bg-transparent',
    )
    expect(screen.getByText('chrome.emptyHint')).toBeInTheDocument()
    expect(document.querySelector('[data-node-empty-upload]')).not.toBeNull()
    expect(document.querySelector('[data-node-empty-library]')).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('选中空镜头图无工具条与空参考轨，上传和素材库字键可用；拖入变实线', async () => {
    renderImage(
      harness([imageNode('i_1', { subtype: 'shot' })], {
        selectedNodeIds: ['i_1'],
      }),
      'i_1',
      true,
    )
    expect(document.querySelector('[data-prompt-bar-input]')).not.toBeNull()
    expect(document.querySelector('[data-image-ref-rail]')).toBeNull()
    expect(screen.queryByRole('toolbar')).toBeNull()
    const fileInput = document.querySelector<HTMLInputElement>(
      'input[type="file"][accept="image/*"]',
    )!
    const click = vi.spyOn(fileInput, 'click')
    fireEvent.click(document.querySelector('[data-node-empty-upload]')!)
    expect(click).toHaveBeenCalled()
    fireEvent.click(document.querySelector('[data-node-empty-library]')!)
    expect(screen.getByRole('dialog')).toHaveTextContent('add.library')

    const root = document.querySelector('[data-node-kind="image"]')!
    fireEvent.dragOver(root, { dataTransfer: { types: ['Files'] } })
    expect(document.querySelector('[data-node-card-surface]')).toHaveClass(
      'border-solid',
      'bg-surface-fill-hover',
    )
    fireEvent.dragLeave(root, { relatedTarget: null })
    expect(document.querySelector('[data-node-card-surface]')).toHaveClass(
      'border-dashed',
    )
  })

  it('尚未挂参考时从参考上传产生 pending，参考轨立即显示进度格', () => {
    uploadImageFileAPI.mockImplementationOnce(() => new Promise(() => {}))
    renderImage(
      harness([imageNode('i_1', { subtype: 'shot' })], {
        selectedNodeIds: ['i_1'],
      }),
      'i_1',
      true,
    )
    expect(document.querySelector('[data-image-ref-rail]')).toBeNull()
    const file = new File(['x'], 'new-ref.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('[data-image-ref-file]')!, {
      target: { files: [file] },
    })
    expect(document.querySelector('[data-image-ref-rail]')).not.toBeNull()
    expect(
      document.querySelector('[data-image-rail-pending-state="uploading"]'),
    ).not.toBeNull()
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

  it('工具条四键：编辑 · 分镜 · 下载 · ⋯（放大回编辑，生镜头进 ⋯）', () => {
    renderImage(selectedContext(), 'i_1', true)
    const ids = Array.from(
      document.querySelectorAll('[data-toolbar-action]'),
    ).map((element) => element.getAttribute('data-toolbar-action'))
    expect(ids).toEqual(['edit', 'storyboard', 'download', 'more'])
  })

  it('提示词栏预填上次的词', () => {
    renderImage(selectedContext(), 'i_1', true)
    const input = document.querySelector(
      '[data-prompt-bar-input]',
    ) as HTMLTextAreaElement
    expect(input.value).toBe('站台')
    const bar = input.closest('[data-node-chrome="prompt-bar"]')
    expect(bar).toHaveClass('w-160')
    expect(bar?.parentElement).toHaveClass('gap-2')
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

  it('正文里的 @别的图：镜像层压缩略，退格整颗删掉', () => {
    const context = harness(
      [
        imageNode('i_1', {
          subtype: 'shot',
          url: 'https://cdn.test/a.png',
          prompt: '站台',
        }),
        imageNode('i_ref', { url: 'https://cdn.test/ref.png' }),
      ],
      { selectedNodeIds: ['i_1'] },
    )
    renderImage(context, 'i_1', true)
    const input = document.querySelector(
      '[data-prompt-bar-input]',
    ) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '站台 @i_ref' } })
    expect(
      document.querySelector(
        '[data-prompt-bar-mark="mention"] [data-prompt-bar-thumb]',
      ),
    ).not.toBeNull()
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(input.value).toBe('站台 ')
  })

  /**
   * ⚠ **阻塞在 S0**：`chrome/NodeToolbar` 的 `ToolbarCell` 把 `{...rest}` 展开在
   * `onClick={action.onSelect}` **之后**，而 Radix Tooltip 的触发器会经由 `rest`
   * 递一个自己的 `onClick` 下来 —— 于是每一格的点击都被覆盖掉，四个键一个都不响应。
   * 修法是一行（`{...rest}` 挪到 `onClick` 之前）—— S0 已经修掉，所以这条从
   * `it.fails` 转回正的断言。
   */
  it('⋯「新建镜头」是**一批**：建镜头 + 把这张图连成它的首帧', () => {
    const context = selectedContext()
    renderImage(context, 'i_1', true)
    fireEvent.pointerDown(
      document.querySelector('[data-toolbar-action="more"]') as HTMLElement,
      { button: 0 },
    )
    fireEvent.click(
      document.querySelector('[data-image-more="new-shot"]') as HTMLElement,
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

  it('没有可用模型时仍保留可见的模型 chip', () => {
    const context = harness([imageNode('i_1')], {
      selectedNodeIds: ['i_1'],
    })
    renderImage(context, 'i_1', true)
    expect(document.querySelector('[data-model-chip]')).not.toBeNull()
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
  it('四项都映射到已经跑得通的能力 id（放大在编辑里，⛔ 叫扩图）', () => {
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
    const context = harness([imageNode('i_1')], { selectedNodeIds: ['i_1'] })
    renderImage(context, 'i_1', true)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
    window.dispatchEvent(event)
    await waitFor(() =>
      expect(context.onSetMedia).toHaveBeenCalledWith(
        'i_1',
        expect.objectContaining({
          url: 'https://cdn.test/up.png',
          mediaWidth: 640,
          mediaHeight: 480,
        }),
      ),
    )
    expect(uploadImageFileAPI).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ note: 'i_1' }),
    )
  })

  it('未选中时不接管粘贴', async () => {
    renderImage(harness([imageNode('i_1')]), 'i_1', false)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
    window.dispatchEvent(event)
    await act(async () => {})
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
  })
})

describe('生成中 / 版本 / 画中框', () => {
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

  it('只有一版时版本条自己不渲染', () => {
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
      document.querySelector('[data-node-chrome="version-strip"]'),
    ).toBeNull()
  })

  it('有图双击进入与视频同款画中框', () => {
    const context = harness([
      imageNode('i_1', { url: 'https://cdn.test/a.png' }),
    ])
    renderImage(context, 'i_1')
    fireEvent.doubleClick(
      document.querySelector('[data-node-kind="image"]') as HTMLElement,
    )
    expect(context.onToggleExpanded).toHaveBeenCalledWith('i_1')
    expect(document.querySelector('[data-node-chrome="quick-look"]')).toBeNull()
  })

  it('选中图的空格与更多菜单仍能显式快速看', () => {
    renderImage(
      harness([imageNode('i_1', { url: 'https://cdn.test/a.png' })], {
        selectedNodeIds: ['i_1'],
      }),
      'i_1',
      true,
    )
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    expect(
      document.querySelector('[data-node-chrome="quick-look"]'),
    ).not.toBeNull()
    fireEvent.click(document.querySelector('[data-quick-look-close]')!)
    fireEvent.pointerDown(
      document.querySelector('[data-toolbar-action="more"]')!,
      {
        button: 0,
      },
    )
    fireEvent.click(document.querySelector('[data-image-more="quick-look"]')!)
    expect(
      document.querySelector('[data-node-chrome="quick-look"]'),
    ).not.toBeNull()
  })

  it('右键菜单与 ⋯ 是同一份清单', () => {
    renderImage(
      harness([imageNode('i_1', { url: 'https://cdn.test/a.png' })], {
        selectedNodeIds: ['i_1'],
      }),
      'i_1',
      true,
    )
    fireEvent.pointerDown(
      document.querySelector('[data-toolbar-action="more"]')!,
      { button: 0 },
    )
    const moreIds = [
      ...document.querySelectorAll<HTMLElement>('[data-image-more]'),
    ].map((item) => item.dataset.imageMore)
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    fireEvent.contextMenu(
      document.querySelector('[data-node-kind="image"]') as HTMLElement,
    )
    const menu = document.querySelector('[data-node-context-menu="i_1"]')!
    const contextIds = [...menu.querySelectorAll('[data-menu-action]')].map(
      (item) => item.getAttribute('data-menu-action'),
    )
    expect(moreIds).toContain('download')
    expect(contextIds).toEqual(moreIds)
  })

  it('空卡双击不打开画中框', () => {
    const context = harness([imageNode('i_1')])
    renderImage(context)
    fireEvent.doubleClick(
      document.querySelector('[data-node-kind="image"]') as HTMLElement,
    )
    expect(context.onToggleExpanded).not.toHaveBeenCalled()
  })

  it('打开态有原比例媒体、参考行、正文和共用生成页脚', () => {
    renderImage(
      harness(
        [
          imageNode('i_1', {
            subtype: 'shot',
            url: 'https://cdn.test/a.png',
            mediaWidth: 1920,
            mediaHeight: 1080,
            prompt: '雨夜的天台',
          }),
        ],
        { expandedNodeId: 'i_1', selectedNodeIds: ['i_1'] },
      ),
      'i_1',
      true,
    )
    expect(document.querySelector('[data-node-chrome="frame"]')).not.toBeNull()
    expect(document.querySelector('[data-toolbar-action]')).toBeNull()
    expect(document.querySelector('[data-prompt-bar-input]')).toBeNull()
    expect(
      document.querySelector('[data-image-frame-stage] img'),
    ).toHaveAttribute('src', 'https://cdn.test/a.png')
    expect(document.querySelector('[data-image-frame-refs]')).not.toBeNull()
    expect(document.querySelector('[data-image-frame-add-ref]')).not.toBeNull()
    expect(document.querySelector('[data-image-frame-body]')).toHaveTextContent(
      '雨夜的天台',
    )
    expect(document.querySelector('[data-image-regenerate]')).not.toBeNull()
  })

  it('画中框的版本点和左右键都切同一份输出版本', () => {
    const onApplyOp = vi.fn()
    renderImage(
      harness(
        [
          imageNode('i_1', {
            url: 'https://cdn.test/a.png',
            outputs: {
              versions: [
                { id: 'ov_1', url: 'https://cdn.test/a.png', createdAt: NOW },
                { id: 'ov_2', url: 'https://cdn.test/b.png', createdAt: NOW },
              ],
              cur: 0,
            },
          }),
        ],
        { expandedNodeId: 'i_1', onApplyOp },
      ),
    )
    const dots = document.querySelectorAll(
      '[data-image-frame-version-dots] button',
    )
    expect(dots).toHaveLength(2)
    fireEvent.click(dots[1]!)
    expect(onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: 'i_1',
      index: 1,
    })
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onApplyOp).toHaveBeenLastCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: 'i_1',
      index: 1,
    })
  })
})

describe('提示词栏参考图轨', () => {
  it('名称缩略图绑定挂载节点，图片更新后刷新，移除引用后恢复文字', () => {
    const prompt =
      '以「生成图6」确定脸型，以「生成图9」确定背后；「生成图60」未挂载。'
    const shot = imageNode('i_shot', { subtype: 'shot', prompt })
    const face = imageNode('i_face', { name: '生成图6', url: '/face.png' })
    const back = imageNode('i_back', { name: '生成图9', url: '/back.png' })
    const unbound = imageNode('i_other', {
      name: '生成图60',
      url: '/other.png',
    })
    const context = harness([shot, face, back, unbound], {
      selectedNodeIds: ['i_shot'],
      edges: ['i_back', 'i_face'].map((source) => ({
        id: `e_${source}`,
        source,
        sourceHandle: 'out',
        target: 'i_shot',
        slot: NODE_SLOT_IDS.reference,
      })),
    })
    const { container, rerender } = renderImage(context, 'i_shot', true)
    const overlay = () => container.querySelector('[data-prompt-bar-overlay]')!
    const thumbnails = () =>
      Array.from(overlay().querySelectorAll('img'), (image) =>
        image.getAttribute('src'),
      )
    expect(thumbnails()).toEqual(['/face.png', '/back.png'])
    expect(overlay().textContent).toBe(prompt)
    expect(screen.getByRole('textbox')).toHaveValue(prompt)

    const updatedContext = {
      ...context,
      nodes: [
        shot,
        imageNode('i_face', { name: '生成图6', url: '/face-v2.png' }),
        back,
        unbound,
      ],
    }
    const view = (value: NodeV4CanvasContextValue) => (
      <NodeV4CanvasProvider value={value}>
        {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
        <ImageNodeV4 id="i_shot" data={shot.data} selected />
      </NodeV4CanvasProvider>
    )
    rerender(view(updatedContext))
    expect(thumbnails()).toEqual(['/face-v2.png', '/back.png'])

    rerender(view({ ...updatedContext, edges: context.edges.slice(0, 1) }))
    expect(thumbnails()).toEqual(['/back.png'])
    expect(overlay().textContent).toBe(prompt)
    expect(context.onSetPrompt).not.toHaveBeenCalled()
  })

  it('两张挂载图片重名时不显示可能指错图片的缩略图', () => {
    const { container } = renderImage(
      harness(
        [
          imageNode('i_shot', { subtype: 'shot', prompt: '参考「同名图片」' }),
          imageNode('i_a', { name: '同名图片', url: '/a.png' }),
          imageNode('i_b', { name: '同名图片', url: '/b.png' }),
        ],
        {
          selectedNodeIds: ['i_shot'],
          edges: ['i_a', 'i_b'].map((source) => ({
            id: `e_${source}`,
            source,
            sourceHandle: 'out',
            target: 'i_shot',
            slot: NODE_SLOT_IDS.reference,
          })),
        },
      ),
      'i_shot',
      true,
    )
    expect(container.querySelector('[data-prompt-bar-overlay] img')).toBeNull()
    expect(screen.getByRole('textbox')).toHaveValue('参考「同名图片」')
  })

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

  it('已有参考的镜头图显示参考轨，可把另一张画布图挂上去', async () => {
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
          imageNode('i_ref', {
            url: 'https://cdn.test/ref.png',
          }),
        ],
        {
          selectedNodeIds: ['i_shot'],
          onApplyOp,
          edges: [
            {
              id: 'e_ref',
              source: 'i_ref',
              sourceHandle: 'out',
              target: 'i_shot',
              slot: NODE_SLOT_IDS.reference,
            },
          ],
        },
      ),
      'i_shot',
      true,
    )
    expect(document.querySelector('[data-image-ref-rail]')).not.toBeNull()
    expect(document.querySelector('[data-image-rail-add]')).toBeNull()
    expect(document.querySelectorAll('[data-prompt-bar-add]')).toHaveLength(1)
    fireEvent.pointerDown(document.querySelector('[data-prompt-bar-add]')!, {
      button: 0,
      pointerType: 'mouse',
    })
    const attached = await waitFor(
      () => document.querySelector('[data-image-add-canvas="i_ref"]')!,
    )
    expect(attached).toHaveAttribute('data-attached', 'true')
    fireEvent.click(attached)
    expect(onApplyOp).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(document.querySelector('[data-prompt-bar-add-menu]')).toBeNull(),
    )
    fireEvent.pointerDown(document.querySelector('[data-prompt-bar-add]')!, {
      button: 0,
      pointerType: 'mouse',
    })
    const candidate = await waitFor(
      () => document.querySelector('[data-image-add-canvas="i_gen"]')!,
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

  it('已有图的镜头图 ⌘V 进参考轨，不覆盖本卡', async () => {
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
    await waitFor(() =>
      expect(uploadImageFileAPI).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ note: 'i_shot' }),
      ),
    )
    await act(async () => {})
    expect(context.onSetMedia).not.toHaveBeenCalled()
  })
})

describe('来源没了（owner 09-27：素材库删了图，画布上是裂图）', () => {
  const URL = 'https://cdn.example/deleted.png'

  it('图读不出来且 CDN 回 404 → 灰底「已从素材库删除」+「从画布移除」，⛔ 不露裂图', async () => {
    const onApplyOp = vi.fn()
    renderImage(harness([imageNode('i_1', { url: URL })], { onApplyOp }))
    fireEvent.error(screen.getByRole('img'))

    expect(await screen.findByText('gone.image')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(server.requests).toContainEqual({
      method: 'HEAD',
      path: '/deleted.png',
    })

    fireEvent.click(screen.getByRole('button', { name: 'remove' }))
    expect(onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.delete,
      target: 'i_1',
    })
  })

  // owner 2026-09-29：好几版里只有一版的原图删了，按钮 ⛔ 连好的那几版一起删掉整张卡。
  it('卡上不止一版：按钮换成「去掉这一版」，只拿掉当前这一版', async () => {
    const onApplyOp = vi.fn()
    renderImage(
      harness(
        [
          imageNode('i_1', {
            url: URL,
            outputs: {
              versions: [
                { id: 'ov_1', url: URL, createdAt: NOW },
                {
                  id: 'ov_2',
                  url: 'https://cdn.example/ok.png',
                  createdAt: NOW,
                },
              ],
              cur: 0,
            },
          }),
        ],
        { onApplyOp },
      ),
    )
    fireEvent.error(screen.getByRole('img'))
    expect(await screen.findByText('gone.image')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'removeVersion' }))
    expect(onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.removeOutputVersion,
      target: 'i_1',
      index: 0,
    })
  })

  it('网络读不到 → 只说暂时读不到 +「重试」，重试把图重新挂回去', async () => {
    cdnStatus = 503
    renderImage(harness([imageNode('i_1', { url: URL })]))
    fireEvent.error(screen.getByRole('img'))

    expect(await screen.findByText('unreachable.image')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', URL)
  })
})

describe('`/` 模板与九宫格分镜（§3）', () => {
  function storyboardApi(
    overrides: Partial<
      NonNullable<NodeV4CanvasContextValue['storyboard']>
    > = {},
  ) {
    return {
      split: vi.fn(),
      issues: {},
      dismissIssue: vi.fn(),
      splitting: new Set<string>(),
      landing: null,
      ...overrides,
    }
  }

  it('挂着宫格模板：chip 首位写模板短名，正文开头一颗模板 chip', () => {
    const context = harness(
      [
        imageNode('i_1', {
          url: 'https://cdn.test/a.png',
          params: { aspectRatio: '16:9', promptTemplate: 'grid3' },
        }),
      ],
      { selectedNodeIds: ['i_1'], storyboard: storyboardApi() },
    )
    renderImage(context, 'i_1', true)
    const chip = document.querySelector('[data-testid="image-frame-chip"]')
    expect(chip?.textContent).toMatch(/^template\.grid3\.short · /)
    expect(
      document.querySelector('[data-prompt-template-chip="grid3"]'),
    ).not.toBeNull()
  })

  it('工具条「分镜 ▾」选一种：挂到参数上，其余参数不丢', () => {
    const onSetParams = vi.fn()
    const context = harness(
      [
        imageNode('i_1', {
          url: 'https://cdn.test/a.png',
          params: { aspectRatio: '16:9', count: 2 },
        }),
      ],
      { selectedNodeIds: ['i_1'], onSetParams },
    )
    renderImage(context, 'i_1', true)
    fireEvent.pointerDown(
      document.querySelector(
        '[data-toolbar-action="storyboard"]',
      ) as HTMLElement,
      { button: 0 },
    )
    fireEvent.click(
      document.querySelector('[data-image-storyboard="grid2"]') as HTMLElement,
    )
    expect(onSetParams).toHaveBeenCalledWith('i_1', {
      aspectRatio: '16:9',
      count: 2,
      promptTemplate: 'grid2',
    })
  })

  it('正文里打 `/` 列「我的模板」里的图片模板：选中把提示词落在 `/` 的位置', async () => {
    const context = harness(
      [imageNode('i_1', { url: 'https://cdn.test/a.png' })],
      { selectedNodeIds: ['i_1'] },
    )
    renderImage(context, 'i_1', true)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: '雨夜 /', selectionStart: 4, selectionEnd: 4 },
    })
    // 「我的模板」拉回来之后这一条才在列表里。
    const option = await waitFor(() => {
      const found = document.querySelector('[data-mention-option="r_cat"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    // 视频模板不出现在图片卡上。
    expect(document.querySelector('[data-mention-option="r_video"]')).toBeNull()
    fireEvent.pointerDown(option)
    expect(input.value).toBe('雨夜 一只橘猫')
    await waitFor(() => expect(recipeUses).toEqual(['r_cat']))
  })

  it('光标在最前面按退格：摘掉模板，正文不动', () => {
    const onSetParams = vi.fn()
    const context = harness(
      [
        imageNode('i_1', {
          prompt: '雨夜',
          params: { count: 2, promptTemplate: 'sequence4' },
        }),
      ],
      { selectedNodeIds: ['i_1'], onSetParams },
    )
    renderImage(context, 'i_1', true)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    input.setSelectionRange(0, 0)
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onSetParams).toHaveBeenCalledWith('i_1', { count: 2 })
    expect(input.value).toBe('雨夜')
  })

  it('认不出九宫格：卡上一句 + 手动切 3×3 / 2×2 + 关掉', () => {
    const storyboard = storyboardApi({ issues: { i_1: 'notDetected' } })
    const context = harness(
      [imageNode('i_1', { url: 'https://cdn.test/a.png' })],
      { storyboard },
    )
    renderImage(context)
    expect(screen.getByText('storyboard.notDetected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '3×3' }))
    fireEvent.click(screen.getByRole('button', { name: '2×2' }))
    fireEvent.click(screen.getByRole('button', { name: 'storyboard.dismiss' }))
    expect(storyboard.split).toHaveBeenNthCalledWith(1, 'i_1', 3)
    expect(storyboard.split).toHaveBeenNthCalledWith(2, 'i_1', 2)
    expect(storyboard.dismissIssue).toHaveBeenCalledWith('i_1')
  })

  it('正在切：卡上盖一层「正在切开」', () => {
    const context = harness(
      [imageNode('i_1', { url: 'https://cdn.test/a.png' })],
      { storyboard: storyboardApi({ splitting: new Set(['i_1']) }) },
    )
    renderImage(context)
    expect(document.querySelector('[data-storyboard-splitting]')).toBeTruthy()
  })
})
