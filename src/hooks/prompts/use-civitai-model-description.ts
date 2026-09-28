'use client'

import { useEffect, useReducer, useRef } from 'react'

import type { LoraNsfwFilter } from '@/constants/lora'
import { fetchCivitaiModelDescriptionAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CivitaiLoraLibraryItem } from '@/types'

export interface UseCivitaiModelDescriptionReturn {
  /** 作者 model.description 的纯文本；null = 无 / 未加载 / 拉取失败。 */
  descriptionText: string | null
  isLoading: boolean
}

export interface UseCivitaiModelDetailReturn extends UseCivitaiModelDescriptionReturn {
  /** 能下载的各个版本（新 → 旧），与列表同形；没取到是空数组。 */
  versions: readonly CivitaiLoraLibraryItem[]
}

interface DetailResult {
  descriptionText: string | null
  versions: readonly CivitaiLoraLibraryItem[]
}

const EMPTY_RESULT: DetailResult = { descriptionText: null, versions: [] }

// 会话级缓存：作者描述与版本小时级稳定，避免重开同一 LoRA 详情重复拉取，也去重
// strict-mode 双挂载 / 并发请求。按「模型 + 分级」记（各版本封面随分级限定）。
interface CacheEntry {
  promise: Promise<DetailResult>
  result?: DetailResult
}

const cache = new Map<string, CacheEntry>()

/** 测试用缓存清理 —— 在 beforeEach 里调，避免跨 spec 泄漏。 */
export function __resetModelDescriptionCacheForTests(): void {
  cache.clear()
}

type State = DetailResult & { isLoading: boolean }

type Action =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; result: DetailResult }

const IDLE: State = { ...EMPTY_RESULT, isLoading: false }

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'idle':
      return IDLE
    case 'loading':
      return { ...EMPTY_RESULT, isLoading: true }
    case 'success':
      return { ...action.result, isLoading: false }
  }
}

function useModelDetail(
  modelId: number | null | undefined,
  nsfwFilter: LoraNsfwFilter | undefined,
): State {
  const [state, dispatch] = useReducer(reducer, IDLE)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!modelId) {
      dispatch({ type: 'idle' })
      return
    }

    const key = `${modelId}|${nsfwFilter ?? ''}`
    // 同步缓存命中（含缓存的空结果）——立即应用，无 loading 闪烁。
    const cached = cache.get(key)
    if (cached && cached.result !== undefined) {
      dispatch({ type: 'success', result: cached.result })
      return
    }

    dispatch({ type: 'loading' })

    return deferEffectTask(() => {
      const existing = cache.get(key)
      const inflight =
        existing?.promise ??
        fetchCivitaiModelDescriptionAPI(modelId, nsfwFilter).then(
          (response) => {
            const result: DetailResult =
              response.success && response.data
                ? {
                    descriptionText: response.data.descriptionText,
                    versions: response.data.versions ?? [],
                  }
                : EMPTY_RESULT
            const entry = cache.get(key)
            if (entry) entry.result = result
            return result
          },
        )
      if (!existing) cache.set(key, { promise: inflight })

      void inflight.then((result) => {
        if (requestIdRef.current !== requestId) return
        dispatch({ type: 'success', result })
      })
    })
  }, [modelId, nsfwFilter])

  return state
}

/**
 * 方向 A：LoRA 详情面板打开时懒加载作者描述（strip 后纯文本）。对**任何** LoRA
 * 都可拉（不受「有没有配方」限制）。`modelId` 为空 → idle，不发请求。失败 →
 * descriptionText 保持 null（面板据此整块不显示，best-effort，不报错打扰）。
 */
export function useCivitaiModelDescription(
  modelId: number | null | undefined,
): UseCivitaiModelDescriptionReturn {
  const state = useModelDetail(modelId, undefined)
  return { descriptionText: state.descriptionText, isLoading: state.isLoading }
}

/**
 * 库 B 详情页（lora-library.md §4）：作者描述 + 能下载的各个版本，同一次请求。
 * 各版本的封面按 `nsfwFilter` 限定（与列表同一条天花板）。
 */
export function useCivitaiModelDetail(
  modelId: number | null | undefined,
  nsfwFilter: LoraNsfwFilter,
): UseCivitaiModelDetailReturn {
  return useModelDetail(modelId, nsfwFilter)
}
