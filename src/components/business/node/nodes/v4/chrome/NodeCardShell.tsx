'use client'

/**
 * v3 界面的**节点卡骨架**（spec §1.1–1.4，画板 `Main.dc.html` / `ImageQuickLook.dc.html` 的空卡）。
 *
 * ⚠ 这是四类节点卡**唯一**的骨架：「卡头 44 + kind 标 + chevron + 卡内分区栈」
 * 的旧骨架已于 S11 删除。⛔ 不往回兼容旧结构，也⛔ 不重建第二套卡壳。
 *
 * ── 这一层负责的四件事（其余一律是 children）───────────────────────────────
 * ① **名字在卡外上方一行小字**，**双击**改名（spec §2：单击不进编辑，否则选卡时
 *    蹭到名字就掉进输入框）；⋯ 菜单的「改名」走受控入口 `renameRequest`，选中变深；
 * ② **卡面就是内容**：非空卡白面、空卡透明虚线；选中是屏幕 2px 前景色环；
 * ③ **两侧端口点**：卡两侧永远留空给连线（spec §1.4）；S6e 起是**一入一出**，
 *    并由这一层承担拖线中的整卡反馈——合法目标发光、非法目标压暗、落线被拒红环
 *    （spec §1.13）。⛔ 不进各节点组件：四类卡的反馈必须是同一套。
 * ④ **空态插槽**：虚线框与各类卡自己的内容（node-polish-2 改后）。
 *
 * ⛔ 没有卡头、没有 kind 标、没有 chevron、没有卡内分区栈、没有卡底工具栏。
 * 工具条 / 提示词栏 / 版本点是**卡外的浮层**，由调用方摆在 `NodeCardShell` 上下。
 * `expanded` 只是一个标记（换阴影档 + 抬 z）——邻居让位由画布引擎算。
 */

import { useNodeId, useStore } from '@xyflow/react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { cn } from '@/lib/utils'

import { NodeV4EditableLabel } from '../NodeV4EditableLabel'
import { useNodeConnectRole } from './node-connect-state'
import { useNodeCardReject } from './node-card-flash'
import { NodePorts, type NodePortsProps } from './NodePorts'

export interface NodeCardShellProps {
  /** 卡外上方那行小字。 */
  readonly name: string
  /** 进编辑态时填进输入框的值（镜头卡显示串带 `S02·` 前缀，改的是不带前缀的 label）。 */
  readonly editName?: string
  readonly renameAriaLabel: string
  /** 返回 `false` = 被拒（重名/空名），输入框留在编辑态。 */
  /** 不给 = 名字只读（角色卡：名字现读角色库，改了也会被角色库盖回去）。 */
  onRename?(next: string): boolean
  /** 受控改名入口：这个数每变一次就进一次编辑态（⋯ 菜单的「改名」用）。 */
  readonly renameRequest?: number
  readonly selected?: boolean
  /**
   * 变更高亮（spec §7）：上游有新版本、这张卡的产物已经过期。
   * 名字旁一颗细点，⛔ 不改卡面颜色——上百张卡同时染色会把画布读成报警面板。
   */
  readonly changed?: boolean
  /** 展开态标记：只换阴影档并抬 z，让位是引擎的事。 */
  readonly expanded?: boolean
  /**
   * 生成中：卡边交给进度线（加载态 A「边即进度」，owner 2026-09-27）—— 细灰边与
   * 选中环都退掉，由 `NodeFrameProgress` 的浅灰轨道 + 前景色线占住同一处；线走满
   * 合拢后宿主放开，环 / 细灰边在淡出的线底下回来，看不出接缝。
   */
  readonly edgeBusy?: boolean
  /**
   * 压在卡边上的那一层（生成进度）。⚠ 不放进卡面：卡面 `overflow-hidden`，而进度线
   * 压在边外半个线宽上（与选中环同一处），放进去会被裁掉。这一层与卡面同一个盒子、
   * 不裁切，端口点仍在它上面。
   */
  readonly edgeOverlay?: ReactNode
  readonly width?: number
  /** 卡面内容。给了它就不是空态。 */
  readonly children?: ReactNode
  /** 正文仍渲染 children 时显式标记为空态（文本卡）。 */
  readonly empty?: boolean
  /** 媒体空态直接渲染的内容。 */
  readonly emptyContent?: ReactNode
  /** 拖文件进空卡时，虚线变实线并加深底色。 */
  readonly emptyDragging?: boolean
  /** 空态卡的高度（图片 16:9、视频 16:9、文本按行数——由调用方定）。 */
  readonly emptyHeight?: number
  /**
   * **有内容**时的卡面固定高（文本卡的高文本框，spec §2）。给了就由卡面兜住高度、
   * 内容自己在里面滚。⛔ 其余三类卡不给 —— 它们的高由内容（图 / 波形 / 封面）定。
   */
  readonly surfaceHeight?: number
  /** 名字行最左那颗标记（文本卡的「T」字形）。 */
  readonly nameLeading?: ReactNode
  /** 名字行最右那颗（文本卡的归属 / 子型标签图标）。 */
  readonly nameTrailing?: ReactNode
  /**
   * 左右两侧的端口点：默认由 `NodePorts` 渲染（一入一出，spec §1.13）。
   * ⛔ 调用方不要再自己复制一份 `Handle`。
   */
  readonly portSpec?: NodePortsProps
  /** 端口点的完全自定义渲染（给了就覆盖 `portSpec`）。⛔ 卡面上不占位置。 */
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
  renameRequest,
  selected = false,
  changed = false,
  expanded = false,
  edgeBusy = false,
  edgeOverlay,
  width,
  children,
  empty: emptyProp,
  emptyContent,
  emptyDragging = false,
  emptyHeight,
  surfaceHeight,
  nameLeading,
  nameTrailing,
  portSpec,
  ports,
  className,
  surfaceClassName,
}: NodeCardShellProps) {
  const empty = emptyProp ?? (children === undefined || children === null)
  /**
   * ⚠ 从 ReactFlow 拿 id（⛔ 不加一个 `nodeId` prop）：四类卡里有一张正被另一个
   * 会话改着，而拖线反馈必须四类同时生效。卡壳被单测直接渲染时这里是 `null` ——
   * 静止态，什么都不亮。
   */
  const nodeId = useNodeId()
  const zoom = useStore((state) => state.transform[2])
  const connect = useNodeConnectRole(nodeId)
  const rejected = useNodeCardReject(nodeId)
  const cardHeight = empty ? (emptyHeight ?? surfaceHeight) : surfaceHeight

  return (
    <div
      data-node-chrome="card"
      data-selected={selected ? 'true' : 'false'}
      data-changed={changed ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      data-empty={empty ? 'true' : 'false'}
      data-connecting={connect.connecting ? 'true' : 'false'}
      className={cn('relative flex flex-col', expanded && 'z-10', className)}
      style={{
        ...(width === undefined ? {} : { width }),
        paddingTop: `calc((var(--text-base) + var(--spacing) * 1.5) / ${zoom})`,
      }}
    >
      <div data-node-card-name-space className="absolute inset-x-0 top-0">
        <div
          data-node-card-name
          className="flex min-w-0 items-center gap-1 px-0.75 pb-1.5 text-xs leading-4"
          style={{
            width: `${zoom * 100}%`,
            transform: `scale(${1 / zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {nameLeading}
          <AnimatePresence initial={false}>
            <motion.span
              key={name}
              initial={{ opacity: 0.2 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION.fast, ease: EASE_STANDARD }}
              className="min-w-0"
            >
              {onRename ? (
                <NodeV4EditableLabel
                  value={name}
                  {...(editName === undefined ? {} : { editValue: editName })}
                  ariaLabel={renameAriaLabel}
                  onCommit={onRename}
                  activateOn="doubleClick"
                  {...(renameRequest === undefined ? {} : { renameRequest })}
                  className={cn(
                    'min-w-0 truncate transition-colors duration-fast ease-standard',
                    // 选中变深（spec §1.1，走 120）。⛔ 不靠字重变化——字重跳动会让整行宽度抖。
                    // 对比度（`contrast-check`，2026-09-10）：`foreground` 对卡面 19.80；
                    // `muted-foreground`（实测 #696969）对卡面 5.49 / `--muted` 5.04 /
                    // 画布米纸 4.98，三种底都过 4.5。
                    selected ? 'text-foreground' : 'text-muted-foreground',
                  )}
                />
              ) : (
                <span
                  className={cn(
                    'block min-w-0 truncate transition-colors duration-fast ease-standard',
                    selected ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {name}
                </span>
              )}
            </motion.span>
          </AnimatePresence>
          {changed && (
            <span
              data-node-card-changed
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
          {nameTrailing}
        </div>
      </div>
      <div className="relative">
        <motion.div
          data-node-card-surface
          className={cn(
            'rounded-node node-ring-track transition-[box-shadow,border-color,outline-color] duration-fast ease-standard',
            empty
              ? cn(
                  'border-foreground/24',
                  emptyDragging
                    ? 'border-solid bg-surface-fill-hover'
                    : 'border-dashed bg-transparent',
                )
              : 'corner-squircle bg-card',
            !empty &&
              (expanded ? 'shadow-node-card-expanded' : 'shadow-node-card'),
            selected && !edgeBusy && 'node-selected-ring',
            // 拖线中（spec §1.13）：收得下 = 发光，收不下 = 压暗。
            connect.connecting && connect.legal && 'node-card-glow',
            connect.connecting && !connect.legal && 'node-card-dim',
            rejected && 'node-card-reject',
            surfaceClassName,
          )}
          style={{
            outlineWidth: `${2 / zoom}px`,
            ...(empty ? { borderWidth: `${1.5 / zoom}px` } : {}),
            ...(cardHeight === undefined ? {} : { height: cardHeight }),
          }}
          initial={false}
          animate={
            empty
              ? {
                  backgroundColor: emptyDragging
                    ? 'var(--surface-fill-hover)'
                    : 'transparent',
                }
              : undefined
          }
          transition={{ duration: DURATION.fast, ease: EASE_STANDARD }}
        >
          {empty ? (emptyContent ?? children) : children}
        </motion.div>
        {edgeOverlay ? (
          <div
            data-node-card-edge
            className="pointer-events-none absolute inset-0"
          >
            {edgeOverlay}
          </div>
        ) : null}
        {ports ??
          (portSpec && <NodePorts {...portSpec} nodeId={nodeId} zoom={zoom} />)}
      </div>
    </div>
  )
}
