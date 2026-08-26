import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

const { flowState, mockFocusNode } = vi.hoisted(() => ({
  flowState: {
    nodes: [] as Array<Record<string, unknown>>,
    edges: [] as Array<Record<string, unknown>>,
  },
  mockFocusNode: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({
  useNodes: () => flowState.nodes,
  useEdges: () => flowState.edges,
}))

vi.mock('./NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ focusNode: mockFocusNode }),
}))

// G1（画布修法 P2）：`CastDock` 自己的分组/呈现细节已经在 CastDock.test.tsx
// 里锁住。这里只关心 `CanvasRosterRail` 有没有把 query 正确地 controlled 下
// 发——换一个极简搜索框桩件，把测试焦点收在「上下两段有没有共用同一个
// query」上。
vi.mock('./CastDock', () => ({
  CastDock: ({
    query,
    onQueryChange,
  }: {
    query: string
    onQueryChange: (value: string) => void
  }) => (
    <input
      aria-label="stub-locator-search"
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
    />
  ),
}))

// CastCard 自己的渲染（hover 徽章、拖拽源身份等）已经在 CastCard.test.tsx
// 里锁住。这里换一个只暴露名字的桩件，把测试焦点收在「filteredCards 算得
// 对不对」上。
vi.mock('./CastCard', () => ({
  CastCard: ({
    node,
  }: {
    node: { id: string; data: Record<string, unknown> }
  }) => (
    <div data-testid={`stub-card-${node.id}`}>
      {(node.data.characterName as string | undefined) ??
        (node.data.backgroundName as string | undefined)}
    </div>
  ),
}))

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

import { CanvasRosterRail } from './CanvasRosterRail'

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  return { id, type, position: { x: 0, y: 0 }, data }
}

describe('CanvasRosterRail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flowState.nodes = []
    flowState.edges = []
  })

  // G1：调查实测的原 bug——搜「镜头1」时上段节点定位器收窄，下段收集器卡区
  // 4 张卡纹丝不动，因为两段各管一份 query。这里用一张名字命中、一张名字不
  // 命中的卡复现并锁住修复：同一个输入框改一次值，两段必须同时反应。
  it('用同一个搜索框过滤上段定位器与下段卡片区', () => {
    flowState.nodes = [
      makeNode('char-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '镜头1专用角色',
      }),
      makeNode('char-2', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '不相关的角色',
      }),
    ]

    render(<CanvasRosterRail />)
    expect(screen.getByTestId('stub-card-char-1')).toBeInTheDocument()
    expect(screen.getByTestId('stub-card-char-2')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('stub-locator-search'), {
      target: { value: '镜头1' },
    })

    expect(screen.getByTestId('stub-card-char-1')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-card-char-2')).not.toBeInTheDocument()
  })

  // 验收②：卡片段被搜索滤空时不能整段静默消失——那会和「项目里根本没有卡」
  // 两种状态混在一起分不清。
  it('搜索把卡全部滤掉时显示「没有匹配」而不是让卡片段消失', () => {
    flowState.nodes = [
      makeNode('char-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]

    render(<CanvasRosterRail />)
    fireEvent.change(screen.getByLabelText('stub-locator-search'), {
      target: { value: '不存在的名字' },
    })

    expect(screen.queryByTestId('stub-card-char-1')).not.toBeInTheDocument()
    expect(screen.getByText('noResults')).toBeInTheDocument()
  })

  // 项目里压根没有收集器卡时（不是搜索滤掉的）下段整体不渲染——「一张卡都
  // 没有时空标题+空网格是伪装能力」这条既有约束不能被这次改动破坏。
  it('项目里没有收集器卡时下段整体不渲染', () => {
    flowState.nodes = [
      makeNode('shot-1', NODE_TYPE_IDS.shotText, { mediaLabel: '镜头1' }),
    ]

    render(<CanvasRosterRail />)
    expect(screen.queryByText('rosterTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('noResults')).not.toBeInTheDocument()
  })

  // G3：两段各有一个能读懂的标题，不是只有下段有、上段没有。
  it('上下两段各有自己的标题', () => {
    flowState.nodes = [
      makeNode('char-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        characterName: '黛西',
      }),
    ]

    render(<CanvasRosterRail />)
    expect(screen.getByText('locatorTitle')).toBeInTheDocument()
    expect(screen.getByText('rosterTitle')).toBeInTheDocument()
  })
})
