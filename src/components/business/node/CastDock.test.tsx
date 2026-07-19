import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

const { flowState, mockSetExpandedNodeId, mockDeleteNode, mockBeginDrag } =
  vi.hoisted(() => ({
    flowState: {
      nodes: [] as Array<Record<string, unknown>>,
      edges: [] as Array<Record<string, unknown>>,
    },
    mockSetExpandedNodeId: vi.fn(),
    mockDeleteNode: vi.fn(),
    mockBeginDrag: vi.fn(),
  }))

vi.mock('@xyflow/react', () => ({
  useNodes: () => flowState.nodes,
  useEdges: () => flowState.edges,
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    setExpandedNodeId: mockSetExpandedNodeId,
    expandedNodeId: null,
    deleteNode: mockDeleteNode,
  }),
}))

vi.mock('./IngestDragLayer', () => ({
  useIngestDrag: () => ({
    beginDrag: mockBeginDrag,
    dragState: { active: false, sourceNodeId: null, ghost: null, reason: null },
  }),
}))

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

import { CastDock, isCastIdentityNode } from './CastDock'

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  }
}

function renderDock(
  onCreateCard = vi.fn(),
  extraProps: Partial<ComponentProps<typeof CastDock>> = {},
) {
  return render(
    <CastDock
      onCreateCard={onCreateCard}
      insetLeft={16}
      insetRight={16}
      {...extraProps}
    />,
  )
}

describe('CastDock', () => {
  beforeAll(() => {
    // jsdom lacks the observers Radix/floating-ui rely on (the trailing
    // ＋新建 tile's type picker is a real Popover since S5d's 【紧急修复】—
    // a hand-rolled absolute div got clipped by the strip's own overflow).
    if (!('ResizeObserver' in globalThis)) {
      class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {}
    }
    if (typeof window.matchMedia !== 'function') {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }))
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    flowState.nodes = []
    flowState.edges = []
  })

  it('renders nothing when the canvas has no nodes (mirror view, no data to mirror)', () => {
    const { container } = renderDock()
    expect(container).toBeEmptyDOMElement()
  })

  // S5d ①「卡匣回横匣」: no click-to-open step anymore — both sections and
  // their cards are visible immediately, side by side.
  it('shows character/background sections with their cards immediately, no expand click required', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
      makeNode('b1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
        backgroundName: '夜街',
      }),
      // Not a Cast identity node — must not leak into any section.
      makeNode('s1', NODE_TYPE_IDS.shot, {}),
    ]

    renderDock()

    expect(screen.getByTitle('黛西')).toBeInTheDocument()
    expect(screen.getByTitle('夜街')).toBeInTheDocument()
  })

  // owner 2026-07-10 追加拍板：卡匣只放卡片，音色/参考视频是素材不进卡匣
  // （它们仍走同一条"零引用可见"画布规则，只是不再有 dock 卡面）。
  it('never renders voice/videoReference nodes as dock cards even though they still count as Cast identity nodes', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
      makeNode('v1', NODE_TYPE_IDS.voice, { voiceName: '温柔女声' }),
      makeNode('r1', NODE_TYPE_IDS.videoReference, { mediaLabel: '开场运镜' }),
    ]

    renderDock()

    expect(screen.getByTitle('黛西')).toBeInTheDocument()
    expect(screen.queryByTitle('温柔女声')).not.toBeInTheDocument()
    expect(screen.queryByTitle('开场运镜')).not.toBeInTheDocument()
  })

  // §6.0 修正①「空分区不占位」
  it('hides a section entirely when it has no cards', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]

    renderDock()

    expect(screen.getByText('sections.character')).toBeInTheDocument()
    expect(screen.queryByText('sections.background')).not.toBeInTheDocument()
  })

  it('opens the node detail panel (胃) instead of focusing the canvas when a card is tapped', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]

    renderDock()
    fireEvent.click(screen.getByTitle('黛西'))

    expect(mockSetExpandedNodeId).toHaveBeenCalledWith('c1')
  })

  // §6.0 修正①: one trailing ＋新建 tile opens a 2-item type picker
  // (角色/场景) instead of a per-section button. Popover-based (【紧急修复】
  // owner 2026-07-11 实测发现手写 absolute 菜单被 strip 的 overflow 裁切
  // 隐藏 — 换成真 Popover 才能逃出裁切，同时拿到 outside-click/Esc)。
  it('opens a type picker from the single trailing ＋新建 tile and creates the picked type', async () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]
    const onCreateCard = vi.fn()

    renderDock(onCreateCard)

    // Only one create trigger exists now.
    expect(screen.getAllByRole('button', { name: 'create' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'create' }))

    const backgroundOption = await screen.findByText('sections.background')
    fireEvent.click(backgroundOption)
    expect(onCreateCard).toHaveBeenCalledWith(NODE_IMAGE_ROLE_IDS.background)
  })

  it('computes the identity badge (📷 referenceAssets + closeup edges, ♪ voice edge existence) from a single edges pass', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
        referenceAssets: [
          { id: 'r1', url: 'https://x/1.png', source: 'upload' },
        ],
      }),
      makeNode('close1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
      }),
      makeNode('voice1', NODE_TYPE_IDS.voice, {}),
    ]
    flowState.edges = [
      { id: 'e1', source: 'close1', target: 'c1' },
      { id: 'e2', source: 'voice1', target: 'c1' },
    ]

    renderDock()

    const badge = screen.getByLabelText(
      'referenceCountAria {"count":2} · voiceBoundAria',
    )
    expect(badge).toHaveTextContent('📷2 ♪')
  })

  it('collapses to a small handle pill and re-expands, without losing the total count', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]

    renderDock()
    expect(screen.getByTitle('黛西')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'collapse' }))
    expect(screen.queryByTitle('黛西')).not.toBeInTheDocument()
    expect(screen.getByText('handle {"count":1}')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'expand' }))
    expect(screen.getByTitle('黛西')).toBeInTheDocument()
  })

  // R3-4 (canvas-relationship-v3 §4.2 rule 3/1): a higher tier (add menu /
  // 详情面板 / 重编辑工作区) claims the L5 slot — CastDock collapses itself.
  it('collapses when forceCollapse flips true, even though nothing inside CastDock asked for it', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]

    const { rerender } = render(
      <CastDock
        onCreateCard={vi.fn()}
        insetLeft={16}
        insetRight={16}
        forceCollapse={false}
      />,
    )
    expect(screen.getByTitle('黛西')).toBeInTheDocument()

    rerender(
      <CastDock
        onCreateCard={vi.fn()}
        insetLeft={16}
        insetRight={16}
        forceCollapse
      />,
    )
    expect(screen.queryByTitle('黛西')).not.toBeInTheDocument()
  })

  // R3-4 §4.2: the mirror half of the same contract — every collapsed⇄
  // expanded transition is reported upward so the workbench can close the
  // other L5 citizen (add menu) and fold this into the Esc ladder.
  it('reports its own collapsed/expanded transitions via onExpandedChange', () => {
    flowState.nodes = [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]
    const onExpandedChange = vi.fn()

    renderDock(vi.fn(), { onExpandedChange })
    expect(onExpandedChange).toHaveBeenCalledWith(true)

    onExpandedChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'collapse' }))
    expect(onExpandedChange).toHaveBeenCalledWith(false)
  })
})

describe('isCastIdentityNode', () => {
  it('matches the four Cast dock kinds (legacy + unified role) and rejects everything else', () => {
    expect(
      isCastIdentityNode(
        makeNode('c1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.character,
        }) as never,
      ),
    ).toBe(true)
    expect(
      isCastIdentityNode(makeNode('c2', NODE_TYPE_IDS.characterImage) as never),
    ).toBe(true)
    expect(
      isCastIdentityNode(makeNode('v1', NODE_TYPE_IDS.voice) as never),
    ).toBe(true)
    expect(
      isCastIdentityNode(makeNode('r1', NODE_TYPE_IDS.videoReference) as never),
    ).toBe(true)
    // 镜头图卡（中鱼）must stay visible — never folds into the dock/hidden set.
    expect(
      isCastIdentityNode(
        makeNode('s1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
        }) as never,
      ),
    ).toBe(false)
    expect(
      isCastIdentityNode(makeNode('vid1', NODE_TYPE_IDS.seedance) as never),
    ).toBe(false)
  })
})
