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
  error?: string
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
        totalSampled: action.data.totalSampled,
        isLoading: false,
        hasFetched: true,
        error: null,
      }
    case 'error':
      return {
        outfits: [],
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
 *   - item isn't a Civitai LoRA (no fileHashAutoV3)
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
    // mined data doesn't leak into the next selection. modelId is
    // required server-side; without it there's nothing to query even if
    // a hash exists.
    if (!fileHashAutoV3 || !modelId) {
      dispatch({ type: 'idle' })
      return
    }

    const key = cacheKey(modelId, modelVersionId, fileHashAutoV3)

    // Synchronous cache hit — apply immediately, no loading flash.
    const cached = cache.get(key)
    if (cached?.result) {
      dispatch({ type: 'success', data: cached.result })
      return
    }
    if (cached?.error) {
      dispatch({ type: 'error', message: cached.error })
      return
    }

    dispatch({ type: 'loading', preserveOutfits: true })

    return deferEffectTask(() => {
      // Reuse in-flight promise if another consumer (or a strict-mode
      // double-mount) already started a fetch for the same key.
      const existing = cache.get(key)
      const inflight =
        existing?.promise ??
        mineCivitaiLoraPromptsAPI({
          modelId,
          modelVersionId,
          fileHash: fileHashAutoV3,
        }).then((response) => {
          const entry = cache.get(key)
          if (response.success && response.data) {
            if (entry) entry.result = response.data
            return response.data
          }
          if (entry)
            entry.error = response.error ?? t('minedPromptsUnknownError')
          return null
        })
      if (!existing) cache.set(key, { promise: inflight })

      void inflight.then((result) => {
        if (requestIdRef.current !== requestId) return
        if (result) {
          dispatch({ type: 'success', data: result })
        } else {
          dispatch({
            type: 'error',
            message: cache.get(key)?.error ?? t('minedPromptsFailed'),
          })
        }
      })
    })
  }, [modelId, modelVersionId, fileHashAutoV3, t])

  return state
}
