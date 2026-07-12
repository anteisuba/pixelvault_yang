'use client'

import { useEffect, useReducer, useRef } from 'react'

import { fetchCivitaiModelDescriptionAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'

export interface UseCivitaiModelDescriptionReturn {
  /** 作者 model.description 的纯文本；null = 无 / 未加载 / 拉取失败。 */
  descriptionText: string | null
  isLoading: boolean
}

const EMPTY: UseCivitaiModelDescriptionReturn = {
  descriptionText: null,
  isLoading: false,
}

// 会话级缓存：作者描述小时级稳定，避免重开同一 LoRA 详情面板重复拉取，也去重
// strict-mode 双挂载 / 并发请求。result 存 `string | null`（null = 已确认无描述）。
interface CacheEntry {
  promise: Promise<string | null>
  result?: string | null
}
const cache = new Map<number, CacheEntry>()

/** 测试用缓存清理 —— 在 beforeEach 里调，避免跨 spec 泄漏。 */
export function __resetModelDescriptionCacheForTests(): void {
  cache.clear()
}

type Action =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; descriptionText: string | null }

function reducer(
  state: UseCivitaiModelDescriptionReturn,
  action: Action,
): UseCivitaiModelDescriptionReturn {
  switch (action.type) {
    case 'idle':
      return EMPTY
    case 'loading':
      return { descriptionText: null, isLoading: true }
    case 'success':
      return { descriptionText: action.descriptionText, isLoading: false }
  }
}

/**
 * 方向 A：LoRA 详情面板打开时懒加载作者描述（strip 后纯文本）。对**任何** LoRA
 * 都可拉（不受「有没有配方」限制）。`modelId` 为空 → idle，不发请求。失败 →
 * descriptionText 保持 null（面板据此整块不显示，best-effort，不报错打扰）。
 */
export function useCivitaiModelDescription(
  modelId: number | null | undefined,
): UseCivitaiModelDescriptionReturn {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!modelId) {
      dispatch({ type: 'idle' })
      return
    }

    // 同步缓存命中（含缓存的 null）——立即应用，无 loading 闪烁。
    const cached = cache.get(modelId)
    if (cached && cached.result !== undefined) {
      dispatch({ type: 'success', descriptionText: cached.result })
      return
    }

    dispatch({ type: 'loading' })

    return deferEffectTask(() => {
      const existing = cache.get(modelId)
      const inflight =
        existing?.promise ??
        fetchCivitaiModelDescriptionAPI(modelId).then((response) => {
          const text =
            response.success && response.data
              ? response.data.descriptionText
              : null
          const entry = cache.get(modelId)
          if (entry) entry.result = text
          return text
        })
      if (!existing) cache.set(modelId, { promise: inflight })

      void inflight.then((text) => {
        if (requestIdRef.current !== requestId) return
        dispatch({ type: 'success', descriptionText: text })
      })
    })
  }, [modelId])

  return state
}
