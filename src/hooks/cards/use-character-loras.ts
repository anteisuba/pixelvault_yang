'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { listCharacterLorasAPI, setLoraCharactersAPI } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  CharacterLoraGroup,
  FavoriteLoraRequest,
  SetLoraCharactersRequest,
} from '@/types'

export interface UseCharacterLorasReturn {
  groups: CharacterLoraGroup[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** 收了这个 LoRA 的角色（按下载链接认：没收藏的 LoRA 前端没有记录 id）。 */
  charactersOf: (loraUrl: string) => CharacterLoraGroup[]
  /** 这个 LoRA 属于哪些角色、挂在哪套造型下（整组替换）。成功后分组换成服务端那份。 */
  setLoraCharacters: (
    lora: FavoriteLoraRequest,
    characters: SetLoraCharactersRequest['characters'],
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
        map.set(lora.loraUrl, [...(map.get(lora.loraUrl) ?? []), group])
      }
    }
    return map
  }, [groups])

  const charactersOf = useCallback(
    (loraUrl: string) => byLora.get(loraUrl) ?? [],
    [byLora],
  )

  const setLoraCharacters = useCallback(
    async (
      lora: FavoriteLoraRequest,
      characters: SetLoraCharactersRequest['characters'],
    ) => {
      const result = await setLoraCharactersAPI(lora, characters)
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
