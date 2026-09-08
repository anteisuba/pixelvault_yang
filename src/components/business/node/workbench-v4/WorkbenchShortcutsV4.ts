'use client'

/**
 * v4 workbench 的**画布级快捷键**（第三期 · 画布 C3c-③d-3「写好不接」）。
 *
 * ⛔ 生产调用方为 0 —— 接线在 ③d-4。
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

import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'

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

      // shift+A = 自动排列（星流那套的同一个键位）。
      if (
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === 'a'
      ) {
        if (isTypingTarget(event.target)) return
        event.preventDefault()
        latest.current.onTidyLayout()
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
