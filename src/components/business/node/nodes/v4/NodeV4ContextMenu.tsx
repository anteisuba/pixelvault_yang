'use client'

/**
 * 节点上的**右键菜单**（legacy 在节点上根本没有——只有画布空白处的 `CanvasAddMenu`）。
 *
 * 存在理由：展开态的动作住在卡里，收起态只有一条浮动工具条，而「删除 / 克隆 /
 * 下载 / 归到某镜 / 整理」在收起态也要够得着。⚠ 菜单**只是已有动作的第二个入口**，
 * ⛔ 不在这里长出独有动作——两个入口做的事一旦分叉，用户就得记住哪个能做什么。
 */

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

export interface NodeV4ContextMenuProps {
  readonly node: NodeV4
  /** 相对**卡片**的落点（右键事件的 offsetX/Y）。 */
  readonly x: number
  readonly y: number
  readonly mediaUrl?: string
  onClose(): void
}

export function NodeV4ContextMenu({
  node,
  x,
  y,
  mediaUrl,
  onClose,
}: NodeV4ContextMenuProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const ref = useRef<HTMLDivElement>(null)

  // Esc 关闭 + 点外部关闭。⚠ 用 capture：ReactFlow 在冒泡阶段吃掉画布上的点击。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [onClose])

  const items: {
    id: string
    label: string
    disabled?: boolean
    run(): void
  }[] = [
    {
      id: 'expand',
      label: t(
        canvas.expandedNodeId === node.id ? 'collapseNode' : 'expandNode',
      ),
      run: () => canvas.onToggleExpanded(node.id),
    },
    {
      id: 'download',
      label: t('toolbar.download'),
      disabled: !mediaUrl,
      run: () => mediaUrl && triggerNodeV4Download(mediaUrl),
    },
    {
      id: 'clone',
      label: t('toolbar.clone'),
      run: () =>
        void canvas.onApplyOp({
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: node.data.kind,
          subtype: node.data.subtype,
          ...(node.data.shotNo === undefined
            ? {}
            : { shotNo: node.data.shotNo }),
        }),
    },
    {
      id: 'tidy',
      label: t('toolbar.tidy'),
      run: () => canvas.onTidyLayout(),
    },
    {
      id: 'delete',
      label: t('toolbar.delete'),
      run: () =>
        void canvas.onApplyOp({
          op: NODE_ASSISTANT_OP_V4_IDS.delete,
          target: node.id,
        }),
    },
  ]

  return (
    <div
      ref={ref}
      role="menu"
      data-node-context-menu={node.id}
      style={{ left: x, top: y }}
      className="nodrag nopan nowheel absolute z-10 min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-menu-action={item.id}
          disabled={item.disabled}
          onClick={() => {
            item.run()
            onClose()
          }}
          className="block w-full rounded-sm px-2 py-1 text-left text-2xs hover:bg-accent disabled:opacity-40"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
