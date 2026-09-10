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
 */

import { Handle, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { NODE_PORT_HANDLE_IDS, getNodeV4Ports } from '@/constants/node-slots'
import type {
  NodeV4Subtype,
  NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { cn } from '@/lib/utils'

import { useNodeConnectRole } from './node-connect-state'

export interface NodePortSpec {
  /** 槽名 / 出口名。⚠ S6e 起只用来数「这一侧有没有口」。 */
  readonly id: string
  /** ⚠ 不再逐槽读：一入一出的两个口由 `NodePorts` 自己起名（三语走 `ports.*`）。 */
  readonly ariaLabel?: string
  readonly lit?: boolean
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
}

export function NodePorts({
  kind,
  left = [],
  right = [],
  nodeId = null,
}: NodePortsProps) {
  const t = useTranslations('StudioNode.v4.ports')
  const { isSource } = useNodeConnectRole(nodeId)

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
          aria-label={t('output')}
          className={cn('node-port', isSource && 'node-port--hot')}
        />
      )}
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
