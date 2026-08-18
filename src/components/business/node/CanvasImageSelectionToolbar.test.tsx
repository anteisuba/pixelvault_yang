import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import {
  canOfferCanvasImageEdit,
  CanvasImageSelectionToolbar,
  MediaReviewButtons,
  NodeSelectionToolbarChrome,
} from './CanvasImageSelectionToolbar'

const mocks = vi.hoisted(() => ({
  setExpandedNodeId: vi.fn(),
  deleteNode: vi.fn(),
  deleteEdge: vi.fn(),
  placeDerivedImages: vi.fn(),
  focusNode: vi.fn(),
  updateNodeData: vi.fn(),
  generateMediaNode: vi.fn(),
  // R3-4 (canvas-relationship-v3 §4.2): mirrors CanvasImageEditWorkspace's
  // own open/close state up to the workbench.
  setImageEditWorkspaceOpen: vi.fn(),
  edges: [] as Array<{ id: string; source: string; target: string }>,
  // 台账 #12：生成钮的渲染期守卫要按 handler 同款收割上游 shotText，
  // 所以 seedance capability 现在也读 useNodes。
  nodes: [] as Array<{ id: string; type: string; data: NodeWorkflowNodeData }>,
  fitView: vi.fn(),
  mergeAction: {
    canMerge: true,
    isMerging: false,
    handleMerge: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@xyflow/react', () => ({
  useEdges: () => mocks.edges,
  useNodes: () => mocks.nodes,
  useReactFlow: () => ({ fitView: mocks.fitView }),
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => mocks,
}))

vi.mock('./CanvasImageEditWorkspace', () => ({
  CanvasImageEditWorkspace: ({
    defaultTask,
    open,
  }: {
    defaultTask: string
    open: boolean
  }) =>
    open ? <div data-testid="image-edit-workspace">{defaultTask}</div> : null,
}))

vi.mock('./CharacterImageReferenceControls', () => ({
  CharacterImageReferenceControls: ({
    triggerLabel,
  }: {
    triggerLabel?: string
  }) => (
    <button type="button" data-testid="collector-add-asset">
      {triggerLabel}
    </button>
  ),
}))

vi.mock('./FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="voice-library-dialog" /> : null,
}))

// FB-5 ②: VoiceCapability now also renders AssetSelectorDialog (从素材).
// Same minimal-mock pattern as every other test that imports a component
// transitively pulling in AssetSelectorDialog (e.g. NodeMediaInspector.test.tsx)
// — the real component drags in next-intl navigation, which this test's
// lightweight `next-intl` mock doesn't cover.
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/hooks/node/use-video-merge-action', () => ({
  useVideoMergeAction: () => mocks.mergeAction,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

/** 台账 #12：生成钮的前提（有模型 + 有提示词）现在是**渲染期**判据，缺任一
 *  项按钮就是 disabled。凡是要断言「点生成能派发」的 fixture 都得带齐这两项，
 *  否则测的是 disabled 态。缺前提本身的行为另有专门用例。 */
const GENERATE_READY = {
  model: {
    optionId: 'fal:flux',
    modelId: 'flux',
    adapterType: 'fal',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  prompt: '深夜便利店，货架反光',
} as unknown as NodeWorkflowNodeData

const IMAGE_DATA = {
  ...GENERATE_READY,
  mediaUrl: 'https://cdn.example.com/source.png',
  status: NODE_STATUS_IDS.done,
} as NodeWorkflowNodeData

beforeEach(() => {
  vi.clearAllMocks()
  mocks.edges = []
  mocks.mergeAction = {
    canMerge: true,
    isMerging: false,
    handleMerge: vi.fn(),
  }
})

describe('CanvasImageSelectionToolbar', () => {
  it('detects image sources for the object toolbar', () => {
    expect(canOfferCanvasImageEdit(IMAGE_DATA)).toBe(true)
    expect(
      canOfferCanvasImageEdit({
        status: NODE_STATUS_IDS.idle,
      } as NodeWorkflowNodeData),
    ).toBe(false)
  })

  it('opens AI edit tools from the more menu into the workspace dialog', () => {
    render(<CanvasImageSelectionToolbar nodeId="node-1" data={IMAGE_DATA} />)

    // 常驻条 = 快捷编辑（主）/ ⤢ / ⬇ / ⋯ / 🗑；AI 套件仍在「更多」里
    // （这个 mock dropdown 恒渲染内容）。
    expect(
      screen.getByRole('button', { name: 'quickEdit' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /upscale.label/ }))
    expect(screen.getByTestId('image-edit-workspace')).toHaveTextContent(
      'upscale',
    )
  })

  // 台账 C1（2026-08-02）：常驻 6 项 + 溢出 8 项 = 14 个等权灰钮。
  describe('C1 三组 + 溢出分段', () => {
    it('分类不再占常驻位，收进「更多」里仍可设', () => {
      render(<CanvasImageSelectionToolbar nodeId="node-1" data={IMAGE_DATA} />)

      // 常驻条上没有分类钮了（toolbar 的直接子节点里找不到）
      const toolbar = screen.getByRole('toolbar')
      expect(
        Array.from(toolbar.children).some((child) =>
          child.getAttribute('aria-label')?.includes('category'),
        ),
      ).toBe(false)

      // 但「更多」里那条子菜单还在，点选项照样写回 imageCategory
      fireEvent.click(screen.getByRole('button', { name: /roles\.identity/ }))
      expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
        imageCategory: 'identity',
        imageCategoryLabel: undefined,
      })
    })

    it('八条编辑能力按「点下去还要你干什么」分三段', () => {
      render(<CanvasImageSelectionToolbar nodeId="node-1" data={IMAGE_DATA} />)

      // 段标题按 interaction 推导：instant+layers / mask+outpaint / prompt
      expect(screen.getByText('moreEditsInstant')).toBeInTheDocument()
      expect(screen.getByText('moreEditsRegion')).toBeInTheDocument()
      expect(screen.getByText('moreEditsDescribe')).toBeInTheDocument()

      // ⚠ 守的是「一条能力都不许在分段里丢掉」——批 2 原型手抄了一份分组，
      // 把 prompt 的两条错归进了「需要框选」。
      for (const taskId of [
        'upscale',
        'remove-background',
        'inpaint',
        'outpaint',
        'extract-element',
        'object-replace',
        'style-transfer',
      ]) {
        expect(
          screen.getByRole('button', { name: new RegExp(`${taskId}\\.label`) }),
        ).toBeInTheDocument()
      }
    })

    it('删除排在末组，不再紧贴主动作', () => {
      render(<CanvasImageSelectionToolbar nodeId="node-1" data={IMAGE_DATA} />)

      const toolbar = screen.getByRole('toolbar')
      const labels = Array.from(toolbar.children).map((child) =>
        child.getAttribute('aria-label'),
      )
      expect(labels[0]).toBe('quickEdit')
      expect(labels.at(-1)).toBe('delete')
    })
  })

  it('does not render a rename input — the on-card label is the single place to rename (canvas-image-card.md §1)', () => {
    render(<CanvasImageSelectionToolbar nodeId="node-1" data={IMAGE_DATA} />)
    expect(screen.queryByLabelText('rename')).not.toBeInTheDocument()
  })

  it('toggles quick-edit without opening the heavy dialog', () => {
    const onQuickEditOpenChange = vi.fn()
    render(
      <CanvasImageSelectionToolbar
        nodeId="node-1"
        data={IMAGE_DATA}
        quickEditOpen={false}
        onQuickEditOpenChange={onQuickEditOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'quickEdit' }))
    expect(onQuickEditOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByTestId('image-edit-workspace')).not.toBeInTheDocument()
  })
})

// R3-3 (canvas-relationship-v3 §3.2/§7): the registry-driven chrome every
// non-image-edit node type now goes through. Covers the capability-area
// differences per type, the universal region staying constant, and the two
// deliberate disambiguations (collector vs closeup sharing legacy type
// `characterImage`; video/audio results not tripping the image quick-edit
// gate now that every type feeds this component a `data` with `mediaUrl`).
describe('NodeSelectionToolbarChrome', () => {
  it('renders nothing when not selected', () => {
    const { container } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={IMAGE_DATA}
        selected={false}
        nodeType={NODE_TYPE_IDS.seedance}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('image family with media still delegates to the untouched CanvasImageSelectionToolbar, plus a shot-only 生成 extra', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={IMAGE_DATA}
        selected
        nodeType={NODE_TYPE_IDS.shot}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'quickEdit' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'regenerate' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'regenerate' }))
    expect(mocks.generateMediaNode).toHaveBeenCalledWith('node-1')
  })

  it('a video result does not trip the image quick-edit gate (videoMerge with media)', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            mediaUrl: 'https://cdn.example.com/merged.mp4',
            status: NODE_STATUS_IDS.done,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.videoMerge}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'quickEdit' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'merge.regenerate' }),
    ).toBeInTheDocument()
  })

  it('collector card (isCollector) gets 添加素材 + 出演, never the image quick-edit suite even with a mediaUrl', () => {
    mocks.edges = [{ id: 'e1', source: 'node-1', target: 'node-2' }]
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            mediaUrl: 'https://cdn.example.com/portrait.png',
            status: NODE_STATUS_IDS.done,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.characterImage}
        isCollector
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'quickEdit' }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('collector-add-asset')).toHaveTextContent(
      'addAsset',
    )
    // The button's aria-label is the count-aware `performancesAria` key (the
    // visible text is `performanceSection · 1`, but aria-label wins as the
    // accessible name).
    expect(
      screen.getByRole('button', { name: /performancesAria/ }),
    ).toBeInTheDocument()
    // Universal region still applies — download shows because mediaUrl exists.
    expect(screen.getByRole('button', { name: 'download' })).toBeInTheDocument()
  })

  it('a closeup image node (same legacy type characterImage, isCollector unset) with no media renders no toolbar at all', () => {
    const { container } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.characterImage}
      />,
    )
    // Falls to the generic branch: not a collector, characterImage isn't in
    // the capability registry, and there's no media to download — nothing
    // to operate on, so the whole toolbar is absent (owner 2026-07-27: 空态
    // 卡不显示近场工具条 — "整条不渲染", not an empty expand+delete shell).
    // Rename now lives on the card's own on-card label, not the toolbar.
    expect(screen.queryByTestId('collector-add-asset')).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('an empty (role-less) image card gets no toolbar at all — the driving case for the "no content, no toolbar" rule', () => {
    const { container } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.image}
      />,
    )
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('出演 button is absent entirely when the collector has no downstream performances', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.backgroundImage}
        isCollector
      />,
    )
    expect(
      screen.queryByRole('button', { name: /performancesAria/ }),
    ).not.toBeInTheDocument()
  })

  // 台账 #12（2026-08-02）：守卫前移到渲染期。此前三道守卫全在点击后的
  // handler 里，缺前提时零状态写入、零请求派发、卡面纹丝不动，只剩一个
  // 1.6s 就消失的右下角 toast —— 用户无法判断自己到底点没点上。
  it('disables 生成 up front when the node has no model or no prompt', () => {
    const { rerender } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            prompt: '有词但没模型',
            status: NODE_STATUS_IDS.idle,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.shot}
      />,
    )
    expect(screen.getByRole('button', { name: 'generate' })).toBeDisabled()

    rerender(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            model: GENERATE_READY.model,
            status: NODE_STATUS_IDS.idle,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.shot}
      />,
    )
    expect(screen.getByRole('button', { name: 'generate' })).toBeDisabled()

    // 前提齐了就恢复可点，且仍派发同一条 context 通道。
    rerender(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            ...GENERATE_READY,
            status: NODE_STATUS_IDS.idle,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.shot}
      />,
    )
    const button = screen.getByRole('button', { name: 'generate' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(mocks.generateMediaNode).toHaveBeenCalledWith('node-1')
  })

  it('seedance capability keeps generation local and reserves detail for expand', () => {
    const { rerender } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            ...GENERATE_READY,
            status: NODE_STATUS_IDS.idle,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.seedance}
      />,
    )
    expect(screen.getByRole('button', { name: 'generate' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'preview' }),
    ).not.toBeInTheDocument()

    rerender(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            ...GENERATE_READY,
            mediaUrl: 'https://cdn.example.com/shot.mp4',
            status: NODE_STATUS_IDS.done,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.seedance}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'regenerate' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'preview' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'expand' }))
    expect(mocks.setExpandedNodeId).toHaveBeenCalledWith('node-1')
  })

  it('videoMerge capability keeps merge local and reserves detail for expand', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.videoMerge}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'merge.run' }))
    expect(mocks.mergeAction.handleMerge).toHaveBeenCalled()

    expect(
      screen.queryByRole('button', { name: 'reorder' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'expand' }))
    expect(mocks.setExpandedNodeId).toHaveBeenCalledWith('node-1')
  })

  it('voice capability: 更换 opens the shared voice library dialog', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.voice}
      />,
    )
    expect(screen.queryByTestId('voice-library-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chooseVoice' }))
    expect(screen.getByTestId('voice-library-dialog')).toBeInTheDocument()
  })

  it('videoReference with media gets a 替换 capability plus universal actions', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={
          {
            mediaUrl: 'https://cdn.example.com/ref.mp4',
            status: NODE_STATUS_IDS.idle,
          } as NodeWorkflowNodeData
        }
        selected
        nodeType={NODE_TYPE_IDS.videoReference}
      />,
    )
    // 台账 #28（2026-08-02）：videoReference 现在**有**能力区（上传/替换）。
    // Rename moved to the card's own on-card label (NodeShell.tsx
    // EditableNodeLabel) — no rename input here anymore, on this toolbar or
    // any other type's.
    expect(screen.queryByLabelText('rename')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'replace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument()
  })

  // 台账 #28 的验收点：空参考视频卡此前**整条工具条不渲染**（无能力区且无
  // 媒体 ⇒ GenericSelectionToolbar 早退），于是没有 ⤢，而它的详情 body
  // 恰恰就是上传面板 —— 最该打开的时刻打不开。加了能力区后 capability 恒
  // 非空，那条「无能力无媒体不渲染」的拍板规则本身没动（见下一条 shotText）。
  it('videoReference with NO media still renders a toolbar so the upload panel stays reachable', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.videoReference}
      />,
    )
    expect(screen.getByRole('button', { name: 'upload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument()
    // 空卡没有可下载的东西 —— 通用区的下载钮仍按媒体有无决定
    expect(
      screen.queryByRole('button', { name: 'download' }),
    ).not.toBeInTheDocument()
  })

  // 2026-08-02 反转：这条用例原先断言「shotText 无媒体 ⇒ 整条工具条不渲染」，
  // 那是把 shotText 当纯投影产物的时代。owner 拍板「助手自动生成与用户手动
  // 输入是同一种东西」后，它的四个字段必须能改，而唯一的编辑面板
  // （GenericDetailBody）只能从工具条的 ⤢ 进 —— 没有工具条就永远打不开。
  // ⚠ owner 那条「无能力区且无媒体 ⇒ 不渲染」的规则**本身没动**，改的是
  // 「shotText 有没有能力区」。规则仍由下面 composer 那条用例守着。
  it('shotText gets an edit capability so its fields stay reachable', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.shotText}
      />,
    )
    expect(screen.getByRole('button', { name: 'editText' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument()
  })

  // owner 2026-07-27 规则的守门用例：真正没有能力区、又没有媒体的类型，整条
  // 工具条仍然不渲染（composer 是已退役的旧 planner，永远两者皆无）。
  it('a type with neither capability nor media still renders no toolbar', () => {
    const { container } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.composer}
      />,
    )
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})

// ── 包 4 审核动作 ────────────────────────────────────────────────────────
describe('MediaReviewButtons', () => {
  const URL = 'https://cdn/a.png'

  function renderAt(state?: 'awaiting_review' | 'approved' | 'rejected') {
    return render(
      <MediaReviewButtons
        nodeId="node-1"
        data={
          {
            status: NODE_STATUS_IDS.idle,
            mediaUrl: URL,
            ...(state ? { mediaReview: { [URL]: { state } } } : {}),
          } as NodeWorkflowNodeData
        }
      />,
    )
  }

  /**
   * ⚠ 这组断言存在的理由：第一版把 `approved` 直接 return null，于是**手滑点了
   * 「通过」就再也退不回来**——按钮自己消失了。那条工具条是选中才出现的，不是
   * 常年挂着，所以「已通过就别挂按钮」的理由不成立。两个方向都必须可逆。
   */
  it.each([
    ['awaiting_review', ['approve', 'reject']],
    ['rejected', ['approve']],
    ['approved', ['reject']],
  ] as const)('%s → 只给还能往哪走的那一个动作', (state, expected) => {
    renderAt(state)
    for (const label of ['approve', 'reject']) {
      const found = screen.queryByRole('button', { name: label })
      if ((expected as readonly string[]).includes(label)) {
        expect(found).toBeInTheDocument()
      } else {
        expect(found).not.toBeInTheDocument()
      }
    }
  })

  it('祖父条款：没有审核记录的图按已通过处理，只给「打回」', () => {
    renderAt(undefined)
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'approve' }),
    ).not.toBeInTheDocument()
  })

  it('没有媒体就整个不渲染', () => {
    const { container } = render(
      <MediaReviewButtons
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('打回只改状态，不碰媒体 URL', () => {
    renderAt('awaiting_review')
    fireEvent.click(screen.getByRole('button', { name: 'reject' }))
    const patch = mocks.updateNodeData.mock.calls.at(-1)?.[1]
    expect(patch.mediaReview[URL].state).toBe('rejected')
    // §5-W3「保留上一版媒体 URL 作对比（不立刻删 R2）」
    expect(patch).not.toHaveProperty('mediaUrl')
  })
})
