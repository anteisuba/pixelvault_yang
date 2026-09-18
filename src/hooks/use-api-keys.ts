'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type {
  UserApiKeyRecord,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  ApiKeyHealthStatus,
} from '@/types'
import {
  listApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  verifyApiKey,
} from '@/lib/api-client'
import { deferToIdle } from '@/lib/defer-to-idle'

// ─── Health Cache (localStorage, 5-min TTL) ───────────────────────

const HEALTH_CACHE_KEY = 'pixelvault:api-key-health'
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface HealthCacheEntry {
  status: ApiKeyHealthStatus
  ts: number
}

function loadHealthCache(): Record<string, ApiKeyHealthStatus> {
  try {
    const raw = localStorage.getItem(HEALTH_CACHE_KEY)
    if (!raw) return {}
    const entries = JSON.parse(raw) as Record<string, HealthCacheEntry>
    const now = Date.now()
    const result: Record<string, ApiKeyHealthStatus> = {}
    for (const [id, entry] of Object.entries(entries)) {
      if (now - entry.ts < HEALTH_CACHE_TTL_MS) {
        result[id] = entry.status
      }
    }
    return result
  } catch {
    return {}
  }
}

function saveHealthCache(map: Record<string, ApiKeyHealthStatus>) {
  try {
    const entries: Record<string, HealthCacheEntry> = {}
    const now = Date.now()
    // Merge with existing cache (keep non-expired entries for other keys)
    const existing = localStorage.getItem(HEALTH_CACHE_KEY)
    if (existing) {
      const parsed = JSON.parse(existing) as Record<string, HealthCacheEntry>
      for (const [id, entry] of Object.entries(parsed)) {
        if (now - entry.ts < HEALTH_CACHE_TTL_MS) {
          entries[id] = entry
        }
      }
    }
    // Overwrite with new values
    for (const [id, status] of Object.entries(map)) {
      entries[id] = { status, ts: now }
    }
    localStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage unavailable — silently skip
  }
}

// ─── Verified-at Stamps (localStorage, no TTL) ────────────────────
//
// ⚠ 与上面那份健康缓存**分开存**：健康缓存 5 分钟过期（过期即当作未知，该重查），
// 而「上次校验是什么时候」过了 5 分钟仍然是真话——/settings 的 key 行要拿它写
// 「健康 · 3 分钟前」。塞回上面那份会被 `saveHealthCache` 的过期裁剪一起扔掉。

const VERIFIED_AT_KEY = 'pixelvault:api-key-verified-at'

function loadVerifiedAtMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VERIFIED_AT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, number>
    const result: Record<string, number> = {}
    for (const [id, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && Number.isFinite(ts)) result[id] = ts
    }
    return result
  } catch {
    return {}
  }
}

function saveVerifiedAtMap(map: Record<string, number>) {
  try {
    localStorage.setItem(VERIFIED_AT_KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable — the row just loses its "上次校验" stamp.
  }
}

/**
 * ⚠ 走 `useSyncExternalStore` 而不是「`useState` 初值里读 localStorage」：后者
 * 在服务端渲染出的是空表、客户端首帧是真表 —— 那正是 hydration mismatch。
 * 服务端快照恒为同一个空对象（引用稳定，⛔ 别每次新建 `{}`，会无限重渲染）。
 */
const EMPTY_VERIFIED_AT: Record<string, number> = {}
let verifiedAtCache: Record<string, number> | null = null
const verifiedAtListeners = new Set<() => void>()

function subscribeVerifiedAt(onStoreChange: () => void): () => void {
  verifiedAtListeners.add(onStoreChange)
  return () => {
    verifiedAtListeners.delete(onStoreChange)
  }
}

function getVerifiedAtSnapshot(): Record<string, number> {
  verifiedAtCache ??= loadVerifiedAtMap()
  return verifiedAtCache
}

function getVerifiedAtServerSnapshot(): Record<string, number> {
  return EMPTY_VERIFIED_AT
}

function writeVerifiedAt(
  updater: (prev: Record<string, number>) => Record<string, number>,
): void {
  verifiedAtCache = updater(getVerifiedAtSnapshot())
  saveVerifiedAtMap(verifiedAtCache)
  for (const listener of verifiedAtListeners) listener()
}

// ─── API Key List Cache (per user, in-memory) ─────────────────────

const API_KEYS_CACHE_TTL_MS = 60_000
interface ApiKeysSnapshot {
  userId: string
  keys: UserApiKeyRecord[]
  healthMap: Record<string, ApiKeyHealthStatus>
  fetchedAt: number
}

let apiKeysCache: ApiKeysSnapshot | null = null
let apiKeysRequest: {
  userId: string
  request: Promise<ApiKeysSnapshot>
} | null = null

function getFreshApiKeysSnapshot(userId: string): ApiKeysSnapshot | null {
  if (!apiKeysCache || apiKeysCache.userId !== userId) return null
  if (Date.now() - apiKeysCache.fetchedAt >= API_KEYS_CACHE_TTL_MS) return null
  return apiKeysCache
}

function updateCachedApiKeys(
  userId: string,
  updater: (keys: UserApiKeyRecord[]) => UserApiKeyRecord[],
) {
  if (!apiKeysCache || apiKeysCache.userId !== userId) return
  apiKeysCache = {
    ...apiKeysCache,
    keys: updater(apiKeysCache.keys),
    fetchedAt: Date.now(),
  }
}

function updateCachedHealthMap(
  userId: string,
  updater: (
    healthMap: Record<string, ApiKeyHealthStatus>,
  ) => Record<string, ApiKeyHealthStatus>,
) {
  if (!apiKeysCache || apiKeysCache.userId !== userId) return
  apiKeysCache = {
    ...apiKeysCache,
    healthMap: updater(apiKeysCache.healthMap),
    fetchedAt: Date.now(),
  }
}

async function loadApiKeysSnapshot(
  userId: string,
  force: boolean,
  loadFailedMessage: string,
): Promise<ApiKeysSnapshot> {
  if (!force) {
    const cached = getFreshApiKeysSnapshot(userId)
    if (cached) return cached
    if (apiKeysRequest?.userId === userId) return apiKeysRequest.request
  }

  const request = listApiKeys()
    .then((response) => {
      if (!response.success || !response.data) {
        throw new Error(response.error ?? loadFailedMessage)
      }

      const cached = loadHealthCache()
      const healthMap: Record<string, ApiKeyHealthStatus> = {}
      for (const key of response.data.filter((record) => record.isActive)) {
        healthMap[key.id] = cached[key.id] ?? 'unknown'
      }

      const snapshot: ApiKeysSnapshot = {
        userId,
        keys: response.data,
        healthMap,
        fetchedAt: Date.now(),
      }
      apiKeysCache = snapshot
      return snapshot
    })
    .finally(() => {
      if (apiKeysRequest?.request === request) {
        apiKeysRequest = null
      }
    })

  apiKeysRequest = { userId, request }
  return request
}

// ─── Hook ─────────────────────────────────────────────────────────

export interface UseApiKeysReturn {
  keys: UserApiKeyRecord[]
  isLoading: boolean
  error: string | null
  healthMap: Record<string, ApiKeyHealthStatus>
  /** key id → 上次校验的时间戳（ms）。没校验过的 key 不在表里。 */
  verifiedAtMap: Record<string, number>
  create: (data: CreateApiKeyRequest) => Promise<boolean>
  update: (id: string, data: UpdateApiKeyRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  verify: (id: string) => Promise<ApiKeyHealthStatus>
  refresh: () => Promise<void>
}

interface UseApiKeysOptions {
  autoLoad?: boolean
}

export function useApiKeys({
  autoLoad = true,
}: UseApiKeysOptions = {}): UseApiKeysReturn {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const cachedSnapshot = userId ? getFreshApiKeysSnapshot(userId) : null
  const [keys, setKeys] = useState<UserApiKeyRecord[]>(
    () => cachedSnapshot?.keys ?? [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthMap, setHealthMap] = useState<
    Record<string, ApiKeyHealthStatus>
  >(() => cachedSnapshot?.healthMap ?? {})
  const verifiedAtMap = useSyncExternalStore(
    subscribeVerifiedAt,
    getVerifiedAtSnapshot,
    getVerifiedAtServerSnapshot,
  )
  const t = useTranslations('Toasts')

  const verifyOne = useCallback(
    async (id: string): Promise<ApiKeyHealthStatus> => {
      const response = await verifyApiKey(id)
      const status: ApiKeyHealthStatus =
        response.success && response.data ? response.data.status : 'failed'
      setHealthMap((prev) => {
        const next = { ...prev, [id]: status }
        saveHealthCache(next)
        if (userId) {
          updateCachedHealthMap(userId, () => next)
        }
        return next
      })
      writeVerifiedAt((prev) => ({ ...prev, [id]: Date.now() }))
      return status
    },
    [userId],
  )

  useEffect(() => {
    let isCancelled = false

    async function loadInitialKeys() {
      if (!userId) return
      try {
        const snapshot = await loadApiKeysSnapshot(
          userId,
          false,
          t('apiKeyLoadFailed'),
        )
        if (isCancelled) return
        setKeys(snapshot.keys)
        setHealthMap(snapshot.healthMap)
        setError(null)
      } catch (loadError) {
        if (isCancelled) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : t('apiKeyLoadFailed'),
        )
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    }

    if (!isLoaded) return

    if (!isSignedIn || !userId) {
      apiKeysCache = null
      apiKeysRequest = null
      setKeys([])
      setHealthMap({})
      setError(null)
      setIsLoading(false)
      return
    }

    const cached = getFreshApiKeysSnapshot(userId)
    if (cached) {
      setKeys(cached.keys)
      setHealthMap(cached.healthMap)
      setError(null)
      setIsLoading(false)
      return
    }

    if (!autoLoad) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    // Defer to idle so gallery/assets/studio images win the connection
    // pool on first paint. API key list is not visible until the user
    // opens settings, so a ~500ms delay is invisible.
    const cancelDefer = deferToIdle(() => {
      if (!isCancelled) void loadInitialKeys()
    })

    return () => {
      isCancelled = true
      cancelDefer()
    }
  }, [autoLoad, isLoaded, isSignedIn, userId, t])

  const fetchKeys = useCallback(async () => {
    if (!userId) {
      setKeys([])
      setHealthMap({})
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const snapshot = await loadApiKeysSnapshot(
        userId,
        true,
        t('apiKeyLoadFailed'),
      )
      setKeys(snapshot.keys)
      setHealthMap(snapshot.healthMap)
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t('apiKeyLoadFailed'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [userId, t])

  const create = useCallback(
    async (data: CreateApiKeyRequest): Promise<boolean> => {
      const response = await createApiKey(data)
      if (response.success && response.data) {
        setError(null)
        const newKey = response.data
        setKeys((prev) => {
          const next = [newKey, ...prev]
          if (userId) {
            updateCachedApiKeys(userId, () => next)
          }
          return next
        })
        // Auto-verify newly created key (user just entered it)
        void verifyOne(newKey.id)
        toast.success(t('apiKeyCreated'))
        return true
      }
      setError(response.error ?? t('apiKeyCreateFailed'))
      toast.error(t('apiKeyCreateFailed'))
      return false
    },
    [verifyOne, t, userId],
  )

  const update = useCallback(
    async (id: string, data: UpdateApiKeyRequest): Promise<boolean> => {
      const response = await updateApiKey(id, data)
      if (response.success && response.data) {
        setError(null)
        const updatedKey = response.data
        setKeys((prev) => prev.map((key) => (key.id === id ? updatedKey : key)))
        if (userId) {
          updateCachedApiKeys(userId, (prev) =>
            prev.map((key) => (key.id === id ? updatedKey : key)),
          )
        }
        // Auto-verify if key value changed
        if (data.keyValue) {
          void verifyOne(id)
        }
        toast.success(t('apiKeyUpdated'))
        return true
      }
      setError(response.error ?? t('apiKeyUpdateFailed'))
      toast.error(t('apiKeyUpdateFailed'))
      return false
    },
    [verifyOne, t, userId],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await deleteApiKey(id)
      if (response.success) {
        setError(null)
        setKeys((prev) => {
          const next = prev.filter((k) => k.id !== id)
          if (userId) {
            updateCachedApiKeys(userId, () => next)
          }
          return next
        })
        setHealthMap((prev) => {
          const next = { ...prev }
          delete next[id]
          saveHealthCache(next)
          if (userId) {
            updateCachedHealthMap(userId, () => next)
          }
          return next
        })
        writeVerifiedAt((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        toast.success(t('apiKeyDeleted'))
        return true
      }
      setError(response.error ?? t('apiKeyDeleteFailed'))
      toast.error(t('apiKeyDeleteFailed'))
      return false
    },
    [t, userId],
  )

  return {
    keys,
    isLoading,
    error,
    healthMap,
    verifiedAtMap,
    create,
    update,
    remove,
    verify: verifyOne,
    refresh: fetchKeys,
  }
}
