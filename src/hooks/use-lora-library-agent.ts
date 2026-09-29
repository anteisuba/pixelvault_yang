'use client'

/**
 * **助手在「库」页当面搜**的那一小份状态（lora-assistant §13.2）。
 *
 * 两头的消费者不在一棵子树上：写的是 LoRA 装配台的助手宿主（`search_loras` 完成 /
 * `show_lora_picks`），读的是库页（搜索框、网格里那几张卡）。同 `use-studio-operator-store`
 * 的判据走模块 store：LoRA 台是单例，不存在多实例串台。
 *
 * ⚠ 快照必须是稳定引用：只有一个 `state`，改动一律整体替换。
 */

import { useSyncExternalStore } from 'react'

import {
  appendOperatorEntry,
  nextOperatorEntryId,
} from '@/hooks/use-studio-operator-store'

export interface LoraLibraryAgentPick {
  candidateId: string
  name: string
}

export interface LoraLibraryAgentState {
  /** 待库页执行的一次搜索（库页执行完就清掉）。`nonce` 让同一个词也能再搜一次。 */
  request: { nonce: number; query: string; baseModel: string | null } | null
  /** 助手填进搜索框的词 —— 搜索框小标、判断「你改没改」都认它。`null` = 没在当面搜。 */
  query: string | null
  /** 助手设的底模筛选（Civitai 值）；`null` = 不限。 */
  baseModel: string | null
  /** 网格里圈着的那几把（按库页卡片 id）。 */
  picks: readonly LoraLibraryAgentPick[]
}

const EMPTY: LoraLibraryAgentState = {
  request: null,
  query: null,
  baseModel: null,
  picks: [],
}

let state: LoraLibraryAgentState = EMPTY
let nonce = 0
const listeners = new Set<() => void>()

function emit(next: LoraLibraryAgentState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLoraLibraryAgentState(): LoraLibraryAgentState {
  return state
}

export function useLoraLibraryAgent(): LoraLibraryAgentState {
  return useSyncExternalStore(subscribe, getLoraLibraryAgentState, () => EMPTY)
}

/** `search_loras` 完成：让库页照这个词、这个底模搜一次（旧圈一起撤）。 */
export function requestLoraLibrarySearch(input: {
  query: string
  baseModel?: string
}): void {
  nonce += 1
  const baseModel = input.baseModel ?? null
  emit({
    request: { nonce, query: input.query, baseModel },
    query: input.query,
    baseModel,
    picks: [],
  })
}

/** 库页照请求搜过了 —— 只清掉那一次请求，词与圈留着。 */
export function consumeLoraLibrarySearch(requestNonce: number): void {
  if (state.request?.nonce !== requestNonce) return
  emit({ ...state, request: null })
}

/** `show_lora_picks`：圈这几把。 */
export function showLoraLibraryPicks(input: {
  query: string
  picks: readonly LoraLibraryAgentPick[]
}): void {
  emit({ ...state, query: state.query ?? input.query, picks: input.picks })
}

/** `show_lora_picks` 的撤销：只撤圈，词还是助手填的那个。 */
export function clearLoraLibraryPicks(): void {
  if (state.picks.length === 0) return
  emit({ ...state, picks: [] })
}

/** 你改了搜索词或筛选 / 开新对话：结果已不是助手搜的那一组，圈、小标一起撤。 */
export function resetLoraLibraryAgent(): void {
  if (state === EMPTY) return
  emit(EMPTY)
}

/**
 * 你挂上了圈里那一把：那一张撤圈（卡上换成 ✓），线程里落一行交代 ——
 * 助手做的事在助手的线程里留痕（同 `loraMountFailed`）。
 */
export function markLoraLibraryPickMounted(candidateId: string): void {
  const pick = state.picks.find((entry) => entry.candidateId === candidateId)
  if (!pick) return
  emit({
    ...state,
    picks: state.picks.filter((entry) => entry.candidateId !== candidateId),
  })
  appendOperatorEntry({
    kind: 'system',
    id: nextOperatorEntryId('sys'),
    code: 'loraLibraryPickMounted',
    subject: pick.name,
  })
}
