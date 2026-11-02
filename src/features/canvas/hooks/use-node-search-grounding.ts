'use client'

import { useSyncExternalStore } from 'react'

import type { SearchGroundingRailState } from '@/components/business/studio-shared/search-grounding/SearchGroundingRail'
import { mergeSearchGroundingResults } from '@/lib/search-grounding'
import type { SearchGroundingResult } from '@/types'

/**
 * 画布卡的「先搜再画」来源 —— **只在内存里**，按节点 id 记这一次出图交回的来源与
 * 搜索建议（Gemini API 条款：只在出图当下给提交提示词的本人看，⛔ 不缓存）。
 * ⛔ 不进节点数据：节点数据会随项目落库；刷新 / 切到旧版本之后这里自然就没有了。
 * 开关本身（`params.searchGrounding`）才跟卡存。
 */
interface NodeSearchGroundingEntry {
  phase: 'searching' | 'done'
  results: SearchGroundingResult[]
}

const entries = new Map<string, NodeSearchGroundingEntry>()
const snapshots = new Map<string, SearchGroundingRailState | null>()
const listeners = new Set<() => void>()

function emit(nodeId: string) {
  snapshots.delete(nodeId)
  listeners.forEach((listener) => listener())
}

/** 这张卡开始一次开着搜索的出图（之前那一份作废）。 */
export function startNodeSearchGrounding(nodeId: string) {
  entries.set(nodeId, { phase: 'searching', results: [] })
  emit(nodeId)
}

/** 张数 > 1 时每一枪交回一份，最后一起合并。 */
export function addNodeSearchGroundingResult(
  nodeId: string,
  result: SearchGroundingResult,
) {
  const entry = entries.get(nodeId)
  if (!entry) return
  entry.results = [...entry.results, result]
  emit(nodeId)
}

export function finishNodeSearchGrounding(nodeId: string) {
  const entry = entries.get(nodeId)
  if (!entry) return
  entries.set(nodeId, { ...entry, phase: 'done' })
  emit(nodeId)
}

/** 这张卡这一次没开搜索 / 没出图：资料收起。 */
export function clearNodeSearchGrounding(nodeId: string) {
  if (!entries.delete(nodeId)) return
  emit(nodeId)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readSnapshot(nodeId: string): SearchGroundingRailState | null {
  if (snapshots.has(nodeId)) return snapshots.get(nodeId) ?? null
  const entry = entries.get(nodeId)
  const snapshot: SearchGroundingRailState | null = !entry
    ? null
    : entry.phase === 'searching'
      ? { phase: 'searching' }
      : { phase: 'done', view: mergeSearchGroundingResults(entry.results) }
  snapshots.set(nodeId, snapshot)
  return snapshot
}

export function useNodeSearchGrounding(
  nodeId: string,
): SearchGroundingRailState | null {
  return useSyncExternalStore(
    subscribe,
    () => readSnapshot(nodeId),
    () => null,
  )
}
