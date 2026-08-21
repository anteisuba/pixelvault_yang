'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { RESEARCH_MODES, type ResearchMode } from '@/constants/research'
import type { NodeAssistantRouteSelection } from '@/components/business/node/CanvasAssistantRouteSelector'

interface StudioAssistantControlsState {
  route: NodeAssistantRouteSelection
  /**
   * 联网检索三态（AI 导演内核 · 切片 1）。
   *
   * ⚠ **不是布尔**。旧的 `researchEnabled: boolean` 只有两个位置，而服务端
   * `resolveResearchMode` 把 `false` 映射成 `auto`（那个布尔表达的是「没主动开」
   * 不是「明确关」）—— 于是用户**根本没有关闭手段**。三态是唯一能表达 `off` 的
   * 形状，这也是服务端 §3.7 第 4 条对 UI 批的硬要求。
   */
  researchMode: ResearchMode
}

const INITIAL_STATE: StudioAssistantControlsState = {
  route: {
    optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  },
  // 默认 `auto`：规划器按意图决定要不要打源（§7 未决 3 执行席代拍）。
  researchMode: RESEARCH_MODES.auto,
}

let state = INITIAL_STATE
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(next: StudioAssistantControlsState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function useStudioAssistantControls() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL_STATE,
  )

  const setRoute = useCallback((route: NodeAssistantRouteSelection) => {
    emit({ ...state, route })
  }, [])
  const setResearchMode = useCallback((researchMode: ResearchMode) => {
    emit({ ...state, researchMode })
  }, [])

  return {
    ...snapshot,
    setRoute,
    setResearchMode,
  }
}
