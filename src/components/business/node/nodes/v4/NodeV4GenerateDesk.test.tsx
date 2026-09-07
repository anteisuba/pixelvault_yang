import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const generateNode = vi.fn(async () => ({ success: true as const }))
vi.mock('@/hooks/node/use-node-media-generation-v4', () => ({
  useNodeMediaGenerationV4: () => ({
    generateNode,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}))

vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({
    uploadFile: vi.fn(),
    isUploading: false,
    progress: 0,
    error: null,
    cancelUpload: vi.fn(),
  }),
}))

// 槽架的动效与折叠不是本组要断言的东西，桩成一个计数条。
vi.mock('../../composer/CanvasSlotRack', () => ({
  CanvasSlotRack: ({ tokens }: { tokens: readonly { id: string }[] }) => (
    <div data-testid="slot-rack">{tokens.length}</div>
  ),
}))

vi.mock('../../node-detail/DetailModelPicker', () => ({
  DetailModelPicker: () => <div data-testid="model-picker" />,
}))

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { NodeV4CanvasProvider } from './NodeV4Context'
import type { NodeV4CanvasContextValue } from './NodeV4Context'
import { NodeV4GenerateDesk } from './NodeV4GenerateDesk'

const NOW = '2026-09-07T00:00:00.000Z'

function scene(): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        {
          id: 'i_a',
          position: { x: 0, y: 0 },
          data: {
            name: 'i_a',
            status: 'idle',
            createdAt: NOW,
            kind: 'image',
            subtype: 'shot',
            url: 'https://x/a.png',
          },
        },
        {
          id: 'v_1',
          position: { x: 0, y: 0 },
          data: {
            name: 'v_1',
            status: 'idle',
            createdAt: NOW,
            kind: 'video',
            subtype: 'shot',
            label: '有人还在',
            prompt: '缓慢推入',
          },
        },
        {
          id: 'm_1',
          position: { x: 0, y: 0 },
          data: {
            name: 'm_1',
            status: 'idle',
            createdAt: NOW,
            kind: 'video',
            subtype: 'merge',
          },
        },
        {
          id: 't_1',
          position: { x: 0, y: 0 },
          data: {
            name: 't_1',
            status: 'idle',
            createdAt: NOW,
            kind: 'text',
            subtype: 'shotNote',
            body: '正文',
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'i_a',
          sourceHandle: 'out',
          target: 'v_1',
          slot: NODE_SLOT_IDS.firstFrame,
        },
        {
          id: 'e2',
          source: 'v_1',
          sourceHandle: 'out',
          target: 'm_1',
          slot: NODE_SLOT_IDS.clip,
        },
      ],
    },
    { now: NOW },
  )
}

function context(state: NodeWorkflowStateV4): NodeV4CanvasContextValue {
  return {
    nodes: state.nodes,
    edges: state.edges,
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
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
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    selectedNodeIds: [],
  }
}

function renderDesk(
  state: NodeWorkflowStateV4,
  nodeId: string,
  overrides: Partial<NodeV4CanvasContextValue> = {},
) {
  const value = { ...context(state), ...overrides }
  const node = state.nodes.find((item) => item.id === nodeId) as NodeV4
  render(
    <NodeV4CanvasProvider value={value}>
      <NodeV4GenerateDesk node={node} />
    </NodeV4CanvasProvider>,
  )
  return value
}

describe('NodeV4GenerateDesk', () => {
  it('镜头节点：提示词可编辑、槽架读 v4 令牌、参数档全露', () => {
    const state = scene()
    const value = renderDesk(state, 'v_1')
    const prompt = screen.getByLabelText('generateDesk.prompt')
    expect(prompt).toHaveValue('缓慢推入')
    fireEvent.change(prompt, { target: { value: '推到特写' } })
    fireEvent.blur(prompt)
    expect(value.onSetPrompt).toHaveBeenCalledWith('v_1', '推到特写')

    // 首帧一格进槽架（文本槽不进 —— 那一格发的是字）。
    expect(screen.getByTestId('slot-rack')).toHaveTextContent('1')
    expect(screen.getByLabelText('generateDesk.seed')).toBeInTheDocument()
    expect(
      screen.getByLabelText('generateDesk.generateAudio'),
    ).toBeInTheDocument()
  })

  it('没选模型 → 生成按钮点不动，并说清为什么', () => {
    const state = scene()
    renderDesk(state, 'v_1')
    expect(screen.getByText('generateDesk.noModel')).toBeInTheDocument()
    const button = screen.getByText('generateDesk.generate').closest('button')
    expect(button).toBeDisabled()
  })

  it('槽没填够 → 列出 belowMin 的专属文案（⛔ 不借连线拒绝的话）', () => {
    const state = scene()
    const { container } = render(
      <NodeV4CanvasProvider value={context(state)}>
        <NodeV4GenerateDesk
          node={state.nodes.find((item) => item.id === 'm_1') as NodeV4}
        />
      </NodeV4CanvasProvider>,
    )
    expect(
      container.querySelector('[data-slot-issue="belowMin"]')?.textContent,
    ).toBe('StudioNode.v4.slotIssue.belowMin')
  })

  it('文本节点没有生成区，只说明它靠派生', () => {
    const state = scene()
    renderDesk(state, 't_1')
    expect(screen.getByText('generateDesk.noGenerate')).toBeInTheDocument()
    expect(screen.queryByLabelText('generateDesk.prompt')).toBeNull()
  })

  it('图片节点只露比例这一档，不露视频参数', () => {
    const state = scene()
    renderDesk(state, 'i_a')
    expect(screen.queryByLabelText('generateDesk.seed')).toBeNull()
    expect(screen.getByText('generateDesk.aspectRatio')).toBeInTheDocument()
  })
})
