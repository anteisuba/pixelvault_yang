'use client'

import { createContext, useContext } from 'react'

import type { UseApiKeysReturn } from '@/hooks/use-api-keys'
import { useApiKeys } from '@/hooks/use-api-keys'

const ApiKeysContext = createContext<UseApiKeysReturn | null>(null)

export function ApiKeysProvider({ children }: { children: React.ReactNode }) {
  const apiKeysState = useApiKeys()
  return (
    <ApiKeysContext.Provider value={apiKeysState}>
      {children}
    </ApiKeysContext.Provider>
  )
}

export function useApiKeysContext(): UseApiKeysReturn {
  const ctx = useContext(ApiKeysContext)
  if (!ctx) throw new Error('useApiKeysContext must be used inside ApiKeysProvider')
  return ctx
}
