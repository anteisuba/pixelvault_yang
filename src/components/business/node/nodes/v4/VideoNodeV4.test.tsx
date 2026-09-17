import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

/** 时长滑杆是 Radix Slider —— 它量 thumb 尺寸要 ResizeObserver（jsdom 没有）。 */
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join('/')}` : key,
      { has: () => false },
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

const cancelJobs = vi.fn()
const checkVideo = vi.fn()
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  cancelGenerationsAPI: (...args: unknown[]) => cancelJobs(...args),
  checkVideoStatusAPI: (...args: unknown[]) => checkVideo(...args),
}))
const generateNode = vi.fn<
  ReturnType<
    typeof import('@/hooks/node/use-node-media-generation-v4').useNodeMediaGenerationV4
  >['generateNode']
>(async () => ({ success: false as const, error: 'failed' }))
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

/** ⋯「加入剪辑台」走动作出口（`useNodeCanvasActions`）——本组只看它被调到。 */
const openEditDesk = vi.fn()
vi.mock('./NodeV4ActionsBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./NodeV4ActionsBridge')>()),
  useNodeCanvasActions: () => ({ openEditDesk }),
}))

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
import { flashNodeCard, resetNodeCardFlash } from './chrome'
import { VideoNodeV4 } from './VideoNodeV4'
import { VIDEO_RAIL_PICKERS } from './video/VideoNodeMenus'
import {
  VIDEO_SEND_MODE_IDS,
  videoCardHeight,
  videoDurationStepIndex,
  videoDurationSteps,
  videoFrameChipLabel,
  videoFrameReadout,
  videoRailCapacity,
  videoSendMode,
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
    expect(document.querySelector('[data-video-ref-rail]')).toBeNull()
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
  it('工具条第一键 = 展开，其后 续拍 · 抽帧 · 下载 · ⋯', () => {
    renderVideo(harness([videoNode('v_1', READY)]), 'v_1', true)
    const toolbar = screen.getByTestId('flow-toolbar-top')
    expect(
      [...toolbar.querySelectorAll('[data-toolbar-action]')].map((element) =>
        element.getAttribute('data-toolbar-action'),
      ),
    ).toEqual(['expand', 'continue', 'extract', 'download', 'more'])
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

  it('参考轨在栏首行：图组第 1 项带「首」角标，退格删断的是那条边', () => {
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
      '[data-video-rail-slot="firstFrame"]',
    ) as HTMLElement
    expect(chip).not.toBeNull()
    expect(chip.getAttribute('data-video-rail-index')).toBe('1')
    expect(
      chip.querySelector('[data-video-rail-role="firstFrame"]'),
    ).not.toBeNull()

    fireEvent.keyDown(chip, { key: 'Backspace' })
    expect(onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
      edgeId: 'e1',
    })
  })

  it('+ 菜单收成与轨一致的三组，图 / 视频都落参考、语音落语音', () => {
    // ⚠ 顺序断在**常量**上而不是打开菜单：Radix 的子菜单要真悬停才渲染内容，
    // 在 jsdom 里断它等于断 Radix 的实现，⛔ 不是断我们的契约。
    expect(VIDEO_RAIL_PICKERS.map((item) => [item.group, item.slot])).toEqual([
      ['image', NODE_SLOT_IDS.reference],
      ['video', NODE_SLOT_IDS.reference],
      ['voice', NODE_SLOT_IDS.voice],
    ])
  })
})

describe('画面弹层（spec §5）', () => {
  it('时长是滑杆的吸附表，跟着模型能力表走，⛔ 不是一份写死的表', () => {
    expect(videoDurationSteps(undefined)).toEqual([])
    const durations = videoDurationSteps(MODEL_ID)
    expect(durations).toContain(7)
    expect(durations).not.toContain(60)
    // 表是升序的（滑杆两端要写最小 / 最大）。
    expect([...durations].sort((a, b) => a - b)).toEqual([...durations])
  })

  it('存量卡上落不在档里的时长吸附到最近一格，⛔ 不跳回最左', () => {
    const steps = [4, 8, 12]
    expect(videoDurationStepIndex(steps, '9')).toBe(1)
    expect(videoDurationStepIndex(steps, '12')).toBe(2)
    expect(videoDurationStepIndex(steps, undefined)).toBe(0)
  })

  it('生成声音开关只在模型发得出这个字段时可点', () => {
    expect(videoSupportsGeneratedAudio(undefined)).toBe(false)
    expect(videoSupportsGeneratedAudio(MODEL_ID)).toBe(true)
  })

  it('chip 首位是推出来的模式，其后 `7s · 16:9 · 720p`，开了声音再接「· 有声」', () => {
    const params = { duration: '7', aspectRatio: '16:9', resolution: '720p' }
    expect(
      videoFrameChipLabel(params, {
        modeLabel: '文生视频',
        fallback: '选模型',
      }),
    ).toBe('文生视频 · 7s · 16:9 · 720p')
    expect(
      videoFrameChipLabel(
        { ...params, generateAudio: true },
        { modeLabel: '全能参考', audioLabel: '有声', fallback: '选模型' },
      ),
    ).toBe('全能参考 · 7s · 16:9 · 720p · 有声')
    // 一个数都不知道时退回 fallback（没模型时那是「选模型」）。
    expect(videoFrameChipLabel(undefined, { fallback: '选模型' })).toBe(
      '选模型',
    )
  })

  it('模式由挂了什么推出来（spec §5「不设模式页签」）', () => {
    const empty = {
      firstFrame: false,
      lastFrame: false,
      referenceImages: 0,
      videos: 0,
      voices: 0,
    }
    expect(videoSendMode(empty)).toBe(VIDEO_SEND_MODE_IDS.textToVideo)
    expect(videoSendMode({ ...empty, firstFrame: true })).toBe(
      VIDEO_SEND_MODE_IDS.imageToVideo,
    )
    expect(videoSendMode({ ...empty, firstFrame: true, lastFrame: true })).toBe(
      VIDEO_SEND_MODE_IDS.firstLastFrame,
    )
    // 任何一项参考（图 / 视频 / 语音）都把它推到全能参考 —— 首尾帧也让位。
    expect(videoSendMode({ ...empty, referenceImages: 1 })).toBe(
      VIDEO_SEND_MODE_IDS.omniReference,
    )
    expect(videoSendMode({ ...empty, videos: 1 })).toBe(
      VIDEO_SEND_MODE_IDS.omniReference,
    )
    expect(
      videoSendMode({
        ...empty,
        firstFrame: true,
        lastFrame: true,
        voices: 1,
      }),
    ).toBe(VIDEO_SEND_MODE_IDS.omniReference)
  })

  it('每组上限来自发送契约的参考变体，⛔ 不是另列的一份数字', () => {
    const capacity = videoRailCapacity({
      optionId: 'opt_a',
      modelId: MODEL_ID,
      adapterType: 'fal',
      providerConfig: { label: 'fal', baseUrl: 'https://fal.run' },
    } as never)
    // Seedance 2.0 的参考变体：图 9 · 视频 3 · 语音 3（send-plan 的
    // `SEEDANCE_20_REFERENCE_SLOTS`）。
    expect(capacity).toMatchObject({ images: 9, videos: 3, voices: 3 })
    expect(capacity.referenceUnavailable).toBe(false)
    // 没模型 = 上限未知（⛔ 不编一个数把加号灰掉）。
    expect(videoRailCapacity(undefined).images).toBeNull()
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

  it('底部读数带每组的 已挂 / 上限；上限不可得时只写已挂数', () => {
    expect(
      videoFrameReadout(
        MODEL_ID,
        { duration: '7', aspectRatio: '16:9', resolution: '1080p' },
        [
          { label: '图', current: 4, limit: 9 },
          { label: '视频', current: 2, limit: 3 },
          { label: '语音', current: 1, limit: null },
        ],
      ),
    ).toBe('1920×1080 · 7s · $4.77 · 图 4/9 · 视频 2/3 · 语音 1')
  })

  it('弹层里模式 · 时长滑杆 · 比例 · 清晰度 · 声音开关齐全', () => {
    renderVideo(harness([videoNode('v_1', READY)]), 'v_1', true)
    const chip = document.querySelector(
      '[data-video-frame-chip]',
    ) as HTMLElement
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.click(chip)
    expect(
      document.querySelector('[data-video-duration-slider]'),
    ).not.toBeNull()
    expect(document.querySelector('[data-video-generate-audio]')).not.toBeNull()
    expect(document.querySelector('[data-video-frame-readout]')).not.toBeNull()
    // 模式只读地写在弹层顶部（⛔ 没有任何一个可点的模式控件）。
    expect(document.querySelector('[data-video-frame-mode]')).not.toBeNull()
  })
})

describe('参考轨（spec §5，画板 `VideoRefs.dc.html` 方向 A）', () => {
  const railEdges: NodeWorkflowEdgeV4[] = [
    {
      id: 'e1',
      source: 'i_kf',
      sourceHandle: 'out',
      target: 'v_1',
      slot: NODE_SLOT_IDS.firstFrame,
    },
  ]
  const railNode = () =>
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
    })

  it('换角色 = 一批 `disconnect + connect`（**一条撤销**，⛔ 不发两个 op）', async () => {
    const onApplyBatch = vi.fn(
      async (ops: readonly unknown[]) => (
        void ops,
        { createdNodeIds: [] as string[] }
      ),
    )
    renderVideo(
      harness([railNode(), imageNode('i_kf', 'https://cdn.test/kf.png')], {
        edges: railEdges,
        onApplyBatch,
      }),
      'v_1',
      true,
    )
    const item = document.querySelector(
      '[data-video-rail-slot="firstFrame"]',
    ) as HTMLElement
    fireEvent.pointerDown(item, { button: 0, ctrlKey: false })
    fireEvent.click(item)
    const action = await screen.findByText('rail.setRole.reference')
    fireEvent.click(action)

    await waitFor(() => expect(onApplyBatch).toHaveBeenCalledTimes(1))
    expect(onApplyBatch.mock.calls[0]?.[0]).toEqual([
      { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: 'e1' },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: 'i_kf',
        target: 'v_1',
        slot: NODE_SLOT_IDS.reference,
      },
    ])
  })

  it('模型没有参考变体 → 视频 / 语音两组的加号**灰掉不藏**，图组照常', () => {
    renderVideo(
      harness([
        videoNode('v_1', {
          ...READY,
          // Veo 3.1 只有 image-content-array 那一档，没有参考端点。
          model: { optionId: 'opt_v', modelId: 'veo-3.1', adapterType: 'fal' },
        }),
      ]),
      'v_1',
      true,
    )
    fireEvent.pointerDown(
      document.querySelector('[data-video-rail-add="all"]')!,
      {
        button: 0,
        ctrlKey: false,
      },
    )
    const addOf = (group: string) =>
      document.querySelector(
        `[data-video-rail-add="${group}"]`,
      ) as HTMLButtonElement
    expect(addOf('video')).not.toBeNull()
    expect(addOf('video')).toHaveAttribute('aria-disabled', 'true')
    expect(addOf('voice')).toHaveAttribute('aria-disabled', 'true')
    expect(addOf('image')).not.toHaveAttribute('aria-disabled', 'true')
  })
})

describe('参数 chip 永不为空（spec §5）', () => {
  const option = (optionId: string, extra: Record<string, unknown> = {}) => ({
    optionId,
    modelId: MODEL_ID,
    adapterType: 'fal',
    providerConfig: { label: 'fal', baseUrl: 'https://fal.run' },
    sourceType: 'workspace',
    requestCount: 0,
    ...extra,
  })

  it('新卡即带默认模型（与图片卡同一条 `resolveModelChannel`：自己的 key 优先）', () => {
    renderVideo(
      harness([videoNode('v_1')], {
        modelOptionsByKind: {
          video: [
            option('opt_keyless'),
            option('opt_mine', { sourceType: 'saved', apiKeyId: 'k_1' }),
          ],
        },
      } as never),
      'v_1',
      true,
    )
    // 自己的 key 那条赢 —— chip 上写的就是它（⛔ 不是清单第一条）。
    expect(screen.getByTestId('model-chip').getAttribute('data-value')).toBe(
      'opt_mine',
    )
  })

  it('有模型时参数 chip 首位写推出来的模式，⛔ 不是空的「画面」', () => {
    renderVideo(
      harness([videoNode('v_1')], {
        modelOptionsByKind: { video: [option('opt_a')] },
      } as never),
      'v_1',
      true,
    )
    const chip = document.querySelector('[data-video-frame-chip]')
    expect(chip?.textContent).toContain('mode.textToVideo')
  })

  it('一个模型都没有时 chip 写「选模型」', () => {
    renderVideo(harness([videoNode('v_1')]), 'v_1', true)
    expect(document.querySelector('[data-video-frame-chip]')?.textContent).toBe(
      'frame.pickModel',
    )
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
  it('未发送的草稿在展开和收起间保持一致，展开生成也读取最新编辑', () => {
    const context = harness([
      videoNode('v_1', { ...READY, prompt: '原始内容' }),
    ])
    const view = renderVideo(context, 'v_1', true)
    fireEvent.change(document.querySelector('[data-prompt-bar-input]')!, {
      target: { value: '收起时输入的新内容' },
    })
    const renderState = (expandedNodeId: string | null) => (
      <NodeV4CanvasProvider value={{ ...context, expandedNodeId }}>
        {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
        <VideoNodeV4 id="v_1" data={context.nodes[0]!.data} selected />
      </NodeV4CanvasProvider>
    )
    view.rerender(renderState('v_1'))
    const editor = screen.getByRole('textbox', { name: 'frame.editAriaLabel' })
    expect(editor).toHaveTextContent('收起时输入的新内容')
    editor.textContent = '展开后继续输入'
    fireEvent.input(editor)
    fireEvent.click(document.querySelector('[data-video-regenerate]')!)
    expect(generateNode).toHaveBeenLastCalledWith(
      'v_1',
      expect.anything(),
      expect.objectContaining({ prompt: '展开后继续输入' }),
    )
    view.rerender(renderState(null))
    expect(document.querySelector('[data-prompt-bar-input]')).toHaveValue(
      '展开后继续输入',
    )
  })
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

describe('双击 = 展开 · 快速看走空格（画板 `VideoRefs.dc.html` 底注）', () => {
  it('双击卡片 = 展开画中框，⛔ 不再弹快速看', () => {
    const context = harness([videoNode('v_1', READY)])
    renderVideo(context, 'v_1')
    fireEvent.doubleClick(
      document.querySelector('[data-node-chrome="card"]') as HTMLElement,
    )
    expect(context.onToggleExpanded).toHaveBeenCalledWith('v_1')
    expect(document.querySelector('[data-node-chrome="quick-look"]')).toBeNull()
  })

  it('选中态按空格 = 快速看；空卡按了不弹', () => {
    renderVideo(harness([videoNode('v_1')]), 'v_1', true)
    fireEvent.keyDown(
      document.querySelector('[data-node-kind="video"]') as HTMLElement,
      { key: ' ' },
    )
    expect(document.querySelector('[data-node-chrome="quick-look"]')).toBeNull()

    renderVideo(harness([videoNode('v_2', READY)]), 'v_2', true)
    fireEvent.keyDown(
      document.querySelectorAll('[data-node-kind="video"]')[1] as HTMLElement,
      { key: ' ' },
    )
    expect(
      document.querySelector('[data-node-chrome="quick-look"]'),
    ).not.toBeNull()
  })

  it('栏内 / 轨上双击不冒泡到卡片（⛔ 选个词不该把框顶出来）', () => {
    const context = harness([videoNode('v_1', READY)])
    renderVideo(context, 'v_1', true)
    fireEvent.doubleClick(
      document.querySelector('[data-prompt-bar-input]') as HTMLElement,
    )
    fireEvent.doubleClick(
      document.querySelector('[data-video-ref-rail]') as HTMLElement,
    )
    expect(context.onToggleExpanded).not.toHaveBeenCalled()
  })

  it('⋯ 菜单里有「快速看」这一项（有片才给）', async () => {
    renderVideo(harness([videoNode('v_1', READY)]), 'v_1', true)
    const more = document.querySelector(
      '[data-toolbar-action="more"]',
    ) as HTMLElement
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false })
    fireEvent.click(more)
    await screen.findByText('more.quickLook')
    expect(
      document.querySelector('[data-video-more="quick-look"]'),
    ).not.toBeNull()
  })

  it('⋯「加入剪辑台」：有片时开台并带上这张卡；空卡灰掉不藏', async () => {
    openEditDesk.mockClear()
    const { unmount } = renderVideo(
      harness([videoNode('v_1', READY)]),
      'v_1',
      true,
    )
    const openMore = () => {
      const more = document.querySelector(
        '[data-toolbar-action="more"]',
      ) as HTMLElement
      fireEvent.pointerDown(more, { button: 0, ctrlKey: false })
      fireEvent.click(more)
    }
    openMore()
    const item = await screen.findByText('more.addToEditDesk')
    fireEvent.click(item)
    expect(openEditDesk).toHaveBeenCalledWith(['v_1'])

    unmount()
    // 空卡：项还在，但按不下去（⛔ 不藏 —— 藏了会被读成「这张卡不支持剪辑台」）。
    renderVideo(harness([videoNode('v_1')]), 'v_1', true)
    openMore()
    await screen.findByText('more.addToEditDesk')
    expect(
      document
        .querySelector('[data-video-more="edit-desk"]')
        ?.getAttribute('data-disabled'),
    ).toBe('')
  })
})

describe('别人连过来那一下高亮（spec §1.13 尾句）', () => {
  it('镜头卡是「连到镜头」唯一的目标 —— 它必须认得那一下亮', async () => {
    // ⚠ 回归闸：S5d 起初只给音频 / 图片 / 文本三张卡接了高亮，而目标**永远**是
    // 镜头卡，结果真机上连完什么都不亮（2026-09-10 实测）。
    renderVideo(harness([videoNode('v_1', READY)]), 'v_1')
    const card = () =>
      document
        .querySelector('[data-node-chrome="card"]')
        ?.getAttribute('data-changed')
    expect(card()).toBe('false')
    flashNodeCard('v_1')
    await waitFor(() => expect(card()).toBe('true'))
    resetNodeCardFlash()
    await waitFor(() => expect(card()).toBe('false'))
  })
})

describe('取消服务端任务', () => {
  it('调用取消 API，确认取消后才清理任务 ID', async () => {
    cancelJobs.mockResolvedValueOnce({
      success: true,
      data: { cancelled: ['job_1'], alreadyFinished: [], notFound: [] },
    })
    const context = harness([
      videoNode('v_1', { ...READY, mediaJobId: 'job_1' }),
    ])
    renderVideo(context, 'v_1', true)
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await waitFor(() =>
      expect(context.onSetMedia).toHaveBeenCalledWith('v_1', {
        mediaJobId: undefined,
        generationFailure: undefined,
      }),
    )
    expect(cancelJobs).toHaveBeenLastCalledWith(['job_1'])
  })

  it('服务端取消失败时保留任务 ID 和生成态', async () => {
    cancelJobs.mockResolvedValueOnce({ success: false })
    const context = harness([
      videoNode('v_1', { ...READY, mediaJobId: 'job_1' }),
    ])
    renderVideo(context, 'v_1', true)
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await waitFor(() => expect(cancelJobs).toHaveBeenLastCalledWith(['job_1']))
    expect(context.onSetMedia).not.toHaveBeenCalled()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('已完成的任务保留成功产物并退出残留生成态', async () => {
    cancelJobs.mockResolvedValueOnce({
      success: true,
      data: { cancelled: [], alreadyFinished: ['job_1'], notFound: [] },
    })
    checkVideo.mockResolvedValueOnce({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: { id: 'g', url: 'https://cdn/done.mp4' },
      },
    })
    const context = harness([
      videoNode('v_1', { ...READY, mediaJobId: 'job_1' }),
    ])
    renderVideo(context, 'v_1', true)
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await waitFor(() =>
      expect(context.onSetMedia).toHaveBeenCalledWith('v_1', {
        mediaJobId: undefined,
        generationFailure: undefined,
      }),
    )
    expect(context.onSetMedia).toHaveBeenCalledWith('v_1', {
      url: 'https://cdn/done.mp4',
      generationId: 'g',
    })
  })
})

it.each([false, true])(
  '失败回包 pending=%s 时正确保留或清除任务 ID',
  async (pending) => {
    generateNode.mockImplementationOnce(async (_id, _graph, options) => {
      options?.onJobCreated?.('job-failure')
      const result = {
        success: false as const,
        error: 'failed',
        ...(pending ? { pending: true as const, jobId: 'job-failure' } : {}),
      }
      options?.onEach?.(result)
      return result
    })
    const context = harness([videoNode('v_1', { ...READY, prompt: 'a shot' })])
    renderVideo(context, 'v_1', true)
    fireEvent.click(screen.getByRole('button', { name: 'send' }))
    await waitFor(() =>
      expect(context.onSetMedia).toHaveBeenCalledWith('v_1', {
        mediaJobId: 'job-failure',
      }),
    )
    if (pending) {
      expect(context.onSetMedia).not.toHaveBeenCalledWith('v_1', {
        mediaJobId: undefined,
        generationFailure: undefined,
      })
    } else {
      await waitFor(() =>
        expect(context.onSetMedia).toHaveBeenCalledWith('v_1', {
          mediaJobId: undefined,
          generationFailure: { error: 'failed' },
        }),
      )
    }
  },
)

it('提交尚未取得任务 ID 时点击取消，在 ID 到达后取消服务端任务', async () => {
  let options: Parameters<typeof generateNode>[2]
  let finish!: () => void
  generateNode.mockImplementationOnce(async (_id, _graph, supplied) => {
    options = supplied
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return { success: false, error: 'cancelled' }
  })
  cancelJobs.mockResolvedValueOnce({
    success: true,
    data: { cancelled: ['late-job'], alreadyFinished: [], notFound: [] },
  })
  const context = harness([videoNode('v_1', { ...READY, prompt: 'a shot' })])
  renderVideo(context, 'v_1', true)
  fireEvent.click(screen.getByRole('button', { name: 'send' }))
  fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
  options?.onJobCreated?.('late-job')
  await waitFor(() => expect(cancelJobs).toHaveBeenLastCalledWith(['late-job']))
  await waitFor(() =>
    expect(context.onSetMedia).toHaveBeenCalledWith('v_1', {
      mediaJobId: undefined,
      generationFailure: undefined,
    }),
  )
  finish()
})

it('失败原因在卡片与展开态持续显示，编辑提示词不会清除', () => {
  const data = {
    ...READY,
    prompt: 'a shot',
    status: 'failed',
    generationFailure: {
      error: 'Output rejected due to copyright restrictions',
    },
  }
  const context = harness([videoNode('v_1', data)])
  const view = renderVideo(context, 'v_1', true)
  expect(screen.getByRole('alert')).toHaveTextContent('copyright restrictions')
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'promptLabel' }), {
    target: { value: 'edited shot' },
  })
  expect(screen.getByRole('alert')).toHaveTextContent('copyright restrictions')
  view.unmount()
  renderVideo(harness([videoNode('v_1', data)], { expandedNodeId: 'v_1' }))
  expect(
    screen
      .getAllByRole('alert')
      .some((el) => el.textContent?.includes('copyright restrictions')),
  ).toBe(true)
})

it('历史失败节点没有详情时也显示错误，而不是空上传卡', () => {
  renderVideo(
    harness([videoNode('v_1', { status: 'failed', prompt: 'shot' })]),
    'v_1',
    true,
  )
  expect(screen.getByRole('alert')).toHaveTextContent('generateDesk.failed')
  expect(screen.getByRole('button', { name: 'frame.regenerate' })).toBeEnabled()
  expect(screen.queryByText('chrome.emptyHint')).not.toBeInTheDocument()
})
