'use client'

import { useMemo } from 'react'

import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
} from '@/types'
import {
  listStyleCardsAPI,
  createStyleCardAPI,
  updateStyleCardAPI,
  deleteStyleCardAPI,
} from '@/lib/api-client'
import {
  useCardManager,
  type UseCardManagerReturn,
} from '@/hooks/use-card-manager'

export type UseStyleCardsReturn = Pick<
  UseCardManagerReturn<
    StyleCardRecord,
    CreateStyleCardRequest,
    UpdateStyleCardRequest
  >,
  | 'cards'
  | 'isLoading'
  | 'activeCardId'
  | 'setActiveCardId'
  | 'activeCard'
  | 'create'
  | 'update'
  | 'remove'
  | 'refresh'
>

const api = {
  list: listStyleCardsAPI,
  create: createStyleCardAPI,
  update: updateStyleCardAPI,
  delete: deleteStyleCardAPI,
}

export function useStyleCards(projectId?: string | null): UseStyleCardsReturn {
  const manager = useCardManager<
    StyleCardRecord,
    CreateStyleCardRequest,
    UpdateStyleCardRequest
  >(
    useMemo(
      () => ({
        cardType: 'style',
        api,
        selectionMode: 'single' as const,
        projectId,
      }),
      [projectId],
    ),
  )

  return {
    cards: manager.cards,
    isLoading: manager.isLoading,
    activeCardId: manager.activeCardId,
    setActiveCardId: manager.setActiveCardId,
    activeCard: manager.activeCard,
    create: manager.create,
    update: manager.update,
    remove: manager.remove,
    refresh: manager.refresh,
  }
}
