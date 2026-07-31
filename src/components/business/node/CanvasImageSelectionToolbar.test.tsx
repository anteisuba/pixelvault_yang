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
}))

const IMAGE_DATA = {
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

    // Primary chrome is category/expand/download/quick-edit; AI suite lives
    // under "more" (always rendered in this mock dropdown).
    expect(
      screen.getByRole('button', { name: 'quickEdit' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /upscale.label/ }))
    expect(screen.getByTestId('image-edit-workspace')).toHaveTextContent(
      'upscale',
    )
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

  it('seedance capability keeps generation local and reserves detail for expand', () => {
    const { rerender } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
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

  it('videoReference gets no capability region — universal actions only (identity now lives on the card, not the toolbar)', () => {
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
    // FB-4: videoReference has no capability region, but a mediaUrl still
    // makes the toolbar worth showing (download). Rename moved to the card's
    // own on-card label (NodeShell.tsx EditableNodeLabel) — no rename input
    // here anymore, on this toolbar or any other type's.
    expect(screen.queryByLabelText('rename')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument()
  })

  it('shotText with no media and no capability region renders no toolbar at all', () => {
    const { container } = render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.shotText}
      />,
    )
    // shotText has no registry capability and (here) no media — nothing to
    // operate on, so the whole toolbar is absent, not a read-only identity
    // span + universal-actions shell like before this change.
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
