'use client'

import { useEffect, useReducer, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { mineCivitaiLoraPromptsAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CivitaiMinedPromptsResult } from '@/types'

/**
 * Minimal input shape — anything carrying the Civitai identifiers can
 * trigger a mine. CivitaiLoraLibraryItem satisfies this; so does any
 * LoraAssetRecord pulled from the active-LoRA stack after a Civitai push
 * (those carry these as optional fields).
 */
export interface MinedPromptsInputItem {
  modelId?: number
  modelVersionId?: number
  fileHashAutoV3?: string | null
}

export interface UseCivitaiMinedPromptsReturn {
  outfits: CivitaiMinedPromptsResult['outfits']
  /**
   * 逐图配方（图片 URL + 完整生成参数，M1 数据层）。旧缓存/旧响应可能
   * 没有该字段 — 恒为数组，缺失时为空。
   */
  recipes: NonNullable<CivitaiMinedPromptsResult['recipes']>
  /**
   * 无配方兜底纯预览图（作者示例图无 prompt 元数据）。恒为数组，仅在
   * recipes 为空且服务端有兜底图时非空。
   */
  previewImages: NonNullable<CivitaiMinedPromptsResult['previewImages']>
  /**
   * 无配方兜底（方案 B）：作者 model.description 的纯文本，供用户自读+复制。
   * null = 无（有配方 / 描述为空 / 拉取失败）。
   */
  descriptionText: string | null
  totalSampled: number
  isLoading: boolean
  /**
   * True only when we have nothing to show AND we are still waiting on
   * the very first fetch. After any result (even an empty one) returns
   * this is false — callers should render whatever's available and use
   * `isLoading` to decide between "fetching first time" and "idle".
   */
  hasFetched: boolean
  error: string | null
}

const EMPTY: UseCivitaiMinedPromptsReturn = {
  outfits: [],
  recipes: [],
  previewImages: [],
  descriptionText: null,
  totalSampled: 0,
  isLoading: false,
  hasFetched: false,
  error: null,
}

// Module-level cache keyed by (modelId, versionId, fileHash). Mined
// prompts barely change hour-to-hour, so a per-session cache avoids
// re-firing the request when the user re-selects the same LoRA. Also
// dedupes in-flight requests so React strict-mode double-mounts don't
// double-fetch.
interface CacheEntry {
  promise: Promise<CivitaiMinedPromptsResult | null>
  result?: CivitaiMinedPromptsResult
  /**
   * 取失败了。`message` 为 `null` = 服务端没给理由 —— 翻译成哪句话由调用方按
   * 自己的语境定（⛔ 别在缓存里存一句译文：助手宿主那条路没有 `useTranslations`）。
   */
  error?: { message: string | null }
}
const cache = new Map<string, CacheEntry>()

function cacheKey(
  modelId: number,
  versionId: number | undefined,
  fileHash: string,
): string {
  return `${modelId}|${versionId ?? ''}|${fileHash}`
}

/**
 * **唯一的取数通道**：发一次、写进模块缓存、把在飞的那个 promise 交出去复用。
 *
 * ⭐ hook 与助手宿主（`use-lora-operator-host`）走的是这一个函数，所以同一把 LoRA
 * 在装配台上被看过之后，助手再取就是缓存命中 —— ⛔ 不许谁再写第二条 fetch。
 */
function startMinedPromptsFetch(
  key: string,
  params: { modelId: number; modelVersionId: number; fileHash?: string },
): Promise<CivitaiMinedPromptsResult | null> {
  const existing = cache.get(key)
  if (existing) return existing.promise
  const promise = mineCivitaiLoraPromptsAPI(params).then((response) => {
    const entry = cache.get(key)
    if (response.success && response.data) {
      if (entry) entry.result = response.data
      return response.data
    }
    if (entry) entry.error = { message: response.error ?? null }
    return null
  })
  cache.set(key, { promise })
  return promise
}

/** 缓存里那份的 key —— `null` = 这条挂载没有 Civitai provenance，取不了。 */
function resolveKey(item: MinedPromptsInputItem | null): string | null {
  if (!item?.modelId || !item.modelVersionId) return null
  return cacheKey(item.modelId, item.modelVersionId, item.fileHashAutoV3 ?? '')
}

/**
 * 缓存里**已经有**的那份（同步读，⛔ 不发请求）。
 *
 * ⚠ `null` 有三个意思：没有 provenance / 还没取 / 取失败。三者对调用方是同一件事
 * ——「这一刻手上没有来源图配方」，⛔ 别在这里把它们摊成三种返回值：助手那边对
 * 三者的处置一模一样（如实落回家族骨架）。
 */
export function readCachedMinedPrompts(
  item: MinedPromptsInputItem | null,
): CivitaiMinedPromptsResult | null {
  const key = resolveKey(item)
  return (key && cache.get(key)?.result) || null
}

/**
 * 没取过就取一次（取过 / 在飞 / 没 provenance 都是空转）。
 *
 * ⚠ **交出去就不管**：调用方要的是「下次同步读得到」，不是这一次的结果。
 */
export function primeMinedPrompts(item: MinedPromptsInputItem | null): void {
  const key = resolveKey(item)
  if (!key || cache.has(key) || !item?.modelId || !item.modelVersionId) return
  void startMinedPromptsFetch(key, {
    modelId: item.modelId,
    modelVersionId: item.modelVersionId,
    fileHash: item.fileHashAutoV3 ?? undefined,
  })
}

/**
 * Test-only cache reset. Call from `beforeEach` so the module-level cache
 * does not leak across specs.
 */
export function __resetMinedPromptsCacheForTests(): void {
  cache.clear()
}

// useReducer state — single source of truth so effect's setState calls
// don't chain into "cascading effect renders" the way naive setState
// pairs in useEffect do (the React 19 lint rule). The reducer collapses
// the (loading, error, data) transitions into a single dispatch.
type Action =
  | { type: 'idle' }
  | { type: 'loading'; preserveOutfits?: boolean }
  | { type: 'success'; data: CivitaiMinedPromptsResult }
  | { type: 'error'; message: string }

function reducer(
  state: UseCivitaiMinedPromptsReturn,
  action: Action,
): UseCivitaiMinedPromptsReturn {
  switch (action.type) {
    case 'idle':
      return EMPTY
    case 'loading':
      return action.preserveOutfits
        ? { ...state, isLoading: true, error: null }
        : { ...EMPTY, isLoading: true }
    case 'success':
      return {
        outfits: action.data.outfits,
        recipes: action.data.recipes ?? [],
        previewImages: action.data.previewImages ?? [],
        descriptionText: action.data.descriptionText ?? null,
        totalSampled: action.data.totalSampled,
        isLoading: false,
        hasFetched: true,
        error: null,
      }
    case 'error':
      return {
        outfits: [],
        recipes: [],
        previewImages: [],
        descriptionText: null,
        totalSampled: 0,
        isLoading: false,
        hasFetched: true,
        error: action.message,
      }
  }
}

/**
 * Fetch user-mined activation prompts for a Civitai LoRA when the user
 * selects it in the inspector. Skips entirely when:
 *   - item is null
 *   - item is missing modelId or modelVersionId
 *
 * fileHashAutoV3 is NOT required — meilisearch search-hit LoRAs never carry
 * a file hash (Civitai's search index doesn't expose files[].hashes), but
 * the mined-prompts endpoint only needs modelId+modelVersionId to locate
 * the version's source-image recipes; the hash (when present) is only used
 * server-side to attribute a matched image's real per-LoRA weight;
 * search-hit LoRAs carry no file hash at all.
 *
 * Stale-while-revalidate friendly: a previous result keeps rendering
 * while a new selection is loading (`isLoading: true`, outfits kept).
 */
export function useCivitaiMinedPrompts(
  item: MinedPromptsInputItem | null,
): UseCivitaiMinedPromptsReturn {
  const t = useTranslations('LoraWorkbench')
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const requestIdRef = useRef(0)

  // Effect depends on **primitive** identifiers, not the item object,
  // because callers commonly construct the input as an inline `{...}`
  // literal — a new reference every render. Depending on `[item]` made
  // the effect re-run forever → dispatch → re-render → repeat, tripping
  // React's "Maximum update depth exceeded" guard.
  const modelId = item?.modelId
  const fileHashAutoV3 = item?.fileHashAutoV3
  const modelVersionId = item?.modelVersionId

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    // No Civitai identifiers → idle. Reset to EMPTY so a previous LoRA's
    // mined data doesn't leak into the next selection. modelId + modelVersionId
    // are both required server-side to locate a version's source images;
    // fileHashAutoV3 is optional (search-hit LoRAs never carry one — Issue A).
    if (!modelId || !modelVersionId) {
      dispatch({ type: 'idle' })
      return
    }

    const key = cacheKey(modelId, modelVersionId, fileHashAutoV3 ?? '')

    // Synchronous cache hit — apply immediately, no loading flash.
    const cached = cache.get(key)
    if (cached?.result) {
      dispatch({ type: 'success', data: cached.result })
      return
    }
    if (cached?.error) {
      dispatch({
        type: 'error',
        message: cached.error.message ?? t('minedPromptsUnknownError'),
      })
      return
    }

    dispatch({ type: 'loading', preserveOutfits: true })

    return deferEffectTask(() => {
      // Reuse in-flight promise if another consumer (or a strict-mode
      // double-mount) already started a fetch for the same key.
      const inflight = startMinedPromptsFetch(key, {
        modelId,
        modelVersionId,
        fileHash: fileHashAutoV3 ?? undefined,
      })

      void inflight.then((result) => {
        if (requestIdRef.current !== requestId) return
        if (result) {
          dispatch({ type: 'success', data: result })
        } else {
          dispatch({
            type: 'error',
            message: cache.get(key)?.error?.message ?? t('minedPromptsFailed'),
          })
        }
      })
    })
  }, [modelId, modelVersionId, fileHashAutoV3, t])

  return state
}
