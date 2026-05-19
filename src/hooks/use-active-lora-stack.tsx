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

const STYLE_PARAM = 'style'

interface ParsedStyleToken {
  code: string
  scale?: number
}

/**
 * Parse the `?style=` query into an ordered list of LoRA codes + optional
 * scale overrides. Accepts:
 *   ?style=code              — single code, default scale
 *   ?style=code:0.8          — single code, explicit scale
 *   ?style=a,b               — comma-separated multi (order preserved)
 *   ?style=a:0.8,b:1.2       — multi with per-LoRA scale
 *   ?style=a&style=b         — repeated query is also a valid multi form
 *
 * Invalid scales (NaN, negative) are dropped silently — the LoRA still
 * loads at its asset default. We do not throw on malformed input because
 * style links are user-shareable and need to degrade gracefully.
 */
export function parseStyleParams(
  styleValues: readonly string[],
): ParsedStyleToken[] {
  const out: ParsedStyleToken[] = []
  for (const raw of styleValues) {
    for (const token of raw.split(',')) {
      const trimmed = token.trim()
      if (!trimmed) continue
      const [code, scaleStr] = trimmed.split(':')
      if (!code) continue
      const parsedScale = scaleStr != null ? Number(scaleStr) : NaN
      const validScale =
        Number.isFinite(parsedScale) && parsedScale >= 0
          ? parsedScale
          : undefined
      out.push(
        validScale !== undefined ? { code, scale: validScale } : { code },
      )
    }
  }
  return out
}

/**
 * Serialize stack entries into a single `?style=` query value. Order
 * matches stack order. Omits the `:scale` suffix when the entry uses
 * its asset's default scale, keeping the URL terse for the common case.
 */
export function serializeStackForUrl(
  items: readonly { asset: LoraAssetRecord; scale?: number }[],
): string {
  return items
    .map((entry) => {
      const scale = entry.scale
      if (scale == null || scale === entry.asset.defaultScale) {
        return entry.asset.styleCode
      }
      return `${entry.asset.styleCode}:${roundScale(scale)}`
    })
    .join(',')
}

function roundScale(n: number): string {
  // Strip trailing zeros for compact URLs: 1.0 → "1", 0.8 → "0.8"
  return Number(n.toFixed(2)).toString()
}

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
  /**
   * Build a shareable URL that reproduces this stack on the canvas.
   * Always points at /<locale>/studio/image with a `?style=` value
   * encoding code + (non-default) scale per LoRA, in stack order.
   * Returns `null` when the stack is empty.
   */
  getShareUrl(): string | null
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

  // Resolve `?style=` tokens → fetch + push. Accepts the legacy
  // single-code form, comma-separated multi, and `code:scale` per-token
  // overrides. Resolution order matches URL order, so a shared link
  // reproduces the sender's stack layering.
  useEffect(() => {
    const tokens = parseStyleParams(searchParams.getAll(STYLE_PARAM))
    if (tokens.length === 0) return

    let cancelled = false
    void (async () => {
      setIsResolvingFromUrl(true)
      const resolved: StoredEntry[] = []
      for (const { code, scale } of tokens) {
        const result = await getLoraAssetByCodeAPI(code)
        if (result.success && result.data) {
          resolved.push(
            scale !== undefined
              ? { asset: result.data, scale }
              : { asset: result.data },
          )
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

  const getShareUrl = useCallback((): string | null => {
    if (items.length === 0) return null
    if (typeof window === 'undefined') return null
    const encoded = serializeStackForUrl(items)
    if (!encoded) return null
    // Extract the locale prefix from the current path so the share link
    // lands the recipient on the same language they're already using.
    // Routes look like `/{locale}/studio/image` or `/{locale}/studio/lora`.
    const segments = window.location.pathname.split('/').filter(Boolean)
    const locale = segments[0] ?? 'en'
    return `${window.location.origin}/${locale}/studio/image?${STYLE_PARAM}=${encodeURIComponent(encoded)}`
  }, [items])

  const value = useMemo<ActiveLoraStackValue>(
    () => ({
      items,
      toActiveLoras,
      push,
      setScale,
      remove,
      clear,
      isResolvingFromUrl,
      getShareUrl,
    }),
    [
      items,
      toActiveLoras,
      push,
      setScale,
      remove,
      clear,
      isResolvingFromUrl,
      getShareUrl,
    ],
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
