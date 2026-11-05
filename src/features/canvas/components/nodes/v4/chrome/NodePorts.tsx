'use client'

/**
 * 卡两侧的**端口点**（spec §1.13，画板 `ConnectLines.dc.html` 方向 A）。
 *
 * ── S6e 把五颗紫点收成一入一出 ──────────────────────────────────────────
 * 之前每张卡按端口表逐槽画一个 `Handle`（镜头卡左侧五颗、四族色），于是「口的
 * 数量和颜色都在抢注意力」，而且拖线要瞄准 10px 的某一颗。现在**每张卡左一入口、
 * 右一出口**：12px 白底黑边圆点，平时藏着（悬停 / 选中 / 画布上正拖线时才显出），
 * 拖线起点那颗变成 18px 黑底「＋」。
 *
 * ⚠ 槽没有消失，只是不再有各自的口：落进哪个槽由**来源 kind** 推
 * （`planV4ConnectDrop`），角色之后在参考轨上改。`tailFrame` 出口不再画——续拍
 * 走工具条；存量里 `sourceHandle = 'tailFrame'` 的边照样从这一个出口画出去。
 *
 * 纯呈现：⛔ 不读槽表、不认识节点。调用方给的 `left` / `right` 只用来回答
 * 「这张卡有没有入口 / 出口」（叶子源没有入口），逐槽的 id 与点亮状态不再读。
 *
 * ── 出口悬停出「+」（§1 第 18 条尾句，LibTV / Flora 做法）─────────────────────
 * 调用方给了 `grow`：鼠标停到出口上，那颗点长成 18px 黑底「+」；**点一下**（不拖）
 * = 在右边长一张空的下游卡并连线。去处只有一个就直接做（视频 → 续拍、音频 → 视频），
 * 两个以上贴着出口弹一张小菜单（图 / 文本 → 图片 · 视频）。拖线照旧从这颗点起手：
 * ReactFlow 的「点一下连线」被这里的 `onClick` 顶掉，拖动不受影响。
 */

import { useState, type CSSProperties, type MouseEvent } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { NODE_PORT_HANDLE_IDS, getNodeV4Ports } from '@/constants/node-slots'
import type {
  NodeV4Subtype,
  NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { useStudioChipPopoverMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { useNodeConnectRole } from './node-connect-state'

export interface NodePortSpec {
  /** 槽名 / 出口名。⚠ S6e 起只用来数「这一侧有没有口」。 */
  readonly id: string
  /** ⚠ 不再逐槽读：一入一出的两个口由 `NodePorts` 自己起名（三语走 `ports.*`）。 */
  readonly ariaLabel?: string
  readonly lit?: boolean
}

export interface NodePortGrowChoice {
  readonly id: string
  readonly label: string
  onSelect(): void
}

/** 出口「+」的去处（调用方按卡的 kind 给，⛔ 这里不认识节点）。空 = 不出「+」。 */
export interface NodePortGrow {
  readonly choices: readonly NodePortGrowChoice[]
  /** 卡还没东西可接（例如续拍要有片子）：「+」不出，只剩拖线的点。 */
  readonly disabled?: boolean
}

export interface NodePortsProps {
  /** 只作 `data-family` 调试标 —— 端口不再按族分色（画板：颜色和数量都在抢注意力）。 */
  readonly kind?: NodeWorkflowMediaKind
  /** 左侧入口槽：非空 = 这张卡收得下东西。 */
  readonly left?: readonly NodePortSpec[]
  /** 右侧出口。 */
  readonly right?: readonly NodePortSpec[]
  /** 保留给调用方的显式覆盖；缺省时读画布的拖线状态。 */
  readonly dragging?: boolean
  /** 这张卡的 id（`NodeCardShell` 从 `useNodeId()` 拿）。 */
  readonly nodeId?: string | null
  /** 端口直径和描边按屏幕 px 固定，调用方传当前画布缩放。 */
  readonly zoom?: number
  /** 出口悬停出「+」，点一下长下游卡。 */
  readonly grow?: NodePortGrow
}

export function NodePorts({
  kind,
  left = [],
  right = [],
  nodeId = null,
  zoom = 1,
  grow,
}: NodePortsProps) {
  const t = useTranslations('StudioNode.v4.ports')
  const { isSource } = useNodeConnectRole(nodeId)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuMotion = useStudioChipPopoverMotion({
    side: 'right',
    align: 'start',
    sideOffset: 12,
  })
  const scale = zoom > 0 ? zoom : 1
  const baseStyle = {
    width: 12 / scale,
    height: 12 / scale,
    borderWidth: 1.5 / scale,
  }
  const growChoices = grow && !grow.disabled ? grow.choices : []
  const canGrow = growChoices.length > 0
  const growLabel =
    growChoices.length === 1
      ? t('growOne', { target: growChoices[0]!.label })
      : t('grow')
  // 「+」那颗的尺寸只写成变量（canvas.css `.node-port--grow`）：行内 width 会压过
  // :hover，点就长不大了。长大后的尺寸与拖线起点那颗同一个（`node-port--hot`）。
  const growStyle = {
    '--node-port-size': `${12 / scale}px`,
    '--node-port-border': `${1.5 / scale}px`,
    '--node-port-grow-size': `${18 / scale}px`,
    '--node-port-grow-border': `${2 / scale}px`,
  } as CSSProperties
  const onGrow = () => {
    if (growChoices.length === 1) growChoices[0]!.onSelect()
    else if (growChoices.length > 1) setMenuOpen(true)
  }

  return (
    <>
      {left.length > 0 && (
        <Handle
          id={NODE_PORT_HANDLE_IDS.input}
          type="target"
          position={Position.Left}
          // 线只从右边的出口起手（画板：出口带「＋」，入口只接）。
          isConnectableStart={false}
          {...(kind ? { 'data-family': kind } : {})}
          data-port="input"
          aria-label={t('input')}
          className="node-port"
          style={baseStyle}
        />
      )}
      {right.length > 0 && (
        <Handle
          id={NODE_PORT_HANDLE_IDS.output}
          type="source"
          position={Position.Right}
          isConnectableEnd={false}
          {...(kind ? { 'data-family': kind } : {})}
          data-port="output"
          data-hot={isSource ? 'true' : 'false'}
          {...(canGrow ? { 'data-grow': 'true', title: growLabel } : {})}
          aria-label={canGrow ? growLabel : t('output')}
          className={cn(
            'node-port',
            isSource && 'node-port--hot',
            canGrow && !isSource && 'node-port--grow',
          )}
          style={
            isSource
              ? {
                  width: 18 / scale,
                  height: 18 / scale,
                  borderWidth: 2 / scale,
                }
              : canGrow
                ? growStyle
                : baseStyle
          }
          {...(canGrow
            ? {
                onClick: (event: MouseEvent) => {
                  event.stopPropagation()
                  onGrow()
                },
              }
            : {})}
        >
          {isSource || canGrow ? (
            <span
              aria-hidden
              data-port-plus
              className="pointer-events-none"
              style={{ fontSize: 13 / scale, lineHeight: `${14 / scale}px` }}
            >
              +
            </span>
          ) : null}
        </Handle>
      )}
      {right.length > 0 && growChoices.length > 1 ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          {/* 菜单的锚点：贴着出口的一个零尺寸点（⛔ 把 Handle 当触发器 —— Radix
              按下就开，会吃掉拖线）。 */}
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none absolute top-1/2 right-0 size-0"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            sideOffset={12}
            data-node-port-grow-menu
            className={cn('min-w-32', menuMotion.className)}
            style={menuMotion.style}
            onClick={(event) => event.stopPropagation()}
          >
            {growChoices.map((choice) => (
              <DropdownMenuItem
                key={choice.id}
                data-grow-choice={choice.id}
                onSelect={() => choice.onSelect()}
              >
                {choice.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}

/**
 * 端口表 → 两侧描述。四类卡都调它，⛔ 不各写一份「这张卡有没有入口」。
 * 叶子源（`image.reference` / `video.clip`）没有入口，于是左侧不画点。
 */
export function portSpecOf(node: {
  readonly data: {
    readonly kind: NodeWorkflowMediaKind
    readonly subtype: NodeV4Subtype
  }
}): NodePortsProps {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  return {
    kind: node.data.kind,
    left: (ports?.inputs ?? []).map((spec) => ({ id: spec.slot })),
    right: (ports?.outputs ?? []).map((output) => ({ id: output })),
  }
}
