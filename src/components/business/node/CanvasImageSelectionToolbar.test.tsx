import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import {
  canOfferCanvasImageEdit,
  CanvasImageSelectionToolbar,
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

    // Primary chrome is rename/category/expand/download/quick-edit; AI suite
    // lives under "more" (always rendered in this mock dropdown).
    expect(
      screen.getByRole('button', { name: 'quickEdit' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /upscale.label/ }))
    expect(screen.getByTestId('image-edit-workspace')).toHaveTextContent(
      'upscale',
    )
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

  it('a closeup image node (same legacy type characterImage, isCollector unset) does NOT get the collector capability', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.characterImage}
      />,
    )
    expect(screen.queryByTestId('collector-add-asset')).not.toBeInTheDocument()
    // Falls to the generic branch: identity still renders the characterName
    // rename field (shared with the true collector), just no capability.
    expect(screen.getByLabelText('rename')).toBeInTheDocument()
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

  it('seedance capability: 生成/重生成 always, 预览 only once media exists', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'preview' }))
    expect(mocks.setExpandedNodeId).toHaveBeenCalledWith('node-1')
  })

  it('videoMerge capability: 合成 via the shared use-video-merge-action hook + 排序 opens detail', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'reorder' }))
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

  it('videoReference gets no capability region — mediaLabel rename input + universal actions only', () => {
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
    // FB-4: videoReference has no dedicated name field, so it now shares the
    // generic mediaLabel — the identity region renders a rename input (same
    // field the card's own corner-chip title reads) instead of the old
    // read-only type-name span.
    expect(screen.getByLabelText('rename')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'expand' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument()
  })

  it('shotText gets no capability region — read-only identity label + universal actions only, omitting download without media', () => {
    render(
      <NodeSelectionToolbarChrome
        nodeId="node-1"
        data={{ status: NODE_STATUS_IDS.idle } as NodeWorkflowNodeData}
        selected
        nodeType={NODE_TYPE_IDS.shotText}
      />,
    )
    // shotText has no FB-4 mapping (not in resolveIdentityNamedField), so it
    // keeps the pre-existing read-only type-name span.
    expect(screen.getByText('shotText')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'download' }),
    ).not.toBeInTheDocument()
  })
})
