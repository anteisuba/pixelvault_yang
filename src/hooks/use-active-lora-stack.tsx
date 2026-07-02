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
import { useAuth } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'

import { getLoraAssetByCodeAPI } from '@/lib/api-client/lora-assets'
import { logger } from '@/lib/logger'
import type { ActiveLora, LoraAssetRecord } from '@/types'

// Storage layout is now per-user:
//   pv.active-lora-stack.v2.<clerkId>  →  { ownerClerkId, items }
// The pre-v2 key `pv.active-lora-stack.v1` was a single global slot — A's
// LoRA picks would render under B on the same browser. We wipe that
// legacy key once on mount and ignore any snapshot whose ownerClerkId
// doesn't match the active session.
const STORAGE_KEY_PREFIX = 'pv.active-lora-stack.v2'
const LEGACY_GLOBAL_STORAGE_KEY = 'pv.active-lora-stack.v1'
const MAX_STACK = 3 // FAL flux-lora supports up to 5; cap UI at 3 for clarity

function getStorageKey(clerkId: string): string {
  return `${STORAGE_KEY_PREFIX}.${clerkId}`
}

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

/**
 * On-disk envelope. The ownerClerkId is required so a snapshot that
 * ends up under the wrong key (browser sync, manual import, dev tools
 * tinkering) is rejected on read instead of being rendered as the
 * current user's stack.
 */
interface StoredEnvelope {
  ownerClerkId: string
  items: StoredEntry[]
}

/**
 * 最近一次"新 LoRA 进入挂载栈"事件（workbench push 或 ?style= 分享链接
 * 解析）。
 *
 * ⚠️ 2026-07-02：原消费方 LoraPromptControlButton 已删除（Image Studio
 * LoRA 清理，见 docs/plans/lora-domain-split-2026-06.md §7），当前没有
 * 组件读取 mountEvent/acknowledgeMountEvent —— 这条一次性反馈通路已是
 * 死状态，只是没删（删 mountEvent 字段需要单独评估，不在本次清理范围内）。
 * Provider 现在只包 /studio/lora（见 studio/lora/layout.tsx），不再跨
 * Image Studio 存活。
 */
export interface LoraMountEvent {
  assetId: string
  assetName: string
  at: number
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
  /** 待消费的挂载事件；无则 null。 */
  mountEvent: LoraMountEvent | null
  /** 消费（清除）当前挂载事件 — 反馈只展示一次。 */
  acknowledgeMountEvent(): void
  /**
   * Build a shareable URL that reproduces this stack in the LoRA workbench.
   * Always points at /<locale>/studio/lora with a `?style=` value encoding
   * code + (non-default) scale per LoRA, in stack order. Returns `null`
   * when the stack is empty.
   */
  getShareUrl(): string | null
}

const ActiveLoraStackContext = createContext<ActiveLoraStackValue | null>(null)

function isValidEntry(entry: unknown): entry is StoredEntry {
  return (
    !!entry &&
    typeof entry === 'object' &&
    'asset' in entry &&
    !!(entry as { asset: unknown }).asset
  )
}

function readFromStorage(clerkId: string): StoredEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getStorageKey(clerkId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    // v2 envelope is the new format — only honor it when ownerClerkId
    // matches. Mismatch means storage was written by a different
    // account (or tampered with).
    if (
      parsed &&
      typeof parsed === 'object' &&
      'ownerClerkId' in parsed &&
      'items' in parsed &&
      Array.isArray((parsed as { items: unknown }).items)
    ) {
      const envelope = parsed as { ownerClerkId: unknown; items: unknown[] }
      if (envelope.ownerClerkId !== clerkId) return []
      return envelope.items.filter(isValidEntry).slice(0, MAX_STACK)
    }
    // Legacy v1 raw arrays. They lived under a global key so we never
    // know who wrote them — discard on first read. The legacy global
    // key gets wiped separately on mount.
    return []
  } catch {
    return []
  }
}

function writeToStorage(items: StoredEntry[], clerkId: string): void {
  if (typeof window === 'undefined') return
  try {
    const envelope: StoredEnvelope = { ownerClerkId: clerkId, items }
    window.localStorage.setItem(
      getStorageKey(clerkId),
      JSON.stringify(envelope),
    )
  } catch {
    // Quota or disabled storage — silently no-op; the stack still
    // works in-memory for the rest of the session.
  }
}

/**
 * One-shot wipe of the pre-v2 global key. Safe to call repeatedly;
 * removeItem on a missing key is a no-op.
 */
function purgeLegacyGlobalStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_GLOBAL_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function LoraStackProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StoredEntry[]>([])
  const [isResolvingFromUrl, setIsResolvingFromUrl] = useState(false)
  const [mountEvent, setMountEvent] = useState<LoraMountEvent | null>(null)
  // Mirror of `items` for event-side dup/capacity checks in callbacks —
  // the setItems updater stays the single source of truth for mutations.
  const itemsRef = useRef<StoredEntry[]>([])
  const hasHydrated = useRef(false)
  const searchParams = useSearchParams()
  // Clerk scopes every read and write. Until isLoaded === true we treat
  // the user as unknown — same parked-state contract as the Node
  // Workflow hook. activeClerkId is null while parked.
  const { isLoaded, userId } = useAuth()
  const activeClerkId: string | null = isLoaded ? userId : null
  const loadedForClerkId = useRef<string | null>(null)

  // One-shot legacy wipe — independent of whoever is signed in.
  useEffect(() => {
    purgeLegacyGlobalStorage()
  }, [])

  // Hydrate from the per-user slot whenever clerkId changes. When
  // parked (null), clear in-memory state so the previous user's stack
  // doesn't render against the new session.
  useEffect(() => {
    hasHydrated.current = false
    if (activeClerkId === null) {
      loadedForClerkId.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([])
      return
    }

    loadedForClerkId.current = activeClerkId

    setItems(readFromStorage(activeClerkId))
    hasHydrated.current = true
  }, [activeClerkId])

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
        // Predict which entries will actually land (dup/capacity) against
        // the latest snapshot so the mount event matches the merge below.
        const currentIds = new Set(
          itemsRef.current.map((entry) => entry.asset.id),
        )
        const capacity = Math.max(0, MAX_STACK - itemsRef.current.length)
        const added = resolved
          .filter((entry) => !currentIds.has(entry.asset.id))
          .slice(0, capacity)
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
        const lastAdded = added[added.length - 1]
        if (lastAdded) {
          setMountEvent({
            assetId: lastAdded.asset.id,
            assetName: lastAdded.asset.name,
            at: Date.now(),
          })
        }
      }
      setIsResolvingFromUrl(false)
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // Persist after hydration — only when we know who owns the snapshot.
  // While parked, mutations stay in memory (won't survive reload, but
  // that's intentional: don't leak unsigned-in edits into anyone's slot).
  useEffect(() => {
    itemsRef.current = items
    if (!hasHydrated.current) return
    if (activeClerkId === null) return
    if (loadedForClerkId.current !== activeClerkId) return
    writeToStorage(items, activeClerkId)
  }, [activeClerkId, items])

  const push = useCallback((asset: LoraAssetRecord, scale?: number) => {
    // willAdd reads the post-render mirror: exact for real interactions
    // (one push per click/tick). Same-tick batched pushes may evaluate
    // against a stale mirror and over-fire the mount event — items
    // themselves stay correct via the updater guards below.
    const current = itemsRef.current
    const willAdd =
      !current.some((entry) => entry.asset.id === asset.id) &&
      current.length < MAX_STACK
    setItems((prev) => {
      if (prev.some((entry) => entry.asset.id === asset.id)) return prev
      if (prev.length >= MAX_STACK) return prev
      return [...prev, { asset, scale }]
    })
    if (willAdd) {
      setMountEvent({
        assetId: asset.id,
        assetName: asset.name,
        at: Date.now(),
      })
    }
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

  const acknowledgeMountEvent = useCallback(() => {
    setMountEvent(null)
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
    // Routes look like `/{locale}/studio/lora`.
    const segments = window.location.pathname.split('/').filter(Boolean)
    const locale = segments[0] ?? 'en'
    return `${window.location.origin}/${locale}/studio/lora?${STYLE_PARAM}=${encodeURIComponent(encoded)}`
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
      mountEvent,
      acknowledgeMountEvent,
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
      mountEvent,
      acknowledgeMountEvent,
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
