'use client'

import { useMemo } from 'react'

import type {
  BackgroundCardRecord,
  CreateBackgroundCardRequest,
  UpdateBackgroundCardRequest,
} from '@/types'
import {
  listBackgroundCardsAPI,
  createBackgroundCardAPI,
  updateBackgroundCardAPI,
  deleteBackgroundCardAPI,
} from '@/lib/api-client'
import {
  useCardManager,
  type UseCardManagerReturn,
} from '@/hooks/use-card-manager'

export type UseBackgroundCardsReturn = Pick<
  UseCardManagerReturn<
    BackgroundCardRecord,
    CreateBackgroundCardRequest,
    UpdateBackgroundCardRequest
  >,
  | 'cards'
  | 'isLoading'
  | 'activeCardId'
  | 'setActiveCardId'
  | 'create'
  | 'update'
  | 'remove'
  | 'refresh'
>

const api = {
  list: listBackgroundCardsAPI,
  create: createBackgroundCardAPI,
  update: updateBackgroundCardAPI,
  delete: deleteBackgroundCardAPI,
}

export function useBackgroundCards(
  projectId?: string | null,
): UseBackgroundCardsReturn {
  const manager = useCardManager<
    BackgroundCardRecord,
    CreateBackgroundCardRequest,
    UpdateBackgroundCardRequest
  >(
    useMemo(
      () => ({
        cardType: 'background',
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
    create: manager.create,
    update: manager.update,
    remove: manager.remove,
    refresh: manager.refresh,
  }
}
