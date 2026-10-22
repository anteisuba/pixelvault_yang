'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { listCharacterLorasAPI, setLoraCharactersAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CharacterLoraGroup } from '@/types'

export interface UseCharacterLorasReturn {
  groups: CharacterLoraGroup[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** 收了这个 LoRA 的角色（按 LoRA 记录 id 认）。 */
  charactersOf: (loraAssetId: string) => CharacterLoraGroup[]
  /** 这个 LoRA 属于哪些角色（整组替换）。成功后分组换成服务端那份。 */
  setLoraCharacters: (
    loraAssetId: string,
    characterCardIds: readonly string[],
  ) => Promise<boolean>
}

/**
 * 角色收的 LoRA（角色③）。LoRA 台「从角色选」、LoRA 库「加到角色…」与角色详情
 * 「她的 LoRA」共用这一份；给 `characterCardId` 只取那一位。
 */
export function useCharacterLoras(
  characterCardId?: string,
): UseCharacterLorasReturn {
  const t = useTranslations('LoraWorkbench.characterLoras')
  const [groups, setGroups] = useState<CharacterLoraGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const result = await listCharacterLorasAPI(characterCardId)
    if (result.success && result.data) setGroups(result.data)
    else setError(result.error ?? t('loadFailed'))
    setIsLoading(false)
  }, [characterCardId, t])

  useEffect(() => deferEffectTask(() => void refresh()), [refresh])

  const byLora = useMemo(() => {
    const map = new Map<string, CharacterLoraGroup[]>()
    for (const group of groups) {
      for (const lora of group.loras) {
        map.set(lora.id, [...(map.get(lora.id) ?? []), group])
      }
    }
    return map
  }, [groups])

  const charactersOf = useCallback(
    (loraAssetId: string) => byLora.get(loraAssetId) ?? [],
    [byLora],
  )

  const setLoraCharacters = useCallback(
    async (loraAssetId: string, characterCardIds: readonly string[]) => {
      const result = await setLoraCharactersAPI(loraAssetId, characterCardIds)
      if (!result.success || !result.data) {
        toast.error(result.error ?? t('saveFailed'))
        return false
      }
      setGroups(result.data)
      return true
    },
    [t],
  )

  return {
    groups,
    isLoading,
    error,
    refresh,
    charactersOf,
    setLoraCharacters,
  }
}
