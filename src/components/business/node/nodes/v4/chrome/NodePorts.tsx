'use client'

/**
 * 卡两侧的**端口点**（spec §1.4「卡两侧永远留空给连线」）。
 *
 * S0 原先只在 `NodeCardShell` 留了 `ports` 插槽、没给渲染件，于是文本卡与图片卡
 * 各复制了一份 `Handle` + 一份端口色（真机 2026-09-10 抓到：文本那份写死蓝，
 * 四族色只活在旧的 `NodeV4Shell` 里）。这一层把渲染件收上来：**四族色是唯一的
 * 画布专属视觉**，只应该有一份。
 *
 * 纯呈现：左入右出、按数量均分纵向位置、拖拽时点亮/压暗。⛔ 不读槽表、不认识
 * 节点——`getNodeV4Ports` 的结果由调用方翻成 `left` / `right` 两串描述。
 * 文案也由调用方给（chrome 不做 i18n 查表）。
 */

import { Handle, Position } from '@xyflow/react'

import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import { cn } from '@/lib/utils'

/**
 * 端口点四族色（脊柱以外唯一的画布专属视觉）。
 *
 * ⚠ **对比度实测**（`contrast-check`，非文本图形对象门槛 3:1，2026-09-07）：
 * 浅色卡 `#fff` 上 600 档 —— sky 4.10 · emerald 3.77 · amber 3.19 · violet 5.70；
 * 暗色卡 `oklch(20.5% 0 0)`（`#171717`）上 400 档 —— sky 8.37 · emerald 9.33 ·
 * amber 10.74 · violet 6.59。⛔ 原先的 `600/70` 半透明档四色全部落在 2.1–3.4，
 * amber/violet 在其中一档不达标，已整档换掉，不要改回半透明。
 */
export const PORT_CLASS =
  '!size-2.5 !border !border-background !bg-muted-foreground data-[family=text]:!bg-sky-600 dark:data-[family=text]:!bg-sky-400 data-[family=image]:!bg-emerald-600 dark:data-[family=image]:!bg-emerald-400 data-[family=audio]:!bg-amber-600 dark:data-[family=audio]:!bg-amber-400 data-[family=video]:!bg-violet-600 dark:data-[family=video]:!bg-violet-400'

export interface NodePortSpec {
  /** `Handle` 的 id：入口是槽名，出口是出口名。 */
  readonly id: string
  readonly ariaLabel: string
  /** 拖拽中这个入口是否亮着（合法落点）。非拖拽态传 undefined。 */
  readonly lit?: boolean
}

export interface NodePortsProps {
  /** 决定四族色。 */
  readonly kind: NodeWorkflowMediaKind
  /** 左侧入口（`type="target"`）。 */
  readonly left?: readonly NodePortSpec[]
  /** 右侧出口（`type="source"`）。 */
  readonly right?: readonly NodePortSpec[]
  /** 画布上正有一条线在拖：未点亮的入口压暗且不可接。 */
  readonly dragging?: boolean
}

/** 按个数均分纵向位置：1 个居中，2 个 1/3 与 2/3，以此类推。 */
function offsetOf(index: number, total: number): string {
  return `${((index + 1) * 100) / ((total || 1) + 1)}%`
}

export function NodePorts({
  kind,
  left = [],
  right = [],
  dragging = false,
}: NodePortsProps) {
  return (
    <>
      {left.map((spec, index) => (
        <Handle
          key={spec.id}
          id={spec.id}
          type="target"
          position={Position.Left}
          isConnectable={!dragging || Boolean(spec.lit)}
          data-family={kind}
          data-slot={spec.id}
          data-lit={dragging ? (spec.lit ? 'true' : 'false') : 'idle'}
          aria-label={spec.ariaLabel}
          className={cn(
            PORT_CLASS,
            'transition-opacity',
            dragging && !spec.lit && 'opacity-30',
            dragging && spec.lit && 'scale-125 opacity-100',
          )}
          style={{ top: offsetOf(index, left.length) }}
        />
      ))}
      {right.map((spec, index) => (
        <Handle
          key={spec.id}
          id={spec.id}
          type="source"
          position={Position.Right}
          data-family={kind}
          data-output={spec.id}
          aria-label={spec.ariaLabel}
          className={PORT_CLASS}
          style={{ top: offsetOf(index, right.length) }}
        />
      ))}
    </>
  )
}
