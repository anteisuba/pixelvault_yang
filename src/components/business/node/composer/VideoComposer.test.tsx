import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

// jsdom lacks ResizeObserver, which the radix Slider in the duration control
// calls on mount; the V-3a 管理素材 ResponsiveDialog needs scrollIntoView too.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock(
  '@/components/business/studio-shared/pickers/CanvasRoutePicker',
  () => ({
    CanvasRoutePicker: ({
      triggerLabel,
      variant,
      mediaModality,
    }: {
      triggerLabel?: string
      variant?: string
      mediaModality?: string
    }) => (
      <button
        type="button"
        data-testid="shared-model-picker"
        data-variant={variant}
        data-modality={mediaModality}
      >
        {triggerLabel}
      </button>
    ),
  }),
)

// Radix DropdownMenu doesn't open on a synthetic click in jsdom; follow the
// repo's established pattern (LoraAssetCard.test) and render the ⋮ menu
// inline so its conditional items are queryable without driving the portal.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <div role="menuitem" onClick={onClick}>
      {children}
    </div>
  ),
}))

const { composerState } = vi.hoisted(() => ({
  composerState: {
    referenceKinds: [] as Array<'character' | 'background' | 'shot' | 'voice'>,
    referenceTokens: [] as Array<{
      id: string
      kind: 'character' | 'background' | 'shot' | 'voice'
      label: string
      token: string
      mediaUrl?: string
      coverImage?: string
      imageSlotIndex?: number
      audioSlotIndex?: number
      edgeId?: string
      boundVoice?: { nodeId: string; label: string; ready: boolean }
    }>,
    referencedTokenIds: new Set<string>(),
    // R3-6b: `maxReferenceImages` / `sendPreview` mirror `useVideoComposer`'s
    // real return shape — VideoComposer.tsx reads both unconditionally, so
    // this mock has to supply them (not just the fields these tests assert
    // on) or the component throws reading properties off `undefined`.
    maxReferenceImages: undefined as number | undefined,
    sendPreview: {
      translatedPrompt: '',
      legend: '',
      images: [] as Array<{
        url: string
        index: number
        name?: string
        kind?: string
        category?: string
      }>,
      overflow: [] as Array<{ url: string; name?: string }>,
      assembledImageCount: 0,
      videoUrls: [] as string[],
      audioEntries: [] as Array<{ index: number; label: string }>,
      dropped: [],
      contract: {
        family: 'seedance' as const,
        referenceMode: 'text-or-first-frame' as const,
        slots: { images: 1, videos: 0, audio: 0 },
        parameters: {
          duration: true,
          aspectRatio: true,
          resolution: true,
          negativePrompt: false,
          generateAudio: true,
          seed: true,
        },
        execution: 'ready' as const,
        positionalImageTokens: false,
      },
      request: { prompt: '' },
      canSubmit: true,
      blockers: [],
    },
  },
}))

/**
 * ⚠ `videoMode` 用**真实**的推导，不在 mock 里手写一份简化版：模式的事实源在
 * `useVideoComposer` 里（存量节点从模型反推），组件只是读它。写个
 * `data.videoMode ?? 'keyframe'` 的假货，就等于让这些测试绕开真正要守的那条规则。
 */
vi.mock('@/hooks/node/use-video-composer', async () => {
  const { DEFAULT_VIDEO_NODE_MODE, getNodeModeForModel } =
    await import('@/constants/video-node-modes')
  return {
    useVideoComposer: (_nodeId: string, data: NodeWorkflowNodeData) => ({
      options: [],
      videoMode:
        data?.videoMode ??
        (data?.model
          ? getNodeModeForModel(data.model.modelId, data.model.adapterType)
          : DEFAULT_VIDEO_NODE_MODE),
      hasReferenceInputs: false,
      hasUpstreamInputs: true,
      referenceKinds: composerState.referenceKinds,
      referenceTokens: composerState.referenceTokens,
      referencedTokenIds: composerState.referencedTokenIds,
      maxReferenceImages: composerState.maxReferenceImages,
      sendPreview: composerState.sendPreview,
    }),
  }
})

/** Round 2 A: open the inline 管理素材 region and return its content root. */
function openManager() {
  fireEvent.click(
    screen.getByRole('button', { name: 'references.manageButton' }),
  )
  return screen.getByRole('region', { name: 'references.manageTitle' })
}

/** Radix Tabs' trigger switches value on `onMouseDown`, not `onClick` (see
 *  @radix-ui/react-tabs source) — a plain `fireEvent.click` never fires a
 *  preceding mousedown in jsdom, so the tab silently stays put. */
function selectTab(container: HTMLElement, name: string) {
  fireEvent.mouseDown(within(container).getByRole('tab', { name }))
}

const {
  updateNodeData,
  updateEdgeData,
  focusNode,
  deleteEdge,
  toastInfo,
  spawnReference,
  setExpandedNodeId,
  listConnectableReferences,
  connectReferenceNode,
} = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  updateEdgeData: vi.fn(),
  focusNode: vi.fn(),
  deleteEdge: vi.fn(),
  toastInfo: vi.fn(),
  spawnReference: vi.fn(),
  setExpandedNodeId: vi.fn(),
  listConnectableReferences: vi.fn(),
  connectReferenceNode: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    updateEdgeData,
    generateMediaNode: vi.fn(),
    setExpandedNodeId,
    focusNode,
    deleteEdge,
    listConnectableReferences,
    connectReferenceNode,
    spawnReference,
  }),
}))

// Stub the asset library — when open, expose a button that resolves a fake
// picked generation so the ＋添加位 → autospawn wiring is testable without the
// real dialog's data fetching.
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    mediaType,
    onSelect,
  }: {
    open: boolean
    mediaType?: string
    onSelect?: (g: unknown) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="asset-pick"
        data-media-type={mediaType}
        onClick={() =>
          onSelect?.({
            id: 'gen1',
            url: 'https://cdn.test/picked.png',
            thumbnailUrl: 'https://cdn.test/picked-thumb.webp',
            prompt: '选中的角色',
            model: 'seedream',
          })
        }
      >
        pick-asset
      </button>
    ) : null,
}))

vi.mock('sonner', () => ({
  toast: { info: toastInfo },
}))

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: () => null,
}))

// ⚠ S7 起 detail 分支通过 `useDownstreamUses` 直接读 React Flow 的 store
// （关系带「被哪些节点用」）。本文件不套 ReactFlowProvider，所以在这里给桩，
// 否则每一条 detail 用例都会死在 zustand provider 缺失上。
vi.mock('@xyflow/react', () => ({
  useNodes: () => [],
  useEdges: () => [],
}))

// Radix Popover 在 jsdom 里不会被合成 click 打开（本文件对 dropdown-menu 已有
// 同样的注记）。参数与模型都收进了它（契约 §8「参数收成一颗按钮」），所以这里
// 给一个**行为等价**的桩而不是摊平：保留开合语义与 `aria-expanded`，
// 只把「怎么打开」换成同步的 click —— 否则要么测不到浮层里的控件（摊平前），
// 要么把紧凑侧车那条 `aria-expanded` 断言测没了（摊平后）。
vi.mock('@/components/ui/responsive-popover', () => {
  const Ctx = createContext<{ open: boolean; toggle: () => void }>({
    open: false,
    toggle: () => {},
  })
  return {
    ResponsivePopover: ({
      children,
      open,
      onOpenChange,
    }: {
      children: ReactNode
      open?: boolean
      onOpenChange?: (next: boolean) => void
    }) => {
      const [internal, setInternal] = useState(false)
      const isOpen = open ?? internal
      const toggle = () => {
        setInternal(!isOpen)
        onOpenChange?.(!isOpen)
      }
      return (
        <Ctx.Provider value={{ open: isOpen, toggle }}>{children}</Ctx.Provider>
      )
    },
    ResponsivePopoverTrigger: ({ children }: { children: ReactNode }) => {
      const { open, toggle } = useContext(Ctx)
      return isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            'aria-expanded': open,
            onClick: toggle,
          })
        : children
    },
    ResponsivePopoverContent: ({ children }: { children: ReactNode }) => {
      const { open } = useContext(Ctx)
      return open ? <div>{children}</div> : null
    },
  }
})

import { VideoComposer } from './VideoComposer'

/**
 * S7 起 `density='detail'` 是**槽表提供者** —— 它自己不产出 DOM，必须给
 * children 渲染函数。这里把七个槽平铺出来（不套 `NodeDetailFrame`），
 * 让本文件既有的按文案/角色查询继续成立；槽序另有 `NodeDetailPanel.test`
 * 与各族自己的断言守着。
 */
function detailTree(data: NodeWorkflowNodeData, id = 'v1') {
  return (
    <VideoComposer id={id} data={data} density="detail">
      {(slots) => (
        <>
          {slots.stage}
          {slots.desk}
          {slots.rack}
          {slots.relations}
          {slots.evidence}
          {slots.dock}
          {slots.overlays}
        </>
      )}
    </VideoComposer>
  )
}

/**
 * 打开「参数」那颗按钮的浮层（契约 §8：时长/分辨率/画幅/生成音频/种子全部
 * 收在这一颗里，一级面上只剩一行摘要）。迁移前它们是四颗 OSD 胶囊 + 五个
 * `.node-collapsible` 手风琴段。
 */
function openParams() {
  fireEvent.click(screen.getByRole('button', { name: 'editParams' }))
}

function renderDetail() {
  const data = { prompt: '', status: 'idle' } as NodeWorkflowNodeData
  return render(detailTree(data))
}

function renderCompact(patch: Partial<NodeWorkflowNodeData> = {}) {
  const data = { prompt: '', status: 'idle', ...patch } as NodeWorkflowNodeData
  return render(<VideoComposer id="v1" data={data} density="card" />)
}

describe('VideoComposer compact sidecar', () => {
  beforeEach(() => {
    composerState.referenceKinds = []
    composerState.referenceTokens = []
    composerState.referencedTokenIds = new Set()
    updateNodeData.mockClear()
    setExpandedNodeId.mockClear()
    listConnectableReferences.mockReset()
    connectReferenceNode.mockClear()
    spawnReference.mockClear()
  })

  it('模式三档做成真 tab，当前档由字段决定', () => {
    renderCompact({ videoMode: 'multimodal' } as Partial<NodeWorkflowNodeData>)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'sidecar.mode.keyframe',
      'sidecar.mode.image-reference',
      'sidecar.mode.multimodal',
    ])
    expect(
      tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.textContent,
    ).toBe('sidecar.mode.multimodal')
  })

  it('存量节点没有模式字段时，从它当前的模型反推而不是默认成关键帧', () => {
    // 一个「全能参考」的存量节点：默认成关键帧会让它一打开就显示错档，
    // 并按不兼容把用户的模型清掉。反推是精确的（模式 ↔ referenceMode 一一对应）。
    renderCompact({
      model: {
        optionId: 'workspace:ref',
        modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: { label: 'fal', baseUrl: 'https://x.test' },
      },
    } as Partial<NodeWorkflowNodeData>)

    expect(
      screen
        .getAllByRole('tab')
        .find((t) => t.getAttribute('aria-selected') === 'true')?.textContent,
    ).toBe('sidecar.mode.multimodal')
  })

  it('切档时清掉不兼容的模型与参数档，但**不动**用户已传的素材', () => {
    renderCompact({
      videoMode: 'multimodal',
      duration: '10',
      resolution: '720p',
      model: {
        optionId: 'workspace:ref',
        modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: { label: 'fal', baseUrl: 'https://x.test' },
      },
    } as Partial<NodeWorkflowNodeData>)

    fireEvent.click(screen.getByRole('tab', { name: 'sidecar.mode.keyframe' }))

    const patch = updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch).toEqual({
      videoMode: 'keyframe',
      model: undefined,
      duration: undefined,
      resolution: undefined,
    })
    // 素材字段一个都不许出现在补丁里 —— 切视图不销毁用户的劳动。
    for (const assetField of [
      'referenceImages',
      'referenceVideoUrl',
      'voiceReferenceAudioUrl',
      'audioClip',
    ]) {
      expect(patch).not.toHaveProperty(assetField)
    }
  })

  it('切到该模型仍然支持的档时，保留模型与参数档', () => {
    renderCompact({
      videoMode: 'keyframe',
      duration: '10',
      model: {
        optionId: 'workspace:ref',
        modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: { label: 'fal', baseUrl: 'https://x.test' },
      },
    } as Partial<NodeWorkflowNodeData>)

    fireEvent.click(
      screen.getByRole('tab', { name: 'sidecar.mode.multimodal' }),
    )

    expect(updateNodeData.mock.calls.at(-1)?.[1]).toEqual({
      videoMode: 'multimodal',
    })
  })

  it('点当前已选中的档不写库', () => {
    renderCompact({ videoMode: 'keyframe' } as Partial<NodeWorkflowNodeData>)
    fireEvent.click(screen.getByRole('tab', { name: 'sidecar.mode.keyframe' }))
    expect(updateNodeData).not.toHaveBeenCalled()
  })

  it('connects or adds references inside the compact editor without opening detail', () => {
    listConnectableReferences.mockReturnValue([
      {
        id: 'character-1',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { role: 'character', characterName: '角色 A' },
      },
    ])
    renderCompact()

    expect(screen.queryByText('monitor.empty')).not.toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'sidecar.chooseFromCanvas' }),
    )
    fireEvent.click(screen.getByRole('button', { name: /角色 A/ }))
    expect(connectReferenceNode).toHaveBeenCalledWith('character-1', 'v1')

    fireEvent.click(
      screen.getByRole('button', { name: 'sidecar.addReference' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'references.addGroups.image' }),
    )
    fireEvent.click(screen.getByTestId('asset-pick'))

    expect(spawnReference).toHaveBeenCalledWith(
      expect.objectContaining({
        targetNodeId: 'v1',
        nodeType: 'image',
        role: 'shot',
      }),
    )
    expect(setExpandedNodeId).not.toHaveBeenCalled()
  })

  it('shows real connected references as compact thumbnails', () => {
    composerState.referenceTokens = [
      {
        id: 'c1',
        kind: 'character',
        label: 'Character A',
        token: '@CharacterA',
        mediaUrl: 'https://cdn.test/character-a.png',
      },
    ]

    renderCompact()

    const thumbnail = screen
      .getByRole('button', { name: '@CharacterA' })
      .querySelector('img')
    expect(thumbnail).toHaveAttribute('src', 'https://cdn.test/character-a.png')
    expect(screen.getByText('@CharacterA')).toBeInTheDocument()
  })

  it('uses a native prompt field and opens one compact parameter surface', () => {
    renderCompact()

    expect(screen.getByRole('textbox', { name: 'prompt.label' }).tagName).toBe(
      'TEXTAREA',
    )

    const parameterButton = screen.getByRole('button', {
      name: 'sidecar.editParameters',
    })
    fireEvent.click(parameterButton)
    expect(parameterButton).toHaveAttribute('aria-expanded', 'true')
  })

  // 台账 D2（2026-08-02）：摘要曾直接把 data.duration 拼上 's'，助手写的
  // '12s' 因此显示成 `12ss`；更糟的是那条拼接绕过了解析，Number('12s')=NaN
  // 让滑条静默回落中位数 —— 摘要、滑条、真正发出去的值三处互不一致。
  // 现在摘要与滑条共用同一个已解析的事实源。
  it('带单位的 duration 不再拼出两个 s，且摘要与滑条同源', () => {
    renderCompact({ duration: '12s' } as Partial<NodeWorkflowNodeData>)

    const summary = screen.getByRole('button', {
      name: 'sidecar.editParameters',
    })
    // i18n mock 直接回 key：走模板即 duration.seconds，走裸拼接才会出现 12ss
    expect(summary.textContent).toContain('duration.seconds')
    expect(summary.textContent).not.toContain('12ss')
  })

  it('解析不出数字的 duration 仍走既有回落', () => {
    renderCompact({ duration: 'auto' } as Partial<NodeWorkflowNodeData>)

    const summary = screen.getByRole('button', {
      name: 'sidecar.editParameters',
    })
    expect(summary.textContent).toContain('duration.auto')
  })

  it('keeps bottom dock double-clicks from reaching the canvas node', () => {
    const onNodeDoubleClick = vi.fn()
    const data = { prompt: '', status: 'idle' } as NodeWorkflowNodeData

    render(
      <div onDoubleClick={onNodeDoubleClick}>
        <VideoComposer id="v1" data={data} density="card" />
      </div>,
    )

    fireEvent.doubleClick(
      screen.getByRole('button', { name: 'sidecar.editParameters' }),
    )

    expect(onNodeDoubleClick).not.toHaveBeenCalled()
  })
})

describe('VideoComposer references row (detail)', () => {
  beforeEach(() => {
    composerState.referenceKinds = []
    composerState.referenceTokens = []
    composerState.referencedTokenIds = new Set()
    composerState.maxReferenceImages = undefined
    composerState.sendPreview = {
      ...composerState.sendPreview,
      translatedPrompt: '',
      legend: '',
      images: [],
      overflow: [],
      assembledImageCount: 0,
      videoUrls: [],
      audioEntries: [],
    }
    updateNodeData.mockClear()
    updateEdgeData.mockClear()
    focusNode.mockClear()
    deleteEdge.mockClear()
    toastInfo.mockClear()
    spawnReference.mockClear()
  })

  /**
   * ⚠ S7 换了被测的东西：两轨 object-studio 版式已被七槽骨架取代，四个
   * `StudioSectionHeading` 也随 R1「一级面零标题预算」删掉。这条改测
   * 「该出现的内容还在不在、落在哪个槽」——版式是实现，内容与槽位才是契约。
   */
  it('七个槽各自拿到该拿的内容（监视器/素材/提示词/模式）', () => {
    renderDetail()

    // 主体台：监视器空态 —— R2 只许一枚极淡字形，**不许**解释文案
    expect(screen.queryByText('monitor.empty')).toBeNull()
    expect(document.querySelector('.canvas-detail-well')).not.toBeNull()
    // 编排台：提示词
    expect(
      screen.getByRole('textbox', { name: 'prompt.label' }),
    ).toBeInTheDocument()
    // 动作坞：模式名（读节点上的模式字段，纯文本无控件壳）。夹具节点没有
    // `videoMode` 也没有 model → 反推不出来，落到默认档「关键帧」。
    expect(screen.getByText('sidecar.mode.keyframe')).toBeInTheDocument()
    // R1：四个槽标题全不出现
    for (const heading of [
      'studio.currentFilm',
      'studio.sentAssets',
      'studio.composition',
      'studio.modelParameters',
    ]) {
      expect(screen.queryByRole('heading', { name: heading })).toBeNull()
    }
  })

  it('详情复用通用视频模型选择器，不再渲染自造品牌 rail', () => {
    const { container } = renderDetail()
    const picker = screen.getByTestId('shared-model-picker')
    // `triggerLabel` 是**没选模型时的占位**（`CanvasRoutePicker` 把它映射成
    // `triggerEmptyLabel`），选中之后触发器显示的是模型自己的标签。
    //
    // ⚠ 这条断言原本锁的是 `Seedance · variant.fast` —— 那串字**在真实渲染里从
    // 来没出现过**，只是本文件的 mock 把 triggerLabel 当文本渲染了出来，于是给了
    // 一个「标签有在显示」的假信心。它还是从 qualityTier 推的，连 2.0 和 2.5 都
    // 分不开。占位就断言占位。
    expect(picker).toHaveTextContent('pickModel')
    expect(picker).toHaveAttribute('data-variant', 'media')
    expect(picker).toHaveAttribute('data-modality', 'video')
    expect(container.querySelector('.node-collapsible')).toBeNull()
    expect(screen.queryByText('modelRail.label')).toBeNull()
  })

  it('renders REFERENCED tokens as named @token thumbnail chips in the strip (V-3a §8)', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    composerState.referencedTokenIds = new Set(['c1', 'a1'])
    renderDetail()
    expect(screen.getByText('references.label')).toBeInTheDocument()
    // character chip's accessible name is its @token; voice chip's is the speaker name
    expect(screen.getByRole('button', { name: '@角色A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '角色A' })).toBeInTheDocument()
  })

  it('a connected-but-not-yet-referenced token does NOT show in the strip', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    // referencedTokenIds stays empty — nothing has been @-mentioned yet.
    renderDetail()
    expect(
      screen.queryByRole('button', { name: '@角色A' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('references.stripEmptyHint')).toBeInTheDocument()
  })

  it('inserts a character @token from the manager drawer (first reference, trailing space)', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.statusInsert' }),
    )
    // MentionInput serializes the chip + trailing space back to plain text.
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@角色A ' }),
    )
    // §7.2 ⑥ drift bookkeeping: records what name was inserted for this ref.
    expect(updateNodeData).toHaveBeenCalledWith('v1', {
      insertedReferenceNames: { c1: '角色A' },
    })
  })

  it('renders a square thumbnail for a REFERENCED shot token and re-inserts its @token', () => {
    composerState.referenceTokens = [
      { id: 's1', kind: 'shot', label: '开场远景', token: '@开场远景' },
    ]
    composerState.referencedTokenIds = new Set(['s1'])
    renderDetail()
    const chip = screen.getByRole('button', { name: '@开场远景' })
    expect(chip.className).toContain('rounded-md')
    fireEvent.click(chip)
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@开场远景 ' }),
    )
  })

  it('inserts a voice @AudioN chip from the drawer (no drift bookkeeping)', () => {
    composerState.referenceTokens = [
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    renderDetail()
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.statusInsert' }),
    )
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@Audio1 ' }),
    )
    // Voice's text anchor is ambiguous — not drift-tracked.
    expect(updateNodeData).not.toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ insertedReferenceNames: expect.anything() }),
    )
  })

  it('shows a real thumbnail image for a referenced strip chip when the reference has media', () => {
    composerState.referenceTokens = [
      {
        id: 'c1',
        kind: 'character',
        label: '角色A',
        token: '@角色A',
        mediaUrl: 'https://cdn.test/character-a.png',
      },
    ]
    composerState.referencedTokenIds = new Set(['c1'])
    renderDetail()
    const img = screen
      .getByRole('button', { name: '@角色A' })
      .querySelector('img')
    expect(img).toHaveAttribute('src', 'https://cdn.test/character-a.png')
  })

  it('V2-1 silently auto-rewrites a stale @oldName after the node is renamed', () => {
    // The reference was inserted as @旧名字, then its node renamed to 新名字.
    // No manual affordance — the effect rewrites the prompt automatically.
    const data = {
      prompt: '@旧名字 walks into frame',
      status: 'idle',
      insertedReferenceNames: { c1: '旧名字' },
    } as unknown as NodeWorkflowNodeData
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '新名字', token: '@新名字' },
    ]
    render(detailTree(data, 'v1'))

    // No drift affordance renders anymore.
    expect(
      screen.queryByText('references.driftReplace'),
    ).not.toBeInTheDocument()
    // The prompt is rewritten + bookkeeping re-anchored, automatically.
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        prompt: '@新名字 walks into frame',
        insertedReferenceNames: { c1: '新名字' },
      }),
    )
  })

  it('locates a REFERENCED reference node on canvas from the hover preview', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    composerState.referencedTokenIds = new Set(['c1'])
    renderDetail()
    fireEvent.mouseEnter(screen.getByRole('button', { name: '@角色A' }))
    fireEvent.click(screen.getByText('references.locate'))
    expect(focusNode).toHaveBeenCalledWith('c1')
  })

  it('shows a needs-name hint in the manager drawer for an unnamed reference node', () => {
    composerState.referenceTokens = [
      { id: 'b1', kind: 'background', label: '', token: '' },
    ]
    renderDetail()
    const dialog = openManager()
    expect(
      within(dialog).getByText('references.unnamedHint'),
    ).toBeInTheDocument()
  })

  it('shows the no-connections hint when nothing is bound (V-3a, five cast cards retired)', () => {
    renderDetail()
    expect(screen.getByText('references.emptyDept')).toBeInTheDocument()
  })

  it('deletes the edge (node kept) from a REFERENCED strip chip × and toasts about it', () => {
    composerState.referenceTokens = [
      {
        id: 'c1',
        kind: 'character',
        label: '角色A',
        token: '@角色A',
        edgeId: 'e1',
      },
    ]
    composerState.referencedTokenIds = new Set(['c1'])
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'references.remove' }))
    expect(deleteEdge).toHaveBeenCalledWith('e1')
    expect(toastInfo).toHaveBeenCalledWith('references.removedToast')
  })

  /**
   * cleanup §8.6：素材区的**形态**按模式变——全能参考才有音频/视频区，关键帧与多图
   * 参考都没有。夹具默认契约是关键帧档（videos:0 / audio:0），所以要音频＋的用例必须
   * 自己换成全能参考，否则验的是一个设计上不该存在的按钮。
   */
  function useMultimodalContract() {
    composerState.sendPreview = {
      ...composerState.sendPreview,
      contract: {
        ...composerState.sendPreview.contract,
        referenceMode: 'multimodal-reference' as 'text-or-first-frame',
        slots: { images: 9, videos: 3, audio: 3 },
      },
    }
  }

  it('关键帧档不渲染音频/视频的添加位（§8.6 靠形态不靠文案）', () => {
    // 「不存在」是真的不渲染，不是禁用后置灰 —— 置灰仍然是在用文案解释「你不能用」。
    renderDetail()
    const dialog = openManager()
    expect(
      within(dialog).queryByRole('button', {
        name: 'references.addButtons.voice',
      }),
    ).toBeNull()
    expect(
      within(dialog).queryByRole('button', {
        name: 'references.addButtons.video',
      }),
    ).toBeNull()
    // 图片区任何模式都有。
    expect(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.character',
      }),
    ).toBeInTheDocument()
  })

  it('autospawns from the 声音 tab ＋ → library pick → spawnReference (voice→video)', () => {
    useMultimodalContract()
    renderDetail()
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.voice')
    // ＋ opens the audio library (voice → audio mediaType).
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.voice',
      }),
    )
    const pick = screen.getByTestId('asset-pick')
    expect(pick).toHaveAttribute('data-media-type', 'audio')
    fireEvent.click(pick)
    expect(spawnReference).toHaveBeenCalledWith({
      targetNodeId: 'v1',
      nodeType: 'voice',
      role: undefined,
      media: {
        url: 'https://cdn.test/picked.png',
        generationId: 'gen1',
        thumbnailUrl: 'https://cdn.test/picked-thumb.webp',
        name: '选中的角色',
      },
    })
  })

  it('角色 tab ＋ autospawns an image role=character directly (no submenu)', () => {
    renderDetail()
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.character')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.character',
      }),
    )
    const pick = screen.getByTestId('asset-pick')
    expect(pick).toHaveAttribute('data-media-type', 'image')
    fireEvent.click(pick)
    expect(spawnReference).toHaveBeenCalledWith(
      expect.objectContaining({
        targetNodeId: 'v1',
        nodeType: 'image',
        role: 'character',
      }),
    )
  })

  it('§音色收进角色: 管理素材抽屉里的 ＋配音 targets the CHARACTER node (voice→character)', () => {
    composerState.referenceTokens = [
      { id: 'char9', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('menuitem', { name: /references\.addVoice/ }),
    )
    const pick = screen.getByTestId('asset-pick')
    expect(pick).toHaveAttribute('data-media-type', 'audio')
    fireEvent.click(pick)
    expect(spawnReference).toHaveBeenCalledWith(
      expect.objectContaining({
        targetNodeId: 'char9',
        nodeType: 'voice',
      }),
    )
  })

  it('toggles generate_audio onto node data', () => {
    renderDetail()
    openParams()
    fireEvent.click(screen.getByRole('switch', { name: 'generateAudioLabel' }))
    expect(updateNodeData).toHaveBeenCalledWith('v1', { generateAudio: false })
  })

  it('shows the last seed and locks it back into the input seed', () => {
    const data = {
      prompt: '',
      status: 'idle',
      model: { modelId: AI_MODELS.SEEDANCE_20 },
      mediaUrl: 'https://cdn.test/clip.mp4',
      lastSeed: 777,
    } as unknown as NodeWorkflowNodeData
    render(detailTree(data, 'v1'))
    openParams()

    expect(screen.getByText('lastSeedLabel: 777')).toBeInTheDocument()
    const lockButton = screen.getByText('seedLock').closest('button')
    fireEvent.click(lockButton as HTMLButtonElement)
    expect(updateNodeData).toHaveBeenCalledWith('v1', { seed: 777 })
  })
})

describe('VideoComposer monitor (detail, §4 C4)', () => {
  beforeEach(() => {
    composerState.referenceKinds = []
    composerState.referenceTokens = []
    composerState.referencedTokenIds = new Set()
    updateNodeData.mockClear()
  })

  /**
   * ⚠ 反过来了：详情面板走静默档（`quiet`），R2「空态：占几何可以，占内容不行」
   * 明写禁「生成后在此预览」这类解释文案、禁四角取景框。几何照留（同尺寸同圆角
   * 同底），只把内容像素换成一枚极淡字形。卡层监视器不受影响。
   */
  it('空态只留几何与一枚极淡字形，不留解释文案与取景框', () => {
    const { container } = renderDetail()
    expect(screen.queryByText('monitor.empty')).toBeNull()
    expect(container.querySelectorAll('.node-monitor-corner')).toHaveLength(0)
    expect(container.querySelector('.canvas-detail-well')).not.toBeNull()
    expect(document.querySelector('video')).toBeNull()
  })

  it('renders the video with its poster once media + thumbnail exist', () => {
    const data = {
      prompt: '',
      status: 'idle',
      mediaUrl: 'https://cdn.test/clip.mp4',
      videoThumbnailUrl: 'https://cdn.test/clip-thumb.webp',
    } as unknown as NodeWorkflowNodeData
    render(detailTree(data, 'v1'))

    const video = document.querySelector('video')
    expect(video).toHaveAttribute('src', 'https://cdn.test/clip.mp4')
    expect(video).toHaveAttribute('poster', 'https://cdn.test/clip-thumb.webp')
    expect(screen.queryByText('monitor.empty')).not.toBeInTheDocument()
  })

  it('shows the REC readout only while generating', () => {
    const runningData = {
      prompt: '',
      status: 'running',
    } as unknown as NodeWorkflowNodeData
    const { rerender } = render(detailTree(runningData, 'v1'))
    expect(screen.getByText('monitor.rec 00:00:00')).toBeInTheDocument()

    const idleData = { prompt: '', status: 'idle' } as NodeWorkflowNodeData
    rerender(detailTree(idleData, 'v1'))
    expect(screen.queryByText('monitor.rec 00:00:00')).not.toBeInTheDocument()
  })
})

// R3-6b §2 发送图例预览（防黑盒）: the "查看发送内容" collapsible mirrors
// `composer.sendPreview` — a read-only, mocked-hook-driven surface here (the
// hook's own real pipeline is covered by node-video-send-preview.test.ts /
// use-video-composer.test.ts), so these tests only assert the WIRING: closed
// by default, opens on click, and renders exactly what sendPreview reports.
describe('VideoComposer send preview (R3-6b §2)', () => {
  beforeEach(() => {
    composerState.referenceKinds = []
    composerState.referenceTokens = []
    composerState.referencedTokenIds = new Set()
    composerState.maxReferenceImages = undefined
    composerState.sendPreview = {
      ...composerState.sendPreview,
      translatedPrompt: '',
      legend: '',
      images: [],
      overflow: [],
      assembledImageCount: 0,
      videoUrls: [],
      audioEntries: [],
    }
  })

  /**
   * ⚠ 反过来了：迁移前发送预览默认**收起**（「诊断信息，不是主流程」）。
   * 契约把「这次真正会送出什么」列为本轮改版的核心诉求，`slots.ts` 明写
   * 「默认视图里必须看得见」——所以证据抽屉默认展开，点一下才收。
   */
  it('默认展开，点一下收起', () => {
    renderDetail()
    const toggle = screen.getByRole('button', { name: /sendPreview.toggle/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the translated prompt and legend text from sendPreview', () => {
    composerState.sendPreview = {
      ...composerState.sendPreview,
      translatedPrompt: '@Image1（凛） 走进房间',
      legend: '参考素材说明：\n@Image1：角色「凛」',
    }
    renderDetail()
    expect(screen.getByText('@Image1（凛） 走进房间')).toBeInTheDocument()
    expect(screen.getByText(/参考素材说明/)).toBeInTheDocument()
  })

  it('falls back to the empty hint when there is no translated prompt', () => {
    renderDetail()
    expect(screen.getByText('sendPreview.empty')).toBeInTheDocument()
  })

  it('lists each sendPreview image with its 图N badge and name', () => {
    composerState.sendPreview = {
      ...composerState.sendPreview,
      images: [
        {
          url: 'https://cdn.test/char.png',
          index: 1,
          name: '凛',
          kind: 'character',
        },
      ],
    }
    renderDetail()
    expect(screen.getByText('sendPreview.imageBadge')).toBeInTheDocument()
    expect(screen.getByText('凛')).toBeInTheDocument()
  })

  it('lists video and audio entries when present', () => {
    composerState.sendPreview = {
      ...composerState.sendPreview,
      videoUrls: ['https://cdn.test/clip.mp4'],
      audioEntries: [{ index: 1, label: '旁白' }],
    }
    renderDetail()
    expect(screen.getByText(/sendPreview.videoBadge/)).toBeInTheDocument()
    expect(screen.getByText(/sendPreview.audioBadge/)).toBeInTheDocument()
  })
})

// R3-8 C5: the settings column collapses model/duration/resolution/aspect
// behind one capsule row sharing a single accordion (`openSection`) — only
// one of the four can be open at a time, and opening a new one closes
// whichever was open. Seed gets its own independent toggle (§4 C5: 生成音频/
// 种子刻意不进 OSD 摘要组), asserted separately below.
describe('VideoComposer C5 参数 OSD (R3-8)', () => {
  beforeEach(() => {
    composerState.referenceKinds = []
    composerState.referenceTokens = []
    composerState.referencedTokenIds = new Set()
  })

  it('starts fully collapsed once a brand is already selected', () => {
    const { container } = renderDetail()
    expect(
      container.querySelectorAll('.node-collapsible[data-open]'),
    ).toHaveLength(0)
  })

  /**
   * ⚠ 手风琴没了。迁移前四颗 OSD 胶囊共享一个 `openSection`，一次只能开一段；
   * 契约 §8「参数收成一颗按钮」把四段合成**一颗**按钮的一个浮层 ——
   * 「同时只能开一个」这条规则连同它要解决的问题一起消失了。
   * 现在要验的是：一级面上只剩一行摘要，控件全在浮层里，且开合是这一颗说了算。
   */
  it('一级面只有一行摘要，四段参数全在同一颗按钮的浮层里', () => {
    const { container } = renderDetail()
    const chip = screen.getByRole('button', { name: 'editParams' })

    // 关着的时候：控件一个都不在 DOM 里（不是收着仍可 Tab 进去）。
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('switch', { name: 'duration.custom' })).toBeNull()
    expect(container.querySelectorAll('.node-collapsible')).toHaveLength(0)

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
    // 四段一起在场 —— 不再有「开了这段就收起那段」。
    expect(
      screen.getByRole('switch', { name: 'duration.custom' }),
    ).toBeInTheDocument()
    expect(resolutionOptionButtons(container).length).toBeGreaterThan(0)
    expect(aspectOptionButtons(container).length).toBeGreaterThan(0)
    expect(
      screen.getByRole('switch', { name: 'generateAudioLabel' }),
    ).toBeInTheDocument()
    expect(screen.getByText('seedRandom')).toBeInTheDocument()
  })

  /**
   * R8：摘要串只放**已设的**值、用 `·` 串、不写字段名；一项都没设时回落
   * 「编辑参数」。迁移前每颗胶囊各自显示「字段名: 值」，未设时显示 `aspectAuto`
   * —— 那是把「没设」说成了一个值。
   */
  it('摘要空态回落「编辑参数」，不把未设说成一个值', () => {
    renderDetail()
    expect(
      screen.getByRole('button', { name: 'editParams' }),
    ).toHaveTextContent('editParams')
    expect(screen.queryByText(/resolutionLabel:/)).toBeNull()
    expect(screen.queryByText(/aspectRatioLabel:/)).toBeNull()
  })

  /**
   * ⚠ 回归锁（owner 2026-08-04 报「这边无法自定义时间」）。
   *
   * 迁移前滑条是 `disabled={isAutoDuration}`：默认档就是自动，于是滑条一进来
   * 就是灰的，用户必须先找到右上角那颗开关点开才轮得到拖。一个「点一下就能用」
   * 的控件不是不可用，把它画成灰的等于骗人 —— 而且画布卡上的同一根滑条从来
   * 没有这道闸，同一个控件在两处两种行为。
   *
   * 现在**拖动本身就是自定义**：滑条恒可用，写进一个具体秒数后
   * `isAutoDuration` 变 false，那颗开关自己亮起来。
   */
  it('自动档下滑条仍可用，拖一下就落一个具体秒数（自定义自己亮）', () => {
    const autoData = {
      prompt: '',
      status: 'idle',
      duration: 'auto',
    } as NodeWorkflowNodeData
    const { container } = render(detailTree(autoData, 'v9'))
    openParams()

    // 自动档：开关是关的，但滑条**不禁用**。
    const custom = screen.getByRole('switch', { name: 'duration.custom' })
    expect(custom).not.toBeChecked()
    // ⚠ 按容器查而不是按可访问名：Radix 把 aria-label 挂在 Root 上，
    // thumb 自己没有名字，jsdom 里 `getByRole('slider', {name})` 取不到。
    const thumb = container.querySelector(
      '.node-duration-slider [role="slider"]',
    ) as HTMLElement
    expect(thumb).not.toBeNull()
    expect(thumb).not.toHaveAttribute('data-disabled')

    // 键盘走一格 = 拖一下：直接落库成一个具体秒数。
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    const [, patch] = updateNodeData.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ]
    expect(patch.duration).toMatch(/^\d+$/)
    expect(patch.duration).not.toBe('auto')
  })

  it('turns custom duration on and back off to provider auto', () => {
    renderDetail()
    openParams()

    const customDuration = screen.getByRole('switch', {
      name: 'duration.custom',
    })
    expect(customDuration).not.toBeChecked()

    fireEvent.click(customDuration)
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'v1',
      expect.objectContaining({ duration: '10' }),
    )

    const customData = {
      prompt: '',
      status: 'idle',
      duration: '10',
    } as NodeWorkflowNodeData
    const { unmount } = render(detailTree(customData, 'v2'))
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'editParams',
      })[1] as HTMLButtonElement,
    )
    const customSwitches = screen.getAllByRole('switch', {
      name: 'duration.custom',
    })
    const customDurationOn = customSwitches[customSwitches.length - 1]
    expect(customDurationOn).toBeChecked()
    fireEvent.click(customDurationOn)
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'v2',
      expect.objectContaining({ duration: 'auto' }),
    )
    unmount()
  })
})

/** Resolution option buttons ("480p" / "720p" / "1080p") present in the DOM. */
function resolutionOptionButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button')).filter((button) =>
    /^\d{3,4}p$/.test(button.textContent ?? ''),
  )
}

/** Aspect option buttons ("16:9" / "9:16" / …) present in the DOM. */
function aspectOptionButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button')).filter((button) =>
    /^\d+:\d+$/.test(button.textContent ?? ''),
  )
}

// 能力 gate: every OSD segment is driven by the send contract's `parameters`
// flags, and the gate has to cover the collapsible BODY as well as the pill.
// `.node-collapsible` only animates grid-template-rows — a collapsed section's
// controls stay in the DOM and stay keyboard-reachable, so "closed" is not
// "gated". Live cases: Kling V3/O3 Pro send no resolution (fal's endpoint
// schema has no such input) yet their capability table still carries a nominal
// `supportedResolutions: ['1080p']`; Gemini Omni Flash sends no duration.
describe('VideoComposer 参数能力 gate', () => {
  const parameters = composerState.sendPreview.contract.parameters

  beforeEach(() => {
    composerState.referenceKinds = []
    composerState.referenceTokens = []
    composerState.referencedTokenIds = new Set()
  })

  afterEach(() => {
    // 每条只关一个开关；跑完全部还原，后面的用例仍拿到全支持的契约。
    parameters.duration = true
    parameters.resolution = true
    parameters.aspectRatio = true
  })

  /**
   * ⚠ 断言的**意图**没变：契约不发的参数不许出现，而且必须连**控件本体**一起
   * 消失 —— 迁移前 `.node-collapsible` 只动 grid-template-rows，收起的段落
   * 控件仍在 DOM 里、仍能 Tab 进去回车触发，所以「收起」不等于「gate 掉」。
   * 变的是查法：胶囊没了，改成打开那一颗参数按钮再查控件。
   * 真实案例：Kling V3/O3 Pro 不发 resolution（fal 端点 schema 里就没有这个
   * 输入），而能力表还挂着名义上的 `supportedResolutions: ['1080p']`；
   * Gemini Omni Flash 不发 duration。
   */
  it('契约不发分辨率时，选项本体也不出现', () => {
    parameters.resolution = false
    const data = {
      prompt: '',
      status: 'idle',
      model: { modelId: AI_MODELS.KLING_V3_PRO },
    } as unknown as NodeWorkflowNodeData
    const { container } = render(detailTree(data, 'v1'))
    openParams()

    expect(resolutionOptionButtons(container)).toHaveLength(0)
    // 契约支持的那两项不受影响。
    expect(
      screen.getByRole('switch', { name: 'duration.custom' }),
    ).toBeInTheDocument()
    expect(aspectOptionButtons(container).length).toBeGreaterThan(0)
  })

  it('契约不发时长时，滑条与自定义开关一起消失', () => {
    parameters.duration = false
    const data = {
      prompt: '',
      status: 'idle',
      model: { modelId: AI_MODELS.GEMINI_OMNI_FLASH },
    } as unknown as NodeWorkflowNodeData
    const { container } = render(detailTree(data, 'v1'))
    openParams()

    // 滑条留在原地的话，用户仍能把它拖到一个请求里根本不带的时长上。
    expect(container.querySelectorAll('.node-duration-slider')).toHaveLength(0)
    expect(screen.queryByRole('switch', { name: 'duration.custom' })).toBeNull()
  })

  it('契约不发画幅时，画幅选项也不出现', () => {
    parameters.aspectRatio = false
    const data = {
      prompt: '',
      status: 'idle',
      model: { modelId: AI_MODELS.SEEDANCE_20 },
    } as unknown as NodeWorkflowNodeData
    const { container } = render(detailTree(data, 'v1'))
    openParams()

    expect(aspectOptionButtons(container)).toHaveLength(0)
  })

  it('契约发分辨率时三档都可达', () => {
    const data = {
      prompt: '',
      status: 'idle',
      model: { modelId: AI_MODELS.SEEDANCE_20 },
    } as unknown as NodeWorkflowNodeData
    const { container } = render(detailTree(data, 'v1'))
    openParams()

    // Seedance 2.0 公布 480p/720p/1080p。
    expect(resolutionOptionButtons(container)).toHaveLength(3)
  })
})
