// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

import { takeCanvasRerunDownstream } from '@/lib/canvas-rerun-request'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

/**
 * 「重跑下游」这条菜单项（第三期）。
 *
 * 钉三件事：
 *  ① 有下游才画（⛔ 叶子节点上不摆一颗点了什么都不会发生的按钮）；
 *  ② 点它**只投一张便条**，⛔ 不直接发 op（那条会绕过助手与钱闸）；
 *  ③ 其余菜单项一条都没被挤掉。
 */

const NOW = '2026-09-08T00:00:00.000Z'

const node = (id: string): NodeV4 =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'shot',
      name: id,
      status: 'idle',
      createdAt: NOW,
    },
  }) as unknown as NodeV4

const edge = (source: string, target: string): NodeWorkflowEdgeV4 =>
  ({
    id: `${source}->${target}`,
    source,
    sourceHandle: 'out',
    target,
    slot: 'reference',
  }) as unknown as NodeWorkflowEdgeV4

function renderMenu(edges: NodeWorkflowEdgeV4[]) {
  const onApplyOp = vi.fn()
  const value = {
    nodes: [node('a'), node('b')],
    edges,
    expandedNodeId: null,
    changedNodeIds: [],
    selectedNodeIds: [],
    onToggleExpanded: vi.fn(),
    onApplyOp,
    onTidyLayout: vi.fn(),
  } as unknown as NodeV4CanvasContextValue

  render(
    <NodeV4CanvasProvider value={value}>
      <NodeV4ContextMenu node={node('a')} x={0} y={0} onClose={vi.fn()} />
    </NodeV4CanvasProvider>,
  )
  return { onApplyOp }
}

describe('NodeV4ContextMenu · 重跑下游', () => {
  it('⛔ 叶子节点上不画这一项', () => {
    renderMenu([])
    expect(
      document.querySelector('[data-menu-action="rerunDownstream"]'),
    ).toBeNull()
    // 其余项照旧在。
    expect(document.querySelector('[data-menu-action="delete"]')).not.toBeNull()
  })

  it('有下游时画出来，点它只投便条，⛔ 不发任何 op', () => {
    const { onApplyOp } = renderMenu([edge('a', 'b')])
    const item = document.querySelector(
      '[data-menu-action="rerunDownstream"]',
    ) as HTMLElement
    expect(item).not.toBeNull()
    fireEvent.click(item)
    expect(onApplyOp).not.toHaveBeenCalled()
    expect(takeCanvasRerunDownstream()).toBe('a')
    // ⚠ 取走即消费 —— 第二次取应当是空的。
    expect(takeCanvasRerunDownstream()).toBeNull()
  })
})
