'use client'

/**
 * v3 界面的**节点卡骨架**（spec §1.1–1.4，画板 `Main.dc.html` / `ImageQuickLook.dc.html` 的空卡）。
 *
 * ⚠ 与 `../NodeV4Shell.tsx` **并存**：那一版是「卡头 44 + kind 标 + chevron +
 * 卡内分区栈」的旧骨架，四个节点组件在 S2–S6 才逐个换过来，全部换完由 **S11 删**。
 * ⛔ 不在这里往回兼容旧结构，也⛔ 不给旧 Shell 留垫片。
 *
 * ── 这一层负责的四件事（其余一律是 children）───────────────────────────────
 * ① **名字在卡外上方一行小字**，双击改名（`NodeV4EditableLabel`），选中变深；
 * ② **卡面就是内容**：不透明卡色 + `rounded-node corner-squircle` + hairline 边；
 *    选中 = 1.5px 前景色环、边转透明（画板 `.ring`：`box-shadow: 0 0 0 1.5px`，
 *    ⛔ 不是 `ring-2`——2px 在缩放的画布上会把卡边读成描边框）；
 * ③ **两侧端口点**：卡两侧永远留空给连线（spec §1.4）；
 * ④ **空态插槽**：虚线框 + 一句提示 + 加号圆钮（spec §1.3；粘贴不做按钮）。
 *
 * ⛔ 没有卡头、没有 kind 标、没有 chevron、没有卡内分区栈、没有卡底工具栏。
 * 工具条 / 提示词栏 / 版本点是**卡外的浮层**，由调用方摆在 `NodeCardShell` 上下。
 * `expanded` 只是一个标记（换阴影档 + 抬 z）——邻居让位由画布引擎算。
 */

import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { NodeV4EditableLabel } from '../NodeV4EditableLabel'

export interface NodeCardShellProps {
  /** 卡外上方那行小字。 */
  readonly name: string
  /** 进编辑态时填进输入框的值（镜头卡显示串带 `S02·` 前缀，改的是不带前缀的 label）。 */
  readonly editName?: string
  readonly renameAriaLabel: string
  /** 返回 `false` = 被拒（重名/空名），输入框留在编辑态。 */
  onRename(next: string): boolean
  readonly selected?: boolean
  /** 展开态标记：只换阴影档并抬 z，让位是引擎的事。 */
  readonly expanded?: boolean
  readonly width?: number
  /** 卡面内容。给了它就不是空态。 */
  readonly children?: ReactNode
  /** 空态：一句提示 + 加号圆钮的点击。⛔ 不做粘贴按钮（⌘V）。 */
  readonly emptyHint?: string
  onEmptyAdd?(): void
  readonly emptyAddAriaLabel?: string
  /** 空态卡的高度（图片 16:9、视频 16:9、文本按行数——由调用方定）。 */
  readonly emptyHeight?: number
  /** 左右两侧的端口点（ReactFlow `Handle`）。⛔ 卡面上不占位置。 */
  readonly ports?: ReactNode
  readonly className?: string
  /** 卡面内层的额外类（如图片卡的 `overflow-hidden`）。 */
  readonly surfaceClassName?: string
}

export function NodeCardShell({
  name,
  editName,
  renameAriaLabel,
  onRename,
  selected = false,
  expanded = false,
  width,
  children,
  emptyHint,
  onEmptyAdd,
  emptyAddAriaLabel,
  emptyHeight,
  ports,
  className,
  surfaceClassName,
}: NodeCardShellProps) {
  const empty = children === undefined || children === null

  return (
    <div
      data-node-chrome="card"
      data-selected={selected ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      data-empty={empty ? 'true' : 'false'}
      className={cn('flex flex-col gap-1.5', expanded && 'z-10', className)}
      style={width === undefined ? undefined : { width }}
    >
      <NodeV4EditableLabel
        value={name}
        {...(editName === undefined ? {} : { editValue: editName })}
        ariaLabel={renameAriaLabel}
        onCommit={onRename}
        className={cn(
          'px-1 text-xs',
          // 选中变深（spec §1.1）。⛔ 不靠字重变化——字重跳动会让整行宽度抖。
          // 对比度（`contrast-check`，2026-09-10）：`foreground` 对卡面 19.80；
          // `muted-foreground`（实测 #696969）对卡面 5.49 / `--muted` 5.04 /
          // 画布米纸 4.98，三种底都过 4.5。
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
      />
      <div className="relative">
        <div
          data-node-card-surface
          className={cn(
            // 卡面不透明（node/CLAUDE.md 禁改第 6 条：画布上可能同时上百张卡）。
            'rounded-node corner-squircle bg-card transition-[box-shadow,border-color,outline-color] duration-fast ease-standard',
            expanded ? 'shadow-node-card-expanded' : 'shadow-node-card',
            // 选中环走 `node-selected-ring`（globals.css 的工具类，`outline`
            // 实现）——卡影已经占了 `box-shadow`，⛔ 不要再拿 shadow 类叠环。
            selected && 'node-selected-ring',
            empty
              ? 'border border-dashed border-border'
              : selected
                ? 'border border-transparent'
                : 'border border-border',
            surfaceClassName,
          )}
          style={
            empty && emptyHeight !== undefined
              ? { height: emptyHeight }
              : undefined
          }
        >
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
              <button
                type="button"
                aria-label={emptyAddAriaLabel ?? emptyHint ?? ''}
                data-node-card-add
                onClick={onEmptyAdd}
                className="nodrag nopan flex size-9 items-center justify-center rounded-full bg-surface-fill text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Plus aria-hidden className="size-4" />
              </button>
              {emptyHint && <p className="text-xs">{emptyHint}</p>}
            </div>
          ) : (
            children
          )}
        </div>
        {ports}
      </div>
    </div>
  )
}
