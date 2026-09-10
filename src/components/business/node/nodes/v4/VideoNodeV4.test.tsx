import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

vi.mock('@xyflow/react', () => ({
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

/** 上传 / 生成 / 抓帧 / 模型清单四条外部路径桩掉：本组只看视频卡自己的行为。 */
const uploadFn = vi.fn(async () => ({ url: 'https://cdn.test/up.mp4' }))
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

const captureLastFrame = vi.fn(async () => ({
  ok: true as const,
  url: 'https://cdn.test/tail.webp',
}))
const captureCurrentFrame = vi.fn(async () => ({
  ok: true as const,
  url: 'https://cdn.test/frame.webp',
}))
vi.mock('@/hooks/node/use-video-reference-slots', () => ({
  useVideoReferenceSlots: () => ({
    grabbing: null,
    uploadError: null,
    captureLastFrame,
    captureCurrentFrame,
  }),
}))

const generateNode = vi.fn(async () => ({ success: false as const }))
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
      />
    ),
  }),
)

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => <div data-testid="asset-picker" />,
}))

// 画中框底部那条写作助手栏要 Clerk / ApiKeys 上下文，本组不测它（S2 已测）。
vi.mock('./text/TextAssistantBar', () => ({
  TextAssistantBar: () => <div data-testid="assistant-bar" />,
}))

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'
import { VideoNodeV4 } from './VideoNodeV4'
import { VIDEO_SLOT_PICKERS } from './video/VideoNodeMenus'
import {
  videoCardHeight,
  videoDurationOptions,
  videoFrameChipLabel,
  videoFrameReadout,
  videoSupportsGeneratedAudio,
} from './video/video-node-model'

const NOW = '2026-09-10T00:00:00.000Z'
/** 目录里真实存在的一个视频模型 —— 档位与声音开关都读它的能力表。 */
const MODEL_ID = 'seedance-2.0'

function videoNode(id: string, data: Record<string, unknown> = {}): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      label: id,
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    },
  } as NodeV4
}

function imageNode(id: string, url?: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'shot',
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...(url ? { url } : {}),
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
    onApplyBatch: vi.fn(async () => ({ createdNodeIds: ['new_1'] })),
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

function renderVideo(
  context: NodeV4CanvasContextValue,
  nodeId = 'v_1',
  selected = false,
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <VideoNodeV4 id={nodeId} data={target.data} selected={selected} />
    </NodeV4CanvasProvider>,
  )
}

const READY = {
  url: 'https://cdn.test/a.mp4',
  videoThumbnailUrl: 'https://cdn.test/a.png',
  durationSec: 7,
  params: { duration: '7', aspectRatio: '16:9', resolution: '1080p' },
  model: { optionId: 'opt_a', modelId: MODEL_ID, adapterType: 'fal' },
}

describe('空卡 / 有片两态（spec §5）', () => {
  it('空卡是 16:9 虚线框 + 一句提示，⛔ 没有封面', () => {
    renderVideo(harness([videoNode('v_1')]))
    const card = document.querySelector('[data-node-chrome="card"]')
    expect(card?.getAttribute('data-empty')).toBe('true')
    expect(document.querySelector('[data-node-card-add]')).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('卡高恒定 16:9 —— ⛔ 不按回填的媒体尺寸变形', () => {
    expect(videoCardHeight(320)).toBe(180)
  })

  it('有片收起态 = 封面 + 右下角时长，⛔ 没有播放钮、没有槽', () => {
    renderVideo(harness([videoNode('v_1', READY)]))
    expect(
      document.querySelector('[data-video-surface="ready"]'),
    ).not.toBeNull()
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      READY.videoThumbnailUrl,
    )
    expect(screen.getByText('7s')).toBeInTheDocument()
    expect(document.querySelector('[data-video-slot-chips]')).toBeNull()
  })

  it('悬停 = 静音自动播 + 底部细进度线 + 右上静音标', () => {
    renderVideo(harness([videoNode('v_1', READY)]))
    const surface = document.querySelector('[data-video-surface="ready"]')!
    expect(document.querySelector('[data-video-hover-preview]')).toBeNull()

    fireEvent.mouseEnter(surface)
    const preview = document.querySelector(
      '[data-video-hover-preview]',
    ) as HTMLVideoElement
    expect(preview).not.toBeNull()
    expect(preview.muted).toBe(true)
    expect(preview.autoplay).toBe(true)
    expect(document.querySelector('[data-video-hover-progress]')).not.toBeNull()
    expect(document.querySelector('[data-video-muted-badge]')).not.toBeNull()
    // 悬停时时长让位给进度线（画板：两者不同时出现）。
    expect(document.querySelector('[data-video-duration]')).toBeNull()

    fireEvent.mouseLeave(surface)
    expect(document.querySelector('[data-video-hover-preview]')).toBeNull()
  })
})

describe('选中：工具条与批操作', () => {
  it('工具条是 续拍 · 抽帧 · 下载 · ⋯ 四键', () => {
    renderVideo(harness([videoNode('v_1', READY)]), 'v_1', true)
    const toolbar = screen.getByTestId('flow-toolbar-top')
    expect(
      [...toolbar.querySelectorAll('[data-toolbar-action]')].map((element) =>
        element.getAttribute('data-toolbar-action'),
      ),
    ).toEqual(['continue', 'extract', 'download', 'more'])
  })

  it('续拍 = 抓末帧 + 一批四条（建末帧图 / 建下一段 / 落首帧 / 接续边），末帧图回填 url', async () => {
    const onApplyBatch = vi.fn(
      async (ops: readonly unknown[]) => (
        void ops,
        { createdNodeIds: ['img_new'] }
      ),
    )
    const onSetMedia = vi.fn()
    renderVideo(
      harness([videoNode('v_1', READY)], { onApplyBatch, onSetMedia }),
      'v_1',
      true,
    )
    fireEvent.click(
      screen
        .getByTestId('flow-toolbar-top')
        .querySelector('[data-toolbar-action="continue"]') as HTMLElement,
    )

    await waitFor(() => expect(onApplyBatch).toHaveBeenCalled())
    expect(captureLastFrame).toHaveBeenCalledWith(READY.url, 'v_1')
    const ops = onApplyBatch.mock.calls[0]?.[0] as unknown as readonly Record<
      string,
      unknown
    >[]
    expect(ops.map((op) => op.op)).toEqual([
      NODE_ASSISTANT_OP_V4_IDS.addNode,
      NODE_ASSISTANT_OP_V4_IDS.addNode,
      NODE_ASSISTANT_OP_V4_IDS.connect,
      NODE_ASSISTANT_OP_V4_IDS.connect,
    ])
    expect(ops[2]).toMatchObject({ slot: NODE_SLOT_IDS.firstFrame })
    // 接续边从这一段的 `tailFrame` 出口出去 —— 画布上因此看得见「接着上一段」。
    expect(ops[3]).toMatchObject({ source: 'v_1', sourceHandle: 'tailFrame' })
    await waitFor(() =>
      expect(onSetMedia).toHaveBeenCalledWith('img_new', {
        url: 'https://cdn.test/tail.webp',
      }),
    )
  })

  it('抽帧 = 截当前画面落成图片卡，连线**指回**这一段的参考槽', async () => {
    const onApplyBatch = vi.fn(
      async (ops: readonly unknown[]) => (
        void ops,
        { createdNodeIds: ['img_new'] }
      ),
    )
    const onSetMedia = vi.fn()
    renderVideo(
      harness([videoNode('v_1', READY)], { onApplyBatch, onSetMedia }),
      'v_1',
      true,
    )
    // 抽帧要一只正在放的 `<video>` —— 先悬停把它挂上来。
    fireEvent.mouseEnter(
      document.querySelector('[data-video-surface="ready"]') as HTMLElement,
    )
    fireEvent.click(
      screen
        .getByTestId('flow-toolbar-top')
        .querySelector('[data-toolbar-action="extract"]') as HTMLElement,
    )

    await waitFor(() => expect(onApplyBatch).toHaveBeenCalled())
    const ops = onApplyBatch.mock.calls[0]?.[0] as unknown as readonly Record<
      string,
      unknown
    >[]
    expect(ops[1]).toMatchObject({
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      target: 'v_1',
      slot: NODE_SLOT_IDS.reference,
    })
    await waitFor(() =>
      expect(onSetMedia).toHaveBeenCalledWith('img_new', {
        url: 'https://cdn.test/frame.webp',
      }),
    )
  })
})

describe('提示词栏', () => {
  it('回车 = 生成新版本', () => {
    const onSetPrompt = vi.fn()
    renderVideo(
      harness([videoNode('v_1', { ...READY, prompt: '她转身走向站台尽头' })], {
        onSetPrompt,
      }),
      'v_1',
      true,
    )
    const input = screen
      .getByTestId('flow-toolbar-bottom')
      .querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(generateNode).toHaveBeenCalled()
  })

  it('已挂的首帧 / 尾帧 / 语音在栏首行出小 chip，退格删断的是那条边', () => {
    const edges: NodeWorkflowEdgeV4[] = [
      {
        id: 'e1',
        source: 'i_kf',
        sourceHandle: 'out',
        target: 'v_1',
        slot: NODE_SLOT_IDS.firstFrame,
      },
    ]
    const onApplyOp = vi.fn()
    renderVideo(
      harness(
        [
          videoNode('v_1', {
            ...READY,
            slots: {
              [NODE_SLOT_IDS.firstFrame]: {
                versions: [
                  {
                    id: 'sv_e1',
                    edgeId: 'e1',
                    sourceNodeId: 'i_kf',
                    blocked: false,
                    addedAt: NOW,
                  },
                ],
                cur: 'sv_e1',
              },
            },
          }),
          imageNode('i_kf', 'https://cdn.test/kf.png'),
        ],
        { edges, onApplyOp },
      ),
      'v_1',
      true,
    )
    const chip = document.querySelector(
      '[data-video-slot-chip="firstFrame"]',
    ) as HTMLElement
    expect(chip).not.toBeNull()

    fireEvent.keyDown(chip, { key: 'Backspace' })
    expect(onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
      edgeId: 'e1',
    })
  })

  it('+ 菜单四项的顺序与槽名就是画板那一列', () => {
    // ⚠ 顺序断在**常量**上而不是打开菜单：Radix 的子菜单要真悬停才渲染内容，
    // 在 jsdom 里断它等于断 Radix 的实现，⛔ 不是断我们的契约。
    expect(VIDEO_SLOT_PICKERS.map((item) => item.slot)).toEqual([
      NODE_SLOT_IDS.firstFrame,
      NODE_SLOT_IDS.lastFrame,
      NODE_SLOT_IDS.reference,
      NODE_SLOT_IDS.voice,
    ])
  })
})

describe('画面弹层（spec §5）', () => {
  it('时长档位跟着模型能力表走，⛔ 不是一份写死的表', () => {
    expect(videoDurationOptions(undefined)).toEqual([])
    const durations = videoDurationOptions(MODEL_ID).map(
      (option) => option.value,
    )
    expect(durations).toContain('7')
    expect(durations).not.toContain('60')
  })

  it('生成声音开关只在模型发得出这个字段时可点', () => {
    expect(videoSupportsGeneratedAudio(undefined)).toBe(false)
    expect(videoSupportsGeneratedAudio(MODEL_ID)).toBe(true)
  })

  it('chip 上写 `7s · 16:9`，开了声音才接「· 有声」', () => {
    const params = { duration: '7', aspectRatio: '16:9' }
    expect(videoFrameChipLabel(params, { fallback: '画面' })).toBe('7s · 16:9')
    expect(
      videoFrameChipLabel(
        { ...params, generateAudio: true },
        { audioLabel: '有声', fallback: '画面' },
      ),
    ).toBe('7s · 16:9 · 有声')
    // 一个数都不知道时退回「画面」，⛔ 不编一个默认时长写在 chip 上。
    expect(videoFrameChipLabel(undefined, { fallback: '画面' })).toBe('画面')
  })

  it('底部读数 = 尺寸 · 时长 · 估价；缺价那一截不写', () => {
    expect(
      videoFrameReadout(MODEL_ID, {
        duration: '7',
        aspectRatio: '16:9',
        resolution: '1080p',
      }),
    ).toBe('1920×1080 · 7s · $4.77')
    // 480p 这一档 fal 没标价 —— 报尺寸与时长，⛔ 不拿 720p 的数去顶。
    expect(
      videoFrameReadout(MODEL_ID, {
        duration: '7',
        aspectRatio: '9:16',
        resolution: '480p',
      }),
      // 竖幅时短边是**宽**：480p 的 9:16 就是 480×853。
    ).toBe('480×853 · 7s')
  })

  it('弹层里四段齐全，声音是开关不是 chip', () => {
    renderVideo(harness([videoNode('v_1', READY)]), 'v_1', true)
    const chip = document.querySelector(
      '[data-video-frame-chip]',
    ) as HTMLElement
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.click(chip)
    expect(document.querySelector('[data-video-generate-audio]')).not.toBeNull()
    expect(document.querySelector('[data-video-frame-readout]')).not.toBeNull()
  })
})

describe('生成中（spec §1.9）', () => {
  it('裱框显影盖在卡上，提示词栏变灰可取消', () => {
    renderVideo(
      harness([videoNode('v_1', { ...READY, mediaJobId: 'job_1' })]),
      'v_1',
      true,
    )
    expect(
      document
        .querySelector('[data-node-kind="video"]')
        ?.getAttribute('data-generating'),
    ).toBe('true')
    // `variant="frame"` 走 `StudioGeneratingProgress`（描边环 + 大百分比），
    // 它对外的把手是 `role="progressbar"`。
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(
      document
        .querySelector('[data-node-chrome="prompt-bar"]')
        ?.getAttribute('data-generating'),
    ).toBe('true')
  })
})

describe('画中框（spec §5 / §1.11）', () => {
  it('上半播放器 · 下半镜头说明 · 页脚生成行 · 最底写作助手栏', () => {
    renderVideo(
      harness([videoNode('v_1', { ...READY, prompt: '镜头缓慢推近' })], {
        expandedNodeId: 'v_1',
      }),
      'v_1',
      true,
    )
    expect(document.querySelector('[data-video-player="ready"]')).not.toBeNull()
    expect(document.querySelector('[data-video-frame-body]')).not.toBeNull()
    expect(document.querySelector('[data-video-regenerate]')).not.toBeNull()
    expect(screen.getByTestId('assistant-bar')).toBeInTheDocument()
    // 页脚那两颗是**视频**的模型 / 参数，最底那条才是写作助手 —— 两种模型不混。
    expect(document.querySelector('[data-video-frame-readout]')).not.toBeNull()
  })
})

describe('快速看（spec §1.10）', () => {
  it('双击有片的卡打开播放器，⛔ 空卡不弹', () => {
    renderVideo(harness([videoNode('v_1')]))
    fireEvent.doubleClick(
      document.querySelector('[data-node-chrome="card"]') as HTMLElement,
    )
    expect(document.querySelector('[data-node-chrome="quick-look"]')).toBeNull()

    renderVideo(harness([videoNode('v_2', READY)]), 'v_2')
    fireEvent.doubleClick(
      document.querySelectorAll('[data-node-chrome="card"]')[1] as HTMLElement,
    )
    expect(
      document.querySelector('[data-node-chrome="quick-look"]'),
    ).not.toBeNull()
  })
})
