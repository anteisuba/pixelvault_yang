'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { QUERY_KEYS } from '@/constants/query'
import { listCharacterLorasAPI, setLoraCharactersAPI } from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
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

const EMPTY: CharacterLoraGroup[] = []

/**
 * 角色收的 LoRA（角色③）。LoRA 台「从角色选」、LoRA 库「加到角色…」与角色详情
 * 「她的 LoRA」共用这一份；给 `characterCardId` 只取那一位。
 */
export function useCharacterLoras(
  characterCardId?: string,
): UseCharacterLorasReturn {
  const t = useTranslations('LoraWorkbench.characterLoras')
  const queryKey = QUERY_KEYS.characterLoras(characterCardId ?? null)
  const query = useQuery(
    {
      queryKey,
      queryFn: async () => {
        const result = await listCharacterLorasAPI(characterCardId)
        if (!result.success || !result.data) {
          throw new Error(result.error ?? t('loadFailed'))
        }
        return result.data
      },
    },
    queryClient,
  )
  const groups = query.data ?? EMPTY
  const { refetch } = query
  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

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
      // 回来的是整份分组；只看某一位的那几份（带 id 的键）也跟着重拉。
      queryClient.setQueryData(QUERY_KEYS.characterLoras(null), result.data)
      void queryClient.invalidateQueries({
        queryKey: ['character-loras'],
        predicate: (q) => q.queryKey[1] !== null,
      })
      return true
    },
    [t],
  )

  return {
    groups,
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    refresh,
    charactersOf,
    setLoraCharacters,
  }
}
