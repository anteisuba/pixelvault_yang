'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'

import { getLoraAssetByCodeAPI } from '@/lib/api-client/lora-assets'
import { logger } from '@/lib/logger'
import type { ActiveLora, LoraAssetRecord } from '@/types'

const STORAGE_KEY = 'pv.active-lora-stack.v1'
const MAX_STACK = 3 // FAL flux-lora supports up to 5; cap UI at 3 for clarity

interface StoredEntry {
  asset: LoraAssetRecord
  scale?: number
}

interface ActiveLoraStackValue {
  items: StoredEntry[]
  /** Plain shape for snapshots / URL persistence */
  toActiveLoras(): ActiveLora[]
  push(asset: LoraAssetRecord, scale?: number): void
  setScale(assetId: string, scale: number): void
  remove(assetId: string): void
  clear(): void
  /** True while resolving a `?style=` query param on mount */
  isResolvingFromUrl: boolean
}

const ActiveLoraStackContext = createContext<ActiveLoraStackValue | null>(null)

function readFromStorage(): StoredEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (entry): entry is StoredEntry =>
          !!entry &&
          typeof entry === 'object' &&
          'asset' in entry &&
          !!(entry as { asset: unknown }).asset,
      )
      .slice(0, MAX_STACK)
  } catch {
    return []
  }
}

function writeToStorage(items: StoredEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Quota or disabled storage — silently no-op; the stack still
    // works in-memory for the rest of the session.
  }
}

export function LoraStackProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StoredEntry[]>([])
  const [isResolvingFromUrl, setIsResolvingFromUrl] = useState(false)
  const hasHydrated = useRef(false)
  const searchParams = useSearchParams()

  // SSR-safe localStorage hydration — lazy useState init returns [] on the
  // server, so we have to read storage from a mount effect on the client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(readFromStorage())
    hasHydrated.current = true
  }, [])

  // Resolve `?style=<code>` (one or many) → fetch + push. setState calls
  // live inside the async IIFE so the lint rule (which only flags
  // synchronous setState in the effect body) doesn't trip.
  useEffect(() => {
    const codes = searchParams.getAll('style').filter((c) => c.length > 0)
    if (codes.length === 0) return

    let cancelled = false
    void (async () => {
      setIsResolvingFromUrl(true)
      const resolved: StoredEntry[] = []
      for (const code of codes) {
        const result = await getLoraAssetByCodeAPI(code)
        if (result.success && result.data) {
          resolved.push({ asset: result.data })
        } else {
          logger.warn('Failed to resolve ?style= code', {
            code,
            error: result.error,
          })
        }
      }
      if (cancelled) return
      if (resolved.length > 0) {
        setItems((prev) => {
          const seen = new Set(prev.map((entry) => entry.asset.id))
          const merged = [...prev]
          for (const entry of resolved) {
            if (!seen.has(entry.asset.id) && merged.length < MAX_STACK) {
              merged.push(entry)
              seen.add(entry.asset.id)
            }
          }
          return merged
        })
      }
      setIsResolvingFromUrl(false)
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // Persist after hydration
  useEffect(() => {
    if (!hasHydrated.current) return
    writeToStorage(items)
  }, [items])

  const push = useCallback((asset: LoraAssetRecord, scale?: number) => {
    setItems((prev) => {
      if (prev.some((entry) => entry.asset.id === asset.id)) return prev
      if (prev.length >= MAX_STACK) return prev
      return [...prev, { asset, scale }]
    })
  }, [])

  const setScale = useCallback((assetId: string, scale: number) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.asset.id === assetId ? { ...entry, scale } : entry,
      ),
    )
  }, [])

  const remove = useCallback((assetId: string) => {
    setItems((prev) => prev.filter((entry) => entry.asset.id !== assetId))
  }, [])

  const clear = useCallback(() => {
    setItems([])
  }, [])

  const toActiveLoras = useCallback(
    (): ActiveLora[] =>
      items.map((entry) => ({
        assetId: entry.asset.id,
        styleCode: entry.asset.styleCode,
        scale: entry.scale ?? entry.asset.defaultScale,
      })),
    [items],
  )

  const value = useMemo<ActiveLoraStackValue>(
    () => ({
      items,
      toActiveLoras,
      push,
      setScale,
      remove,
      clear,
      isResolvingFromUrl,
    }),
    [items, toActiveLoras, push, setScale, remove, clear, isResolvingFromUrl],
  )

  return (
    <ActiveLoraStackContext.Provider value={value}>
      {children}
    </ActiveLoraStackContext.Provider>
  )
}

export function useActiveLoraStack(): ActiveLoraStackValue {
  const ctx = useContext(ActiveLoraStackContext)
  if (!ctx) {
    throw new Error(
      'useActiveLoraStack must be used inside a <LoraStackProvider>',
    )
  }
  return ctx
}

export const LORA_STACK_MAX = MAX_STACK
