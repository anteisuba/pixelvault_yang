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

  const verifyOne = useCallback(
    async (id: string): Promise<ApiKeyHealthStatus> => {
      const response = await verifyApiKey(id)
      const status: ApiKeyHealthStatus =
        response.success && response.data ? response.data.status : 'failed'
      setHealthMap((prev) => ({ ...prev, [id]: status }))
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

        // Auto-verify all active keys in parallel
        const activeKeys = response.data.filter((k) => k.isActive)
        if (activeKeys.length > 0) {
          const results = await Promise.allSettled(
            activeKeys.map((k) => verifyApiKey(k.id)),
          )
          if (isCancelled) return
          const newHealthMap: Record<string, ApiKeyHealthStatus> = {}
          results.forEach((result, i) => {
            const key = activeKeys[i]
            newHealthMap[key.id] =
              result.status === 'fulfilled' &&
              result.value.success &&
              result.value.data
                ? result.value.data.status
                : 'failed'
          })
          setHealthMap(newHealthMap)
        }
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

  const create = useCallback(
    async (data: CreateApiKeyRequest): Promise<boolean> => {
      const response = await createApiKey(data)
      if (response.success && response.data) {
        setError(null)
        const newKey = response.data
        setKeys((prev) => [newKey, ...prev])
        // Auto-verify newly created key
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
        // Auto-verify updated key (key value may have changed)
        void verifyOne(id)
        toast.success(t('apiKeyUpdated'))
        return true
      }
      setError(response.error ?? 'Failed to update API key')
      toast.error(t('apiKeyUpdateFailed'))
      return false
    },
    [t],
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
