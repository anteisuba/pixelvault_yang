'use client'

import { useState, useCallback, useEffect } from 'react'
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

// ─── Hook ─────────────────────────────────────────────────────────

export interface UseApiKeysReturn {
  keys: UserApiKeyRecord[]
  isLoading: boolean
  error: string | null
  healthMap: Record<string, ApiKeyHealthStatus>
  create: (data: CreateApiKeyRequest) => Promise<boolean>
  update: (id: string, data: UpdateApiKeyRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  verify: (id: string) => Promise<ApiKeyHealthStatus>
  refresh: () => Promise<void>
}

export function useApiKeys(): UseApiKeysReturn {
  const [keys, setKeys] = useState<UserApiKeyRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [healthMap, setHealthMap] = useState<
    Record<string, ApiKeyHealthStatus>
  >({})
  const t = useTranslations('Toasts')

  const verifyOne = useCallback(
    async (id: string): Promise<ApiKeyHealthStatus> => {
      const response = await verifyApiKey(id)
      const status: ApiKeyHealthStatus =
        response.success && response.data ? response.data.status : 'failed'
      setHealthMap((prev) => {
        const next = { ...prev, [id]: status }
        saveHealthCache(next)
        return next
      })
      return status
    },
    [],
  )

  useEffect(() => {
    let isCancelled = false

    async function loadInitialKeys() {
      const response = await listApiKeys()
      if (isCancelled) return

      if (response.success && response.data) {
        setKeys(response.data)
        setError(null)

        // Load cached health results instead of re-verifying all keys
        const cached = loadHealthCache()
        const activeKeys = response.data.filter((k) => k.isActive)
        const initialHealth: Record<string, ApiKeyHealthStatus> = {}

        for (const key of activeKeys) {
          // Use cache if available, otherwise show "unknown" (grey dot)
          initialHealth[key.id] = cached[key.id] ?? 'unknown'
        }

        setHealthMap(initialHealth)
      } else {
        setError(response.error ?? 'Failed to load API keys')
      }
      setIsLoading(false)
    }

    void loadInitialKeys()

    return () => {
      isCancelled = true
    }
  }, [])

  const fetchKeys = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const response = await listApiKeys()
    if (response.success && response.data) {
      setKeys(response.data)
    } else {
      setError(response.error ?? 'Failed to load API keys')
    }
    setIsLoading(false)
  }, [])

  const create = useCallback(
    async (data: CreateApiKeyRequest): Promise<boolean> => {
      const response = await createApiKey(data)
      if (response.success && response.data) {
        setError(null)
        const newKey = response.data
        setKeys((prev) => [newKey, ...prev])
        // Auto-verify newly created key (user just entered it)
        void verifyOne(newKey.id)
        toast.success(t('apiKeyCreated'))
        return true
      }
      setError(response.error ?? 'Failed to create API key')
      toast.error(t('apiKeyCreateFailed'))
      return false
    },
    [verifyOne, t],
  )

  const update = useCallback(
    async (id: string, data: UpdateApiKeyRequest): Promise<boolean> => {
      const response = await updateApiKey(id, data)
      if (response.success && response.data) {
        setError(null)
        setKeys((prev) =>
          prev.map((key) => (key.id === id ? response.data! : key)),
        )
        // Auto-verify if key value changed
        if (data.keyValue) {
          void verifyOne(id)
        }
        toast.success(t('apiKeyUpdated'))
        return true
      }
      setError(response.error ?? 'Failed to update API key')
      toast.error(t('apiKeyUpdateFailed'))
      return false
    },
    [verifyOne, t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await deleteApiKey(id)
      if (response.success) {
        setError(null)
        setKeys((prev) => prev.filter((k) => k.id !== id))
        setHealthMap((prev) => {
          const next = { ...prev }
          delete next[id]
          saveHealthCache(next)
          return next
        })
        toast.success(t('apiKeyDeleted'))
        return true
      }
      setError(response.error ?? 'Failed to delete API key')
      toast.error(t('apiKeyDeleteFailed'))
      return false
    },
    [t],
  )

  return {
    keys,
    isLoading,
    error,
    healthMap,
    create,
    update,
    remove,
    verify: verifyOne,
    refresh: fetchKeys,
  }
}
