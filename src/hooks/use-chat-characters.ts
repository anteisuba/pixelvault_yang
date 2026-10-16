'use client'

import { useEffect, useState } from 'react'

import { listCharacterCardsAPI } from '@/lib/api-client/cards'
import type { StudioOperatorChatRequest } from '@/hooks/use-studio-operator-store'

/**
 * 助手会话菜单「和角色聊…」那一列（附录L）：你自己的角色（只取主卡，变体不列），
 * 每个带开场白，选一个就开一段聊天会话。
 *
 * ⚠ 只在菜单打开时取（`enabled`），取过一次就留着；取不到就是空列表，菜单那一项照常在。
 */
export function useChatCharacters(enabled: boolean): {
  characters: StudioOperatorChatRequest[]
  isLoading: boolean
} {
  const [characters, setCharacters] = useState<
    StudioOperatorChatRequest[] | null
  >(null)

  useEffect(() => {
    if (!enabled || characters !== null) return
    let active = true
    void listCharacterCardsAPI().then((result) => {
      if (!active) return
      setCharacters(
        (result.success ? (result.data ?? []) : [])
          .filter((card) => card.parentId === null)
          .map((card) => ({
            character: { id: card.id, name: card.name },
            opening: card.persona?.opening ?? '',
          })),
      )
    })
    return () => {
      active = false
    }
  }, [enabled, characters])

  return {
    characters: characters ?? [],
    isLoading: enabled && characters === null,
  }
}
