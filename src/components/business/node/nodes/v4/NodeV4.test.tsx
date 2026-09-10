import type { NodeProps } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// ReactFlow 的 `Handle` 在测试里没有 store，桩成一个带 data-* 的 span 就够——
// 本组测试要断言的是「哪些槽渲染成了端口、拖线时点不点亮」，不是 ReactFlow 内部。
vi.mock('@xyflow/react', () => ({
  // S6e：卡壳从 RF 拿自己的 id（拖线反馈）。桩里给一个固定值就够。
  useNodeId: () => 'node-1',
  Handle: (props: Record<string, unknown>) => (
    <span
      data-testid="handle"
      data-slot={props['data-slot'] as string}
      data-output={props['data-output'] as string}
      data-lit={props['data-lit'] as string}
      data-type={props.type as string}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top' },
  // `NodeResizer` / `NodeToolbar` 同样要 ReactFlow 的 store。桩成可断言的壳：
  // 工具条要能点（删除/克隆/审核都从它出去），resizer 只需存在性。
  NodeResizer: (props: Record<string, unknown>) => (
    <span data-testid="resizer" data-visible={String(props.isVisible)} />
  ),
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-testid="node-toolbar">{props.children as ReactNode}</div>
    ) : null,
}))

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: { children: ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

/** ⋯「加入剪辑台」走动作出口（`useNodeCanvasActions`）——本组只看它被调到。 */
const openEditDesk = vi.fn()
vi.mock('./NodeV4ActionsBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./NodeV4ActionsBridge')>()),
  useNodeCanvasActions: () => ({ openEditDesk }),
}))

vi.mock('@/components/ui/audio-player', () => ({
  AudioPlayer: ({ src }: { src: string }) => (
    <div data-testid="audio">{src}</div>
  ),
}))

import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { AudioNodeV4 } from './AudioNodeV4'
import { ImageNodeV4 } from './ImageNodeV4'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'
import { VideoNodeV4 } from './VideoNodeV4'

const NOW = '2026-09-07T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4['data']> & { kind: NodeV4['data']['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    } as NodeV4['data'],
  }
}

function scene(): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        node('t_02', {
          kind: 'text',
          subtype: 'shotNote',
          body: '# S02\n\n控制室广角\n\n第二段',
        }),
        node('i_kf', {
          kind: 'image',
          subtype: 'shot',
          url: 'https://cdn.test/kf.png',
        }),
        node('i_kf2', {
          kind: 'image',
          subtype: 'shot',
          url: 'https://cdn.test/kf2.png',
        }),
        node('a_v', {
          kind: 'audio',
          subtype: 'voice',
          url: 'https://cdn.test/v.mp3',
          durationSec: 4,
        }),
        // `video.shot` 的 `label` 必填 —— 稳定名就是它，`S02` 只是显示前缀。
        node('v_02', {
          kind: 'video',
          subtype: 'shot',
          shotNo: 2,
          label: '有人还在',
        }),
      ],
      edges: [
        {
          id: 'e1',
          source: 'i_kf',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'firstFrame',
        },
        {
          id: 'e2',
          source: 'i_kf2',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'firstFrame',
        },
        {
          id: 'e3',
          source: 'a_v',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'voice',
        },
        {
          id: 'e4',
          source: 't_02',
          sourceHandle: 'out',
          target: 'v_02',
          slot: 'text',
        },
      ],
    },
    { now: NOW },
  )
}

function harness(
  state: NodeWorkflowStateV4,
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes: state.nodes,
    edges: state.edges,
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
    onToggleExpanded: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onFocusNode: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
    modelOptionsByKind: {},
    onSetPrompt: vi.fn(),
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(),
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    selectedNodeIds: [],
    ...overrides,
  }
}

function renderNode(
  Component: (props: NodeProps) => ReactNode,
  nodeId: string,
  context: NodeV4CanvasContextValue,
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <Component id={nodeId} data={target.data} selected={false} />
    </NodeV4CanvasProvider>,
  )
}

describe('四类节点的两态渲染', () => {
  it('图片节点收起态显示缩略图', () => {
    const state = scene()
    renderNode(ImageNodeV4, 'i_kf', harness(state))
    expect(screen.getByAltText('i_kf')).toHaveAttribute(
      'src',
      'https://cdn.test/kf.png',
    )
  })

  it('音频节点是矮卡：波形 + 时长，⛔ 无展开态', () => {
    const state = scene()
    const { container } = renderNode(AudioNodeV4, 'a_v', harness(state))
    const surface = container.querySelector('[data-audio-surface="ready"]')!
    expect(surface).toBeInTheDocument()
    expect(surface.querySelector('[data-audio-waveform]')).toBeInTheDocument()
    expect(screen.getByText('4s')).toBeInTheDocument()

    // 展开态在 S5 随 spec §4「无画中框」一起删 —— 传 `expandedNodeId` 也不换版式。
    const expanded = renderNode(
      AudioNodeV4,
      'a_v',
      harness(state, { expandedNodeId: 'a_v' }),
    )
    expect(
      expanded.container.querySelector('[data-audio-surface="ready"]'),
    ).toBeInTheDocument()
  })

  it('镜头卡头显示 `S02·label`——序号是显示前缀，落库的是 label 与 shotNo', () => {
    const state = scene()
    renderNode(VideoNodeV4, 'v_02', harness(state))
    expect(screen.getByText('S02·有人还在')).toBeInTheDocument()
    // ⛔ 存的不是这一串：节点自己的 name 与 label 都不带前缀。
    const stored = state.nodes.find((item) => item.id === 'v_02')!.data
    expect(stored.kind === 'video' && stored.label).toBe('有人还在')
  })
})

describe('端口（S6e · spec §1.13：一入一出）', () => {
  it('镜头卡五个槽也只画一颗入口 + 一颗出口（`tailFrame` 不再有第二个口）', () => {
    const state = scene()
    const { container } = renderNode(VideoNodeV4, 'v_02', harness(state))
    const inputs = [...container.querySelectorAll('[data-type="target"]')]
    const outputs = [...container.querySelectorAll('[data-type="source"]')]
    expect(inputs).toHaveLength(1)
    expect(outputs).toHaveLength(1)
  })
})
