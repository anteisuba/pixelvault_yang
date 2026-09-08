'use client'

/**
 * 「把画布上的节点拖进左栏名册卡」（阶段 8-b）的 **v4 版**。
 *
 * ③d-4 从 `StudioNodeWorkbench` 搬来。命中检测、跟手替身、悬停高亮三段一字未改
 * ——它们只跟 DOM 打交道。变的是**落法**：
 *   · v3 里图片要写进卡的 `referenceAssets` 数组、音色要连一条无名边，两种落法；
 *   · v4 里两种都是**连一条具名边**（图 → `reference` 槽，音色 → `voice` 槽），
 *     合法性 / 重复 / 容量三道闸全在 `graph.connect` 背后那张端口表里，
 *     ⛔ 这里一个字都不重判。
 *
 * ⭐ 为什么这条手势可以做、而「吞噬」那条被退役了（同样是「拖节点到某处 = 做点
 * 什么」）：吞噬劫持的是**落在画布上**的拖拽终点，而「节点拖到哪都是合法稳态」
 * ——那个终点本来就有意义（摆位置）。这里的终点是**左栏面板**：今天把节点拖到
 * 面板底下就是被挡住看不见，那个位置本来没有任何意义，给它赋予语义偷不走任何
 * 现有手势。⚠ 所以命中检测**必须只认面板里的卡**。
 */

import { useCallback, useEffect, useRef } from 'react'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeV4 } from '@/types/node-workflow'

/** 名册卡的 DOM 标记 —— 由 `CanvasRosterRail` 打在每张卡外层，值是卡节点 id。 */
const ROSTER_CARD_ATTR = 'data-roster-card-id'
/** 悬停高亮的类（纯视觉，⛔ 不进 React state —— 每帧 setState 会重渲整棵画布）。 */
const ROSTER_CARD_HOVER_CLASS = 'canvas-roster-card-hover'
const ROSTER_GHOST_SIZE_PX = 72

function findRosterCardAt(
  clientX: number,
  clientY: number,
): HTMLElement | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof HTMLElement)) continue
    const hit = element.closest<HTMLElement>(`[${ROSTER_CARD_ATTR}]`)
    if (hit) return hit
  }
  return null
}

/**
 * 拖拽替身。
 *
 * ⚠ **必须是 portal 到 body 的替身，不能把被拖的节点提上来**：节点住在
 * `.react-flow__viewport` 里，那个元素带 `transform` —— 它是一个独立层叠上下文，
 * 里面的任何 z-index 都翻不出去，而左栏面板在它外面。所以只要落点在面板上，被拖
 * 的图**必然被面板盖住**（owner 2026-08-10 实拍「图片在下层」就是这个）。
 * ⚠ 用命令式 DOM 而不是 React state：拖拽每帧都要挪它。
 */
function createRosterDragGhost(url: string | undefined): HTMLElement {
  const ghost = document.createElement('div')
  ghost.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${ROSTER_GHOST_SIZE_PX}px`,
    `height:${ROSTER_GHOST_SIZE_PX}px`,
    'border-radius:12px',
    'overflow:hidden',
    'pointer-events:none',
    'opacity:0.92',
    'box-shadow:var(--shadow-node-panel)',
    'z-index:var(--z-index-canvas-drag)',
  ].join(';')
  if (url) {
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
    ghost.appendChild(img)
  } else {
    // 没有封面的音色 —— 给一块中性面而不是一个破图框（音色本来就不一定有脸）。
    ghost.style.background = 'var(--node-panel-inner)'
  }
  document.body.appendChild(ghost)
  return ghost
}

function moveRosterDragGhost(
  ghost: HTMLElement | null,
  clientX: number,
  clientY: number,
): void {
  if (!ghost) return
  const half = ROSTER_GHOST_SIZE_PX / 2
  ghost.style.transform = `translate(${clientX - half}px, ${clientY - half}px)`
}

interface RosterDropIntent {
  /** 落进卡的哪个具名槽。 */
  readonly slot: NodeSlotId
  /** 替身的脸。音色可以没有。 */
  readonly previewUrl?: string
}

/**
 * 这个节点能不能被拖进名册卡 —— 能就说清它落进**哪个槽**。
 *
 * ⚠ 视频不在其中：卡上没有「视觉身份 = 一段视频」这回事。
 * ⚠ 文本也不在：文本连卡走的是画布上的端口拖拽，不是这条面板手势。
 */
function resolveRosterDropIntent(node: NodeV4): RosterDropIntent | undefined {
  if (node.data.kind === NODE_MEDIA_KIND_IDS.image) {
    const url = node.data.url
    if (!url) return undefined
    return { slot: NODE_SLOT_IDS.reference, previewUrl: url }
  }
  if (node.data.kind === NODE_MEDIA_KIND_IDS.audio) {
    return {
      slot: NODE_SLOT_IDS.voice,
      ...(node.data.url ? { previewUrl: node.data.url } : {}),
    }
  }
  return undefined
}

export interface WorkbenchRosterDropV4 {
  onNodeDragStart(node: NodeV4): void
  onNodeDrag(node: NodeV4, clientX: number, clientY: number): void
  /** `true` = 这一拖被名册卡吃掉了（本体已弹回起点，调用方不要再提交坐标）。 */
  onNodeDragStop(node: NodeV4, clientX: number, clientY: number): boolean
}

export function useWorkbenchRosterDropV4(
  graph: NodeGraphV4,
): WorkbenchRosterDropV4 {
  /** 拖拽起点 —— 落进卡之后本体要弹回来，所以起点先记下。 */
  const dragStartRef = useRef(new Map<string, { x: number; y: number }>())
  const hoverElRef = useRef<HTMLElement | null>(null)
  const ghostElRef = useRef<HTMLElement | null>(null)

  // 回调只注册一次，而 `graph` 每次图变都是新对象 —— 从 ref 读，⛔ 不进依赖数组。
  const latest = useRef(graph)
  useEffect(() => {
    latest.current = graph
  }, [graph])

  const onNodeDragStart = useCallback((node: NodeV4) => {
    const intent = resolveRosterDropIntent(node)
    if (!intent) return
    dragStartRef.current.set(node.id, {
      x: node.position.x,
      y: node.position.y,
    })
    ghostElRef.current?.remove()
    ghostElRef.current = createRosterDragGhost(intent.previewUrl)
  }, [])

  const onNodeDrag = useCallback(
    (node: NodeV4, clientX: number, clientY: number) => {
      if (!resolveRosterDropIntent(node)) return
      moveRosterDragGhost(ghostElRef.current, clientX, clientY)
      const hit = findRosterCardAt(clientX, clientY)
      if (hit === hoverElRef.current) return
      hoverElRef.current?.classList.remove(ROSTER_CARD_HOVER_CLASS)
      hit?.classList.add(ROSTER_CARD_HOVER_CLASS)
      hoverElRef.current = hit
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (node: NodeV4, clientX: number, clientY: number): boolean => {
      ghostElRef.current?.remove()
      ghostElRef.current = null
      // 拖拽结束，悬停高亮无论如何都要摘掉 —— 一个留在原地的高亮框比没有更糟。
      hoverElRef.current?.classList.remove(ROSTER_CARD_HOVER_CLASS)
      hoverElRef.current = null

      const origin = dragStartRef.current.get(node.id)
      dragStartRef.current.delete(node.id)

      const intent = resolveRosterDropIntent(node)
      if (!intent) return false
      const cardEl = findRosterCardAt(clientX, clientY)
      const cardId = cardEl?.getAttribute(ROSTER_CARD_ATTR)
      if (!cardEl || !cardId) return false

      // 落法只有一条：连一条具名边。三道闸（类型 / 重复 / 容量）都在端口表背后。
      latest.current.connect(node.id, cardId, intent.slot)

      /**
       * 本体**同步**弹回拖拽起点。
       *
       * ⚠ ⛔ 不用 WAAPI 飞行：owner 2026-08-10 实拍「图片和线分离」—— 卡片元素带着
       * `fill:forwards` 的 transform 飞回起点，而 ReactFlow 的 wrapper（handle 与
       * 边的锚点）还留在落点，位置提交又在动画 `finally` 里做。这一路上只要有一次
       * 重渲把被动画的元素换掉，`finished` 就再也不 settle。同步提交没有中间态。
       */
      if (origin) latest.current.moveNodes([{ id: node.id, position: origin }])
      return true
    },
    [],
  )

  return { onNodeDragStart, onNodeDrag, onNodeDragStop }
}
