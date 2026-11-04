'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { characterCardsQuery } from '@/lib/character-cards-query'
import { characterCoverUrl } from '@/lib/card-bus'
import { queryClient } from '@/lib/query-client'
import type { StudioOperatorChatCharacter } from '@/hooks/use-studio-operator-store'

/**
 * 换人菜单里那一列角色（你自己的角色，只取主卡，变体不列）：点一个进她的配音间。
 *
 * ⚠ 只在菜单打开时取（`enabled`），读的是角色卡那份共用查询（别处拉过就直接有）；
 * 取不到就是空列表，菜单那一项照常在。
 */
export interface ChatCharacterOption {
  character: StudioOperatorChatCharacter
  /** 头像（默认造型的封面）。 */
  avatarUrl: string | null
  /** 她的嗓子（角色卡默认音色）：头像点她进配音间按它认人；没绑 = null。 */
  voiceCardId: string | null
}

export function useChatCharacters(enabled: boolean): {
  characters: ChatCharacterOption[]
  isLoading: boolean
} {
  const query = useQuery({ ...characterCardsQuery, enabled }, queryClient)
  const characters = useMemo(
    () =>
      (query.data ?? []).map((card) => ({
        character: { id: card.id, name: card.name },
        avatarUrl: characterCoverUrl(card),
        voiceCardId: card.voiceCardId,
      })),
    [query.data],
  )

  return {
    characters,
    isLoading: enabled && query.isPending,
  }
}
