'use client'

/**
 * 节点上的**右键菜单**（legacy 在节点上根本没有——只有画布空白处的 `CanvasAddMenu`）。
 *
 * 存在理由：展开态的动作住在卡里，收起态只有一条浮动工具条，而「删除 / 克隆 /
 * 下载 / 归到某镜 / 整理」在收起态也要够得着。⚠ 菜单**只是已有动作的第二个入口**，
 * ⛔ 不在这里长出独有动作——两个入口做的事一旦分叉，用户就得记住哪个能做什么。
 *
 * ── 形态（HIG 定稿 2026-09-08）────────────────────────────────────────────
 * 224px 宽、圆角 14 连续圆角、5px 内距、行 30px、组间一条线；材质与工具条同一种
 * （`surface-glass` + vibrancy，⛔ 不用实色浮层）。hover **整行反白**成
 * `--primary`（全站唯一强调色的合法用法之一 = 当前选中态），危险行反白成红。
 */

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_V4_CONTEXT_MENU } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

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
    /** 该项之前起一组（渲染成一条分组线）。 */
    startsGroup?: boolean
    danger?: boolean
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
      startsGroup: true,
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
      startsGroup: true,
      danger: true,
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
      style={{ left: x, top: y, width: NODE_V4_CONTEXT_MENU.width }}
      className="nodrag nopan nowheel absolute z-10 rounded-xl border p-1.5 text-popover-foreground corner-squircle surface-glass shadow-node-menu"
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.startsGroup ? (
            <span aria-hidden className="mx-1.5 my-1 block h-px bg-border" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            data-menu-action={item.id}
            disabled={item.disabled}
            onClick={() => {
              item.run()
              onClose()
            }}
            className={cn(
              'flex min-h-7.5 w-full items-center rounded-lg px-2.5 text-left text-2sm tracking-node-body transition-colors duration-(--duration-fast) ease-standard disabled:opacity-40',
              item.danger
                ? 'text-destructive hover:bg-destructive hover:text-primary-foreground'
                : 'hover:bg-primary hover:text-primary-foreground',
            )}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
