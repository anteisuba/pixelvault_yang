'use client'

import { useState, useCallback, useEffect } from 'react'

import type {
  UserApiKeyRecord,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
} from '@/types'
import {
  listApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
} from '@/lib/api-client'

export interface UseApiKeysReturn {
  keys: UserApiKeyRecord[]
  isLoading: boolean
  error: string | null
  create: (data: CreateApiKeyRequest) => Promise<boolean>
  update: (id: string, data: UpdateApiKeyRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  refresh: () => Promise<void>
}

export function useApiKeys(): UseApiKeysReturn {
  const [keys, setKeys] = useState<UserApiKeyRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    let isCancelled = false

    async function loadInitialKeys() {
      const response = await listApiKeys()
      if (isCancelled) return

      if (response.success && response.data) {
        setKeys(response.data)
        setError(null)
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
        setKeys((prev) => [response.data!, ...prev])
        return true
      }
      setError(response.error ?? 'Failed to create API key')
      return false
    },
    [],
  )

  const update = useCallback(
    async (id: string, data: UpdateApiKeyRequest): Promise<boolean> => {
      const response = await updateApiKey(id, data)
      if (response.success && response.data) {
        setError(null)
        setKeys((prev) =>
          prev.map((key) => (key.id === id ? response.data! : key)),
        )
        return true
      }
      setError(response.error ?? 'Failed to update API key')
      return false
    },
    [],
  )

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const response = await deleteApiKey(id)
    if (response.success) {
      setError(null)
      setKeys((prev) => prev.filter((k) => k.id !== id))
      return true
    }
    setError(response.error ?? 'Failed to delete API key')
    return false
  }, [])

  return { keys, isLoading, error, create, update, remove, refresh: fetchKeys }
}
