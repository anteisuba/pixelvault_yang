import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

vi.mock('@xyflow/react', () => ({
  Handle: () => <span data-testid="handle" />,
  Position: { Left: 'left', Right: 'right', Top: 'top' },
  NodeResizer: (props: Record<string, unknown>) => (
    <span data-testid="resizer" data-visible={String(props.isVisible)} />
  ),
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-testid="node-toolbar">{props.children as ReactNode}</div>
    ) : null,
}))

// 编排区自带一串 hook（模型清单 / 上传 / 生成），本组测试只看图片卡自己长出来的
// 那几块，桩掉它就够——⛔ 不为了它把整棵 provider 树搭起来。
vi.mock('./NodeV4GenerateDesk', () => ({
  NodeV4GenerateDesk: () => <div data-testid="desk" />,
}))

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import {
  ImageNodeV4,
  collapsedImageWidth,
  formatSizeBytes,
} from './ImageNodeV4'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

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

/** 一张角色图 + 两张参考图（一张已挂进 `reference` 槽，一张还没挂）+ 一个下游镜头。 */
function scene(): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        node('i_char', {
          kind: 'image',
          subtype: 'character',
          url: 'https://cdn.test/c.png',
          mediaWidth: 1600,
          mediaHeight: 900,
          sizeBytes: 2 * 1024 * 1024,
          imageSource: 'generated',
        }),
        node('i_ref', {
          kind: 'image',
          subtype: 'reference',
          url: 'https://cdn.test/r.png',
        }),
        node('i_free', {
          kind: 'image',
          subtype: 'reference',
          url: 'https://cdn.test/f.png',
        }),
        node('v_01', {
          kind: 'video',
          subtype: 'shot',
          shotNo: 1,
          label: '开场',
        }),
      ],
      edges: [
        {
          id: 'e_ref',
          source: 'i_ref',
          sourceHandle: 'out',
          target: 'i_char',
          slot: NODE_SLOT_IDS.reference,
        },
        {
          id: 'e_down',
          source: 'i_char',
          sourceHandle: 'out',
          target: 'v_01',
          slot: NODE_SLOT_IDS.reference,
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
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

function renderImage(
  context: NodeV4CanvasContextValue,
  nodeId = 'i_char',
  selected = false,
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <ImageNodeV4 id={nodeId} data={target.data} selected={selected} />
    </NodeV4CanvasProvider>,
  )
}

describe('卡宽随媒体比例', () => {
  it('缺 mediaWidth/Height 时退回收起态定宽', () => {
    expect(collapsedImageWidth({ kind: 'image' } as never)).toBe(320)
  })

  it('横图变宽但钳在展开态宽以内，⛔ 不放开上限', () => {
    const wide = collapsedImageWidth({
      kind: 'image',
      mediaWidth: 4000,
      mediaHeight: 1000,
    } as never)
    expect(wide).toBeLessThanOrEqual(560)
    expect(wide).toBeGreaterThan(320)
  })

  it('竖图不比收起态更窄', () => {
    expect(
      collapsedImageWidth({
        kind: 'image',
        mediaWidth: 900,
        mediaHeight: 1600,
      } as never),
    ).toBe(320)
  })
})

describe('读数条', () => {
  it('W×H / 大小 / 来源角标都渲染', () => {
    renderImage(harness(scene()))
    expect(
      screen.getAllByText('readout.dimensions:1600/900').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('2.0 MB').length).toBeGreaterThan(0)
    expect(
      document.querySelector('[data-image-source="generated"]'),
    ).not.toBeNull()
  })

  it('缺尺寸字段时那一条整段不渲染，⛔ 不显示 0×0', () => {
    renderImage(harness(scene()), 'i_ref')
    expect(document.querySelector('[data-readout-dimensions]')).toBeNull()
  })

  it('没有 url 时整条读数不渲染', () => {
    const state = scene()
    const stripped = {
      ...state,
      nodes: state.nodes.map((item) =>
        item.id === 'i_ref'
          ? { ...item, data: { ...item.data, url: undefined } }
          : item,
      ),
    } as NodeWorkflowStateV4
    renderImage(harness(stripped), 'i_ref')
    expect(document.querySelector('[data-image-readout]')).toBeNull()
  })
})

describe('选中工具条', () => {
  it('单选时出现；删除发 delete op', () => {
    const context = harness(scene())
    renderImage(context, 'i_char', true)
    fireEvent.click(
      document.querySelector('[data-toolbar-action="delete"]') as Element,
    )
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.delete,
      target: 'i_char',
    })
  })

  it('克隆发的是**同类空节点**的 add_node，⛔ 不带 url', () => {
    const context = harness(scene())
    renderImage(context, 'i_char', true)
    fireEvent.click(
      document.querySelector('[data-toolbar-action="clone"]') as Element,
    )
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: 'image',
      subtype: 'character',
    })
  })

  it('审核按钮写 reviewState', () => {
    const context = harness(scene())
    renderImage(context, 'i_char', true)
    fireEvent.click(
      document.querySelector('[data-toolbar-action="reject"]') as Element,
    )
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.setReviewState,
      target: 'i_char',
      url: 'https://cdn.test/c.png',
      state: 'rejected',
    })
  })

  it('多选时整条不渲染（legacy multiSelectActive 的同一判据）', () => {
    renderImage(
      harness(scene(), { selectedNodeIds: ['i_char', 'i_ref'] }),
      'i_char',
      true,
    )
    expect(screen.queryByTestId('node-toolbar')).toBeNull()
  })
})

describe('展开态的四块', () => {
  const expandedContext = () => harness(scene(), { expandedNodeId: 'i_char' })

  it('参考图集读的是**槽的版本**，不是 referenceAssets', () => {
    renderImage(expandedContext())
    expect(document.querySelector('[data-gallery-item="i_ref"]')).not.toBeNull()
    expect(document.querySelector('[data-gallery-empty]')).toBeNull()
  })

  it('图集「移除」断的是那条边，节点留在画布上', () => {
    const context = expandedContext()
    renderImage(context)
    fireEvent.click(document.querySelector('[data-gallery-remove]') as Element)
    expect(context.onDisconnectSlot).toHaveBeenCalledWith(
      'i_char',
      NODE_SLOT_IDS.reference,
      expect.any(String),
    )
  })

  it('图集「＋加入」只列还没挂进来的图片节点，点一下发 connect', () => {
    const context = expandedContext()
    renderImage(context)
    fireEvent.click(document.querySelector('[data-gallery-add]') as Element)
    expect(document.querySelector('[data-gallery-pick="i_ref"]')).toBeNull()
    fireEvent.click(
      document.querySelector('[data-gallery-pick="i_free"]') as Element,
    )
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      source: 'i_free',
      target: 'i_char',
      slot: NODE_SLOT_IDS.reference,
    })
  })

  it('关系带做的是**下游**反查，点 chip 飞相机而不是打开', () => {
    const context = expandedContext()
    renderImage(context)
    const chip = document.querySelector('[data-relation-chip="v_01"]')
    expect(chip).not.toBeNull()
    fireEvent.click(chip as Element)
    expect(context.onFocusNode).toHaveBeenCalledWith('v_01')
    expect(context.onToggleExpanded).not.toHaveBeenCalled()
  })

  it('证据抽屉默认收起，展开后逐槽列出当前版', () => {
    renderImage(expandedContext())
    const toggle = document.querySelector('[data-evidence-toggle]') as Element
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(
      document.querySelectorAll('[data-evidence-row]').length,
    ).toBeGreaterThan(0)
  })
})

describe('右键菜单', () => {
  it('在节点上右键出菜单，项数固定五条', () => {
    renderImage(harness(scene()))
    fireEvent.contextMenu(
      document.querySelector('[data-node-kind="image"]') as Element,
    )
    expect(
      document.querySelectorAll('[data-node-context-menu] [role="menuitem"]')
        .length,
    ).toBe(5)
  })
})

describe('formatSizeBytes', () => {
  it('1MB 以下走 KB', () => {
    expect(formatSizeBytes(2048)).toBe('2 KB')
  })
})
