'use client'

/**
 * 墨线签署 / 解绑反放的**渲染期记账**（canvas-relationship-v3 §2.7）。
 *
 * ③d-4 从 `StudioNodeWorkbench` 整段搬来。记账本身与节点形状无关 —— 它只按
 * `source::target` 与 `edge.id` 走，所以 v3→v4 翻转对它一个字都没改；搬家只是把
 * 「两个 Map + 两个调度器 + 卸载清 timer」这一坨从 5000 行的宿主里拿出来，让 v4
 * workbench 用一行 hook 接上。
 *
 * ⚠ `signedEdgePairs` 按 `source::target` 键（**不是** edge.id）—— connect 那一刻
 * 调用方拿不到库里现铸的 id，而落槽闸先拒掉了重复对，所以这个键唯一。
 * ⚠ `fadingEdges` 是刚被删、还在反向褪去的边**快照**：边已经不在图上了，装饰性
 * 回声要靠这份快照才画得出来。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { NODE_EDGE_SIGNING_MOTION } from '@/constants/motion'
import { edgePairKey } from '@/lib/node-edge-tier'

/** 一条正在签署的边处在哪一拍。 */
export type EdgeSigningPhase = 'drawing' | 'fading'

/** 反向褪去时还要画一遍的边 —— 只需要两端和 id，⛔ 不要求整条边的形状。 */
export interface FadingEdgeSnapshot {
  readonly id: string
  readonly source: string
  readonly target: string
}

export interface EdgeSigning {
  /** `source::target` → 这一拍。 */
  readonly signedEdgePairs: ReadonlyMap<string, EdgeSigningPhase>
  /** edge.id → 刚被删的那条边的快照。 */
  readonly fadingEdges: ReadonlyMap<string, FadingEdgeSnapshot>
  /** 刚连上一条边：画入 → 淡出 → 销账。 */
  scheduleEdgeSigning(sourceId: string, targetId: string): void
  /** 刚删掉一条边：反向褪去 → 销账。 */
  scheduleEdgeUnsign(edge: FadingEdgeSnapshot): void
}

export function useEdgeSigning(): EdgeSigning {
  const [signedEdgePairs, setSignedEdgePairs] = useState<
    Map<string, EdgeSigningPhase>
  >(new Map())
  const [fadingEdges, setFadingEdges] = useState<
    Map<string, FadingEdgeSnapshot>
  >(new Map())

  /**
   * 每个调度器各跟一份自己的待触发 timer —— 动画跑到一半卸载时，既不能漏掉
   * timer，也不能让它在组件没了之后再 setState。
   */
  const signingTimeoutsRef = useRef<
    Map<string, { drawTimeout: number; holdTimeout: number }>
  >(new Map())
  const fadingTimeoutsRef = useRef<Map<string, number>>(new Map())

  const scheduleEdgeSigning = useCallback(
    (sourceId: string, targetId: string) => {
      const pairKey = edgePairKey(sourceId, targetId)
      const existing = signingTimeoutsRef.current.get(pairKey)
      if (existing) {
        window.clearTimeout(existing.drawTimeout)
        window.clearTimeout(existing.holdTimeout)
      }

      setSignedEdgePairs((prev) => {
        const next = new Map(prev)
        next.set(pairKey, 'drawing')
        return next
      })
      const drawTimeout = window.setTimeout(() => {
        setSignedEdgePairs((prev) => {
          if (!prev.has(pairKey)) return prev
          const next = new Map(prev)
          next.set(pairKey, 'fading')
          return next
        })
      }, NODE_EDGE_SIGNING_MOTION.inkDrawMs)
      const holdTimeout = window.setTimeout(() => {
        signingTimeoutsRef.current.delete(pairKey)
        setSignedEdgePairs((prev) => {
          if (!prev.has(pairKey)) return prev
          const next = new Map(prev)
          next.delete(pairKey)
          return next
        })
      }, NODE_EDGE_SIGNING_MOTION.inkDrawMs + NODE_EDGE_SIGNING_MOTION.inkHoldFadeMs)
      signingTimeoutsRef.current.set(pairKey, { drawTimeout, holdTimeout })
    },
    [],
  )

  const scheduleEdgeUnsign = useCallback((edge: FadingEdgeSnapshot) => {
    const existingTimeout = fadingTimeoutsRef.current.get(edge.id)
    if (existingTimeout !== undefined) window.clearTimeout(existingTimeout)

    setFadingEdges((prev) => {
      const next = new Map(prev)
      next.set(edge.id, edge)
      return next
    })
    const timeoutId = window.setTimeout(() => {
      fadingTimeoutsRef.current.delete(edge.id)
      setFadingEdges((prev) => {
        if (!prev.has(edge.id)) return prev
        const next = new Map(prev)
        next.delete(edge.id)
        return next
      })
    }, NODE_EDGE_SIGNING_MOTION.unsignFadeMs)
    fadingTimeoutsRef.current.set(edge.id, timeoutId)
  }, [])

  // 卸载时丢掉所有待触发的 timer —— 它们闭包着的 setter 否则会在组件（乃至整条
  // 画布路由）没了之后才开火。
  useEffect(() => {
    const signingTimeouts = signingTimeoutsRef.current
    const fadingTimeouts = fadingTimeoutsRef.current
    return () => {
      for (const timers of signingTimeouts.values()) {
        window.clearTimeout(timers.drawTimeout)
        window.clearTimeout(timers.holdTimeout)
      }
      for (const timeoutId of fadingTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return {
    signedEdgePairs,
    fadingEdges,
    scheduleEdgeSigning,
    scheduleEdgeUnsign,
  }
}
