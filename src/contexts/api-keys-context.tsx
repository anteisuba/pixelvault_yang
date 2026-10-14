'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { UseApiKeysReturn } from '@/hooks/use-api-keys'
import { useApiKeys } from '@/hooks/use-api-keys'

const ApiKeysContext = createContext<UseApiKeysReturn | null>(null)

interface ApiKeysProviderProps {
  children: ReactNode
  autoLoad?: boolean
}

export function ApiKeysProvider({
  children,
  autoLoad = true,
}: ApiKeysProviderProps) {
  const apiKeysState = useApiKeys({ autoLoad })
  return (
    <ApiKeysContext.Provider value={apiKeysState}>
      {children}
    </ApiKeysContext.Provider>
  )
}

export function useApiKeysContext(): UseApiKeysReturn {
  const ctx = useContext(ApiKeysContext)
  if (!ctx)
    throw new Error('useApiKeysContext must be used inside ApiKeysProvider')
  return ctx
}

/**
 * 不在 `ApiKeysProvider` 里时返回 null（画布卡片的单测不挂它）。用它判「缺不缺
 * key」的调用方在 null 时一律当「不知道」，⛔ 当成缺。
 */
export function useApiKeysContextOptional(): UseApiKeysReturn | null {
  return useContext(ApiKeysContext)
}
