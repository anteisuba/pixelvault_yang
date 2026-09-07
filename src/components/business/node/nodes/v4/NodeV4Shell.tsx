'use client'

/**
 * v4 节点外壳（node-canvas-v2 §2 两态渲染 · §2.5 视觉脊柱 · §3.2 具名端口）。
 *
 * ── 皮肤 ────────────────────────────────────────────────────────────────
 * 直接写 Tailwind 类，⛔ 不新造 class、⛔ 不引画布私有令牌（那套自建令牌世界随第三期
 * 整体删除）。卡 = `bg-card border rounded-lg shadow-md`，选中 `ring-2 ring-ring`，
 * 失败 `border-destructive`。四族端口色是**唯一**保留的画布专属色，只上端口点与
 * 槽名前的方色标，⛔ 不做面积填充。
 *
 * ── 端口 ────────────────────────────────────────────────────────────────
 * 入口按 `getNodeV4Ports` 逐槽渲染（左，自上而下 = 端口表数组顺序），出口在右
 * （`video.shot` 多一个 `tailFrame`）。拖线时合法入口点亮、非法降到 30% 且
 * `isConnectable={false}` —— 连不上之前就看得见（§3.1 那条注释开的前提）。
 */

import { Handle, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import {
  getNodeV4Ports,
  type NodeSlotId,
  type NodeSlotOutputId,
} from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { renameStableNodeName } from '@/lib/node-display-name'
import { listLiveConnectableSlots } from '@/lib/node-slot-binding'
import { cn } from '@/lib/utils'
import type { NodeV4, NodeV4Data } from '@/types/node-workflow'

import { NodeV4EditableLabel } from './NodeV4EditableLabel'
import { useNodeV4Canvas } from './NodeV4Context'

/**
 * 端口点（脊柱以外唯一的画布专属视觉：四族色）。
 *
 * ⚠ **对比度实测**（`contrast-check`，非文本图形对象门槛 3:1，2026-09-07）：
 * 浅色卡 `#fff` 上 600 档 —— sky 4.10 · emerald 3.77 · amber 3.19 · violet 5.70；
 * 暗色卡 `oklch(20.5% 0 0)`（`#171717`）上 400 档 —— sky 8.37 · emerald 9.33 ·
 * amber 10.74 · violet 6.59。⛔ 原先的 `600/70` 半透明档四色全部落在 2.1–3.4，
 * amber/violet 在其中一档不达标，已整档换掉，不要改回半透明。
 */
const PORT_CLASS =
  '!size-2.5 !border !border-background !bg-muted-foreground data-[family=text]:!bg-sky-600 dark:data-[family=text]:!bg-sky-400 data-[family=image]:!bg-emerald-600 dark:data-[family=image]:!bg-emerald-400 data-[family=audio]:!bg-amber-600 dark:data-[family=audio]:!bg-amber-400 data-[family=video]:!bg-violet-600 dark:data-[family=video]:!bg-violet-400'

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-muted-foreground/50',
  queued: 'bg-muted-foreground',
  running: 'bg-primary',
  ready: 'bg-primary',
  done: 'bg-emerald-600',
  failed: 'bg-destructive',
  stale: 'bg-amber-600',
  disabled: 'bg-muted-foreground/30',
}

export interface NodeV4ShellProps {
  readonly node: NodeV4
  readonly selected?: boolean
  /** 收起态摘要（缩略图 + 状态点）。 */
  readonly collapsedBody: ReactNode
  /** 就地展开的内容（§2.2，不再走 NodeDetailPanel 那张覆盖面板）。 */
  readonly expandedBody?: ReactNode
  /** 左缘的槽格列（`video.shot` 的四槽卡由节点自己给）。 */
  readonly slotRail?: ReactNode
  readonly width: number
  readonly toolbar?: ReactNode
  /**
   * 卡头显示的名字。默认 `data.name`；镜头节点传的是
   * `formatShotDisplayName(label, shotNo)`——序号是**显示前缀**，⛔ 不落库
   * （C1 契约修正 1）。
   */
  readonly title?: string
}

function portFamily(data: NodeV4Data): string {
  return data.kind
}

export function NodeV4Shell({
  node,
  selected,
  collapsedBody,
  expandedBody,
  slotRail,
  width,
  toolbar,
  title,
}: NodeV4ShellProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  const expanded = canvas.expandedNodeId === node.id
  const changed = canvas.changedNodeIds.includes(node.id)

  const source = canvas.draggingFrom
    ? canvas.nodes.find((item) => item.id === canvas.draggingFrom)
    : undefined
  const litSlots: NodeSlotId[] = source
    ? // 传整份 nodes：文本槽的容量按**角色**算，同角色占用要按边回查源节点
      // （`planSlotConnectRole`）。少给它就会把 style 的边也算进 script 的额度。
      listLiveConnectableSlots(source, node, canvas.edges, {
        nodes: canvas.nodes,
      })
    : []
  const dragging = Boolean(source) && source?.id !== node.id

  /**
   * 改名：镜头节点改的是 `label`（序号是显示前缀，⛔ 不落库），其余改 `name`。
   * 重名先在这里判——`renameStableNodeName` 就地拒绝，⛔ 不加后缀。
   */
  const stableNameOf = (data: NodeV4Data): string =>
    data.kind === NODE_MEDIA_KIND_IDS.video
      ? (data.label ?? data.name)
      : data.name

  const renameNode = (next: string): boolean => {
    const isShot = node.data.kind === NODE_MEDIA_KIND_IDS.video
    const current = stableNameOf(node.data)
    const taken = new Set(
      canvas.nodes
        .filter((item) => item.id !== node.id)
        .map((item) => stableNameOf(item.data)),
    )
    const result = renameStableNodeName(current, next, taken)
    if (!result.ok) return false
    // 镜头的 `name` 与 `label` 写同一个值（add_node 里就是这条约定），两条 op
    // 一起发才不会让卡头与 `@` 提及读到两个不同的名字。
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setField,
      target: node.id,
      field: isShot ? 'label' : 'name',
      value: result.name,
    })
    if (isShot) {
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.setField,
        target: node.id,
        field: 'name',
        value: result.name,
      })
    }
    return true
  }

  return (
    <div
      data-node-kind={node.data.kind}
      data-node-subtype={node.data.subtype}
      data-expanded={expanded ? 'true' : 'false'}
      data-changed={changed ? 'true' : 'false'}
      style={{ width }}
      className={cn(
        'relative rounded-lg border bg-card text-card-foreground shadow-md transition-shadow',
        selected && 'ring-2 ring-ring',
        node.data.status === 'failed' && 'border-destructive',
        // §7 变更高亮：2px 描边 + 外发光，不自动消失。
        // ⛔ 不用 Tailwind 任意值（Hard Rule 5）——outline 档位现成够用。
        changed && 'border-primary outline-2 outline-offset-1 outline-primary',
      )}
    >
      {ports?.inputs.map((spec, index) => {
        const lit = litSlots.includes(spec.slot)
        return (
          <Handle
            key={spec.slot}
            id={spec.slot}
            type="target"
            position={Position.Left}
            isConnectable={!dragging || lit}
            data-family={portFamily(node.data)}
            data-slot={spec.slot}
            data-lit={dragging ? (lit ? 'true' : 'false') : 'idle'}
            aria-label={t(`slots.${spec.slot}`)}
            className={cn(
              PORT_CLASS,
              'transition-opacity',
              dragging && !lit && 'opacity-30',
              dragging && lit && 'scale-125 opacity-100',
            )}
            style={{ top: 44 + index * 22 }}
          />
        )
      })}

      {ports?.outputs.map((output: NodeSlotOutputId, index) => (
        <Handle
          key={output}
          id={output}
          type="source"
          position={Position.Right}
          data-family={portFamily(node.data)}
          data-output={output}
          aria-label={t(`outputs.${output}`)}
          className={cn(PORT_CLASS)}
          style={{ top: 44 + index * 22 }}
        />
      ))}

      {/* 卡头 = 状态点 + 可改名的名字 + 展开切换。
          ⚠ 展开切换是**名字右边那块空白**上的按钮，⛔ 不把整条做成 `<button>`：
          名字要能点进编辑，而 `<button>` 里嵌可交互元素既不合法也点不准。 */}
      <div className="flex w-full items-center gap-2 rounded-t-lg border-b px-3 py-2">
        <span
          data-status={node.data.status}
          aria-label={t(`statuses.${node.data.status}`)}
          className={cn(
            'size-2 shrink-0 rounded-full',
            STATUS_DOT[node.data.status] ?? STATUS_DOT.idle,
          )}
        />
        <NodeV4EditableLabel
          value={title ?? node.data.name}
          editValue={stableNameOf(node.data)}
          ariaLabel={t('renameNode')}
          onCommit={(next) => renameNode(next)}
          className="text-xs font-medium"
        />
        {changed ? (
          <span
            className="rounded-full bg-primary px-1.5 text-2xs text-primary-foreground"
            title={t('changedBadge')}
          >
            •
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => canvas.onToggleExpanded(node.id)}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'collapseNode' : 'expandNode')}
          className="ml-auto size-5 shrink-0 rounded-md border text-2xs"
        >
          {expanded ? '−' : '+'}
        </button>
      </div>

      <div className="flex gap-2 p-3">
        {slotRail}
        <div className="min-w-0 flex-1">
          {expanded && expandedBody ? expandedBody : collapsedBody}
        </div>
      </div>

      {expanded && toolbar ? (
        <div className="flex flex-wrap gap-1 border-t px-3 py-2">{toolbar}</div>
      ) : null}
    </div>
  )
}

/** 收起态的媒体缩略 —— `.dark` 只在槽内媒体与灯箱（§2.5）。 */
export function NodeV4Thumbnail({
  url,
  alt,
  kind,
}: {
  url?: string
  alt: string
  kind: NodeV4Data['kind']
}) {
  if (!url) {
    return (
      <div className="dark flex h-24 items-center justify-center rounded-md border border-dashed bg-muted/40 text-2xs text-muted-foreground">
        {alt}
      </div>
    )
  }
  if (kind === NODE_MEDIA_KIND_IDS.video) {
    return (
      <video
        src={url}
        className="dark h-24 w-full rounded-md object-cover"
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return (
    // 画布上的缩略走原始 <img>：ReactFlow 的节点在 transform 里，next/image 的
    // 布局测量在缩放画布下拿不到稳定尺寸。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="dark h-24 w-full rounded-md object-cover"
      draggable={false}
    />
  )
}
