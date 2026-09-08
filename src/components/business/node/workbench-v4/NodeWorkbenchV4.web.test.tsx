/**
 * @vitest-environment jsdom
 *
 * ⚠ 本片是**渲染快照**：只证明画布层把四类 v4 节点各自挑对了组件、把键位真的
 * 绑上了；真机行为（拖投、连线、生成）在真机验收里过。
 */
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

/**
 * ReactFlow 整包桩掉。⚠ `ReactFlow` 本体桩成「按 `nodeTypes` 逐个渲染」——本组
 * 要断言的正是**哪一个组件被挑中渲染**（v4 四类 vs legacy 空壳），而不是 RF 的
 * 视口/连线内部。
 */
vi.mock('@xyflow/react', () => {
  const ReactFlow = (props: Record<string, unknown>) => {
    const nodes = (props.nodes ?? []) as { id: string; type: string }[]
    const nodeTypes = props.nodeTypes as Record<
      string,
      (p: Record<string, unknown>) => ReactNode
    >
    return (
      <div data-testid="react-flow">
        {nodes.map((node) => {
          const Component = nodeTypes[node.type]
          return (
            <div key={node.id} data-testid="rf-node" data-type={node.type}>
              {Component ? (
                <Component
                  {...(node as unknown as Record<string, unknown>)}
                  selected={false}
                />
              ) : null}
            </div>
          )
        })}
        {props.children as ReactNode}
      </div>
    )
  }
  return {
    ReactFlow,
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    ConnectionLineType: { SmoothStep: 'smoothstep' },
    SelectionMode: { Partial: 'partial' },
    MiniMap: () => null,
    Handle: (props: Record<string, unknown>) => (
      <span data-testid="handle" data-slot={props['data-slot'] as string} />
    ),
    NodeResizer: () => null,
    NodeToolbar: (props: Record<string, unknown>) =>
      props.isVisible ? <div>{props.children as ReactNode}</div> : null,
    Position: { Left: 'left', Right: 'right', Top: 'top' },
    useNodes: () => [],
    // `useUpdateNodeInternalsOnInit`（首绘强推 handle 位置）只读 store，
    // 快照里给一个空 store 就够 —— 它一次性、且没有边时立刻收工。
    useStoreApi: () => ({
      getState: () => ({ edges: [], updateNodeInternals: () => undefined }),
    }),
    useEdges: () => [],
    useReactFlow: () => ({
      fitView: vi.fn(),
      screenToFlowPosition: (point: { x: number; y: number }) => point,
    }),
    applyNodeChanges: <T,>(
      changes: { id: string; type: string; selected?: boolean }[],
      nodes: T[],
    ) =>
      (nodes as unknown as { id: string; selected?: boolean }[]).map((node) => {
        const change = changes.find((item) => item.id === node.id)
        return change?.type === 'select'
          ? { ...node, selected: change.selected }
          : node
      }) as unknown as T[],
  }
})

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ui/audio-player', () => ({
  AudioPlayer: () => null,
}))

import { CANVAS_ADD_CATALOG } from '@/constants/canvas-add-catalog'
import { NODE_STUDIO_TOOL_MODE_IDS } from '@/constants/node-studio'
import { useNodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { IngestDragProviderV4 } from '../IngestDragLayerV4'
import { NodeV4Provider } from '../nodes/v4/NodeV4Provider'
import { CanvasV4 } from './CanvasV4'
import { WORKBENCH_V4_ADD_ITEM_COUNT } from './WorkbenchToolbarV4'
import { useWorkbenchShortcutsV4 } from './WorkbenchShortcutsV4'

const NOW = '2026-09-08T00:00:00.000Z'

function node(id: string, data: Record<string, unknown>): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data },
  } as NodeV4
}

const STATE: NodeWorkflowStateV4 = {
  version: 4,
  nodes: [
    node('n1', { kind: 'image', subtype: 'shot' }),
    node('n2', { kind: 'video', subtype: 'shot', label: 'S01' }),
    node('n3', { kind: 'text', subtype: 'script', body: '她回头' }),
    node('n4', { kind: 'audio', subtype: 'voice' }),
  ],
  edges: [],
}

/** 墨线签署的空账本 —— 渲染快照不测装饰，只要装饰层有个可读的入口。 */
const NO_EDGE_SIGNING = {
  signedEdgePairs: new Map(),
  fadingEdges: new Map(),
  scheduleEdgeSigning: () => undefined,
  scheduleEdgeUnsign: () => undefined,
}

function Harness({ state }: { state: NodeWorkflowStateV4 }) {
  const graph = useNodeGraphV4({ state, onStateChange: () => undefined })
  return (
    <IngestDragProviderV4
      nodes={graph.nodes}
      edges={graph.edges}
      onConnect={() => undefined}
    >
      <NodeV4Provider graph={graph}>
        <CanvasV4
          graph={graph}
          toolMode={NODE_STUDIO_TOOL_MODE_IDS.hand}
          relationsCollapsed={false}
          canvasAppearance={undefined}
          edgeSigning={NO_EDGE_SIGNING}
        />
      </NodeV4Provider>
    </IngestDragProviderV4>
  )
}

describe('CanvasV4 · 渲染快照', () => {
  it('v4 卡数 = state 节点数，且四类各挑中自己的组件', () => {
    render(<Harness state={STATE} />)
    const rendered = screen.getAllByTestId('rf-node')
    expect(rendered).toHaveLength(STATE.nodes.length)
    expect(rendered.map((el) => el.dataset.type)).toEqual([
      'image',
      'video',
      'text',
      'audio',
    ])
  })

  it('legacy 空壳一个都不渲染（v4 里节点的 type 就是 kind）', () => {
    render(<Harness state={STATE} />)
    const legacy = screen
      .getAllByTestId('rf-node')
      .filter((el) => el.dataset.type === 'legacy')
    expect(legacy).toHaveLength(0)
  })

  it('空图不渲染任何卡', () => {
    render(<Harness state={{ version: 4, nodes: [], edges: [] }} />)
    expect(screen.queryAllByTestId('rf-node')).toHaveLength(0)
  })
})

describe('WorkbenchToolbarV4 · 添加菜单词表', () => {
  it('项数与词表一致，且每一项都带 v4 身份（⛔ 不靠 role 反推）', () => {
    const items = CANVAS_ADD_CATALOG.flatMap((group) => group.items)
    expect(items).toHaveLength(WORKBENCH_V4_ADD_ITEM_COUNT)
    for (const item of items) {
      expect(item.v4.kind).toBeTruthy()
      expect(item.v4.subtype).toBeTruthy()
    }
  })
})

describe('useWorkbenchShortcutsV4 · 键位真的接上了', () => {
  function renderShortcuts(initial: NodeWorkflowStateV4) {
    const onGenerateSelected = vi.fn()
    const onTidyLayout = vi.fn()
    const view = renderHook(
      ({ state }: { state: NodeWorkflowStateV4 }) => {
        const graph = useNodeGraphV4({
          state,
          onStateChange: (next) => view.rerender({ state: next }),
        })
        useWorkbenchShortcutsV4({ graph, onGenerateSelected, onTidyLayout })
        return graph
      },
      { initialProps: { state: initial } },
    )
    return { view, onGenerateSelected, onTidyLayout }
  }

  function press(key: string, init: KeyboardEventInit = {}) {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, ...init }),
      )
    })
  }

  it('⌘+Enter 带着当前选中集调生成', () => {
    const { view, onGenerateSelected } = renderShortcuts(STATE)
    act(() => {
      view.result.current.onRfNodesChange([
        { id: 'n1', type: 'select', selected: true },
      ])
    })
    press('Enter', { metaKey: true })
    expect(onGenerateSelected).toHaveBeenCalledWith(['n1'])
  })

  it('shift+A 走整理排布', () => {
    const { onTidyLayout } = renderShortcuts(STATE)
    press('A', { shiftKey: true })
    expect(onTidyLayout).toHaveBeenCalled()
  })

  it('⌘Z 撤的是图引擎那一份栈（新建一张卡再撤回去）', () => {
    const { view } = renderShortcuts({ version: 4, nodes: [], edges: [] })
    act(() => {
      view.result.current.addNode('image', 'result')
    })
    expect(view.result.current.nodes).toHaveLength(1)
    press('z', { metaKey: true })
    expect(view.result.current.nodes).toHaveLength(0)
  })

  it('在输入框里按 ⌘Z 一律不接管（那是「撤销我刚敲的字」）', () => {
    const { view } = renderShortcuts({ version: 4, nodes: [], edges: [] })
    act(() => {
      view.result.current.addNode('image', 'result')
    })
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          metaKey: true,
          bubbles: true,
        }),
      )
    })
    expect(view.result.current.nodes).toHaveLength(1)
    input.remove()
  })
})
