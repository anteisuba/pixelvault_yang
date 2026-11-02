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
 *
 * 开合 = 方向 A「从指针处长出来」（node-canvas-v2 §1 第 12 条：开 200 · 关 120 缓入）；
 * 调用方把它包在 `AnimatePresence` 里才播得到关。
 *
 * ⚠ 菜单 **portal 到 body、`fixed` 定位**：留在卡里会被 React Flow 的 NodeToolbar
 * 浮层（选中卡下方的提示词输入框）盖住——那一层是 viewport 级 portal，卡内 z-index
 * 再高也压不过它。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useIsPresent, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { NODE_V4_CONTEXT_MENU } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { requestCanvasRerunDownstream } from '@/lib/canvas-rerun-request'
import { collectDownstream } from '@/lib/node-downstream'
import type { NodeV4 } from '@/types/node-workflow'

import { FADE_ONLY, GROW_FROM_POINTER } from './chrome/chrome-motion'
import { useNodeV4Canvas } from './NodeV4Context'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

/** 调用方自带的一行（图片卡：与 ⋯ 同一份，`useImageMoreActions`）。 */
export interface NodeV4ContextMenuItem {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly danger?: boolean
  /** 该项之前起一组（渲染成一条分组线）。 */
  readonly startsGroup?: boolean
  run(): void
}

export interface NodeV4ContextMenuProps {
  readonly node: NodeV4
  /** 视口坐标落点（右键事件的 clientX/Y）。 */
  readonly x: number
  readonly y: number
  readonly mediaUrl?: string
  /**
   * 只留「整理排布 · 删除」（角色卡：展开 / 下载 / 克隆空节点 / 重跑下游对她都没意义，
   * 克隆还会复制出一张没绑角色的空卡）。
   */
  readonly layoutOnly?: boolean
  /**
   * 整份换掉内置列表。图片卡传它，让右键与 ⋯ 是**同一份**（owner 2026-10-15）；
   * 其余卡不传，照旧用下面那份。
   */
  readonly items?: readonly NodeV4ContextMenuItem[]
  onClose(): void
}

export function NodeV4ContextMenu({
  node,
  x,
  y,
  mediaUrl,
  layoutOnly = false,
  items: customItems,
  onClose,
}: NodeV4ContextMenuProps) {
  const t = useTranslations('StudioNode.v4')
  const tRerun = useTranslations('StudioNode.rerunDownstream')
  const canvas = useNodeV4Canvas()
  const ref = useRef<HTMLDivElement>(null)
  const present = useIsPresent()
  const motionSet = useReducedMotion() ? FADE_ONLY : GROW_FROM_POINTER
  /** 贴着视口边时往回收，别让菜单出屏。 */
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    setPos({
      left: Math.max(
        margin,
        Math.min(x, window.innerWidth - el.offsetWidth - margin),
      ),
      top: Math.max(
        margin,
        Math.min(y, window.innerHeight - el.offsetHeight - margin),
      ),
    })
  }, [x, y])
  /**
   * 「重跑下游」露不露脸（第三期）。
   *
   * ⚠ 一个下游都没有就**不渲染**（⛔ 不画停用态，`ui-defaults.md` 状态配方）：
   * 画布上大半节点是叶子，给每一个都摆一颗点了什么都不会发生的按钮，菜单立刻
   * 变成噪音。
   * ⚠ 现算而不是 memo：菜单只在打开的那一帧渲染一次，而 memo 的依赖数组反而会
   *   在边表变化时给出一份过期的答案。
   */
  const hasDownstream = collectDownstream(node.id, canvas.edges).length > 0

  // Esc 关闭 + 点外部关闭。⚠ 用 capture：ReactFlow 在冒泡阶段吃掉画布上的点击。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    // 菜单钉在视口上，画布一滚/缩放卡就走了——跟着关掉。
    const onWheel = (event: WheelEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('wheel', onWheel, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('wheel', onWheel, true)
    }
  }, [onClose])

  const items: NodeV4ContextMenuItem[] = [
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
    /**
     * **重跑下游**（第三期，owner 2026-09-07 定）。
     *
     * ⭐ 它**不直接生成**：投一张便条给助手 dock，由助手先出一份只读名单
     * （`plan_rerun_downstream`），用户看过再决定。⛔ 不从这里开一条绕过助手与
     * 钱闸的重跑路径 —— 那正是这条入口最容易长歪的方向。
     */
    ...(hasDownstream
      ? [
          {
            id: 'rerunDownstream',
            startsGroup: true,
            label: tRerun('menu'),
            run: () => requestCanvasRerunDownstream(node.id),
          },
        ]
      : []),
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
  const shown =
    customItems ??
    (layoutOnly
      ? items.filter((item) => item.id === 'tidy' || item.id === 'delete')
      : items)

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      data-node-context-menu={node.id}
      style={{
        left: pos.left,
        top: pos.top,
        width: NODE_V4_CONTEXT_MENU.width,
        transformOrigin: '0 0',
      }}
      initial={motionSet.initial}
      animate={motionSet.animate}
      exit={motionSet.exit}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      className={cn(
        'nodrag nopan nowheel fixed z-canvas-transient rounded-xl border p-1.5 text-popover-foreground corner-squircle surface-glass shadow-node-menu',
        !present && 'pointer-events-none',
      )}
    >
      {shown.map((item) => (
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
              'flex min-h-7.5 w-full items-center rounded-lg px-2.5 text-left text-2sm tracking-node-body transition-colors duration-fast ease-standard disabled:opacity-40',
              item.danger
                ? 'text-destructive hover:bg-destructive hover:text-primary-foreground'
                : 'hover:bg-primary hover:text-primary-foreground',
            )}
          >
            {item.label}
          </button>
        </div>
      ))}
    </motion.div>,
    document.body,
  )
}
