'use client'

/**
 * v4 workbench 的**画布级快捷键**（第三期 · 画布）。全画布**唯一**一份。
 *
 * ── 只有一处绑键 ────────────────────────────────────────────────────────
 * `NodeV4Provider` 里那份同名的监听在收到 `graph` prop 时**自己关掉**（见该文件
 * 的 `if (graph) return`）。⛔ 两处同时绑 = 一次 ⌘Z 撤两步。
 *
 * ── ⌘+Enter 在这里才接得上 ──────────────────────────────────────────────
 * 生成要的是 `useNodeMediaGenerationV4().generateNode(nodeId, graph)`，而那需要
 * **整张图**——`NodeV4Provider` 拿得到图但拿不到生成 hook（它是画布层的东西）。
 * 所以键位在 Provider 里占位、在这里落地，Provider 那侧诚实弹一句「还没接」。
 *
 * ⛔ 不绑删除键：ReactFlow 的 `deleteKeyCode` 已经接着，两处各绑一次会删两遍。
 */

import { useEffect, useRef } from 'react'

import {
  NODE_ALIGN_EDGE_IDS,
  NODE_DISTRIBUTE_AXIS_IDS,
  alignNodes,
  distributeNodes,
  type AlignBox,
  type NodeAlignEdge,
  type NodeDistributeAxis,
} from '@/lib/node-align'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'

/**
 * 这次按键落在哪个字母上。
 *
 * ⚠ 先看 `event.code`：macOS 上 alt 会把字母键的 `key` 变成 `å`/`∂`/`∑`/`ß`，
 * 只按 `key` 判，alt 那一组永远不命中。`key` 是**兜底**（合成事件常常只给 key）。
 */
function pressedLetter(event: KeyboardEvent): string {
  if (event.code.startsWith('Key')) return event.code.slice(3).toLowerCase()
  return event.key.length === 1 ? event.key.toLowerCase() : ''
}

/** alt + a/d/w/s = 左/右/上/下对齐（8e-3 从星流抄来的键位）。 */
const ALIGN_EDGE_BY_LETTER: Record<string, NodeAlignEdge> = {
  a: NODE_ALIGN_EDGE_IDS.left,
  d: NODE_ALIGN_EDGE_IDS.right,
  w: NODE_ALIGN_EDGE_IDS.top,
  s: NODE_ALIGN_EDGE_IDS.bottom,
}

/** shift + h/v = 横/纵等距。 */
const DISTRIBUTE_AXIS_BY_LETTER: Record<string, NodeDistributeAxis> = {
  h: NODE_DISTRIBUTE_AXIS_IDS.horizontal,
  v: NODE_DISTRIBUTE_AXIS_IDS.vertical,
}

/**
 * 选中的卡 → 对齐用的盒子。宽高取 ReactFlow 量到的那份（`measured`）——量不到时
 * 传 0，右/下对齐就退化成按左/上对齐，⛔ 不硬造一个默认卡宽。
 */
function selectedAlignBoxes(graph: NodeGraphV4): AlignBox[] {
  const selected = new Set(graph.selectedNodeIds)
  return graph.rfNodes
    .filter((node) => selected.has(node.id))
    .map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    }))
}

/** 事件靶子正在输入框里 —— 一律不接管（⌘Z 在 textarea 里是「撤销我刚敲的字」）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ) !== null
  )
}

export interface WorkbenchShortcutsV4Options {
  readonly graph: NodeGraphV4
  /** ⌘+Enter：对当前选中的节点跑生成。 */
  onGenerateSelected(nodeIds: readonly string[]): void
  /** shift+A：按镜头带整理排布。 */
  onTidyLayout(): void
  /**
   * Esc 链的**上一层**（重浮层 / 添加菜单 / 审阅模式）。返回 `true` = 这一次
   * 按键已经被上层消化，本 hook 不再取消选中。
   *
   * ⚠ 一次按键只退一层是 §4.2 定的：不给上层这个否决权，用户按一次 Esc 会同时
   * 关掉菜单**并**取消选中。
   */
  onEscape?(): boolean
  /** `false` = 整份快捷键停用（重浮层开着时）。 */
  readonly enabled?: boolean
}

export function useWorkbenchShortcutsV4({
  graph,
  onGenerateSelected,
  onTidyLayout,
  onEscape,
  enabled = true,
}: WorkbenchShortcutsV4Options): void {
  /**
   * 回调从 ref 读：监听器只注册一次，而 `graph` 每次图变都是新对象 —— 直接进
   * 依赖数组会让 window 监听器每敲一个字重装一次。
   */
  const latest = useRef({ graph, onGenerateSelected, onTidyLayout, onEscape })
  useEffect(() => {
    latest.current = { graph, onGenerateSelected, onTidyLayout, onEscape }
  }, [graph, onGenerateSelected, onTidyLayout, onEscape])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const { graph: g, onGenerateSelected: generate } = latest.current
      if (event.isComposing) return

      if (event.key === 'Escape') {
        if (isTypingTarget(event.target)) return
        if (latest.current.onEscape?.()) return
        g.clearSelection()
        return
      }

      // alt + a/d/w/s = 对齐。⚠ 排在 shift 那条**前面**：alt 组合里没有 shift，
      // 两条互不重叠，但顺序写死能省掉「以后谁加了 alt+shift 谁负责」这种口头约定。
      if (event.altKey && !event.metaKey && !event.ctrlKey) {
        const edge = ALIGN_EDGE_BY_LETTER[pressedLetter(event)]
        if (!edge) return
        if (isTypingTarget(event.target)) return
        event.preventDefault()
        const moves = alignNodes(selectedAlignBoxes(g), edge)
        if (moves.length > 0) g.moveNodes(moves)
        return
      }

      if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
        const letter = pressedLetter(event)
        // shift+A = 自动排列（星流那套的同一个键位）。
        if (letter === 'a') {
          if (isTypingTarget(event.target)) return
          event.preventDefault()
          latest.current.onTidyLayout()
          return
        }
        // shift + h/v = 等距。
        const axis = DISTRIBUTE_AXIS_BY_LETTER[letter]
        if (!axis) return
        if (isTypingTarget(event.target)) return
        event.preventDefault()
        const moves = distributeNodes(selectedAlignBoxes(g), axis)
        if (moves.length > 0) g.moveNodes(moves)
        return
      }

      if (!(event.metaKey || event.ctrlKey)) return
      if (isTypingTarget(event.target)) return

      if (event.key === 'Enter') {
        event.preventDefault()
        generate(g.selectedNodeIds)
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'c') {
        if (g.copySelection()) event.preventDefault()
        return
      }
      if (key === 'v') {
        if (g.pasteClipboard()) event.preventDefault()
        return
      }
      if (key === 'd') {
        // ⌘D = 复制一份同类空节点（右键「克隆空节点」的键位版）。
        if (g.selectedNodeIds.length === 0) return
        event.preventDefault()
        g.duplicate(g.selectedNodeIds)
        return
      }
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) g.redo()
        else g.undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
