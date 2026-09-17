'use client'

/**
 * 画布上**已连的那条线**（S6e，spec §1.13 / 画板 `ConnectLines.dc.html` 方向 A）。
 *
 * ── 与它取代的 `NodeWorkflowStatusEdge` 的差别 ──────────────────────────
 * 旧那条把「骨干 / 成分 / 显现 / 选中 / 未就绪」编码成五档粗细与两种色相（石绿），
 * 于是一张画布上同时有四种线在争解释权。§1.13 把它收成**两档**：平时 1.5px 灰、
 * 悬停或任一端选中时 2px 黑，⛔ 不按家族分色（家族在卡名与缩略上已经看得出来）。
 * 生成中的脉冲留着——那是「正在发生」，不是分类。
 *
 * ── 线中点的槽名胶囊 ────────────────────────────────────────────────────
 * 悬停 / 选中时线中点浮出一颗 22px 胶囊：图边写 首帧 / 尾帧 / 参考，**点开就是改
 * 角色**（作首帧 / 作尾帧 / 作参考）；语音 / 文本 / 视频边只写槽名。改角色走
 * `onApplyBatch([disconnect, connect])` —— 断旧连新是**一步意图**，⛔ 不发两条 op
 * 让用户按两次撤销。尾部 × 断开。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { X } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  playInkSignAnimation,
  playInkUnsignAnimation,
} from '@/hooks/node/node-ingest-dom'
import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { cn } from '@/lib/utils'

import { useNodeV4Canvas } from '../nodes/v4/NodeV4Context'

/** 可在胶囊里互换的三个角色（只对图片源的边有意义）。 */
export const NODE_EDGE_IMAGE_ROLE_SLOTS: readonly NodeSlotId[] = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
  NODE_SLOT_IDS.reference,
]

export interface NodeSlotEdgeData extends Record<string, unknown> {
  /** 这条边落在哪个槽——胶囊上写的就是它。 */
  readonly slot?: NodeSlotId
  /** 两端任一张卡被选中（画布的 `renderEdges` 算好递进来）。 */
  readonly endpointSelected?: boolean
  /** 目标正在生成 —— 脉冲。 */
  readonly running?: boolean
  /** 源是图片卡：胶囊可以点开改角色。 */
  readonly roleChangeable?: boolean
  /** §2.7 墨线签署 / 反向褪去的三个渲染层标记（画布的 `renderEdges` 盖章，⛔ 不落库）。 */
  readonly justSigned?: boolean
  readonly signingFadeOut?: boolean
  readonly unsigning?: boolean
}

export function NodeSlotEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const pathRef = useRef<SVGPathElement | null>(null)

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const edgeData = (data ?? {}) as NodeSlotEdgeData
  const slot = edgeData.slot
  const active =
    hovered || Boolean(selected) || Boolean(edgeData.endpointSelected)

  // 墨线签署：刚连上的那条线画进来一次（`justSigned` 的上升沿）。
  useEffect(() => {
    if (!edgeData.justSigned) return
    playInkSignAnimation(pathRef.current)
  }, [edgeData.justSigned])

  useEffect(() => {
    if (!edgeData.unsigning) return
    playInkUnsignAnimation(pathRef.current)
  }, [edgeData.unsigning])

  // Esc / 点外关掉角色菜单（胶囊本身不是 Radix 触发器：它活在 SVG 覆盖层上）。
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return
      if (menuRef.current?.contains(event.target)) return
      setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menuOpen])

  const disconnect = useCallback(() => {
    canvas.onApplyOp({ op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: id })
  }, [canvas, id])

  /** 改角色 = 断旧 + 连新，**一个**撤销条目。 */
  const changeSlot = useCallback(
    (next: NodeSlotId) => {
      setMenuOpen(false)
      if (next === slot) return
      canvas.onApplyBatch([
        { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: id },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source,
          target,
          slot: next,
        },
      ])
    },
    [canvas, id, slot, source, target],
  )

  return (
    <>
      {/* 宽透明热区：1.5px 的线要好悬停。 */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <path
        ref={pathRef}
        d={path}
        fill="none"
        className={cn(
          'react-flow__edge-path',
          'node-slot-edge',
          edgeData.signingFadeOut && 'node-canvas-edge-signing-fade-out',
          active && 'node-slot-edge--active',
          edgeData.running && 'node-canvas-edge-running',
        )}
      />
      {active && slot ? (
        <EdgeLabelRenderer>
          <div
            ref={menuRef}
            data-node-edge-capsule={id}
            className="nodrag nopan pointer-events-auto absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className="node-edge-capsule">
              {edgeData.roleChangeable ? (
                <button
                  type="button"
                  data-node-edge-role
                  onClick={() => setMenuOpen((open) => !open)}
                  className="rounded-full px-0.5 text-2xs text-foreground"
                >
                  {t(`slots.${slot}`)}
                </button>
              ) : (
                <span className="px-0.5 text-2xs text-foreground">
                  {t(`slots.${slot}`)}
                </span>
              )}
              <button
                type="button"
                aria-label={t('slotDisconnect')}
                data-node-edge-disconnect
                onClick={disconnect}
                className="flex size-3.5 items-center justify-center rounded-full bg-surface-fill text-foreground transition-colors duration-fast hover:bg-surface-fill-hover"
              >
                <X aria-hidden className="size-2.5" />
              </button>
            </div>
            {menuOpen && edgeData.roleChangeable ? (
              <div
                role="menu"
                aria-label={t('edgeRole.menu')}
                className="absolute left-1/2 top-full z-canvas-chrome mt-1.5 flex -translate-x-1/2 flex-col rounded-xl border bg-popover p-1 shadow-node-menu"
              >
                {NODE_EDGE_IMAGE_ROLE_SLOTS.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    role="menuitemradio"
                    aria-checked={candidate === slot}
                    data-node-edge-role-option={candidate}
                    onClick={() => changeSlot(candidate)}
                    className={cn(
                      'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-fast hover:bg-accent',
                      candidate === slot && 'bg-accent',
                    )}
                  >
                    {t(`edgeRole.${candidate}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

/** 源是图片卡时胶囊可点开改角色（首帧 / 尾帧 / 参考）。 */
export function isRoleChangeableEdge(
  sourceKind: string | undefined,
  slot: NodeSlotId | undefined,
): boolean {
  return (
    sourceKind === NODE_MEDIA_KIND_IDS.image &&
    slot !== undefined &&
    NODE_EDGE_IMAGE_ROLE_SLOTS.includes(slot)
  )
}
